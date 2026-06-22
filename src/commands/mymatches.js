import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { matchLine, scheduleEmbed } from '../lib/embeds.js';
import { config } from '../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mymatches')
    .setDescription("Your team's upcoming matches"),
  async execute(interaction, ctx) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const acc = await ctx.acl.getAccountByDiscordId(interaction.user.id);
    if (!acc) {
      return interaction.editReply({ content: `No ACL account linked. Sign in at ${config.siteUrl} first.` });
    }
    const teamId = await ctx.acl.getCurrentTeamId(acc.id);
    if (!teamId) {
      return interaction.editReply({ content: "You're not on a team right now, so you have no scheduled matches." });
    }
    const matches = await ctx.acl.getUpcomingMatches({ teamId, limit: 8 });
    const lines = [];
    for (const m of matches) lines.push(await matchLine(m, ctx));
    return interaction.editReply({ embeds: [scheduleEmbed('📅 Your Upcoming Matches', lines)] });
  },
};
