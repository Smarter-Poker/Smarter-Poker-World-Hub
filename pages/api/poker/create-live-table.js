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
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

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
    console.error('[create-live-table]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
