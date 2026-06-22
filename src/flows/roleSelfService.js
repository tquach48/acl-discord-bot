import { MessageFlags } from 'discord.js';
import { ensureMatchPingsRole } from '../roles.js';
import { config } from '../config.js';
import { log } from '../lib/log.js';

function notLinkedMessage() {
  return [
    "I can't find an ACL account linked to your Discord.",
    `Sign in with Discord at ${config.siteUrl} first, then run this again.`,
  ].join(' ');
}

// Shared by the /roles command and the #onboarding "Assign my roles" button.
export async function assignRoles(interaction, ctx) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const account = await ctx.acl.getAccountByDiscordId(interaction.user.id);
    if (!account) {
      return interaction.editReply({ content: notLinkedMessage() });
    }
    const member = interaction.member;
    const { added, removed, errors } = await ctx.roles.syncForAccount(
      interaction.guild,
      member,
      account,
    );
    const parts = [];
    if (added.length) parts.push(`✅ Added: ${added.join(', ')}`);
    if (removed.length) parts.push(`➖ Removed: ${removed.join(', ')}`);
    if (!added.length && !removed.length) parts.push('Your roles are already up to date. 👍');
    if (errors.length) parts.push(`⚠️ Couldn't apply: ${errors.join('; ')}`);
    return interaction.editReply({ content: parts.join('\n') });
  } catch (e) {
    log.error('assignRoles failed', e);
    return interaction.editReply({ content: 'Something went wrong assigning your roles. Try again shortly.' });
  }
}

// Opt in/out of the "Match Pings" role (the general match-day @mention).
export async function togglePings(interaction, _ctx) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const role = await ensureMatchPingsRole(interaction.guild);
    const member = interaction.member;
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      return interaction.editReply({ content: '🔕 You will no longer be pinged for match days.' });
    }
    await member.roles.add(role);
    return interaction.editReply({ content: '🔔 You will now be pinged in the match-day channel when games go live.' });
  } catch (e) {
    log.error('togglePings failed', e);
    const hint = e?.code === 50013
      ? " (the bot's role must sit above the Match Pings role — ask an admin to move it up)"
      : '';
    return interaction.editReply({ content: `Couldn't update your Match Pings role${hint}.` });
  }
}
