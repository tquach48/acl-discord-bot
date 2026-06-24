import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { formatTime, teamLabel, link } from '../lib/format.js';
import { config } from '../config.js';

// Captains only: DM the tournament code + draft link for their team's current
// match (the live one if a game is in progress, else the next upcoming).
// Gated by matching teams.captain_id to the caller's account.
export default {
  data: new SlashCommandBuilder()
    .setName('code')
    .setDescription("(Captains) DM your current match's tournament code + draft link"),
  async execute(interaction, ctx) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const acc = await ctx.acl.getAccountByDiscordId(interaction.user.id);
    if (!acc) {
      return interaction.editReply({ content: `No ACL account linked. Sign in at ${config.siteUrl} first.` });
    }
    const captainTeams = await ctx.acl.getCaptainTeams(acc.id);
    if (!captainTeams.length) {
      return interaction.editReply({ content: 'This command is for team captains only.' });
    }

    const blocks = [];
    for (const t of captainTeams) {
      const m = await ctx.acl.getCurrentMatchForTeam(t.id);
      if (!m) continue;
      const opp = await ctx.acl.getTeamById(m.team1_id === t.id ? m.team2_id : m.team1_id);
      const heading = m.status === 'live'
        ? `**${teamLabel(t)}** — 🔴 LIVE vs ${teamLabel(opp)}`
        : `**${teamLabel(t)}** — next vs ${teamLabel(opp)}`;
      blocks.push(
        [
          heading,
          `🕒 ${formatTime(m.scheduled_at)}`,
          `🔑 Tournament code: ${m.tournament_code ? `\`${m.tournament_code}\`` : '_not minted yet_'}`,
          `🎴 Draft: ${m.draftlol_url || '_not created yet_'}`,
          `🔗 ${link.match(m.id)}`,
        ].join('\n'),
      );
    }
    if (!blocks.length) {
      return interaction.editReply({ content: 'No current or upcoming matches found for your team(s).' });
    }

    const dm = `**Your ACL match details**\n\n${blocks.join('\n\n')}`;
    try {
      await interaction.user.send(dm);
      return interaction.editReply({ content: '📬 Sent you a DM with your match code + draft link.' });
    } catch {
      // DMs closed — fall back to an ephemeral reply only they can see.
      return interaction.editReply({ content: `I couldn't DM you (DMs may be off), so here it is:\n\n${dm}` });
    }
  },
};
