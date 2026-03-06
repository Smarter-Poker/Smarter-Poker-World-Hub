/**
 * POST /api/poker/engine/action
 * 
 * Process a player's game action.
 * Body: { tableId, playerId, action: { type, amount? } }
 * 
 * Action types: fold, check, call, bet, raise, all_in
 */

import { getController } from '../../../../src/lib/poker-engine/GameController';
const { AntiCheat } = require('../../../../src/lib/poker-engine/AntiCheat');
const { applyRateLimit } = require('../../../../src/lib/poker-engine/RateLimiter');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
// Reuse singleton anti-cheat (with supabase for DB persistence)
if (!globalThis.__ANTI_CHEAT__) globalThis.__ANTI_CHEAT__ = new AntiCheat(supabaseAdmin);
const antiCheat = globalThis.__ANTI_CHEAT__;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

const VALID_ACTIONS = new Set(['fold', 'check', 'call', 'bet', 'raise', 'all_in']);

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  // Rate limit
  if (!applyRateLimit(req, res, 'poker/engine/action')) return;

  // ── Auth: verify JWT identity matches playerId ──
  const { authenticatePlayer } = require('../../../../src/lib/poker-engine/authMiddleware');
  const auth = await authenticatePlayer(req, res);
  if (!auth) return; // 401/403 already sent

  try {
    const { tableId, action, type, ...extra } = req.body;
    const playerId = auth.playerId; // Guaranteed to match JWT

    if (!tableId) return res.status(400).json({ success: false, error: 'tableId required' });

    const controller = await getController();

    // ── COLD-START AUTO-RECOVERY ──────────────────────────────────
    // If this serverless function spun up fresh and the table isn't in
    // memory yet, ensureTable() re-connects it from DB before we fail.
    if (!controller.lobby.tables.has(tableId)) {
      const recovered = await controller.ensureTable(tableId);
      if (!recovered) {
        return res.status(404).json({ success: false, error: 'Table not found' });
      }
    }

    // ── SPECIAL ACTIONS (non-game) ─────────────────────────────
    // These are handled outside the standard game action flow

    // Emoji Throwing: broadcast to table channel
    if (type === 'throw_emoji' || action?.type === 'throw_emoji') {
      const emoji = extra.emoji || action?.emoji;
      const targetId = extra.targetId || action?.targetId;
      if (!emoji) return res.status(400).json({ success: false, error: 'emoji required' });

      const table = controller.lobby?.tables?.get(tableId);
      if (!table) return res.status(404).json({ success: false, error: 'Table not found' });

      // Broadcast emoji event via existing table sync channel
      const sync = table.sync;
      if (sync?.channel) {
        sync.channel.send({
          type: 'broadcast',
          event: 'emoji_thrown',
          payload: {
            fromId: playerId,
            targetId: targetId || null,
            emoji,
            timestamp: Date.now()
          },
        });
      }
      return res.json({ success: true });
    }

    // Insurance: buy or decline
    if (type === 'buy_insurance' || action?.type === 'buy_insurance') {
      const amount = extra.amount || action?.amount || 0;
      const table = controller.lobby?.tables?.get(tableId);
      if (!table?.table?.game) return res.status(404).json({ success: false, error: 'No active game' });
      table.table.game.processInsurance(playerId, amount);
      return res.json({ success: true });
    }
    if (type === 'decline_insurance' || action?.type === 'decline_insurance') {
      const table = controller.lobby?.tables?.get(tableId);
      if (!table?.table?.game) return res.status(404).json({ success: false, error: 'No active game' });
      table.table.game.processInsurance(playerId, 0); // amount=0 means decline
      return res.json({ success: true });
    }

    // ── STANDARD GAME ACTIONS ──────────────────────────────────
    if (!action || !action.type) return res.status(400).json({ success: false, error: 'action.type required' });
    if (!VALID_ACTIONS.has(action.type)) {
      return res.status(400).json({ success: false, error: `Invalid action: ${action.type}` });
    }

    // Rate limit check
    const rateCheck = antiCheat.validateAction(playerId, tableId);
    if (!rateCheck.allowed) {
      return res.status(429).json({ success: false, error: rateCheck.reason });
    }

    const result = await controller.processAction(tableId, playerId, action);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Record action for collusion pattern analysis (non-blocking)
    antiCheat.recordAction(playerId, tableId, {
      type: action.type,
      amount: action.amount || 0,
      targetPlayerId: null, // filled by collusion analysis at hand end
    });

    // Periodic bot pattern check (every ~20 actions per player)
    const timings = antiCheat._actionTimings?.get(playerId);
    if (timings && timings.length > 0 && timings.length % 20 === 0) {
      const botCheck = antiCheat.analyzeBotPattern(playerId);
      if (botCheck.suspicious) {
        // Persist bot flags
        const entry = controller.lobby?.tables?.get(tableId);
        const clubId = entry?.config?.clubId;
        antiCheat.persistFlags(playerId, clubId, tableId)
          .catch(err => console.error('[AntiCheat] Persist bot flags error:', err.message));
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[engine/action]', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}
