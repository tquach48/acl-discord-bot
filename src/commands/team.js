import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { buildTeamEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Show a team: roster, captain, next match')
    .addStringOption((o) =>
      o.setName('name').setDescription('Team name or tag').setRequired(true)),
  async execute(interaction, ctx) {
    const name = interaction.options.getString('name');
    const team = await ctx.acl.getTeamByName(name);
    if (!team) {
      return interaction.reply({ content: `No team found matching "${name}".`, flags: MessageFlags.Ephemeral });
    }
    const embed = await buildTeamEmbed(team, ctx);
    return interaction.reply({ embeds: [embed] });
  },
};
