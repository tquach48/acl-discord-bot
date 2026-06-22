import { MessageFlags } from 'discord.js';
import { log } from '../lib/log.js';

// matchId -> id of the most recent notification message for that match.
// Each new stage for a match (24h → 1h → LIVE → final) deletes the prior
// message for THAT match before posting the new one. Per-match, so different
// games don't interfere. In-memory only: a restart resets the chain (a
// pre-restart message simply won't be auto-deleted).
const lastByMatch = new Map();

// Post a match notification, first deleting the previous one for this match.
// SuppressEmbeds keeps the playacl.ca link clickable (blue) but hides the
// big auto-unfurled site preview card.
export async function postMatchNotification(channel, matchId, options) {
  const prevId = lastByMatch.get(matchId);
  if (prevId) {
    // Delete by id (no fetch needed; the bot can delete its own messages).
    await channel.messages.delete(prevId).catch((e) =>
      log.warn(`Couldn't delete prior notification for match ${matchId}: ${e?.message}`));
  }
  const msg = await channel.send({ ...options, flags: MessageFlags.SuppressEmbeds });
  lastByMatch.set(matchId, msg.id);
  return msg;
}
