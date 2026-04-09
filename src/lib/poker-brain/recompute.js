/**
 * Poker Brain — Historical Hand Equity Recomputer
 * -------------------------------------------------
 * Utilities for re-running the engine against previously stored hands
 * so stats computed under older (buggy) versions of the evaluator can
 * be corrected in place.
 *
 * Two known issues this fixes:
 *
 *   1. Pre-phase-1 evaluateHand scoring bug: High-Card and Flush
 *      scores used `Math.pow(1000, 4-i)`, producing values up to
 *      1.4e13 — dwarfing the 1e7 cap of made hands. Any stored
 *      equity values that used `calculateEquity` while that bug was
 *      live are off by an unpredictable margin. Rule of thumb: if
 *      the hand was logged before the evaluator-fix commit, its
 *      p_equity should be recomputed.
 *
 *   2. Pre-phase-4 Hi-Lo low-side was hardcoded to null for Omaha,
 *      so any stored PLO Hi-Lo hand has lowEquity=0 and the scoop
 *      equity is therefore under-reported. These should also be
 *      recomputed.
 *
 * Usage (offline / scripted):
 *
 *   import { recomputeHandEquity } from 'src/lib/poker-brain/recompute';
 *   const corrected = recomputeHandEquity({
 *     holeCards: [{rank:'A',suit:'s'},{rank:'A',suit:'h'}],
 *     boardCards: [{rank:'7',suit:'c'},{rank:'2',suit:'d'},{rank:'A',suit:'c'}],
 *     gameType: 'nlhe',
 *     numOpponents: 1,
 *     iterations: 2000,
 *   });
 *   // corrected = { equity, highEquity, lowEquity, wins, ties, iterations }
 *
 * Batch usage (a historical table export or IndexedDB dump):
 *
 *   import { recomputeHandsBatch } from 'src/lib/poker-brain/recompute';
 *   const fixed = recomputeHandsBatch(oldHands, { onProgress: (i, n) => ... });
 *   // Each entry gets a `.equity` (and .highEquity/.lowEquity for Hi-Lo) key
 *   // overwritten; the original value is preserved as `.equityOriginal`.
 *
 * This module is pure — it does NOT talk to Supabase or IndexedDB.
 * Callers are responsible for loading the old rows, passing them
 * through `recomputeHandsBatch`, and writing the corrected values
 * back. That keeps the unit testable and avoids baking a migration
 * runtime into the browser bundle.
 */

import PokerBrainEngine from './engine';

const SCHEMA_VERSION = 4; // bump when evaluator / equity changes again

/**
 * Recompute equity + Hi-Lo fields for a single historical hand.
 * Input shape is flexible — we accept the old logHand args shape
 * (holeCards, boardCards / board, gameType, numOpponents) as well as
 * the newer decision-bridge return shape.
 *
 * Returns null if the hand can't be re-evaluated (missing cards,
 * unknown variant, etc.).
 */
export function recomputeHandEquity(hand, opts = {}) {
  if (!hand) return null;

  const holeCards = normalizeCards(hand.holeCards || hand.hole || []);
  const boardCards = normalizeCards(hand.boardCards || hand.board || []);
  const gameType = String(hand.gameType || 'nlhe').toLowerCase();
  const numOpponents = Math.max(1, (hand.numPlayers || hand.players || 2) - 1);
  const iterations = opts.iterations || (boardCards.length === 5 ? 2000 : boardCards.length === 4 ? 1500 : 1200);

  const expected = PokerBrainEngine.expectedHoleCount(gameType);
  if (holeCards.length !== expected) return null;
  if (boardCards.length !== 0 && boardCards.length < 3) return null;

  // Preflop equity can be skipped since the engine uses charts, not MC.
  if (boardCards.length === 0) {
    return {
      equity: null,
      highEquity: null,
      lowEquity: null,
      skipped: true,
      reason: 'preflop - equity not computed from MC',
      schemaVersion: SCHEMA_VERSION,
    };
  }

  const result = PokerBrainEngine.calculateEquity(
    holeCards,
    boardCards,
    numOpponents,
    gameType,
    iterations,
  );
  if (!result) return null;

  return {
    equity: result.equity,
    highEquity: result.highEquity,
    lowEquity: result.lowEquity,
    wins: result.wins,
    ties: result.ties,
    iterations: result.iterations,
    schemaVersion: SCHEMA_VERSION,
    skipped: false,
  };
}

