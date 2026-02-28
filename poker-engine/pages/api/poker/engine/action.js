/**
 * POST /api/poker/engine/action
 * 
 * Process a player's game action.
 * Body: { tableId, playerId, action: { type, amount? } }
 * 
 * Action types: fold, check, call, bet, raise, all_in
 */

import { getController } from '../../../../src/lib/poker-engine/GameController';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

const VALID_ACTIONS = new Set(['fold', 'check', 'call', 'bet', 'raise', 'all_in']);

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { tableId, playerId, action } = req.body;

    if (!tableId) return res.status(400).json({ error: 'tableId required' });
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    if (!action || !action.type) return res.status(400).json({ error: 'action.type required' });
    if (!VALID_ACTIONS.has(action.type)) {
      return res.status(400).json({ error: `Invalid action: ${action.type}` });
    }

    const controller = await getController();
    const result = await controller.processAction(tableId, playerId, action);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[engine/action]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
