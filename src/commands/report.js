import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { link, teamLabel } from '../lib/format.js';

// /report — captain reports their CURRENT match's final series score from
// Discord. Authorization happens INSIDE Postgres (bot_report_match_score
// resolves the caller's discord id → account and requires captain-on-match
// or admin), so the bot can't be tricked into scoring someone else's series.
export default {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription("Report your team's current match final score (captains only)")
    .addIntegerOption((o) =>
      o.setName('us').setDescription('Games YOUR team won').setRequired(true).setMinValue(0).setMaxValue(5))
    .addIntegerOption((o) =>
      o.setName('them').setDescription('Games the OPPONENT won').setRequired(true).setMinValue(0).setMaxValue(5)),
  async execute(interaction, ctx) {
    const acc = await ctx.acl.getAccountByDiscordId(interaction.user.id);
    if (!acc) {
      return interaction.reply({
        content: `No ACL account linked to your Discord — sign up at ${link.site()} first.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const captainTeams = await ctx.acl.getCaptainTeams(acc.id);
    if (!captainTeams.length) {
      return interaction.reply({ content: 'Only team captains can report scores.', flags: MessageFlags.Ephemeral });
    }
    const team = captainTeams[0];
    const match = await ctx.acl.getCurrentMatchForTeam(team.id);
    if (!match) {
      return interaction.reply({
        content: `No live or upcoming match found for **${teamLabel(team)}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const us = interaction.options.getInteger('us');
    const them = interaction.options.getInteger('them');
    // Map us/them onto team1/team2 orientation.
    const s1 = match.team1_id === team.id ? us : them;
    const s2 = match.team1_id === team.id ? them : us;

    try {
      await ctx.acl.reportMatchScoreAsBot(interaction.user.id, match.id, s1, s2);
    } catch (e) {
      return interaction.reply({
        content: `Couldn't report: ${e?.message || 'unknown error'}`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const opp = await ctx.acl.getTeamById(match.team1_id === team.id ? match.team2_id : match.team1_id);
    return interaction.reply({
      content: `🏁 Reported **${teamLabel(team)} ${us}–${them} ${teamLabel(opp)}** — match closed. ${link.match(match.id)}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
