import { Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { config, assertConfig } from './config.js';
import { log } from './lib/log.js';
import { ACCENT } from './lib/format.js';
import * as acl from './lib/acl.js';
import * as roles from './roles.js';
import { supabase } from './supabase.js';
import { commands } from './commands/index.js';
import { buttonHandlers } from './buttons/assignRoles.js';
import { handleMvpButton } from './flows/mvp.js';
import { startCron } from './notifications/cron.js';
import { startRealtime } from './notifications/realtime.js';
import { reconcileAllMembership, setMemberPresence } from './membership.js';

assertConfig();

// Last-resort safety nets so a stray rejection in an async event handler
// can't silently kill the process (or, on Node ≥15, crash it uncaught).
process.on('unhandledRejection', (reason) => log.error('unhandledRejection', reason));
process.on('uncaughtException', (err) => { log.error('uncaughtException', err); process.exit(1); });

// GuildMembers is enabled so guild.members.fetch(id) and the member cache are
// reliable for auto role-sync. (Enable "Server Members Intent" in the Bot tab.)
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const commandMap = new Map(commands.map((c) => [c.data.name, c]));
// supabase here is the lazy proxy; the real client is built on first use
// (after assertConfig above). Exposed for cron/realtime queries.
const ctx = { config, supabase, acl, roles, client };

// Post (once) the self-serve roles message in #onboarding if it isn't there.
async function ensureOnboardingMessage() {
  const channel = await client.channels.fetch(config.onboardingChannelId).catch(() => null);
  if (!channel?.isTextBased()) {
    log.warn('Onboarding channel not found / not text-based — skipping button message.');
    return;
  }
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const exists = recent?.some((m) =>
    m.author.id === client.user.id
    && m.components?.some((row) => row.components?.some((c) => c.customId === 'acl:assign-roles')));
  if (exists) return;

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('Get your ACL roles')
    .setDescription([
      'Link your account at **playacl.ca** (sign in with Discord), then:',
      '',
      '• **Assign my roles** — get your province, team, and (if applicable) Team Captain role.',
      '• **Match Pings** — opt in/out of match-day @mentions.',
    ].join('\n'))
    .setFooter({ text: 'Atlantic Canada League' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('acl:assign-roles').setLabel('Assign my roles').setStyle(ButtonStyle.Primary).setEmoji('🎭'),
    new ButtonBuilder().setCustomId('acl:toggle-pings').setLabel('Match Pings').setStyle(ButtonStyle.Secondary).setEmoji('🔔'),
  );
  await channel.send({ embeds: [embed], components: [row] });
  log.info('Posted onboarding roles message.');
}

client.once(Events.ClientReady, async (c) => {
  log.info(`Logged in as ${c.user.tag}`);
  try {
    const guild = await client.guilds.fetch(config.guildId);
    await roles.ensureMatchPingsRole(guild).catch((e) => log.warn('ensure pings role', e?.message));
    // Non-fatal: if the bot can't post to #onboarding, still start everything else.
    await ensureOnboardingMessage().catch((e) => log.warn(
      `Couldn't post the onboarding roles message: ${e?.message}. `
      + 'Grant the bot View Channel + Send Messages + Embed Links in the onboarding channel, then restart.',
    ));
    if (config.membershipTracking) {
      await reconcileAllMembership(guild).catch((e) => log.warn('membership reconcile', e?.message));
    }
    startCron(client, ctx);
    await startRealtime(client, ctx);
  } catch (e) {
    log.error('startup', e);
  }
  // Heartbeat. When membership tracking is on, also write bot_status (drives
  // the website's fail-open gate). Otherwise it's just a host-log liveness tick.
  const beat = () => {
    log.info('heartbeat');
    if (config.membershipTracking) {
      acl.touchHeartbeat().catch((e) => log.warn('heartbeat write failed', e?.message));
    }
  };
  beat();
  setInterval(beat, 2 * 60 * 1000);
});

// Keep accounts.is_in_discord_server in sync from live join/leave events.
// Disabled unless membership tracking is on (the gate is click-through now).
client.on(Events.GuildMemberAdd, (member) => {
  if (config.membershipTracking && member.guild.id === config.guildId) setMemberPresence(member.id, true);
});
client.on(Events.GuildMemberRemove, (member) => {
  if (config.membershipTracking && member.guild.id === config.guildId) setMemberPresence(member.id, false);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commandMap.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction, ctx);
    } else if (interaction.isButton()) {
      const handler = buttonHandlers[interaction.customId];
      if (handler) await handler(interaction, ctx);
      // Dynamic-id buttons (per-match / per-player) route by prefix.
      else if (interaction.customId.startsWith('acl:mvp:')) await handleMvpButton(interaction, ctx);
    }
  } catch (e) {
    log.error(`interaction ${interaction.commandName || interaction.customId}`, e);
    const msg = { content: 'Something went wrong. Please try again.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) interaction.editReply(msg).catch(() => {});
    else interaction.reply(msg).catch(() => {});
  }
});

client.login(config.discordToken);
