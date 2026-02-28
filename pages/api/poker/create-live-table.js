/**
 * POST /api/poker/create-live-table
 * 
 * Creates a new live poker table via the GameController.
 * Used by PokerLobby's Create Table dialog.
 * 
 * Body: { name, variant, maxSeats, smallBlind, bigBlind, minBuyIn, maxBuyIn, userId, clubId? }
 * Returns: { success, tableId }
 */

import { getController } from '../../../src/lib/poker-engine/GameController';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { name, variant, maxSeats, smallBlind, bigBlind, minBuyIn, maxBuyIn, userId, clubId } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId required' });

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
      createdBy: userId,
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
