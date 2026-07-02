import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { link } from '../lib/format.js';

// /lft on|off — self-serve "looking for team" flag. Writes ONLY the caller's
// own account (resolved via their Discord id), mirroring the site's Free
// Agents toggle. The free-agent board mirror reacts via realtime.
export default {
  data: new SlashCommandBuilder()
    .setName('lft')
    .setDescription('Toggle your "looking for team" status')
    .addStringOption((o) =>
      o.setName('status')
        .setDescription('on = show me on the free-agent board, off = remove me')
        .setRequired(true)
        .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })),
  async execute(interaction, ctx) {
    const acc = await ctx.acl.getAccountByDiscordId(interaction.user.id);
    if (!acc) {
      return interaction.reply({
        content: `No ACL account linked to your Discord yet — sign up at ${link.site()} first.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const on = interaction.options.getString('status') === 'on';
    await ctx.acl.setLookingForTeam(acc.id, on);
    return interaction.reply({
      content: on
        ? `🔎 You're now flagged **looking for team** — captains can find you on the Free Agents board: ${link.site()}/?tab=agents`
        : 'You are no longer flagged as looking for a team.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
