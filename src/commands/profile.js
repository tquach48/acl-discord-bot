import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { buildProfileEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Show a player's ACL profile")
    .addStringOption((o) =>
      o.setName('player').setDescription('Summoner / display name or Riot ID (defaults to you)')),
  async execute(interaction, ctx) {
    const query = interaction.options.getString('player');
    const acc = query
      ? await ctx.acl.searchAccount(query)
      : await ctx.acl.getAccountByDiscordId(interaction.user.id);
    if (!acc) {
      return interaction.reply({
        content: query ? `No player found matching "${query}".` : 'No ACL account linked to your Discord yet.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const embed = await buildProfileEmbed(acc, ctx);
    return interaction.reply({ embeds: [embed] });
  },
};
