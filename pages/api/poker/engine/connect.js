/**
 * POST /api/poker/engine/connect
 * 
 * Connection management: heartbeat, chat, disconnect.
 * Body: { tableId, playerId, type, ... }
 * 
 * Types:
 *   heartbeat:   Keep connection alive
 *   chat:        { message }
 *   disconnect:  Signal intentional disconnect
 */

import { getController } from '../../../../src/lib/poker-engine/GameController';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const controller = await getController();

    // GET /api/poker/engine/connect → Controller stats
    if (req.method === 'GET') {
      return res.json(controller.getStats());
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'POST or GET' });

    const { tableId, playerId, type, message } = req.body;

    if (!tableId || !playerId || !type) {
      return res.status(400).json({ error: 'tableId, playerId, type required' });
    }

    switch (type) {
      case 'heartbeat':
        await controller.handleHeartbeat(tableId, playerId);
        return res.json({ success: true });

      case 'chat':
        if (!message) return res.status(400).json({ error: 'message required' });
        const chatResult = await controller.sendChat(tableId, playerId, message);
        return res.json(chatResult);

      case 'disconnect':
        await controller.handleDisconnect(tableId, playerId);
        return res.json({ success: true });

      default:
        return res.status(400).json({ error: `Unknown type: ${type}` });
    }
  } catch (err) {
    console.error('[engine/connect]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
