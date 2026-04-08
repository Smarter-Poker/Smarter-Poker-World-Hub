/**
 * brain/index.js — Barrel re-export for modular HorsePokerBrain
 *
 * This barrel provides backward compatibility: require('./HorsePokerBrain')
 * can be redirected here with zero consumer changes.
 *
 * Architecture:
 *   core.js          → Shared utilities (cards, position, hash, timing, Supabase)
 *   plo8-brain.js    → PLO8 Hi-Lo decision engine
 *   plo-core.js      → Shared PLO hand evaluation, outs, blockers (used by all PLO variants)
 *   holdem-brain.js  → Holdem decision engine
 *   tournament.js    → Tournament-specific adjustments (ICM, bubble, etc.)
 *   cash.js          → Cash game session management
 *   anti-exploit.js  → Anti-exploit modules 1-32
 *   router.js        → getDecision() master router
 *
 * During migration, functions not yet extracted are still served from the
 * legacy monolith (../HorsePokerBrain.js). As modules are completed,
 * their exports shift from legacy → new module.
 */

// Phase 1: New modular exports
const core = require('./core');

// Phase 2: Legacy monolith (still serves most functions during migration)
const legacy = require('../HorsePokerBrain');

// Merge: new modules take precedence over legacy for extracted functions
module.exports = {
    ...legacy,

    // Explicitly re-export from new modules (these override legacy versions)
    // core.js
    cardIntToString: core.cardIntToString,
    cardsToStrings: core.cardsToStrings,
    mapPosition: core.mapPosition,
    formatHandString: core.formatHandString,
    getPreflopStrength: core.getPreflopStrength,
    getActionDelay: core.getActionDelay,
    parseCard: core.parseCard,
    parseCards: core.parseCards,
};
