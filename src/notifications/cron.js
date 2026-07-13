import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { log } from '../lib/log.js';
import { ACCENT, formatTime, teamLabel, link } from '../lib/format.js';
import { postMatchNotification } from './matchPosts.js';

// In-memory de-dup. Windows below are wider than the 5-min cron interval, so
// each match hits its window exactly once; the Set prevents a double-send
// within a process lifetime. A restart can only re-send for a match sitting
// inside the narrow ~7-min window — acceptable for v1.
const sentReminders = new Set();

function localDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: config.timezone,
  }).format(date);
}

async function postMatchReminder(client, ctx, match, label) {
  const channel = await client.channels.fetch(config.matchDayChannelId).catch(() => null);
  if (!channel?.isTextBased()) {
    log.warn('match-day channel not found / not text-based');
    return;
  }
  const [t1, t2] = await Promise.all([
    ctx.acl.getTeamById(match.team1_id),
    ctx.acl.getTeamById(match.team2_id),
  ]);
  // Ping each team's role (rostered players all hold it after a sync) rather
  // than @-ing individual players.
  const roleIds = [t1, t2]
    .map((t) => t && ctx.roles.getRoleByName(channel.guild, t.name)?.id)
    .filter(Boolean);
  const mentions = roleIds.map((id) => `<@&${id}>`).join(' ');
  const content = [
    `⏰ **Match in ${label}** — ${teamLabel(t1)} vs ${teamLabel(t2)}`,
    `🕒 ${formatTime(match.scheduled_at)} · ${link.match(match.id)}`,
    mentions,
  ].filter(Boolean).join('\n');
  // Supersede this match's previous notification (24h → 1h) and suppress
  // the big link embed.
  await postMatchNotification(channel, match.id, { content, allowedMentions: { roles: roleIds } });
  log.info(`Posted ${label} reminder for match ${match.id} (pinged ${roleIds.length} team role(s))`);
}

async function checkMatchReminders(client, ctx) {
  const matches = await ctx.acl.getUpcomingMatches();
  const now = Date.now();
  for (const m of matches) {
    const mins = (new Date(m.scheduled_at).getTime() - now) / 60000;
    if (mins > 53 && mins <= 60 && !sentReminders.has(`${m.id}:1h`)) {
      sentReminders.add(`${m.id}:1h`);
      await postMatchReminder(client, ctx, m, '1 hour');
    } else if (mins > 1433 && mins <= 1440 && !sentReminders.has(`${m.id}:24h`)) {
      sentReminders.add(`${m.id}:24h`);
      await postMatchReminder(client, ctx, m, '24 hours');
    }
  }
}

async function checkDeadlines(client, ctx) {
  const { data, error } = await ctx.supabase
    .from('calendar_events')
    .select('id, title, event_type, scheduled_at, all_day');
  if (error) { log.error('deadline fetch', error); return; }
  const today = localDateKey(new Date());
  const due = (data || []).filter((e) => localDateKey(new Date(e.scheduled_at)) === today);
  if (!due.length) return;
  const channel = await client.channels.fetch(config.matchDayChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const icon = { deadline: '⏰', milestone: '⭐', break: '☕', other: '📌' };
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('📌 Key dates today')
    .setDescription(due.map((e) => `${icon[e.event_type] || '📌'} **${e.title}**`).join('\n'))
    .setURL(link.schedule())
    .setFooter({ text: 'Atlantic Canada League · playacl.ca' });
  await channel.send({ embeds: [embed] });
  log.info(`Posted ${due.length} deadline(s) for ${today}`);
}

export function startCron(client, ctx) {
  // Every 5 minutes: match reminders.
  cron.schedule('*/5 * * * *', () => {
    checkMatchReminders(client, ctx).catch((e) => log.error('cron:matches', e));
  }, { timezone: config.timezone });

  // 09:00 Atlantic daily: today's calendar deadlines/milestones.
  cron.schedule('0 9 * * *', () => {
    checkDeadlines(client, ctx).catch((e) => log.error('cron:deadlines', e));
  }, { timezone: config.timezone });

  log.info('Cron schedulers started (match reminders + check-ins + daily deadlines).');
}
