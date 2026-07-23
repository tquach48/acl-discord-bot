import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { link, teamLabel } from '../lib/format.js';
import { addTournamentOption, resolveTournament } from '../lib/tournamentOption.js';

// /ingest — points the captain at their current match's ingest panel with the
// exact steps. The actual Riot fetch + translation runs in the site (it holds
// the Riot proxy + DDragon mapping); doing it bot-side would duplicate the
// whole translator. This keeps one ingest path with the deep link one press
// away. (Full bot-side ingest = follow-up if ever needed.)
export default {
  data: addTournamentOption(
    new SlashCommandBuilder()
      .setName('ingest')
      .setDescription('How to ingest your game stats (links your current match page)'),
    'Link a match in another tournament (defaults to the main one)',
  ),
  async execute(interaction, ctx) {
    const acc = await ctx.acl.getAccountByDiscordId(interaction.user.id);
    const t = await resolveTournament(interaction, ctx);
    if (t.error) return interaction.reply({ content: t.error, flags: MessageFlags.Ephemeral });

    const teamId = acc ? await ctx.acl.getCurrentTeamId(acc.id, t.id) : null;
    const team = teamId ? await ctx.acl.getTeamById(teamId) : null;
    const match = team ? await ctx.acl.getCurrentMatchForTeam(team.id, t.id) : null;

    const steps = [
      '**Ingest a game in 3 steps:**',
      '1. In the League client, open the post-game screen → **match history** → copy the **Match ID** (e.g. `NA1_1234567890`).',
      `2. Open your match page${match ? `: ${link.match(match.id)}` : ` from ${link.schedule()}`}`,
      '3. Paste the Match ID into the **Match Ingest** panel — stats, drafts, and the series score fill in automatically.',
    ];
    if (match && team) {
      const opp = await ctx.acl.getTeamById(match.team1_id === team.id ? match.team2_id : match.team1_id);
      const where = t.isMain ? '' : ` · ${t.name}`;
      steps.push('', `Current match: **${teamLabel(team)} vs ${teamLabel(opp)}**${where}`);
    }
    return interaction.reply({ content: steps.join('\n'), flags: MessageFlags.Ephemeral });
  },
};
