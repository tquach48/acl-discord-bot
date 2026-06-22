import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { formatTime, teamLabel, link } from '../lib/format.js';
import { config } from '../config.js';

// Captains only: DM the tournament code + draft link for their team's next
// match. Gated by matching teams.captain_id to the caller's account.
export default {
  data: new SlashCommandBuilder()
    .setName('code')
    .setDescription("(Captains) DM your next match's tournament code + draft link"),
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
      const next = await ctx.acl.getNextMatchForTeam(t.id);
      if (!next) continue;
      const opp = await ctx.acl.getTeamById(next.team1_id === t.id ? next.team2_id : next.team1_id);
      blocks.push(
        [
          `**${teamLabel(t)}** — next vs ${teamLabel(opp)}`,
          `🕒 ${formatTime(next.scheduled_at)}`,
          `🔑 Tournament code: ${next.tournament_code ? `\`${next.tournament_code}\`` : '_not minted yet_'}`,
          `🎴 Draft: ${next.draftlol_url || '_not created yet_'}`,
          `🔗 ${link.match(next.id)}`,
        ].join('\n'),
      );
    }
    if (!blocks.length) {
      return interaction.editReply({ content: 'No upcoming matches found for your team(s).' });
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