/**
 * Batch variant that takes an array of hands and returns copies with
 * corrected equity fields. Original values are preserved under
 * `equityOriginal` / `highEquityOriginal` / `lowEquityOriginal` so the
 * caller can diff before writing back.
 *
 * Skips (but does not remove) hands that cannot be recomputed -- those
 * entries get a `recomputeError` field so the caller can log them.
 */
export function recomputeHandsBatch(hands, opts = {}) {
  if (!Array.isArray(hands)) return [];
  const { onProgress } = opts;
  const out = [];
  for (let i = 0; i < hands.length; i++) {
    const h = hands[i];
    const patched = { ...h };
    try {
      const rec = recomputeHandEquity(h, opts);
      if (!rec) {
        patched.recomputeError = 'insufficient-data';
      } else if (rec.skipped) {
        patched.recomputeSkipped = rec.reason;
      } else {
        patched.equityOriginal = h.equity ?? null;
        patched.highEquityOriginal = h.highEquity ?? null;
        patched.lowEquityOriginal = h.lowEquity ?? null;
        patched.equity = rec.equity;
        patched.highEquity = rec.highEquity;
        patched.lowEquity = rec.lowEquity;
        patched.schemaVersion = SCHEMA_VERSION;
      }
    } catch (err) {
      patched.recomputeError = err && err.message ? err.message : 'unknown';
    }
    out.push(patched);
    if (typeof onProgress === 'function') onProgress(i + 1, hands.length);
  }
  return out;
}

/**
 * Diff summary between original and corrected values. Useful for
 * "what would change?" dry runs before writing back to the database.
 */
export function summarizeRecompute(originalHands, correctedHands) {
  let changedEquity = 0;
  let changedLowEquity = 0;
  let skipped = 0;
  let errored = 0;
  let maxEquityDelta = 0;
  const samples = [];
  const n = Math.min(originalHands.length, correctedHands.length);
  for (let i = 0; i < n; i++) {
    const a = originalHands[i];
    const b = correctedHands[i];
    if (b.recomputeError) { errored++; continue; }
    if (b.recomputeSkipped) { skipped++; continue; }
    const dEq = Math.abs((b.equity ?? 0) - (a.equity ?? 0));
    const dLow = Math.abs((b.lowEquity ?? 0) - (a.lowEquity ?? 0));
    if (dEq > 0.5) {
      changedEquity++;
      if (dEq > maxEquityDelta) maxEquityDelta = dEq;
      if (samples.length < 5) samples.push({ idx: i, before: a.equity, after: b.equity, delta: dEq });
    }
    if (dLow > 0.5) changedLowEquity++;
  }
  return {
    total: n,
    changedEquity,
    changedLowEquity,
    skipped,
    errored,
    maxEquityDelta: Math.round(maxEquityDelta * 100) / 100,
    samples,
  };
}

function normalizeCards(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const c of input) {
    if (!c) continue;
    // Accept both {rank, suit} and 2-char string shapes ("As", "Th").
    if (typeof c === 'string' && c.length >= 2) {
      out.push({ rank: c[0].toUpperCase(), suit: c[1].toLowerCase() });
      continue;
    }
    if (c.rank != null && c.suit != null) {
      out.push({ rank: String(c.rank).toUpperCase(), suit: String(c.suit).toLowerCase() });
    }
  }
  return out;
}

export default {
  recomputeHandEquity,
  recomputeHandsBatch,
  summarizeRecompute,
  SCHEMA_VERSION,
};
