import { SlashCommandBuilder } from 'discord.js';
import { assignRoles } from '../flows/roleSelfService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Assign your ACL province / team / captain roles'),
  execute: (interaction, ctx) => assignRoles(interaction, ctx),
};
