import { config } from '../config.js';

// ACL brand accent for embeds.
export const ACCENT = 0x0a6e92;

// Format a stored rank (accounts.riot_tier/division/lp — already the
// player's HIGHEST Solo/Duo rank) as a readable string.
export function formatRank(acc) {
  if (!acc || !acc.riot_tier || acc.riot_tier === 'UNRANKED') return 'Unranked';
  const tier = acc.riot_tier.charAt(0) + acc.riot_tier.slice(1).toLowerCase();
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(acc.riot_tier);
  if (apex) return `${tier} ${acc.riot_lp ?? 0} LP`;
  const div = acc.riot_division ? ` ${acc.riot_division}` : '';
  return `${tier}${div}`;
}

// Atlantic-time string with the zone abbreviation (AST/ADT) baked in.
export function formatTime(iso, { dateOnly = false } = {}) {
  const opts = dateOnly
    ? { weekday: 'short', month: 'short', day: 'numeric', timeZone: config.timezone }
    : {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
        timeZone: config.timezone, timeZoneName: 'short',
      };
  return new Intl.DateTimeFormat('en-CA', opts).format(new Date(iso));
}

// Discord relative timestamp, e.g. "<t:1700000000:R>" -> "in 3 hours".
export function discordRelative(iso) {
  return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:R>`;
}

export const link = {
  match: (id) => `${config.siteUrl}/?match=${id}`,
  team: (id) => `${config.siteUrl}/?team=${id}`,
  player: (id) => `${config.siteUrl}/?player=${id}`,
  schedule: () => `${config.siteUrl}/?tab=schedule`,
  standings: () => `${config.siteUrl}/?tab=standings`,
  site: () => config.siteUrl,
};

export function teamLabel(team) {
  if (!team) return 'TBD';
  return team.tag ? `${team.name} (${team.tag})` : team.name;
}
