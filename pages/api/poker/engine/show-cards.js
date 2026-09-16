/**
 * Show Cards Consent API
 * POST /api/poker/engine/show-cards
 * Body: { tableId, seatIndex, show: true/false }
 *
 * Allows a player to opt-in or opt-out of showing their hole cards
 * at showdown in the Live Table Mini-View broadcast.
 *
 * SECURITY: Authentication + per-seat ownership check.
 *
 * Previously this endpoint accepted (tableId, seatIndex, show) from any
 * anonymous client and immediately wrote to lobby._showCardsConsent —
 * which means anyone with a valid (tableId, seatIndex) pair could force
 * any opponent's cards to be revealed mid-hand. Closed by:
 *   1. Bearer JWT required (authenticatePlayer).
 *   2. JWT user.id must match the player seated at tableId:seatIndex.
 */

import { reportApiError } from '../../../../src/lib/sentryWrap';
import { getController } from '../../../../src/lib/poker-engine/GameController';
const { applyRateLimit } = require('../../../../src/lib/poker-engine/RateLimiter');
const { authenticatePlayer } = require('../../../../src/lib/poker-engine/authMiddleware');

// NOTE: This handler imports GameController (→ HealthWatchdog → process.memoryUsage)
// and uses req.body, res.status() — all incompatible with Edge Runtime. Keep as Node.js runtime.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // Rate limit (per-IP) to blunt brute-force scanning of (tableId, seatIndex) pairs.
  if (!applyRateLimit(req, res, 'poker/show-cards')) return;

  // Auth: verify Bearer JWT identity. Don't require a body playerId — we
  // use the JWT identity for ownership check below.
  const auth = await authenticatePlayer(req, res, { requirePlayerId: false });
  if (!auth) return; // 401/403 already sent

  const { tableId, seatIndex, show } = req.body || {};

  if (!tableId || seatIndex === undefined || seatIndex === null) {
    return res.status(400).json({ error: 'tableId and seatIndex required' });
  }

  try {
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

    // Ownership check: the JWT user must own the seat they're consenting on.
    const entry = lobby.getTable(tableId);
    if (!entry || !entry.table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const seat = entry.table.seats?.[seatIndex];
    const seatPlayerId = seat?.player?.id || null;

    if (!seatPlayerId) {
      return res.status(404).json({ error: 'Seat is empty' });
    }

    if (seatPlayerId !== auth.userId) {
      // Don't tell the caller why — could be used to enumerate seat ownership.
      return res.status(403).json({ error: 'Not allowed' });
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
