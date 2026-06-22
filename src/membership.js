// Discord-server membership tracking. The website's signup gate requires
// players to be in the ACL server; rather than the site asking Discord
// "is this user in the guild?" per signup (tight per-token rate limit), the
// bot — which is already in the server — owns the truth and writes
// accounts.is_in_discord_server from gateway events. The site just reads it.
import * as acl from './lib/acl.js';
import { log } from './lib/log.js';

// On startup, mark every linked account that IS currently in the guild as
// in-server. Additive only: we don't flip anyone to false here, so accounts
// grandfathered to true (existing players from before the gate) aren't
// retroactively locked out. Leaving the server flips false via the live
// GuildMemberRemove event.
export async function reconcileAllMembership(guild) {
  await guild.members.fetch().catch(() => null); // populate cache
  const present = new Set(guild.members.cache.map((m) => m.id));
  const accounts = await acl.getLinkedAccounts();
  const toTrue = accounts
    .filter((a) => present.has(a.discord_id) && !a.is_in_discord_server)
    .map((a) => a.id);
  await acl.setMembershipForAccounts(toTrue, true);
  log.info(`Membership reconcile: marked ${toTrue.length} present member(s) in-server (of ${accounts.length} linked).`);
}

// A member joined (isIn=true) or left (isIn=false) the server.
export async function setMemberPresence(discordId, isIn) {
  try {
    await acl.setDiscordMemberByDiscordId(discordId, isIn);
    log.info(`Membership: ${discordId} → ${isIn ? 'in server' : 'left server'}`);
  } catch (e) {
    log.error('setMemberPresence', e);
  }
}

// An account row was created/updated (e.g. a new signup) and is flagged out.
// If that Discord user is actually already in the guild, flip the flag on.
// Covers people who were in the server BEFORE they signed up on the site
// (so GuildMemberAdd already fired and won't fire again).
export async function reconcileAccountFromRow(guild, row) {
  if (!row?.discord_id || row.is_in_discord_server) return;
  let inGuild = guild.members.cache.has(row.discord_id);
  if (!inGuild) inGuild = !!(await guild.members.fetch(row.discord_id).catch(() => null));
  if (inGuild) {
    try { await acl.setDiscordMemberByDiscordId(row.discord_id, true); }
    catch (e) { log.error('reconcileAccountFromRow', e); }
  }
}
