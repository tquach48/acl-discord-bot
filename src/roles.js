// Idempotent role management: create-if-missing, add/remove only what
// changed, and surface role-hierarchy errors (bot role must sit above the
// roles it manages) instead of throwing.
import {
  provinceRoleName, ALL_PROVINCE_ROLE_NAMES, PROVINCE_ROLE_COLOR,
  CAPTAIN_ROLE, MATCH_PINGS_ROLE,
} from './lib/acl.js';
import * as acl from './lib/acl.js';
import { log } from './lib/log.js';

const CAPTAIN_COLOR = 0xf6c026;
const PINGS_COLOR = 0x0a6e92;

function findRole(guild, name) {
  return guild.roles.cache.find((r) => r.name === name) || null;
}

// Accept hex strings ("#1e6091" / "1e6091"), ints, or null and return an int
// (or undefined). Team colors arrive from the DB as hex strings; passing a
// malformed value straight to roles.create() would throw.
function resolveColor(color) {
  if (color == null || color === '') return undefined;
  if (typeof color === 'number') return Number.isNaN(color) ? undefined : color;
  const n = Number.parseInt(String(color).replace('#', '').trim(), 16);
  return Number.isNaN(n) ? undefined : n;
}

// Find a role by name, creating it if it doesn't exist yet.
export async function ensureRole(guild, name, color, { mentionable = false } = {}) {
  const existing = findRole(guild, name);
  if (existing) return existing;
  log.info(`Creating role "${name}"`);
  // discord.js v14.18+ replaced the singular `color` with a `colors` object
  // (primary/secondary/tertiary for gradient roles). Only set it when we have
  // a valid int so a colorless role stays default.
  const opts = { name, mentionable, reason: 'ACL bot managed role' };
  const resolved = resolveColor(color);
  if (resolved !== undefined) opts.colors = { primaryColor: resolved };
  return guild.roles.create(opts);
}

export async function ensureMatchPingsRole(guild) {
  return ensureRole(guild, MATCH_PINGS_ROLE, PINGS_COLOR);
}

function roleErr(name, e) {
  if (e?.code === 50013) return `${name} — the bot's role must be ABOVE this role`;
  return `${name} — ${e?.message || 'failed'}`;
}

// Apply the desired province / team / captain roles to a guild member.
// `desired`: { provinceCode, currentTeam, teams, isCaptain }
export async function syncMemberRoles(guild, member, desired) {
  const { provinceCode, currentTeam, teams, isCaptain } = desired;
  const added = [];
  const removed = [];
  const errors = [];

  const tryAdd = async (role) => {
    if (role && !member.roles.cache.has(role.id)) {
      try { await member.roles.add(role); added.push(role.name); }
      catch (e) { errors.push(roleErr(role.name, e)); }
    }
  };
  const tryRemove = async (role) => {
    if (role && member.roles.cache.has(role.id)) {
      try { await member.roles.remove(role); removed.push(role.name); }
      catch (e) { errors.push(roleErr(role.name, e)); }
    }
  };

  // --- Province (exactly one) ---
  const wantProvince = provinceRoleName(provinceCode);
  let provRole = null;
  try { provRole = await ensureRole(guild, wantProvince, PROVINCE_ROLE_COLOR[wantProvince]); }
  catch (e) { errors.push(roleErr(wantProvince, e)); }
  await tryAdd(provRole);
  for (const name of ALL_PROVINCE_ROLE_NAMES) {
    if (name !== wantProvince) await tryRemove(findRole(guild, name));
  }

  // --- Team (at most one) ---
  const teamNames = new Set(teams.map((t) => t.name));
  if (currentTeam) {
    let teamRole = null;
    try { teamRole = await ensureRole(guild, currentTeam.name, currentTeam.color); }
    catch (e) { errors.push(roleErr(currentTeam.name, e)); }
    await tryAdd(teamRole);
  }
  for (const role of [...member.roles.cache.values()]) {
    if (teamNames.has(role.name) && (!currentTeam || role.name !== currentTeam.name)) {
      await tryRemove(role);
    }
  }

  // --- Team Captain ---
  if (isCaptain) {
    let cap = null;
    try { cap = await ensureRole(guild, CAPTAIN_ROLE, CAPTAIN_COLOR); }
    catch (e) { errors.push(roleErr(CAPTAIN_ROLE, e)); }
    await tryAdd(cap);
  } else {
    await tryRemove(findRole(guild, CAPTAIN_ROLE));
  }

  return { added, removed, errors };
}

// Gather the player's current team + captaincy from the DB, then sync.
// `teams` (all teams) is only used to know which role names are team roles so
// stale ones can be removed; captaincy is tied to the CURRENT team (matching
// the website: a player is a captain iff they captain the team they're on).
export async function syncForAccount(guild, member, account) {
  const teams = await acl.getTeams();
  const currentTeamId = await acl.getCurrentTeamId(account.id);
  const currentTeam = currentTeamId ? teams.find((t) => t.id === currentTeamId) || null : null;
  const isCaptain = !!currentTeam && currentTeam.captain_id === account.id;
  return syncMemberRoles(guild, member, {
    provinceCode: account.province,
    currentTeam,
    teams,
    isCaptain,
  });
}
