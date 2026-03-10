/**
 * Table Chat API
 * POST /api/poker/engine/table-chat
 * Body: { tableId, seatIndex, message }
 *
 * Allows a player to send a chat message that appears as a floating bubble.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { tableId, seatIndex, message } = req.body || {};

  if (!tableId || !message) {
    return res.status(400).json({ error: 'tableId and message required' });
  }

  const safeMessage = String(message).substring(0, 40).trim();
  if (!safeMessage) {
    return res.status(400).json({ error: 'Empty message' });
  }

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

    // Get player name from seat
    const state = entry.table.getState(null);
    const seat = (state.seats || []).find(s => s.seatIndex === seatIndex);
    const playerName = seat?.player?.displayName || 'Player';

    entry.table.emit('chat_message', { playerName, message: safeMessage, seatIndex });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[table-chat] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
