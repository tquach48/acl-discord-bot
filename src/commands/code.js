import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { formatTime, teamLabel, link } from '../lib/format.js';
import { config } from '../config.js';
import { addTournamentOption, resolveTournament } from '../lib/tournamentOption.js';

// Captains only: DM the tournament code + draft link for their team's current
// match (the live one if a game is in progress, else the next upcoming).
// Gated by matching teams.captain_id to the caller's account. Defaults to the
// main tournament; pass `tournament:` for any other one.
export default {
  data: addTournamentOption(
    new SlashCommandBuilder()
      .setName('code')
      .setDescription("(Captains) DM your current match's tournament code + draft link"),
    'Get the code for a match in another tournament (defaults to the main one)',
  ),
  async execute(interaction, ctx) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const acc = await ctx.acl.getAccountByDiscordId(interaction.user.id);
    if (!acc) {
      return interaction.editReply({ content: `No ACL account linked. Sign in at ${config.siteUrl} first.` });
    }
    const t = await resolveTournament(interaction, ctx);
    if (t.error) return interaction.editReply({ content: t.error });

    const captainTeams = await ctx.acl.getCaptainTeams(acc.id, t.id);
    if (!captainTeams.length) {
      return interaction.editReply({ content: 'This command is for team captains only.' });
    }

    const blocks = [];
    for (const team of captainTeams) {
      const m = await ctx.acl.getCurrentMatchForTeam(team.id, t.id);
      if (!m) continue;
      const opp = await ctx.acl.getTeamById(m.team1_id === team.id ? m.team2_id : m.team1_id);
      const heading = m.status === 'live'
        ? `**${teamLabel(team)}** — 🔴 LIVE vs ${teamLabel(opp)}`
        : `**${teamLabel(team)}** — next vs ${teamLabel(opp)}`;
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
      const where = t.isMain ? '' : ` in **${t.name}**`;
      return interaction.editReply({ content: `No current or upcoming matches found for your team(s)${where}.` });
    }

    const title = t.isMain ? '**Your ACL match details**' : `**Your ACL match details · ${t.name}**`;
    const dm = `${title}\n\n${blocks.join('\n\n')}`;
    try {
      await interaction.user.send(dm);
      return interaction.editReply({ content: '📬 Sent you a DM with your match code + draft link.' });
    } catch {
      // DMs closed — fall back to an ephemeral reply only they can see.
      return interaction.editReply({ content: `I couldn't DM you (DMs may be off), so here it is:\n\n${dm}` });
    }
  },
};
