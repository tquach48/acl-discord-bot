import { MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { log } from '../lib/log.js';
import { teamLabel, link } from '../lib/format.js';
import { ensureMatchPingsRole } from '../roles.js';
import { postMatchNotification } from './matchPosts.js';
import { reconcileAccountFromRow } from '../membership.js';

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
  const result = winner ? `🏆 **${teamLabel(winner)}** win` : 'Draw';
  // Final supersedes the LIVE message for this match.
  await postMatchNotification(channel, match.id, {
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, async (payload) => {
      const row = payload.new;
      if (!row?.id) return;
      // Membership: flip the signup-gate flag on if a linked, flagged-out
      // account is actually already in the server (e.g. someone who was in
      // the Discord before they signed up, so GuildMemberAdd won't re-fire).
      await reconcileAccountFromRow(guild, row);
      // Province change → role resync.
      const prev = provinceCache.get(row.id);
      const next = row.province ?? null;
      if (next !== prev) {
        provinceCache.set(row.id, next);
        await resyncAccount(ctx, guild, row.id);
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
