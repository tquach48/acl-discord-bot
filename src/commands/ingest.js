import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { link, teamLabel } from '../lib/format.js';

// /ingest — points the captain at their current match's ingest panel with the
// exact steps. The actual Riot fetch + translation runs in the site (it holds
// the Riot proxy + DDragon mapping); doing it bot-side would duplicate the
// whole translator. This keeps one ingest path with the deep link one press
// away. (Full bot-side ingest = follow-up if ever needed.)
export default {
  data: new SlashCommandBuilder()
    .setName('ingest')
    .setDescription('How to ingest your game stats (links your current match page)'),
  async execute(interaction, ctx) {
    const acc = await ctx.acl.getAccountByDiscordId(interaction.user.id);
    const team = acc ? await ctx.acl.getCurrentTeamId(acc.id).then(
      (id) => (id ? ctx.acl.getTeamById(id) : null),
    ) : null;
    const match = team ? await ctx.acl.getCurrentMatchForTeam(team.id) : null;

    const steps = [
      '**Ingest a game in 3 steps:**',
      '1. In the League client, open the post-game screen → **match history** → copy the **Match ID** (e.g. `NA1_1234567890`).',
      `2. Open your match page${match ? `: ${link.match(match.id)}` : ` from ${link.schedule()}`}`,
      '3. Paste the Match ID into the **Match Ingest** panel — stats, drafts, and the series score fill in automatically.',
    ];
    if (match && team) {
      const opp = await ctx.acl.getTeamById(match.team1_id === team.id ? match.team2_id : match.team1_id);
      steps.push('', `Current match: **${teamLabel(team)} vs ${teamLabel(opp)}**`);
    }
    return interaction.reply({ content: steps.join('\n'), flags: MessageFlags.Ephemeral });
  },
};
