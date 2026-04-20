/**
 * Mini-State API — Batch observer-safe game state for lobby thumbnails
 * GET /api/poker/engine/mini-state?tableIds=id1,id2,id3
 *
 * Returns lightweight state for each table: seats, phase, community cards,
 * pot total, and current actor. No auth required (public observer data).
 * In-memory only — no DB queries. Target: < 2ms response.
 *
 * V2: Uses table.getState(null) for correct observer-safe field access.
 */

import { reportApiError } from '../../../../src/lib/sentryWrap';

// ── Phase mapping: engine phases → display phases ──
const DISPLAY_PHASE = {
  idle: 'idle',
  post_blinds: 'dealing',
  deal: 'dealing',
  preflop: 'preflop',
  flop: 'flop',
  discard: 'flop',       // Pineapple discard happens during flop
  turn: 'turn',
  river: 'river',
  showdown: 'showdown',
  payout: 'showdown',
};

// ── Soft rate-limit store (per-IP, 100/min) ──
const _hits = new Map();
const RATE_WINDOW = 60_000;
const RATE_LIMIT = 100;

function checkRate(ip) {
  const now = Date.now();
  let entry = _hits.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    entry = { windowStart: now, count: 0 };
    _hits.set(ip, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// Clean stale entries every 5 min
if (typeof globalThis.__miniStateCleanup === 'undefined') {
  globalThis.__miniStateCleanup = setInterval(() => {
    const cutoff = Date.now() - RATE_WINDOW * 2;
    for (const [ip, entry] of _hits) {
      if (entry.windowStart < cutoff) _hits.delete(ip);
    }
  }, 300_000);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  // ── Rate limit ──
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (!checkRate(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded (100/min)' });
  }

  const { tableIds } = req.query;
  if (!tableIds || typeof tableIds !== 'string') {
    return res.status(400).json({ error: 'tableIds query param required (comma-separated)' });
  }

  const ids = tableIds.split(',').filter(Boolean).slice(0, 50); // Max 50 tables per batch
  if (ids.length === 0) {
    return res.status(400).json({ error: 'No valid table IDs provided' });
  }

  try {
    // Import GameController lazily — it may not be initialized
    const { getController } = require('../../../../src/lib/poker-engine/GameController');
    let controller;
    try {
      controller = await getController();
    } catch {
      // Engine not booted — return idle for all
      return res.status(200).json(ids.map(id => ({ tableId: id, phase: 'idle', seats: [] })));
    }

    const results = [];

    for (const tableId of ids) {
      const entry = controller.lobby?.tables?.get(tableId);

      if (!entry || !entry.table) {
        results.push({ tableId, phase: 'idle', seats: [] });
        continue;
      }

      // ── V2 FIX: Use the sanctioned getState(null) API ──
      // This correctly maps all internal fields through TableManager.getState()
      // which in turn calls GameStateMachine.getState(), giving us:
      //   - state.game.communityCards (from currentHand.communityCards)
      //   - state.game.potTotal (from potCalculator.totalPot)
      //   - state.game.currentPlayerId (from bettingRound.getCurrentPlayer())
      //   - state.game.buttonSeat (from game.buttonSeat)
      //   - state.seats[].isFolded, isCurrentActor (pre-computed)
      const state = entry.table.getState(null);

      const enginePhase = state.game?.phase || 'idle';
      const displayPhase = DISPLAY_PHASE[enginePhase] || enginePhase;

      // Build lightweight seat array from the pre-computed state
      // Build lightweight seat array from the pre-computed state
      // Note: allIn is detected via isInHand + stack=0 (allIn flag not exposed in seat output)
      const seats = (state.seats || []).map(s => {
        if (!s.player) return { seatIndex: s.seatIndex, occupied: false };
        
        let lastAction = null;
        if (state.game && state.game.bettingRound) {
           const log = state.game.bettingRound.actionLog;
           if (log && log.length > 0) {
              const pActions = log.filter(a => a.playerId === s.player.id);
              if (pActions.length > 0) {
                 lastAction = pActions[pActions.length - 1];
              }
           }
        }

        return {
          seatIndex: s.seatIndex,
          occupied: true,
          stack: s.stack || 0,
          isFolded: s.isFolded || false,
          isActor: s.isCurrentActor || false,
          isDealer: s.seatIndex === (state.game?.buttonSeat ?? -1),
          isAllIn: s.isInHand && s.stack === 0,
          displayName: s.player.displayName ? String(s.player.displayName).substring(0, 10) : 'Player',
          lastAction: lastAction ? (lastAction.type === 'call' && lastAction.amount === 0 ? 'CHECK' : lastAction.type.toUpperCase()) : null,
          lastActionAmount: lastAction?.amount,
        };
      });

      results.push({
        tableId,
        phase: displayPhase,
        communityCards: state.game?.communityCards || [],
        boards: state.game?.boards || null,
        shownCards: state.game?.shownCards || [],
        potTotal: state.game?.potTotal || 0,
        handNumber: state.game?.handNumber || 0,
        currentActorSeat: seats.findIndex(s => s.isActor),
        turnEndTime: entry.timer?.turnEndTime || null,
        turnTotalTime: entry.timer?.turnTime || 15,
        seats,
      });
    }

    // Cache for 2 seconds (clients poll every 4s, so 2s is safe)
    res.setHeader('Cache-Control', 'public, max-age=2');
    return res.status(200).json(results);
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[mini-state] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
