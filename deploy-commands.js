// Registers the bot's slash commands to your guild (instant, unlike global
// commands which can take up to an hour). Run after adding/changing a
// command: `npm run deploy-commands`.
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commands } from './src/commands/index.js';

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, GUILD_ID } = process.env;
const missing = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'GUILD_ID'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[deploy-commands] Missing env var(s): ${missing.join(', ')}`);
  process.exit(1);
}

const body = commands.map((c) => c.data.toJSON());
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

try {
  await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, GUILD_ID), { body });
  console.log(`Registered ${body.length} guild command(s): ${body.map((c) => c.name).join(', ')}`);
} catch (err) {
  console.error('Failed to register commands:', err);
  process.exit(1);
}
