import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
} from 'discord.js';
import { config } from '../config.js';
import { log } from '../lib/log.js';
import { ACCENT, formatTime, teamLabel, link } from '../lib/format.js';

// Pre-match check-in: ~36h out the bot posts a Confirm / Need-reschedule
// prompt for each match; captains press a button and the bot upserts a
// match_checkins row for THEIR team (authorized here — the bot runs on
// service-role). ~12h out, any match still missing a confirmation gets an
// admin flag post. In-memory de-dup mirrors cron.js (restart may re-post
// for a match inside the narrow window — acceptable).

const postedCheckins = new Set(); // matchId
const flaggedMatches = new Set(); // matchId

function checkinButtons(matchId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`acl:checkin:${matchId}:confirmed`)
      .setLabel('✅ Confirm — we’re playing')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`acl:checkin:${matchId}:needs_reschedule`)
      .setLabel('⚠️ Need a reschedule')
      .setStyle(ButtonStyle.Secondary),
  );
}

async function postCheckin(client, ctx, match) {
  const channel = await client.channels.fetch(config.matchDayChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const [t1, t2] = await Promise.all([
    ctx.acl.getTeamById(match.team1_id),
    ctx.acl.getTeamById(match.team2_id),
  ]);
  const roleIds = [t1, t2]
    .map((t) => t && ctx.roles.getRoleByName(channel.guild, t.name)?.id)
    .filter(Boolean);
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle(`📋 Check-in — ${teamLabel(t1)} vs ${teamLabel(t2)}`)
    .setURL(link.match(match.id))
    .setDescription([
      `🕒 ${formatTime(match.scheduled_at)}`,
      '',
      '**Captains:** press a button below to check in for your team.',
      "Haven't checked in 12h before the match? You'll get a reminder here.",
    ].join('\n'))
    .setFooter({ text: 'Atlantic Canada League · playacl.ca' });
  await channel.send({
    content: roleIds.map((id) => `<@&${id}>`).join(' ') || undefined,
    embeds: [embed],
    components: [checkinButtons(match.id)],
    allowedMentions: { roles: roleIds },
  });
  log.info(`Posted check-in for match ${match.id}`);
}

async function flagUnconfirmed(client, ctx, match) {
  const checkins = await ctx.acl.getCheckinsForMatch(match.id);
  const confirmed = new Set(checkins.filter((c) => c.status === 'confirmed').map((c) => c.team_id));
  const needsResched = checkins.some((c) => c.status === 'needs_reschedule');
  const missing = [match.team1_id, match.team2_id].filter((id) => !confirmed.has(id));
  if (!missing.length && !needsResched) return;

  const channel = await client.channels.fetch(config.matchDayChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const [t1, t2] = await Promise.all([
    ctx.acl.getTeamById(match.team1_id),
    ctx.acl.getTeamById(match.team2_id),
  ]);
  const teams = await Promise.all(missing.map((id) => ctx.acl.getTeamById(id)));
  const lines = [
    `⏰ **Match reminder** — ${teamLabel(t1)} vs ${teamLabel(t2)} in ~12h`,
    link.match(match.id),
    teams.length
      ? `Still waiting on a check-in from: ${teams.map((t) => `**${teamLabel(t)}**`).join(', ')}`
      : null,
    needsResched ? 'A team has requested a reschedule.' : null,
  ].filter(Boolean);
  await channel.send({ content: lines.join('\n'), allowedMentions: { parse: [] }, flags: MessageFlags.SuppressEmbeds });
  log.info(`Posted prematch reminder for match ${match.id}`);
}

// Called from the 5-min cron sweep.
export async function checkCheckins(client, ctx) {
  const matches = await ctx.acl.getUpcomingMatches();
  const now = Date.now();
  for (const m of matches) {
    const mins = (new Date(m.scheduled_at).getTime() - now) / 60000;
    if (mins > 2153 && mins <= 2160 && !postedCheckins.has(m.id)) {       // ~36h out
      postedCheckins.add(m.id);
      await postCheckin(client, ctx, m).catch((e) => log.error('checkin post', e));
    } else if (mins > 713 && mins <= 720 && !flaggedMatches.has(m.id)) {  // ~12h out
      flaggedMatches.add(m.id);
      await flagUnconfirmed(client, ctx, m).catch((e) => log.error('checkin flag', e));
    }
  }
}

// Button press: acl:checkin:<matchId>:<status>. Only a captain of one of the
// two competing teams may check in; their press records THEIR team.
export async function handleCheckinButton(interaction, ctx) {
  const [, , matchId, status] = interaction.customId.split(':');
  const acc = await ctx.acl.getAccountByDiscordId(interaction.user.id);
  if (!acc) {
    return interaction.reply({ content: 'No ACL account linked to your Discord.', flags: MessageFlags.Ephemeral });
  }
  const match = await ctx.acl.getMatchByIdSafe(matchId);
  if (!match) {
    return interaction.reply({ content: 'Match not found (it may have been removed).', flags: MessageFlags.Ephemeral });
  }
  const captainTeams = await ctx.acl.getCaptainTeams(acc.id);
  const myTeam = captainTeams.find((t) => t.id === match.team1_id || t.id === match.team2_id);
  if (!myTeam) {
    return interaction.reply({
      content: 'Only a captain of one of the two competing teams can check in.',
      flags: MessageFlags.Ephemeral,
    });
  }
  await ctx.acl.upsertCheckin(matchId, myTeam.id, status, acc.id);

  // Reflect current state on the original message so everyone sees it.
  try {
    const checkins = await ctx.acl.getCheckinsForMatch(matchId);
    const [t1, t2] = await Promise.all([
      ctx.acl.getTeamById(match.team1_id),
      ctx.acl.getTeamById(match.team2_id),
    ]);
    const line = (team) => {
      const c = checkins.find((x) => x.team_id === team.id);
      if (!c) return `⬜ ${teamLabel(team)} — no response yet`;
      return c.status === 'confirmed'
        ? `✅ ${teamLabel(team)} — confirmed`
        : `⚠️ ${teamLabel(team)} — needs a reschedule`;
    };
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setFields({ name: 'Status', value: `${line(t1)}\n${line(t2)}`, inline: false });
    await interaction.update({ embeds: [embed], components: interaction.message.components });
  } catch (e) {
    log.warn('checkin message update', e?.message);
    await interaction.reply({
      content: status === 'confirmed' ? '✅ Checked in.' : '⚠️ Reschedule request noted.',
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }
}
