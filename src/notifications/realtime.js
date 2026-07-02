import { MessageFlags, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { log } from '../lib/log.js';
import { ACCENT, teamLabel, link } from '../lib/format.js';
import { ensureMatchPingsRole } from '../roles.js';
import { postMatchNotification } from './matchPosts.js';
import { postMvpPoll } from '../flows/mvp.js';
import { reconcileAccountFromRow } from '../membership.js';

// Caches so we can detect *transitions* without relying on REPLICA IDENTITY
// FULL (Realtime's `old` payload otherwise only carries the primary key).
const matchStatus = new Map(); // matchId -> last seen status
const provinceCache = new Map(); // accountId -> last seen province
const rankCache = new Map(); // accountId -> last seen riot_tier
const lftCache = new Map(); // accountId -> last seen looking_for_team
const faPostByAccount = new Map(); // accountId -> free-agent board message id

async function seedCaches(ctx) {
  const { data: ms } = await ctx.supabase.from('matches').select('id, status');
  for (const m of ms || []) matchStatus.set(m.id, m.status);
  const { data: accs } = await ctx.supabase.from('accounts').select('id, province, riot_tier, looking_for_team');
  for (const a of accs || []) {
    provinceCache.set(a.id, a.province ?? null);
    rankCache.set(a.id, a.riot_tier ?? null);
    lftCache.set(a.id, !!a.looking_for_team);
  }
  log.info(`Realtime caches seeded (${matchStatus.size} matches, ${provinceCache.size} accounts).`);
}

async function matchDayChannel(client) {
  const ch = await client.channels.fetch(config.matchDayChannelId).catch(() => null);
  return ch?.isTextBased() ? ch : null;
}

async function announceLive(client, ctx, guild, match) {
  const channel = await matchDayChannel(client);
  if (!channel) return;
  const [t1, t2] = await Promise.all([
    ctx.acl.getTeamById(match.team1_id),
    ctx.acl.getTeamById(match.team2_id),
  ]);
  // LIVE pings ONLY the opt-in Match Pings role — not the teams.
  let pingRole = null;
  try { pingRole = await ensureMatchPingsRole(guild); } catch (e) { log.warn('match-pings role', e?.message); }
  const roleIds = pingRole ? [pingRole.id] : [];
  const content = [
    `🔴 **LIVE NOW** — ${teamLabel(t1)} vs ${teamLabel(t2)}`,
    `📺 ${link.match(match.id)}`,
    pingRole ? `<@&${pingRole.id}>` : '',
  ].filter(Boolean).join('\n');
  await postMatchNotification(channel, match.id, { content, allowedMentions: { roles: roleIds } });
  log.info(`Announced LIVE for match ${match.id}`);
}

async function announceFinal(client, ctx, match) {
  const channel = await matchDayChannel(client);
  if (!channel) return;
  const [t1, t2] = await Promise.all([
    ctx.acl.getTeamById(match.team1_id),
    ctx.acl.getTeamById(match.team2_id),
  ]);
  const winner = match.score1 > match.score2 ? t1 : match.score2 > match.score1 ? t2 : null;

  // Rich result embed: series score + per-game scorelines. Per-game data is
  // best-effort — a score reported without ingested games still announces.
  const embed = new EmbedBuilder()
    .setColor(winner?.color
      ? Number.parseInt(String(winner.color).replace('#', ''), 16)
      : ACCENT)
    .setTitle(`🏁 Final — ${teamLabel(t1)} ${match.score1}–${match.score2} ${teamLabel(t2)}`)
    .setURL(link.match(match.id))
    .setDescription(winner ? `🏆 **${teamLabel(winner)}** take the series` : 'Series drawn')
    .setFooter({ text: 'Atlantic Canada League · playacl.ca' });

  try {
    const games = await ctx.acl.getGamesForMatch(match.id);
    if (games.length) {
      const lines = games.map((g) => {
        const gw = g.winner_team_id === t1?.id ? t1 : g.winner_team_id === t2?.id ? t2 : null;
        const dur = g.duration_sec
          ? ` · ${Math.floor(g.duration_sec / 60)}:${String(g.duration_sec % 60).padStart(2, '0')}`
          : '';
        return `**Game ${g.game_number}** — ${gw ? `${gw.tag || gw.name} win` : '—'}${dur}`;
      });
      embed.addFields({ name: 'Games', value: lines.join('\n').slice(0, 1024), inline: false });
    }
  } catch (e) { log.warn('result games lookup', e?.message); }

  if (match.forfeit_team_id) {
    const absent = match.forfeit_team_id === t1?.id ? t1 : t2;
    embed.addFields({
      name: match.forfeit_kind === 'forfeit' ? 'Forfeit' : 'No-show',
      value: `${teamLabel(absent)} ${match.forfeit_kind === 'forfeit' ? 'forfeited' : 'did not show'} — win credited.`,
      inline: false,
    });
  }

  // Final supersedes the LIVE message for this match.
  await postMatchNotification(channel, match.id, {
    embeds: [embed],
    allowedMentions: { parse: [] },
  });
  log.info(`Announced FINAL for match ${match.id}`);
}

// Mirror LFT players onto the free-agent board channel: post an embed when a
// player flips LFT on, delete it when they flip off (or find a team). Fail-soft
// throughout — a missing channel or Discord error never breaks the watcher.
async function updateFreeAgentBoard(client, ctx, accountId, isLooking) {
  if (!config.freeAgentsChannelId) return;
  const channel = await client.channels.fetch(config.freeAgentsChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const prevId = faPostByAccount.get(accountId);
  if (prevId) {
    await channel.messages.delete(prevId).catch(() => {});
    faPostByAccount.delete(accountId);
  }
  if (!isLooking) return;

  try {
    const acc = await ctx.acl.getAccountById(accountId);
    if (!acc) return;
    const roles = [acc.main_role, ...(acc.alt_roles || [])].filter(Boolean);
    const embed = new EmbedBuilder()
      .setColor(ACCENT)
      .setTitle(`🔎 ${acc.display_name || 'Player'} is looking for a team`)
      .setURL(link.player(acc.id))
      .addFields(
        { name: 'Roles', value: roles.length ? roles.join(', ') : '—', inline: true },
        { name: 'Rank', value: acc.riot_tier ? `${acc.riot_tier}${acc.riot_division ? ` ${acc.riot_division}` : ''}` : 'Unranked', inline: true },
      )
      .setFooter({ text: 'Atlantic Canada League · playacl.ca' });
    if (acc.riot_id) embed.addFields({ name: 'Riot ID', value: acc.riot_id, inline: true });
    const msg = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    faPostByAccount.set(accountId, msg.id);
  } catch (e) { log.warn('free-agent board', e?.message); }
}

async function resyncAccount(ctx, guild, accountId) {
  try {
    const acc = await ctx.acl.getAccountById(accountId);
    if (!acc?.discord_id) return;
    const member = await guild.members.fetch(acc.discord_id).catch(() => null);
    if (!member) return;
    const res = await ctx.roles.syncForAccount(guild, member, acc);
    if (res.added.length || res.removed.length) {
      log.info(`Auto role-sync ${acc.display_name}: +[${res.added}] -[${res.removed}]`);
    }
  } catch (e) {
    log.error('resyncAccount', e);
  }
}

export async function startRealtime(client, ctx) {
  const guild = await client.guilds.fetch(config.guildId);
  await seedCaches(ctx);

  ctx.supabase
    .channel('acl-bot')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, async (payload) => {
      const row = payload.new;
      if (!row?.id) return;
      const prev = matchStatus.get(row.id);
      matchStatus.set(row.id, row.status);
      if (row.status === prev) return;
      try {
        if (row.status === 'live') await announceLive(client, ctx, guild, row);
        else if (row.status === 'completed') {
          await announceFinal(client, ctx, row);
          // Community MVP poll (only posts when the match has ingested
          // players; fail-soft so the result embed never suffers).
          await postMvpPoll(client, ctx, row).catch((e) => log.warn('mvp poll', e?.message));
        }
      } catch (e) { log.error('match change', e); }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, async (payload) => {
      const row = payload.new;
      if (!row?.id) return;
      // Membership flag upkeep — disabled while the gate is click-through.
      if (config.membershipTracking) await reconcileAccountFromRow(guild, row);
      // Province or rank change → role resync (one call covers both).
      const prevProv = provinceCache.get(row.id);
      const nextProv = row.province ?? null;
      const prevTier = rankCache.get(row.id);
      const nextTier = row.riot_tier ?? null;
      if (nextProv !== prevProv || nextTier !== prevTier) {
        provinceCache.set(row.id, nextProv);
        rankCache.set(row.id, nextTier);
        await resyncAccount(ctx, guild, row.id);
      }
      // LFT flip → free-agent board mirror.
      const prevLft = lftCache.get(row.id);
      const nextLft = !!row.looking_for_team;
      if (nextLft !== prevLft) {
        lftCache.set(row.id, nextLft);
        await updateFreeAgentBoard(client, ctx, row.id, nextLft);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, async (payload) => {
      const accId = payload.new?.account_id || payload.old?.account_id;
      if (accId) await resyncAccount(ctx, guild, accId);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams' }, async (payload) => {
      // Captaincy transfer: re-sync the new captain (old captain can re-run /roles).
      if (payload.new?.captain_id) await resyncAccount(ctx, guild, payload.new.captain_id);
    })
    // NOTE: only fires if `calendar_events` is in the supabase_realtime
    // publication (it is not, by default — see README). The daily 9AM cron
    // posts deadlines via REST regardless, so this is a bonus, not the path
    // we rely on. The daily post is the source of truth.
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calendar_events' }, async (payload) => {
      try {
        const e = payload.new;
        if (!e?.title) return;
        const channel = await matchDayChannel(client);
        if (channel) {
          await channel.send({
            content: `📅 New key date added: **${e.title}**. See ${link.schedule()}`,
            allowedMentions: { parse: [] },
            flags: MessageFlags.SuppressEmbeds,
          });
        }
      } catch (err) { log.error('calendar insert', err); }
    })
    .subscribe((status) => log.info(`Realtime channel: ${status}`));
}
