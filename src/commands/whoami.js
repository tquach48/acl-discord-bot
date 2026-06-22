import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { buildProfileEmbed } from '../lib/embeds.js';
import { config } from '../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('whoami')
    .setDescription('Show your linked ACL profile (rank, team, roles)'),
  async execute(interaction, ctx) {
    const acc = await ctx.acl.getAccountByDiscordId(interaction.user.id);
    if (!acc) {
      return interaction.reply({
        content: `No ACL account is linked to your Discord. Sign in with Discord at ${config.siteUrl} first.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const embed = await buildProfileEmbed(acc, ctx);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
