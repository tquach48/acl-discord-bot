import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { matchLine, scheduleEmbed } from '../lib/embeds.js';
import { config } from '../config.js';
import { addTournamentOption, resolveTournament, scopeSuffix } from '../lib/tournamentOption.js';

export default {
  data: addTournamentOption(
    new SlashCommandBuilder()
      .setName('mymatches')
      .setDescription("Your team's upcoming matches"),
  ),
  async execute(interaction, ctx) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const acc = await ctx.acl.getAccountByDiscordId(interaction.user.id);
    if (!acc) {
      return interaction.editReply({ content: `No ACL account linked. Sign in at ${config.siteUrl} first.` });
    }
    const t = await resolveTournament(interaction, ctx);
    if (t.error) return interaction.editReply({ content: t.error });
    const teamId = await ctx.acl.getCurrentTeamId(acc.id, t.id);
    if (!teamId) {
      return interaction.editReply({
        content: t.isMain
          ? "You're not on a team right now, so you have no scheduled matches."
          : `You're not on a team in **${t.name}**.`,
      });
    }
    const matches = await ctx.acl.getUpcomingMatches({ teamId, limit: 8, tournamentId: t.id });
    const lines = [];
    for (const m of matches) lines.push(await matchLine(m, ctx));
    return interaction.editReply({
      embeds: [scheduleEmbed(`📅 Your Upcoming Matches${scopeSuffix(t)}`, lines)],
    });
  },
};
