import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ACCENT, link } from '../lib/format.js';
import { addTournamentOption, resolveTournament, scopeSuffix } from '../lib/tournamentOption.js';

export default {
  data: addTournamentOption(
    new SlashCommandBuilder()
      .setName('standings')
      .setDescription('Current ACL standings (W–L)'),
  ),
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const t = await resolveTournament(interaction, ctx);
    if (t.error) return interaction.editReply({ content: t.error });
    const rows = await ctx.acl.getStandings(t.id);
    const body = rows.length
      ? rows
          .map((r, i) => {
            const rank = String(i + 1).padStart(2, ' ');
            const tag = (r.team.tag || r.team.name).slice(0, 18).padEnd(18, ' ');
            return `${rank}. ${tag} ${r.wins}-${r.losses}`;
          })
          .join('\n')
      : 'No completed matches yet.';
    const embed = new EmbedBuilder()
      .setColor(ACCENT)
      .setTitle(`🏆 Standings${scopeSuffix(t)}`)
      .setDescription('```\n' + body.slice(0, 3900) + '\n```')
      .setURL(link.standings())
      .setFooter({ text: 'Atlantic Canada League · playacl.ca' });
    return interaction.editReply({ embeds: [embed] });
  },
};
