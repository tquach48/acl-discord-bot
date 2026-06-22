// Read layer over the ACL Supabase backend. Everything the bot needs to
// know about players, teams, matches, and the current tournament.
// Mirrors the website's data model; treat as read-only.
import { supabase } from '../supabase.js';

// ---- Province → Discord role mapping -------------------------------------
export const PROVINCE_ROLE = {
  NS: 'Nova Scotia',
  NB: 'New Brunswick',
  PE: 'PEI',
  NL: 'Newfoundland & Labrador',
};
export const OOR_ROLE = 'Out of Region (OOR)';
export const ALL_PROVINCE_ROLE_NAMES = [...Object.values(PROVINCE_ROLE), OOR_ROLE];

// Nice fixed colours for the auto-created province roles (hex ints).
export const PROVINCE_ROLE_COLOR = {
  'Nova Scotia': 0x1c8fc7,
  'New Brunswick': 0xf2c14e,
  PEI: 0xe07a5f,
  'Newfoundland & Labrador': 0x6a8d3a,
  [OOR_ROLE]: 0x8895a7,
};

export const CAPTAIN_ROLE = 'Team Captain';
export const MATCH_PINGS_ROLE = 'Match Pings';

export function provinceRoleName(code) {
  return PROVINCE_ROLE[code] || OOR_ROLE;
}

// ---- Accounts ------------------------------------------------------------
export async function getAccountByDiscordId(discordId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('discord_id', discordId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getAccountById(id) {
  const { data, error } = await supabase.from('accounts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

// Strip characters that would break a PostgREST or() filter string (commas
// split conditions; parens/asterisks/colons/quotes are operators/wildcards).
function sanitizeSearch(s) {
  return String(s).replace(/[,()*:"%]/g, ' ').trim();
}

// Loose lookup for /profile <player>: match on display name or Riot ID.
// PostgREST uses `*` (not `%`) as the wildcard inside an or() filter.
export async function searchAccount(query) {
  const q = sanitizeSearch(query);
  if (!q) return null;
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .or(`display_name.ilike.*${q}*,riot_id.ilike.*${q}*`)
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

// ---- Tournament scope ----------------------------------------------------
export async function getActiveTournamentId() {
  const { data } = await supabase
    .from('tournament_config')
    .select('active_tournament_id')
    .maybeSingle();
  return data?.active_tournament_id || null;
}

export async function getActiveStageIds() {
  const tid = await getActiveTournamentId();
  if (!tid) return [];
  const { data } = await supabase.from('stages').select('id').eq('tournament_id', tid);
  return (data || []).map((s) => s.id);
}

// ---- Teams ---------------------------------------------------------------
const TEAM_COLS = 'id, name, tag, region, color, captain_id';

export async function getTeams() {
  const { data, error } = await supabase.from('teams').select(TEAM_COLS).order('name');
  if (error) throw error;
  return data || [];
}

export async function getTeamById(id) {
  const { data, error } = await supabase.from('teams').select(TEAM_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getTeamByName(name) {
  const q = sanitizeSearch(name);
  if (!q) return null;
  const { data, error } = await supabase
    .from('teams')
    .select(TEAM_COLS)
    .or(`name.ilike.*${q}*,tag.ilike.*${q}*`)
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function getCaptainTeams(accountId) {
  const { data, error } = await supabase.from('teams').select(TEAM_COLS).eq('captain_id', accountId);
  if (error) throw error;
  return data || [];
}

// ---- Roster --------------------------------------------------------------
// Two queries (members, then accounts) to avoid relying on embedded-join
// aliases, which have bitten the website before.
export async function getRoster(teamId) {
  const { data: mems, error } = await supabase
    .from('team_members')
    .select('account_id, role, is_sub')
    .eq('team_id', teamId)
    .is('left_at', null);
  if (error) throw error;
  const ids = (mems || []).map((m) => m.account_id);
  if (!ids.length) return [];
  const { data: accts } = await supabase
    .from('accounts')
    .select('id, discord_id, display_name, riot_id, riot_tier, riot_division, riot_lp')
    .in('id', ids);
  const byId = new Map((accts || []).map((a) => [a.id, a]));
  return (mems || []).map((m) => ({ ...m, account: byId.get(m.account_id) || null }));
}

export async function getRosterDiscordIds(teamId) {
  const roster = await getRoster(teamId);
  return roster.map((r) => r.account?.discord_id).filter(Boolean);
}

// The player's current active team id (null if free agent).
export async function getCurrentTeamId(accountId) {
  const { data, error } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('account_id', accountId)
    .is('left_at', null)
    .limit(1);
  if (error) throw error;
  return data?.[0]?.team_id || null;
}

// ---- Matches -------------------------------------------------------------
export async function getMatchById(id) {
  const { data, error } = await supabase.from('matches').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

// Upcoming matches, scoped to the active tournament's stages. Optionally
// filtered to one team and/or capped.
export async function getUpcomingMatches({ teamId = null, limit = null } = {}) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('status', 'upcoming')
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  const stageIds = await getActiveStageIds();
  // When an active tournament exists, scope strictly to its stages (a match
  // with no stage_id belongs to no active stage, so it's excluded). With no
  // active tournament set, fall back to showing all upcoming matches.
  let rows = (data || []).filter(
    (m) => !stageIds.length || (m.stage_id && stageIds.includes(m.stage_id)),
  );
  if (teamId) rows = rows.filter((m) => m.team1_id === teamId || m.team2_id === teamId);
  if (limit) rows = rows.slice(0, limit);
  return rows;
}

export async function getNextMatchForTeam(teamId) {
  const rows = await getUpcomingMatches({ teamId, limit: 1 });
  return rows[0] || null;
}

// Win/loss standings for the active tournament, from completed matches.
export async function getStandings() {
  const stageIds = await getActiveStageIds();
  const { data: matches, error } = await supabase
    .from('matches')
    .select('team1_id, team2_id, score1, score2, status, stage_id')
    .eq('status', 'completed');
  if (error) throw error;
  const teams = await getTeams();
  const table = new Map(teams.map((t) => [t.id, { team: t, wins: 0, losses: 0 }]));
  for (const m of matches || []) {
    if (stageIds.length && m.stage_id && !stageIds.includes(m.stage_id)) continue;
    const winner = m.score1 > m.score2 ? m.team1_id : m.score2 > m.score1 ? m.team2_id : null;
    if (!winner) continue; // draws don't move W/L
    const loser = winner === m.team1_id ? m.team2_id : m.team1_id;
    if (table.has(winner)) table.get(winner).wins += 1;
    if (table.has(loser)) table.get(loser).losses += 1;
  }
  return [...table.values()]
    .filter((r) => r.wins + r.losses > 0)
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.team.name.localeCompare(b.team.name));
}

// ---- Calendar events -----------------------------------------------------
export async function getMatchByIdSafe(id) {
  try { return await getMatchById(id); } catch { return null; }
}
