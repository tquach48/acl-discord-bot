# ACL Discord Bot

A companion Discord bot for the **Atlantic Canada League** ([playacl.ca](https://playacl.ca)) —
match notifications, self-serve roles, and quick league info, reading straight from the league's
Supabase backend.

It is a standalone always-on Node service. It does **not** modify the website.

## What it does

**Match notifications** (`#match-day` channel)
- Reminders **24 h** and **1 h** before each upcoming match, pinging the specific players of both
  teams (by their linked Discord) — plus an opt-in **Match Pings** role for everyone else.
- **🔴 LIVE NOW** when a match goes live, and the **final score** when it's reported. (Driven by
  Supabase Realtime — the bot reacts to DB changes from the website.)
- A daily 9 AM (Atlantic) post of any calendar deadlines/milestones due that day.

**Self-serve roles** (button in `#onboarding`, or `/roles`)
- Assigns your **province** role (Nova Scotia / New Brunswick / PEI / Newfoundland & Labrador /
  Out of Region), your **team** role, and the **Team Captain** role if you captain a team.
- **Auto role-sync:** when your province/team/captaincy changes on the site, your Discord roles
  update automatically.

**Info commands** — `/whoami`, `/profile [player]`, `/team <name>`, `/schedule`, `/mymatches`,
`/standings`, and `/code` (captains only — DMs your next match's tournament code + draft link).

> The bot links Discord ↔ ACL accounts via `accounts.discord_id`. Players must sign in with
> Discord at playacl.ca at least once before the bot recognizes them.

## Prerequisites

1. **A Discord application + bot** ([Discord Developer Portal](https://discord.com/developers/applications)).
   - Bot tab → **Reset Token** → copy `DISCORD_TOKEN`. General Info → copy `DISCORD_CLIENT_ID`.
   - Invite URL (OAuth2 → URL Generator): scopes **`bot`** + **`applications.commands`**;
     bot permissions **Manage Roles, Send Messages, Embed Links, Mention Everyone,
     Read Message History**.
2. **Your Supabase project** URL + **service-role** key (Dashboard → Settings → API).
3. **Realtime publication:** the bot subscribes to `matches`, `calendar_events`, `accounts`,
   `team_members`, `teams`. These are already in the league DB's realtime publication (the website
   uses them); if you ever recreate the DB, ensure they're added to `supabase_realtime`.
4. After inviting the bot, **drag its role above** the province/team/captain roles in
   Server Settings → Roles (Discord can only manage roles below its own).

## Setup

```bash
cp .env.example .env      # fill in the values (see comments in the file)
npm install
npm run deploy-commands   # register slash commands to your guild (instant)
npm start                 # run the bot
```

Enable **Developer Mode** in Discord (Settings → Advanced) to copy the Server ID and channel IDs.

## Environment variables

| Var | Required | What |
|-----|----------|------|
| `DISCORD_TOKEN` | ✅ | Bot token |
| `DISCORD_CLIENT_ID` | ✅ | Application (client) ID |
| `GUILD_ID` | ✅ | Your Discord server ID |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service-role key (**secret**) |
| `MATCH_DAY_CHANNEL_ID` | ✅ | Channel for reminders / live / results |
| `ONBOARDING_CHANNEL_ID` | ✅ | Channel for the self-serve roles button |
| `TIMEZONE` | — | Default `America/Halifax` |
| `SITE_URL` | — | Default `https://playacl.ca` |

⚠️ The **service-role key bypasses Row-Level Security** — it's full DB access. Keep it only in the
bot host's secret store. Never commit it or put it anywhere client-side. The bot enforces its own
authorization in code (e.g. `/code` is captain-gated).

## Hosting (free / cheap, always-on)

The bot keeps a persistent gateway connection, so it needs an always-on host (not Vercel/serverless).
A `Dockerfile` is included so it runs anywhere.

- **Oracle Cloud "Always Free" micro VM** — genuinely free 24/7; most setup (provision a VM,
  `git clone`, `npm install`, run under `systemd` or `pm2`).
- **Fly.io** — `fly launch` from the Dockerfile; small machines fit in the free allowance.
- **Koyeb** — free instance, Git/Docker deploy.
- **Self-host** — a spare PC or Raspberry Pi with `pm2` (free, but only up when the machine is on).

Set the env vars as host secrets (never bake them into the image).

## Local development

```bash
npm run check   # syntax check entry points
npm run lint    # eslint
npm start
```

## Project layout

```
src/
  index.js              entry: client wiring, interaction router, startup
  config.js             env load + assertConfig()
  supabase.js           lazy service-role client
  roles.js              idempotent role create/assign + syncForAccount
  flows/roleSelfService.js   shared /roles + button logic
  lib/{acl.js,format.js,embeds.js,log.js}
  commands/*            slash commands (+ index.js registry)
  buttons/assignRoles.js     button → handler map
  notifications/{cron.js,realtime.js}
deploy-commands.js      register slash commands to the guild
```

## Roadmap (scaffolded / not yet built)

Rank-tier roles · new-member onboarding DM · free-agent ping on Looking-for-Team ·
match check-in · admin commands (`/announce`, `/sync-all-roles`, `/create-team-roles`).
