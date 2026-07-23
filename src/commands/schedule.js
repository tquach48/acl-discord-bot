import { SlashCommandBuilder } from 'discord.js';
import { matchLine, scheduleEmbed } from '../lib/embeds.js';
import { addTournamentOption, resolveTournament, scopeSuffix } from '../lib/tournamentOption.js';

export default {
  data: addTournamentOption(
    new SlashCommandBuilder()
      .setName('schedule')
      .setDescription('Upcoming ACL matches'),
  ),
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const t = await resolveTournament(interaction, ctx);
    if (t.error) return interaction.editReply({ content: t.error });
    const matches = await ctx.acl.getUpcomingMatches({ limit: 8, tournamentId: t.id });
    const lines = [];
    for (const m of matches) lines.push(await matchLine(m, ctx));
    return interaction.editReply({
      embeds: [scheduleEmbed(`📅 Upcoming Matches${scopeSuffix(t)}`, lines)],
    });
  },
};
