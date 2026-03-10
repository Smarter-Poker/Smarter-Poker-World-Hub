/**
 * Emoji Reaction API
 * POST /api/poker/engine/emoji-reaction
 * Body: { tableId, seatIndex, emoji }
 *
 * Allows a player to send a floating emoji reaction visible to all spectators.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { tableId, seatIndex, emoji } = req.body || {};

  if (!tableId || seatIndex === undefined) {
    return res.status(400).json({ error: 'tableId and seatIndex required' });
  }

  const ALLOWED_EMOJIS = ['🔥', '👏', '😤', '😂', '💎', '🏆', '❤️', '👀', '🤔', '😎'];
  const safeEmoji = ALLOWED_EMOJIS.includes(emoji) ? emoji : '🔥';

  try {
    const { getController } = require('../../../../src/lib/poker-engine/GameController');
    let controller;
    try {
      controller = await getController();
    } catch {
      return res.status(503).json({ error: 'Engine not initialized' });
    }

    const entry = controller.lobby?.tables?.get(tableId);
    if (!entry || !entry.table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Emit the event on the table so LobbyManager picks it up
    entry.table.emit('emoji_reaction', { emoji: safeEmoji, seatIndex });

    return res.status(200).json({ ok: true, emoji: safeEmoji });
  } catch (err) {
    console.error('[emoji-reaction] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
