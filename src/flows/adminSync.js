import { MessageFlags } from 'discord.js';
import { log } from '../lib/log.js';

export async function cancelSyncAll(interaction) {
  return interaction.update({ content: 'Cancelled — no roles changed.', components: [] });
}

// Confirm-button handler for /sync-all-roles. The ephemeral message is already
// private to the invoking admin, but re-check is_admin as defense in depth.
export async function runSyncAll(interaction, ctx) {
  const acc = await ctx.acl.getAccountByDiscordId(interaction.user.id);
  if (!acc?.is_admin) {
    return interaction.reply({ content: 'Admins only.', flags: MessageFlags.Ephemeral });
  }
  // Acknowledge immediately (within 3s); the sync can run for a while after.
  await interaction.update({ content: '🔄 Syncing roles for all ACL players… this can take a moment.', components: [] });
  try {
    const s = await ctx.roles.syncAllMembers(interaction.guild);
    const lines = [
      '✅ **Role sync complete.**',
      `• Linked ACL players: ${s.total}`,
      `• Synced (in this server): ${s.processed}`,
      `• Players whose roles changed: ${s.changed}`,
      `• Not in server (skipped): ${s.notInGuild}`,
      s.failed ? `• ⚠️ Failures: ${s.failed}` : null,
      ...(s.errors.length ? ['', '**Issues:**', ...s.errors.map((e) => `• ${e}`)] : []),
    ].filter((x) => x !== null);
    return interaction.editReply({ content: lines.join('\n').slice(0, 1900), components: [] });
  } catch (e) {
    log.error('sync-all', e);
    return interaction.editReply({ content: `Sync failed: ${e.message}`, components: [] });
  }
}
