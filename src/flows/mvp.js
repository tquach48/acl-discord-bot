import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
} from 'discord.js';
import { config } from '../config.js';
import { log } from '../lib/log.js';
import { ACCENT, teamLabel, link } from '../lib/format.js';

// Community MVP vote: after a match completes (and has ingested games), the
// bot posts a poll with one button per rostered participant. Any server
// member can vote; one vote per person per match (upsert on
// (match_id, voter_discord_id)). Tally is public on the match page.

export async function postMvpPoll(client, ctx, match) {
  const participants = await ctx.acl.getMatchParticipants(match.id);
  if (participants.length < 2) return; // nothing worth voting on

  const channel = await client.channels.fetch(config.matchDayChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const [t1, t2] = await Promise.all([
    ctx.acl.getTeamById(match.team1_id),
    ctx.acl.getTeamById(match.team2_id),
  ]);

  // Up to 10 players → two button rows of ≤5.
  const rows = [];
  for (let i = 0; i < participants.length && i < 10; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      participants.slice(i, i + 5).map((p) =>
        new ButtonBuilder()
          .setCustomId(`acl:mvp:${match.id}:${p.accountId}`)
          .setLabel(p.name.slice(0, 80))
          .setStyle(ButtonStyle.Secondary)),
    ));
  }

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle(`⭐ MVP vote — ${teamLabel(t1)} vs ${teamLabel(t2)}`)
    .setURL(link.match(match.id))
    .setDescription('Who was the best player of the series? One vote each — press a name below.')
    .setFooter({ text: 'Atlantic Canada League · playacl.ca' });

  await channel.send({ embeds: [embed], components: rows, allowedMentions: { parse: [] } });
  log.info(`Posted MVP poll for match ${match.id}`);
}

// Button press: acl:mvp:<matchId>:<accountId>. Anyone in the server may vote;
// pressing again (any name) changes their vote.
export async function handleMvpButton(interaction, ctx) {
  const [, , matchId, accountId] = interaction.customId.split(':');
  await ctx.acl.castMvpVote(matchId, accountId, interaction.user.id);
  const votee = await ctx.acl.getAccountById(accountId).catch(() => null);
  return interaction.reply({
    content: `⭐ Vote recorded for **${votee?.display_name || 'that player'}**. Press another name to change it.`,
    flags: MessageFlags.Ephemeral,
  });
}
