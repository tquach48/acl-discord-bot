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

// Per-season participation role, e.g. "ACL Season 4". The tournament name is
// free text; ensure a single "ACL " prefix whether it's stored as "Season 4"
// or already "ACL Season 4".
export const TOURNAMENT_ROLE_COLOR = 0x0a6e92;
export function tournamentRoleName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  return /^acl\b/i.test(n) ? n : `ACL ${n}`;
}

export function provinceRoleName(code) {
  return PROVINCE_ROLE[code] || OOR_ROLE;
}

// ---- Rank → Discord role mapping ------------------------------------------
// One role per Riot tier (accounts.riot_tier — the player's HIGHEST Solo/Duo
// tier, refreshed by the website's rank sync). Unranked players get no rank
// role; a player holds at most one.
export const RANK_TIERS = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
  'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER',
];
export function rankRoleName(tier) {
  const t = String(tier || '').toUpperCase();
  if (!RANK_TIERS.includes(t)) return null;
  return t.charAt(0) + t.slice(1).toLowerCase(); // "Diamond"
}
export const ALL_RANK_ROLE_NAMES = RANK_TIERS.map((t) => rankRoleName(t));
export const RANK_ROLE_COLOR = {
  Iron:        0x51484a,
  Bronze:      0x8c523a,
  Silver:      0x80989d,
  Gold:        0xcd8837,
  Platinum:    0x4e9996,
  Emerald:     0x149c3a,
  Diamond:     0x576bce,
  Master:      0x9d48e0,
  Grandmaster: 0xcd4545,
  Challenger:  0xf4c874,
};

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

// All accounts linked to a Discord user (the players the bot can role-manage).
export async function getLinkedAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, discord_id, display_name, province, is_in_discord_server, riot_tier')
    .not('discord_id', 'is', null);
  if (error) throw error;
  return data || [];
}

// Membership flag the website's signup gate reads. The bot is the source of
// truth (it's in the server), so it writes this from gateway join/leave events
// instead of the site hammering Discord's API per user.
export async function setDiscordMemberByDiscordId(discordId, isIn) {
  const { error } = await supabase
    .from('accounts')
    .update({ is_in_discord_server: isIn, updated_at: new Date().toISOString() })
    .eq('discord_id', discordId);
  if (error) throw error;
}

export async function setMembershipForAccounts(accountIds, isIn) {
  if (!accountIds.length) return;
  const { error } = await supabase
    .from('accounts')
    .update({ is_in_discord_server: isIn, updated_at: new Date().toISOString() })
    .in('id', accountIds);
  if (error) throw error;
}

