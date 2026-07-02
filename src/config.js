import 'dotenv/config';

// Config is read at import (side-effect free). Validation is explicit via
// assertConfig() so that tooling which only needs the command definitions
// (deploy-commands.js, eslint) can import modules without a full .env.
export const config = {
  discordToken: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.GUILD_ID,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  matchDayChannelId: process.env.MATCH_DAY_CHANNEL_ID,
  onboardingChannelId: process.env.ONBOARDING_CHANNEL_ID,
  // Optional: free-agent board channel. When set, LFT players are mirrored
  // there (posted on flip-on, removed on flip-off). Unset = mirror off;
  // /lft still works (it only writes the DB flag).
  freeAgentsChannelId: process.env.FREE_AGENTS_CHANNEL_ID || null,
  timezone: process.env.TIMEZONE || 'America/Halifax',
  siteUrl: (process.env.SITE_URL || 'https://playacl.ca').replace(/\/$/, ''),

  // Discord-server membership tracking (bot writes accounts.is_in_discord_server
  // from join/leave events + reconcile + heartbeat for the website's fail-open
  // gate). DISABLED for now — the site just prompts players to click the invite
  // without verifying. Flip to true to re-enable the whole machinery.
  membershipTracking: false,

  // Rank roles (Iron…Challenger from each player's stored Solo/Duo tier).
  // DISABLED: syncs skip rank roles entirely and strip any previously
  // assigned tier role. Set RANK_ROLES=true in the env to re-enable.
  rankRoles: process.env.RANK_ROLES === 'true',
};

const REQUIRED = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'GUILD_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MATCH_DAY_CHANNEL_ID',
  'ONBOARDING_CHANNEL_ID',
];

// Call once at bot startup. Fails fast with a friendly message.
export function assertConfig() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[config] Missing required env var(s): ${missing.join(', ')}`);
    console.error('[config] Copy .env.example to .env and fill them in (see README.md).');
    process.exit(1);
  }
}
