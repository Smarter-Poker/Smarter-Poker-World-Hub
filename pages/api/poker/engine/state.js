/**
 * GET /api/poker/engine/state?tableId=X&playerId=Y
 * 
 * Returns the full table state from the player's perspective.
 * Private cards only revealed for the requesting player.
 */

import { getController } from '../../../../src/lib/poker-engine/GameController';
const { applyRateLimit } = require('../../../../src/lib/poker-engine/RateLimiter');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  // Rate limit
  if (!applyRateLimit(req, res, 'poker/engine/state')) return;

  try {
    const { tableId, playerId } = req.query;

    if (!tableId) return res.status(400).json({ error: 'tableId required' });
    if (!playerId) return res.status(400).json({ error: 'playerId required' });

    const controller = await getController();
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
    console.error('[engine/state]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