// Liveness heartbeat. The website's membership gate fails open when this goes
// stale (it assumes the bot is down and stops enforcing).
export async function touchHeartbeat() {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('bot_status')
    .upsert({ id: true, last_heartbeat_at: now, updated_at: now }, { onConflict: 'id' });
  if (error) throw error;
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

// The active tournament row (id + name), for the per-season participation role.
export async function getActiveTournament() {
  const id = await getActiveTournamentId();
  if (!id) return null;
  const { data } = await supabase.from('tournaments').select('id, name').eq('id', id).maybeSingle();
  return data || null;
}

// All tournaments (id + name) — used to prune stale season roles.
export async function getTournaments() {
  const { data, error } = await supabase.from('tournaments').select('id, name');
  if (error) throw error;
  return data || [];
}

// Set of team ids participating in a tournament.
export async function getTournamentTeamIds(tournamentId) {
  const { data, error } = await supabase
    .from('tournament_teams')
    .select('team_id')
    .eq('tournament_id', tournamentId);
  if (error) throw error;
  return new Set((data || []).map((r) => r.team_id));
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
  // Primary captain (teams.captain_id) ...
  const { data, error } = await supabase.from('teams').select(TEAM_COLS).eq('captain_id', accountId);
  if (error) throw error;
  const teams = data || [];
  // ... plus co-captain memberships (team_members.is_captain, 0084) — scoped
  // to the ACTIVE tournament, matching the server-side is_team_captain (0086):
  // old-season rows stay open as history and must not confer powers.
  const activeTid = await getActiveTournamentId();
  if (!activeTid) return teams;
  const { data: coRows, error: coErr } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('account_id', accountId)
    .eq('is_captain', true)
    .eq('tournament_id', activeTid)
    .is('left_at', null);
  if (coErr) throw coErr;
  const have = new Set(teams.map((t) => t.id));
  const extraIds = [...new Set((coRows || []).map((r) => r.team_id))].filter((id) => !have.has(id));
  if (extraIds.length) {
    const { data: extra, error: exErr } = await supabase
      .from('teams').select(TEAM_COLS).in('id', extraIds);
    if (exErr) throw exErr;
    teams.push(...(extra || []));
  }
  return teams;
}

// Rostered players on the given teams that have a linked Twitch account.
// Returns [{ display_name, twitch_username, team_id }] for live-announce embeds.
export async function getTeamStreamers(teamIds) {
  const ids = (teamIds || []).filter(Boolean);
  if (!ids.length) return [];
  const { data: mems, error } = await supabase
    .from('team_members')
    .select('account_id, team_id')
    .in('team_id', ids)
    .is('left_at', null);
  if (error) throw error;
  const accIds = [...new Set((mems || []).map((m) => m.account_id))];
  if (!accIds.length) return [];
  const { data: accs, error: aErr } = await supabase
    .from('accounts')
    .select('id, display_name, twitch_username')
    .in('id', accIds)
    .not('twitch_username', 'is', null);
  if (aErr) throw aErr;
  const teamByAcc = new Map((mems || []).map((m) => [m.account_id, m.team_id]));
  return (accs || []).map((a) => ({
    display_name: a.display_name,
    twitch_username: a.twitch_username,
    team_id: teamByAcc.get(a.id) || null,
  }));
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

// Every active (not-left) team membership, for bulk role syncs without an
// N+1 query per player.
export async function getActiveMemberships() {
  const { data, error } = await supabase
    .from('team_members')
    .select('account_id, team_id')
    .is('left_at', null);
  if (error) throw error;
  return data || [];
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

// The team's game happening NOW: its live (in-progress) match if any,
// otherwise the next upcoming one. Used by /code so a captain gets the code
// for the current game, not the one after it.
export async function getCurrentMatchForTeam(teamId) {
  const stageIds = await getActiveStageIds();
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('status', 'live')
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  const live = (data || []).find(
    (m) => (m.team1_id === teamId || m.team2_id === teamId)
      && (!stageIds.length || (m.stage_id && stageIds.includes(m.stage_id))),
  );
  return live || getNextMatchForTeam(teamId);
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

// Self-serve LFT flag (accounts.looking_for_team). The bot authorizes by
// resolving the caller's OWN discord_id → account, so players can only flip
// themselves.
export async function setLookingForTeam(accountId, isLooking) {
  const { error } = await supabase
    .from('accounts')
    .update({ looking_for_team: !!isLooking, updated_at: new Date().toISOString() })
    .eq('id', accountId);
  if (error) throw error;
}

// Captain-only recruiting flag (teams.looking_for_fa). Caller must be
// verified as the team's captain BEFORE calling this.
export async function setTeamLookingForFA(teamId, isLooking) {
  const { error } = await supabase
    .from('teams')
    .update({ looking_for_fa: !!isLooking })
    .eq('id', teamId);
  if (error) throw error;
}

// Ingested games for one match — per-game scorelines for result embeds.
export async function getGamesForMatch(matchId) {
  const { data, error } = await supabase
    .from('games')
    .select('id, game_number, duration_sec, winner_team_id, blue_team_id, red_team_id')
    .eq('match_id', matchId)
    .order('game_number');
  if (error) throw error;
  return data || [];
}

// ---- Check-ins (match_checkins, bot-written) ------------------------------
export async function upsertCheckin(matchId, teamId, status, respondedBy) {
  const { error } = await supabase
    .from('match_checkins')
    .upsert(
      { match_id: matchId, team_id: teamId, status, responded_by: respondedBy, responded_at: new Date().toISOString() },
      { onConflict: 'match_id,team_id' },
    );
  if (error) throw error;
}

export async function getCheckinsForMatch(matchId) {
  const { data, error } = await supabase
    .from('match_checkins')
    .select('team_id, status, responded_at')
    .eq('match_id', matchId);
  if (error) throw error;
  return data || [];
}

// ---- Bot-path score report (bot_report_match_score RPC) -------------------
// Authorizes inside Postgres by discord id (captain on match / admin).
export async function reportMatchScoreAsBot(discordId, matchId, s1, s2) {
  const { error } = await supabase.rpc('bot_report_match_score', {
    p_discord_id: discordId,
    p_match_id: matchId,
    p_team1_score: s1,
    p_team2_score: s2,
  });
  if (error) throw error;
}

// ---- MVP votes -------------------------------------------------------------
export async function castMvpVote(matchId, accountId, voterDiscordId) {
  const { error } = await supabase
    .from('mvp_votes')
    .upsert(
      { match_id: matchId, account_id: accountId, voter_discord_id: voterDiscordId },
      { onConflict: 'match_id,voter_discord_id' },
    );
  if (error) throw error;
}

export async function getMvpTally(matchId) {
  const { data, error } = await supabase
    .from('mvp_votes')
    .select('account_id')
    .eq('match_id', matchId);
  if (error) throw error;
  const counts = new Map();
  for (const v of data || []) counts.set(v.account_id, (counts.get(v.account_id) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

// Distinct rostered players who appeared in a match's ingested games — the
// MVP poll candidates. Unrostered (account_id null) rows are skipped.
export async function getMatchParticipants(matchId) {
  const games = await getGamesForMatch(matchId);
  if (!games.length) return [];
  const { data, error } = await supabase
    .from('game_player_stats')
    .select('account_id, summoner_name, game_id')
    .in('game_id', games.map((g) => g.id));
  if (error) throw error;
  const seen = new Map();
  for (const row of data || []) {
    if (!row.account_id || seen.has(row.account_id)) continue;
    seen.set(row.account_id, { accountId: row.account_id, name: row.summoner_name || 'Player' });
  }
  return [...seen.values()];
}

// ---- Calendar events -----------------------------------------------------
export async function getMatchByIdSafe(id) {
  try { return await getMatchById(id); } catch { return null; }
}
