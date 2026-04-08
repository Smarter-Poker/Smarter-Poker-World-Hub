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
const antiExploit = require('./anti-exploit');
const sessionAnalytics = require('./session-analytics');

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

    // anti-exploit.js (Modules 1-32)
    selectCounterStrategy: antiExploit.selectCounterStrategy,
    _loadThreatIntel: antiExploit._loadThreatIntel,
    _persistThreatIntel: antiExploit._persistThreatIntel,
    getThreatScore: antiExploit.getThreatScore,
    isBlacklisted: antiExploit.isBlacklisted,
    getRangeRotationGear: antiExploit.getRangeRotationGear,
    applyMultiwayEquityDiscount: antiExploit.applyMultiwayEquityDiscount,
    detectNutBiasExploitBoard: antiExploit.detectNutBiasExploitBoard,
    reevaluatePLORunoutEquity: antiExploit.reevaluatePLORunoutEquity,
    detectSPRTrap: antiExploit.detectSPRTrap,
    recordProbeBet: antiExploit.recordProbeBet,
    getProbeFarmScore: antiExploit.getProbeFarmScore,
    recordTableImageHand: antiExploit.recordTableImageHand,
    isImageExposed: antiExploit.isImageExposed,
    detectLimpTrap: antiExploit.detectLimpTrap,
    recordIsoSize: antiExploit.recordIsoSize,
    isMechanicalIsolator: antiExploit.isMechanicalIsolator,
    getOOPPositionalGuard: antiExploit.getOOPPositionalGuard,
    evaluateDonkBet: antiExploit.evaluateDonkBet,
    recordRaiseSize: antiExploit.recordRaiseSize,
    isMinRaiser: antiExploit.isMinRaiser,
    recordSqueeze: antiExploit.recordSqueeze,
    isSqueezeOverkill: antiExploit.isSqueezeOverkill,
    detectReverseImplied: antiExploit.detectReverseImplied,
    recordColdCall: antiExploit.recordColdCall,
    recordBarrelVsColdCall: antiExploit.recordBarrelVsColdCall,
    isColdCallTrap: antiExploit.isColdCallTrap,
    detectBombPotOrStraddle: antiExploit.detectBombPotOrStraddle,
    recordActionTiming: antiExploit.recordActionTiming,
    detectAngleShoot: antiExploit.detectAngleShoot,
    recordRITResponse: antiExploit.recordRITResponse,
    isRITRefuser: antiExploit.isRITRefuser,
    getRunItTwicePreference: antiExploit.getRunItTwicePreference,
    recordChipLeak: antiExploit.recordChipLeak,
    getChipLeakBoosts: antiExploit.getChipLeakBoosts,
    recordStreetAction: antiExploit.recordStreetAction,
    getStreetMemory: antiExploit.getStreetMemory,
    recordOpponentAction: antiExploit.recordOpponentAction,
    recordOpponentShowdown: antiExploit.recordOpponentShowdown,
    getOpponentSessionRead: antiExploit.getOpponentSessionRead,

    // session-analytics.js
    recordPerformanceAction: sessionAnalytics.recordPerformanceAction,
    getPerformanceStats: sessionAnalytics.getPerformanceStats,
    recordPerformanceResult: sessionAnalytics.recordPerformanceResult,
    getAdaptiveStrategy: sessionAnalytics.getAdaptiveStrategy,
    getRecommendedStake: sessionAnalytics.getRecommendedStake,
    saveSessionAnalytics: sessionAnalytics.saveSessionAnalytics,
    isSoftPlayAllowed: sessionAnalytics.isSoftPlayAllowed,
    recordSoftPlay: sessionAnalytics.recordSoftPlay,
    getDynamicRebuyStrategy: sessionAnalytics.getDynamicRebuyStrategy,
    saveOpponentRead: sessionAnalytics.saveOpponentRead,
    saveKeyHand: sessionAnalytics.saveKeyHand,
    evolveHorseSkill: sessionAnalytics.evolveHorseSkill,
    getSkillDrift: sessionAnalytics.getSkillDrift,
    getSessionReview: sessionAnalytics.getSessionReview,
    canSitAtTable: sessionAnalytics.canSitAtTable,
    cleanupMultiTable: sessionAnalytics.cleanupMultiTable,
    getChatMessages: sessionAnalytics.getChatMessages,
    warmGTOCache: sessionAnalytics.warmGTOCache,
    recordSitDown: sessionAnalytics.recordSitDown,
    recordRebuy: sessionAnalytics.recordRebuy,
    evaluateSessions: sessionAnalytics.evaluateSessions,
    canRebuy: sessionAnalytics.canRebuy,
    persistOpponentJournal: sessionAnalytics.persistOpponentJournal,
    loadOpponentJournal: sessionAnalytics.loadOpponentJournal,
    persistTableJournals: sessionAnalytics.persistTableJournals,
    loadTableJournals: sessionAnalytics.loadTableJournals,
    _applyJournalToProfile: sessionAnalytics._applyJournalToProfile,
};
