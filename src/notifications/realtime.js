import { config } from '../config.js';
import { log } from '../lib/log.js';
import { teamLabel, link } from '../lib/format.js';
import { ensureMatchPingsRole } from '../roles.js';

// Caches so we can detect *transitions* without relying on REPLICA IDENTITY
// FULL (Realtime's `old` payload otherwise only carries the primary key).
const matchStatus = new Map(); // matchId -> last seen status
const provinceCache = new Map(); // accountId -> last seen province

async function seedCaches(ctx) {
  const { data: ms } = await ctx.supabase.from('matches').select('id, status');
  for (const m of ms || []) matchStatus.set(m.id, m.status);
  const { data: accs } = await ctx.supabase.from('accounts').select('id, province');
  for (const a of accs || []) provinceCache.set(a.id, a.province ?? null);
  log.info(`Realtime caches seeded (${matchStatus.size} matches, ${provinceCache.size} accounts).`);
}

async function matchDayChannel(client) {
  const ch = await client.channels.fetch(config.matchDayChannelId).catch(() => null);
  return ch?.isTextBased() ? ch : null;
}

async function announceLive(client, ctx, guild, match) {
  const channel = await matchDayChannel(client);
  if (!channel) return;
  const [t1, t2, ids1, ids2] = await Promise.all([
    ctx.acl.getTeamById(match.team1_id),
    ctx.acl.getTeamById(match.team2_id),
    ctx.acl.getRosterDiscordIds(match.team1_id),
    ctx.acl.getRosterDiscordIds(match.team2_id),
  ]);
  const ids = [...new Set([...ids1, ...ids2])];
  let pingRole = null;
  try { pingRole = await ensureMatchPingsRole(guild); } catch (e) { log.warn('match-pings role', e?.message); }
  const content = [
    `🔴 **LIVE NOW** — ${teamLabel(t1)} vs ${teamLabel(t2)}`,
    `📺 ${link.match(match.id)}`,
    [ids.map((id) => `<@${id}>`).join(' '), pingRole ? `<@&${pingRole.id}>` : '']
      .filter(Boolean).join(' '),
  ].filter(Boolean).join('\n');
  await channel.send({
    content,
    allowedMentions: { users: ids, roles: pingRole ? [pingRole.id] : [] },
  });
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
  const result = winner ? `🏆 **${teamLabel(winner)}** win` : 'Draw';
  await channel.send({
    content: `🏁 **Final** — ${teamLabel(t1)} ${match.score1}–${match.score2} ${teamLabel(t2)} · ${result}\n${link.match(match.id)}`,
    allowedMentions: { parse: [] },
  });
  log.info(`Announced FINAL for match ${match.id}`);
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
        else if (row.status === 'completed') await announceFinal(client, ctx, row);
      } catch (e) { log.error('match change', e); }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'accounts' }, async (payload) => {
      const row = payload.new;
      if (!row?.id) return;
      const prev = provinceCache.get(row.id);
      const next = row.province ?? null;
      if (next === prev) return; // only province changes affect roles here
      provinceCache.set(row.id, next);
      await resyncAccount(ctx, guild, row.id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, async (payload) => {
      const accId = payload.new?.account_id || payload.old?.account_id;
      if (accId) await resyncAccount(ctx, guild, accId);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams' }, async (payload) => {
      // Captaincy transfer: re-sync the new captain (old captain can re-run /roles).
      if (payload.new?.captain_id) await resyncAccount(ctx, guild, payload.new.captain_id);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calendar_events' }, async (payload) => {
      const e = payload.new;
      if (!e?.title) return;
      const channel = await matchDayChannel(client);
      if (channel) {
        await channel.send({
          content: `📅 New key date added: **${e.title}**. See ${link.schedule()}`,
          allowedMentions: { parse: [] },
        });
      }
    })
    .subscribe((status) => log.info(`Realtime channel: ${status}`));
}
