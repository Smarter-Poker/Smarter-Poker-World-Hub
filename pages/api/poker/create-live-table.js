/**
 * POST /api/poker/create-live-table
 * 
 * Creates a new live poker table via the GameController.
 * Used by PokerLobby's Create Table dialog.
 * 
 * Body: { name, variant, maxSeats, smallBlind, bigBlind, minBuyIn, maxBuyIn, clubId? }
 * Returns: { success, tableId }
 */

import { getController } from '../../../src/lib/poker-engine/GameController';
const { applyCors } = require('../../../src/lib/cors');
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { reportApiError } from '../../../src/lib/sentryWrap';

export default async function handler(req, res) {
  if (!applyCors(req, res, { methods: 'POST, OPTIONS', headers: 'Content-Type, x-user-id, Authorization' })) return;
if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  // Rate limit
  if (!applyRateLimit(req, res, 'poker/create-live-table')) return;

  // ── Auth: verify JWT identity ──
  const { authenticatePlayer } = require('../../../src/lib/poker-engine/authMiddleware');
  const auth = await authenticatePlayer(req, res, { requirePlayerId: false });
  if (!auth) return; // 401/403 already sent

  try {
    const { name, variant, maxSeats, smallBlind, bigBlind, minBuyIn, maxBuyIn, clubId } = req.body;

    const controller = await getController();
    const result = await controller.createTable({
      name,
      variant: variant || 'holdem',
      maxSeats: maxSeats || 9,
      smallBlind: smallBlind || 1,
      bigBlind: bigBlind || 2,
      minBuyIn,
      maxBuyIn,
      clubId: clubId || null,
      createdBy: auth.userId, // From JWT, not request body
    });

    if (!result.success) return res.status(400).json(result);

    return res.status(200).json({
      success: true,
      tableId: result.tableId,
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.error('[create-live-table]', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}
