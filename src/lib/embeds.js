import { EmbedBuilder } from 'discord.js';
import { ACCENT, formatRank, formatTime, discordRelative, link, teamLabel } from './format.js';
import { provinceRoleName } from './acl.js';

function provinceLabel(code) {
  return code ? provinceRoleName(code) : 'Out of Region (OOR)';
}

export async function buildProfileEmbed(acc, ctx) {
  const teamId = await ctx.acl.getCurrentTeamId(acc.id);
  const team = teamId ? await ctx.acl.getTeamById(teamId) : null;
  const captainTeams = await ctx.acl.getCaptainTeams(acc.id);
  const isCaptainHere = team && captainTeams.some((t) => t.id === team.id);
  const roles = [acc.main_role, ...(acc.alt_roles || [])].filter(Boolean);

  const e = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle(acc.display_name || 'ACL Player')
    .setURL(link.player(acc.id))
    .addFields(
      { name: 'Rank (Solo/Duo)', value: formatRank(acc), inline: true },
      { name: 'Province', value: provinceLabel(acc.province), inline: true },
      {
        name: 'Team',
        value: team
          ? `[${team.name}](${link.team(team.id)})${isCaptainHere ? ' · ©' : ''}`
          : 'Free agent',
        inline: true,
      },
    )
    .setFooter({ text: 'Atlantic Canada League · playacl.ca' });

  if (roles.length) e.addFields({ name: 'Roles', value: roles.join(', '), inline: false });
  if (acc.riot_id) e.addFields({ name: 'Riot ID', value: acc.riot_id, inline: true });
  if (acc.twitch_username) {
    e.addFields({
      name: 'Twitch',
      value: `[twitch.tv/${acc.twitch_username}](https://twitch.tv/${acc.twitch_username})`,
      inline: true,
    });
  }
  if (acc.looking_for_team) {
    e.addFields({ name: 'Status', value: '🔎 Looking for a team', inline: true });
  }
  return e;
}

// `scope` is the resolved tournament from the shared `tournament:` option
// ({ id, name, isMain }); omit it for the main tournament. A team can be
// entered in several tournaments with a different roster in each.
export async function buildTeamEmbed(team, ctx, scope = null) {
  const tid = scope?.id || null;
  const roster = await ctx.acl.getRoster(team.id, tid);
  const next = await ctx.acl.getNextMatchForTeam(team.id, tid);
  const captain = team.captain_id ? await ctx.acl.getAccountById(team.captain_id) : null;

  const sorted = [...roster].sort((a, b) => (a.is_sub ? 1 : 0) - (b.is_sub ? 1 : 0));
  const rosterLines = sorted.length
    ? sorted.map((r) => {
        const name = r.account?.display_name || '(unknown)';
        const role = r.role || '—';
        const sub = r.is_sub ? ' · sub' : '';
        const cap = team.captain_id && r.account_id === team.captain_id ? ' © ' : ' ';
        return `\`${role.padEnd(7)}\`${cap}${name}${sub}`;
      }).join('\n')
    : '_No players yet._';

  const e = new EmbedBuilder()
    .setColor(team.color ? Number.parseInt(String(team.color).replace('#', ''), 16) : ACCENT)
    .setTitle(teamLabel(team))
    .setURL(link.team(team.id))
    .addFields({
      name: scope && !scope.isMain ? `Roster · ${scope.name}` : 'Roster',
      value: rosterLines.slice(0, 1024),
      inline: false,
    })
    .setFooter({ text: 'Atlantic Canada League · playacl.ca' });

  if (captain) e.addFields({ name: 'Captain', value: captain.display_name || '—', inline: true });
  if (team.region) e.addFields({ name: 'Region', value: team.region, inline: true });
  if (next) {
    const opp = await ctx.acl.getTeamById(next.team1_id === team.id ? next.team2_id : next.team1_id);
    e.addFields({
      name: 'Next match',
      value: `vs ${teamLabel(opp)} — ${formatTime(next.scheduled_at)} (${discordRelative(next.scheduled_at)})\n[Match page](${link.match(next.id)})`,
      inline: false,
    });
  }
  return e;
}

// One line summarizing a match, with both team labels + time.
export async function matchLine(match, ctx) {
  const t1 = await ctx.acl.getTeamById(match.team1_id);
  const t2 = await ctx.acl.getTeamById(match.team2_id);
  return `**${teamLabel(t1)}** vs **${teamLabel(t2)}** — ${formatTime(match.scheduled_at)} (${discordRelative(match.scheduled_at)}) · [details](${link.match(match.id)})`;
}

export function scheduleEmbed(title, lines) {
  return new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle(title)
    .setDescription(lines.length ? lines.join('\n\n') : '_No upcoming matches scheduled._')
    .setFooter({ text: 'Atlantic Canada League · playacl.ca' });
}
