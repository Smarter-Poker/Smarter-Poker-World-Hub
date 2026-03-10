/**
 * ORB-9: THE DEALER — Pure-Function Barrel Export
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This is the canonical entry point for ORB-9 (The Dealer).
 * 
 * ORB-9 owns `/src/engine/dealer` — the cryptographic mathematics, 
 * true RNG, and absolute hand evaluation layer. This barrel re-exports
 * the battle-tested modules from `src/lib/poker-engine/` and adds
 * the ORB-9 Showdown resolver.
 * 
 * Other Orbs consume this module. They never import from poker-engine directly.
 * 
 * Usage (from other Orbs):
 *   const Dealer = require('../engine/dealer');
 *   
 *   // Deal cards
 *   const deck = new Dealer.Deck();
 *   deck.reset(); deck.shuffle();
 *   const card = deck.deal();
 *   
 *   // Evaluate hands
 *   const result = Dealer.evaluateHoldem([c1, c2, b1, b2, b3, b4, b5]);
 *   
 *   // Resolve showdown (the main ORB-9 API)
 *   const showdown = Dealer.resolveShowdown({ players, board });
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Core Modules from poker-engine ──────────────────────────────
const DeckModule = require('../../lib/poker-engine/Deck');
const HandEvalModule = require('../../lib/poker-engine/HandEvaluator');
const { PotCalculator, Pot } = require('../../lib/poker-engine/PotCalculator');
const { EquityCalculator } = require('../../lib/poker-engine/EquityCalculator');

// ── ORB-9 Showdown Resolver ─────────────────────────────────────
const { resolveShowdown, resolveShowdownFromStrings } = require('./Showdown');

module.exports = {
  // ── Deck & Card Utilities ──
  ...DeckModule,

  // ── Hand Evaluation ──
  ...HandEvalModule,

  // ── Pot Management ──
  PotCalculator,
  Pot,

  // ── Equity Calculator ──
  EquityCalculator,

  // ── ORB-9 Showdown API (Primary Entry Point) ──
  resolveShowdown,
  resolveShowdownFromStrings,
};
