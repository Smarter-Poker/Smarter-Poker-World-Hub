/**
 * GET /api/poker/engine/state?tableId=X&playerId=Y
 * 
 * Returns the full table state from the player's perspective.
 * Private cards only revealed for the requesting player.
 */

import { getController } from '../../../../src/lib/poker-engine/GameController';
const { applyCors } = require('../../../../src/lib/cors');
const { applyRateLimit } = require('../../../../src/lib/poker-engine/RateLimiter');
import { reportApiError } from '../../../../src/lib/sentryWrap';



export default async function handler(req, res) {
    if (!applyCors(req, res, { methods: 'GET, OPTIONS', headers: 'Content-Type, x-user-id, Authorization' })) return;
if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  // Rate limit
  if (!applyRateLimit(req, res, 'poker/engine/state')) return;

  // ── Auth: verify JWT identity matches playerId ──
  // CRITICAL: This endpoint returns private hole cards.
  // Without auth, anyone can view any player's cards.
  const { authenticatePlayer } = require('../../../../src/lib/poker-engine/authMiddleware');
  const auth = await authenticatePlayer(req, res);
  if (!auth) return;

  try {
    const { tableId } = req.query;
    const playerId = auth.playerId; // Guaranteed to match JWT

    if (!tableId) return res.status(400).json({ error: 'tableId required' });

    const controller = await getController();

    // ── COLD-START AUTO-RECOVERY ──────────────────────────────────
    if (!controller.lobby.tables.has(tableId)) {
      await controller.ensureTable(tableId);
    }

    const state = await controller.getTableState(tableId, playerId);

    if (!state) return res.status(404).json({ error: 'Table not found' });

    // Also include legal actions if it's this player's turn
    const actions = controller.getPlayerActions(tableId, playerId);

    return res.json({
      ...state,
      legalActions: actions?.actions || null,
      presets: actions?.presets || null,
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[engine/state]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
