import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { buildTeamEmbed } from '../lib/embeds.js';
import { addTournamentOption, resolveTournament } from '../lib/tournamentOption.js';

export default {
  data: addTournamentOption(
    new SlashCommandBuilder()
      .setName('team')
      .setDescription('Show a team: roster, captain, next match')
      .addStringOption((o) =>
        o.setName('name').setDescription('Team name or tag').setRequired(true)),
    'Show this team as it stands in another tournament (defaults to the main one)',
  ),
  async execute(interaction, ctx) {
    const name = interaction.options.getString('name');
    const team = await ctx.acl.getTeamByName(name);
    if (!team) {
      return interaction.reply({ content: `No team found matching "${name}".`, flags: MessageFlags.Ephemeral });
    }
    const t = await resolveTournament(interaction, ctx);
    if (t.error) return interaction.reply({ content: t.error, flags: MessageFlags.Ephemeral });
    const embed = await buildTeamEmbed(team, ctx, t);
    return interaction.reply({ embeds: [embed] });
  },
};
