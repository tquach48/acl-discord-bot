import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { link, teamLabel } from '../lib/format.js';

// /lfa on|off — captain-only "we're recruiting" flag (teams.looking_for_fa).
// The bot runs on the service-role key, so it authorizes here: the caller
// must be the captain of the team being flipped.
export default {
  data: new SlashCommandBuilder()
    .setName('lfa')
    .setDescription("Toggle your team's 'recruiting free agents' status (captains only)")
    .addStringOption((o) =>
      o.setName('status')
        .setDescription('on = show your team as recruiting, off = stop')
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
    const captainTeams = await ctx.acl.getCaptainTeams(acc.id);
    if (!captainTeams.length) {
      return interaction.reply({
        content: 'Only team captains can flip their team\'s recruiting status.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const team = captainTeams[0];
    const on = interaction.options.getString('status') === 'on';
    await ctx.acl.setTeamLookingForFA(team.id, on);
    return interaction.reply({
      content: on
        ? `📣 **${teamLabel(team)}** is now flagged as recruiting — free agents will see it on ${link.site()}/?tab=agents`
        : `**${teamLabel(team)}** is no longer flagged as recruiting.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
