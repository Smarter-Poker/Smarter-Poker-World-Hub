/**
 * POST /api/poker/engine/club-connect
 * 
 * Bridges Club Arena's 'tables' DB with the poker engine.
 * When a player opens a Club Arena table, this endpoint:
 *   1. Checks if the engine already has an in-memory game for this table
 *   2. If not, reads config from 'tables' DB and creates one
 *   3. Returns the engine tableId (same as club table UUID)
 * 
 * Body: { tableId }
 * Returns: { success, tableId, name? }
 */

import { getController } from '../../../../src/lib/poker-engine/GameController';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ error: 'tableId required' });

    const controller = await getController();
    const result = await controller.connectToClubTable(tableId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('[club-connect]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
