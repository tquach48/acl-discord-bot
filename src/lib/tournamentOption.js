// Shared `tournament:` option for slash commands.
//
// The bot targets the MAIN tournament everywhere. Any command that can
// meaningfully read another one takes an optional `tournament` string option;
// when it's omitted the main tournament is used, when it's given that
// tournament is used instead. Autocomplete lists real tournaments so nobody
// has to remember exact names.

const OPTION = 'tournament';

// Attach the option to a SlashCommandBuilder. Chainable.
export function addTournamentOption(builder, description = 'Another tournament (defaults to the main one)') {
  return builder.addStringOption((o) =>
    o.setName(OPTION).setDescription(description).setAutocomplete(true));
}

// Resolve the option to { id, name, isMain } — or null when the name matched
// nothing / matched several. On failure `error` carries a ready-to-send
// message so callers can bail with a friendly reply.
export async function resolveTournament(interaction, ctx) {
  const raw = interaction.options.getString(OPTION);
  const mainId = await ctx.acl.getActiveTournamentId();

  if (!raw) {
    const main = await ctx.acl.getActiveTournament();
    return {
      id: mainId,
      name: main?.name || 'the current tournament',
      isMain: true,
      error: null,
    };
  }

  const found = await ctx.acl.findTournament(raw);
  if (!found) {
    const all = await ctx.acl.getTournaments();
    const names = all.slice(0, 8).map((t) => `\`${t.name}\``).join(', ');
    return {
      id: null,
      name: null,
      isMain: false,
      error: `No single tournament matches **${raw}**.${names ? ` Try one of: ${names}` : ''}`,
    };
  }
  return { id: found.id, name: found.name, isMain: found.id === mainId, error: null };
}

// A "· Nov Cup" style suffix for titles, so a non-default scope is obvious.
export function scopeSuffix(t) {
  return t && !t.isMain && t.name ? ` · ${t.name}` : '';
}

// Autocomplete responder — wire this up for any command carrying the option.
export async function autocompleteTournaments(interaction, ctx) {
  const typed = String(interaction.options.getFocused() || '').toLowerCase();
  let all = [];
  try { all = await ctx.acl.getTournaments(); } catch { all = []; }
  const mainId = await ctx.acl.getActiveTournamentId().catch(() => null);
  const choices = all
    .filter((t) => !typed
      || String(t.name || '').toLowerCase().includes(typed)
      || String(t.slug || '').toLowerCase().includes(typed))
    .slice(0, 25)
    .map((t) => ({
      name: `${t.name}${t.id === mainId ? ' (main)' : ''}`.slice(0, 100),
      value: String(t.name || '').slice(0, 100),
    }));
  return interaction.respond(choices);
}

export const TOURNAMENT_OPTION_NAME = OPTION;
