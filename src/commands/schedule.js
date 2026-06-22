import { SlashCommandBuilder } from 'discord.js';
import { matchLine, scheduleEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Upcoming ACL matches'),
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const matches = await ctx.acl.getUpcomingMatches({ limit: 8 });
    const lines = [];
    for (const m of matches) lines.push(await matchLine(m, ctx));
    return interaction.editReply({ embeds: [scheduleEmbed('📅 Upcoming Matches', lines)] });
  },
};
