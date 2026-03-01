/**
 * POST /api/poker/engine/connect
 * 
 * Connection management: heartbeat, chat, disconnect.
 * Body: { tableId, playerId, type, ... }
 * 
 * Types:
 *   heartbeat:   Keep connection alive + update GPS location
 *   chat:        { message }
 *   disconnect:  Signal intentional disconnect
 */

import { getController } from '../../../../src/lib/poker-engine/GameController';
const { applyRateLimit } = require('../../../../src/lib/poker-engine/RateLimiter');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limit
  if (!applyRateLimit(req, res, 'poker/engine/connect')) return;

  try {
    const controller = await getController();

    // GET /api/poker/engine/connect → Controller stats (auth required)
    if (req.method === 'GET') {
      const { authenticatePlayer } = require('../../../../src/lib/poker-engine/authMiddleware');
      const auth = await authenticatePlayer(req, res, { requirePlayerId: false });
      if (!auth) return;
      return res.json(controller.getStats());
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'POST or GET' });

    // ── Auth: verify JWT identity matches playerId ──
    const { authenticatePlayer } = require('../../../../src/lib/poker-engine/authMiddleware');
    const auth = await authenticatePlayer(req, res);
    if (!auth) return;
    const playerId = auth.playerId;

    const { tableId, type, message, latitude, longitude } = req.body;

    if (!tableId || !type) {
      return res.status(400).json({ error: 'tableId, type required' });
    }

    switch (type) {
      case 'heartbeat':
        await controller.handleHeartbeat(tableId, playerId);

        // ─── Feed GPS to anti-cheat monitor (non-blocking) ─────────
        // Client sends lat/lng on every heartbeat. Monitor uses this
        // for continuous proximity scanning — no human in the loop.
        if (controller.antiCheatMonitor && latitude != null && longitude != null) {
          controller.antiCheatMonitor.updatePlayerGPS(playerId, tableId, latitude, longitude);
        }

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
