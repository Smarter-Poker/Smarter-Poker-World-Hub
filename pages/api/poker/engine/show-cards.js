/**
 * Show Cards Consent API
 * POST /api/poker/engine/show-cards
 * Body: { tableId, seatIndex, show: true/false }
 *
 * Allows a player to opt-in or opt-out of showing their hole cards
 * at showdown in the Live Table Mini-View broadcast.
 */

import { reportApiError } from '../../../../src/lib/sentryWrap';

export const runtime = 'edge';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { tableId, seatIndex, show } = req.body || {};

  if (!tableId || seatIndex === undefined || seatIndex === null) {
    return res.status(400).json({ error: 'tableId and seatIndex required' });
  }

  try {
    const { getController } = require('../../../../src/lib/poker-engine/GameController');
    let controller;
    try {
      controller = await getController();
    } catch {
      return res.status(503).json({ error: 'Engine not initialized' });
    }

    const lobby = controller.lobby;
    if (!lobby) {
      return res.status(503).json({ error: 'Lobby not available' });
    }

    const key = `${tableId}:${seatIndex}`;
    
    if (show === true) {
      lobby._showCardsConsent.set(key, true);
    } else {
      lobby._showCardsConsent.delete(key);
    }

    // Trigger an immediate mini-state broadcast so viewers see the cards
    if (show === true) {
      lobby._broadcastMiniState(tableId);
    }

    return res.status(200).json({ ok: true, key, show: !!show });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[show-cards] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
