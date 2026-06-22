import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';

// (Admin) Bulk-assign province/team/captain roles to every linked ACL player.
// Hidden from non-staff via default member perms; the real gate is the ACL
// is_admin check on the caller. Shows a confirm button before mutating.
export default {
  data: new SlashCommandBuilder()
    .setName('sync-all-roles')
    .setDescription('(Admin) Assign province/team/captain roles to every ACL player in the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction, ctx) {
    const acc = await ctx.acl.getAccountByDiscordId(interaction.user.id);
    if (!acc?.is_admin) {
      return interaction.reply({ content: 'This command is for ACL admins only.', flags: MessageFlags.Ephemeral });
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('acl:sync-all').setLabel('Sync all ACL roles').setStyle(ButtonStyle.Danger).setEmoji('🔄'),
      new ButtonBuilder().setCustomId('acl:sync-cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({
      content: 'This will create any missing roles and assign **province / team / Team Captain** roles to every linked ACL player currently in this server (and remove ones that no longer apply). Continue?',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
};
