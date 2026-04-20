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
import { createClient } from '../../../../src/lib/supabaseServerClient';
const { applyCors } = require('../../../../src/lib/cors');
import { reportApiError } from '../../../../src/lib/sentryWrap';
const _supaAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);



export default async function handler(req, res) {
    if (!applyCors(req, res, { methods: 'POST, GET, OPTIONS', headers: 'Content-Type, x-user-id, Authorization' })) return;
try {

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

      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST or GET' });

      // ── Auth: verify JWT identity matches playerId ──
      const { authenticatePlayer } = require('../../../../src/lib/poker-engine/authMiddleware');
      const auth = await authenticatePlayer(req, res);
      if (!auth) return;
      const playerId = auth.playerId;

      const { tableId, type, message, latitude, longitude } = req.body;

      if (!tableId || !type) {
        return res.status(400).json({ success: false, error: 'tableId, type required' });
      }

      switch (type) {
        case 'heartbeat':
          // ── COLD-START AUTO-RECOVERY ──────────────────────────────────
          // Heartbeat is the first signal from a connected client after a
          // serverless cold start. Ensure table is loaded before updating presence.
          await controller.ensureTable(tableId);
          await controller.handleHeartbeat(tableId, playerId);

          // ─── Feed GPS to anti-cheat monitor (non-blocking) ─────────
          // Client sends lat/lng on every heartbeat. Monitor uses this
          // for continuous proximity scanning — no human in the loop.
          if (controller.antiCheatMonitor && latitude != null && longitude != null) {
            controller.antiCheatMonitor.updatePlayerGPS(playerId, tableId, latitude, longitude);
          }

          return res.json({ success: true });

        case 'chat':
          if (!message) return res.status(400).json({ success: false, error: 'message required' });
          const chatResult = await controller.sendChat(tableId, playerId, message);
          // Fire-and-forget: persist to table_chat for history on reconnect
          if (chatResult.success) {
            _supaAdmin.from('table_chat').insert({
              table_id: tableId,
              user_id: playerId,
              message: message.slice(0, 200),
              message_type: 'player',
              display_name: chatResult.displayName || null,
            }).then(() => {}).catch(() => {});
          }
          return res.json(chatResult);

        case 'disconnect':
          await controller.handleDisconnect(tableId, playerId);
          return res.json({ success: true });

        default:
          return res.status(400).json({ success: false, error: `Unknown type: ${type}` });
      }
    } catch (err) {
      console.error('[engine/connect]', err);
      return res.status(500).json({ success: false, error: 'Internal error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
