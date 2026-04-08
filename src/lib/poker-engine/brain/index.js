/**
 * brain/index.js — Barrel re-export for modular HorsePokerBrain
 *
 * This barrel provides backward compatibility: require('./HorsePokerBrain')
 * can be redirected here with zero consumer changes.
 *
 * Architecture:
 *   core.js          → Shared utilities (cards, position, hash, timing, Supabase)
 *   anti-exploit.js  → Anti-exploit modules 1-32 (tracking Maps, threat intel, opponent modeling)
 *   session-analytics.js → Session management, performance, bankroll, opponent journals
 *   plo8-brain.js    → PLO8 Hi-Lo low hand evaluator
 *   plo-core.js      → Shared PLO hand evaluation, outs, blockers, decision engine
 *   holdem-brain.js  → Hold'em decision engine (fallback, flop, turn/river heuristics)
 *   router.js        → getDecision() master router (variant routing, GTO, guardrails)
 *   live-observer.js → Always-on opponent tracking (observeAction, getLiveRead, etc.)
 *   hand-result.js   → Post-hand processing pipeline (processHandResult)
 *
 * During migration, functions not yet extracted are still served from the
 * legacy monolith (../HorsePokerBrain.js). As modules are completed,
 * their exports shift from legacy → new module.
 */

// Phase 1: New modular exports
const core = require('./core');
const antiExploit = require('./anti-exploit');
const sessionAnalytics = require('./session-analytics');
const plo8Brain = require('./plo8-brain');
const ploCore = require('./plo-core');
const holdemBrain = require('./holdem-brain');
const plo5Brain = require('./plo5-brain');
const plo6Brain = require('./plo6-brain');
const tournamentBrain = require('./tournament-brain');
const router = require('./router');
const liveObserver = require('./live-observer');
const handResult = require('./hand-result');

// Phase 2: Legacy monolith (remaining unextracted functions during migration)
const legacy = require('../HorsePokerBrain');

// Wire the live observer into the router + holdem modules
// Now using the NEW extracted module instead of legacy
router.setRouterLiveReadFn(liveObserver.getLiveRead);

// Merge: new modules take precedence over legacy for extracted functions
module.exports = {
    ...legacy,

    // ═══════════════════════════════════════════════════════════════════════
    // core.js — Card utilities, position, hash, timing, Supabase
    // ═══════════════════════════════════════════════════════════════════════
    cardIntToString: core.cardIntToString,
    cardsToStrings: core.cardsToStrings,
    mapPosition: core.mapPosition,
    formatHandString: core.formatHandString,
    getPreflopStrength: core.getPreflopStrength,
    getActionDelay: core.getActionDelay,
    parseCard: core.parseCard,
    parseCards: core.parseCards,

    // ═══════════════════════════════════════════════════════════════════════
    // anti-exploit.js — Modules 1-32 (tracking, threat intel, opponent reads)
    // ═══════════════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════════════
    // session-analytics.js — Session management, performance, bankroll
    // ═══════════════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════════════
    // plo8-brain.js — PLO8 Hi-Lo low hand evaluator
    // ═══════════════════════════════════════════════════════════════════════
    evaluatePLO8Low: plo8Brain.evaluatePLO8Low,

    // ═══════════════════════════════════════════════════════════════════════
    // plo-core.js — PLO hand evaluation, decision engine (88 functions)
    // ═══════════════════════════════════════════════════════════════════════
    classifyPLOPreflop: ploCore.classifyPLOPreflop,
    enhancePLOPreflopScore: ploCore.enhancePLOPreflopScore,
    getPLOPreflopAction: ploCore.getPLOPreflopAction,
    getBestPLO5or6PreflopStrength: ploCore.getBestPLO5or6PreflopStrength,
    getBestPLO5or6MadeHand: ploCore.getBestPLO5or6MadeHand,
    evaluatePLOMadeHand: ploCore.evaluatePLOMadeHand,
    countStraightOuts: ploCore.countStraightOuts,
    countFlushOuts: ploCore.countFlushOuts,
    countBackdoorOuts: ploCore.countBackdoorOuts,
    detectPLOWrapDraw: ploCore.detectPLOWrapDraw,
    calculatePLODirtyOuts: ploCore.calculatePLODirtyOuts,
    deduplicatePLOComboOuts: ploCore.deduplicatePLOComboOuts,
    analyzePLOBoardTexture: ploCore.analyzePLOBoardTexture,
    detectScareCard: ploCore.detectScareCard,
    analyzePLORunoutDistribution: ploCore.analyzePLORunoutDistribution,
    projectPLOBoardScenarios: ploCore.projectPLOBoardScenarios,
    getPLOSPRZone: ploCore.getPLOSPRZone,
    getPLOEquityRealization: ploCore.getPLOEquityRealization,
    getPLOPositionRanges: ploCore.getPLOPositionRanges,
    calcPLOPotRaise: ploCore.calcPLOPotRaise,
    calcPLOBetSize: ploCore.calcPLOBetSize,
    getAdaptivePLOBetSize: ploCore.getAdaptivePLOBetSize,
    getPLOCBetStrategy: ploCore.getPLOCBetStrategy,
    getPLOTurnBarrel: ploCore.getPLOTurnBarrel,
    getPLOShowdownValue: ploCore.getPLOShowdownValue,
    getPLORangeBalance: ploCore.getPLORangeBalance,
    getPLOImpliedOdds: ploCore.getPLOImpliedOdds,
    getPLOMultiStreetPlan: ploCore.getPLOMultiStreetPlan,
    getPLONutRangeAdvantage: ploCore.getPLONutRangeAdvantage,
    getPLORiverOverbet: ploCore.getPLORiverOverbet,
    getPLOAllInEquity: ploCore.getPLOAllInEquity,
    getPLOReverseImpliedOdds: ploCore.getPLOReverseImpliedOdds,
    getPLOFlopContinuance: ploCore.getPLOFlopContinuance,
    getPLOCheckBehindCalibration: ploCore.getPLOCheckBehindCalibration,
    optimizePLORiverDecision: ploCore.optimizePLORiverDecision,
    getPLORiverFloat: ploCore.getPLORiverFloat,
    getPLORiverCheckRaise: ploCore.getPLORiverCheckRaise,
    getPLOOpponentAdjustments: ploCore.getPLOOpponentAdjustments,
    getPLOBlockers: ploCore.getPLOBlockers,
    getPLOCardRemovalEffects: ploCore.getPLOCardRemovalEffects,
    buildPLOExploitationProfile: ploCore.buildPLOExploitationProfile,
    getPLOPotManipulation: ploCore.getPLOPotManipulation,
    getPLOTableImage: ploCore.getPLOTableImage,
    approximatePLOHvR: ploCore.approximatePLOHvR,
    detectPLOBetSizingTell: ploCore.detectPLOBetSizingTell,
    readPLOTimingTell: ploCore.readPLOTimingTell,
    getPLOPerStreetBluffCalibration: ploCore.getPLOPerStreetBluffCalibration,
    calibratePLOProbeBet: ploCore.calibratePLOProbeBet,
    updatePLOBayesianModel: ploCore.updatePLOBayesianModel,
    getPLOEquityConfidence: ploCore.getPLOEquityConfidence,
    auditPLODecision: ploCore.auditPLODecision,
    getPLOHandHistoryCorrection: ploCore.getPLOHandHistoryCorrection,
    getPLOGameTypeAdjustments: ploCore.getPLOGameTypeAdjustments,
    getPLOLimpedPotStrategy: ploCore.getPLOLimpedPotStrategy,
    governPLOMultiWayAggression: ploCore.governPLOMultiWayAggression,
    getPLO3BetDefense: ploCore.getPLO3BetDefense,
    getPLOLimperIsolation: ploCore.getPLOLimperIsolation,
    getPLOSidePotAwareness: ploCore.getPLOSidePotAwareness,
    getPLOLateSessionAdjustment: ploCore.getPLOLateSessionAdjustment,
    getPLOBlindDefense: ploCore.getPLOBlindDefense,
    getPLODeepStackAdjustments: ploCore.getPLODeepStackAdjustments,
    getPLOSqueezePlay: ploCore.getPLOSqueezePlay,
    getPLOColdCallDecision: ploCore.getPLOColdCallDecision,
    getPLOBlindBattleStrategy: ploCore.getPLOBlindBattleStrategy,
    getPLOVarianceProtection: ploCore.getPLOVarianceProtection,
    getPLOICMBubblePressure: ploCore.getPLOICMBubblePressure,
    getPLOChipAccumulationMode: ploCore.getPLOChipAccumulationMode,
    getPLOStackPreservation: ploCore.getPLOStackPreservation,
    handlePLODonkBet: ploCore.handlePLODonkBet,
    getPLO4BetPotDecision: ploCore.getPLO4BetPotDecision,
    getPLODonkBetOpportunity: ploCore.getPLODonkBetOpportunity,
    getPLOProbeBet: ploCore.getPLOProbeBet,
    getPLOCheckRaise: ploCore.getPLOCheckRaise,
    getPLOGifTrigger: ploCore.getPLOGifTrigger,
    getPLOGifStateMachine: ploCore.getPLOGifStateMachine,
    getPLOChatResponse: ploCore.getPLOChatResponse,
    obfuscatePLOFrequency: ploCore.obfuscatePLOFrequency,
    injectPLOBetSizeNoise: ploCore.injectPLOBetSizeNoise,
    trackPLOShowdownExposure: ploCore.trackPLOShowdownExposure,
    detectPLOPatternExploit: ploCore.detectPLOPatternExploit,
    detectPLOStackSandwich: ploCore.detectPLOStackSandwich,
    injectPLOGTOChaos: ploCore.injectPLOGTOChaos,
    detectPLOBotOpponent: ploCore.detectPLOBotOpponent,
    buildPLOCounterExploitProfile: ploCore.buildPLOCounterExploitProfile,
    createPLODecisionCache: ploCore.createPLODecisionCache,
    makePLOFallbackDecision: ploCore.makePLOFallbackDecision,

    // ═══════════════════════════════════════════════════════════════════════
    // plo5-brain.js — PLO5 (5-Card Omaha) variant-specific strategy
    // ═══════════════════════════════════════════════════════════════════════
    scorePLO5Hand: plo5Brain.scorePLO5Hand,
    getPLO5PreflopAction: plo5Brain.getPLO5PreflopAction,
    adjustPLO5PostflopStrength: plo5Brain.adjustPLO5PostflopStrength,
    getPLO5DrawEquity: plo5Brain.getPLO5DrawEquity,
    getPLO5BetSize: plo5Brain.getPLO5BetSize,
    makePLO5Decision: plo5Brain.makePLO5Decision,

    // ═══════════════════════════════════════════════════════════════════════
    // plo6-brain.js — PLO6 (6-Card Omaha) nut-or-nothing strategy
    // ═══════════════════════════════════════════════════════════════════════
    scorePLO6Hand: plo6Brain.scorePLO6Hand,
    getPLO6PreflopAction: plo6Brain.getPLO6PreflopAction,
    evaluatePLO6FlushHierarchy: plo6Brain.evaluatePLO6FlushHierarchy,
    evaluatePLO6NutDistance: plo6Brain.evaluatePLO6NutDistance,
    adjustPLO6PostflopStrength: plo6Brain.adjustPLO6PostflopStrength,
    getPLO6BlockerValue: plo6Brain.getPLO6BlockerValue,
    shouldPLO6Bluff: plo6Brain.shouldPLO6Bluff,
    getPLO6DrawEquity: plo6Brain.getPLO6DrawEquity,
    getPLO6BetSize: plo6Brain.getPLO6BetSize,
    getPLO6EquityRealization: plo6Brain.getPLO6EquityRealization,
    makePLO6Decision: plo6Brain.makePLO6Decision,

    // ═══════════════════════════════════════════════════════════════════════
    // holdem-brain.js — Hold'em decision engine (20 functions)
    // ═══════════════════════════════════════════════════════════════════════
    makeFallbackDecision: holdemBrain.makeFallbackDecision,
    evaluatePostflopHand: holdemBrain.evaluatePostflopHand,
    makeFlopHeuristicDecision: holdemBrain.makeFlopHeuristicDecision,
    makeTurnRiverHeuristicDecision: holdemBrain.makeTurnRiverHeuristicDecision,
    evaluateBoardWetness: holdemBrain.evaluateBoardWetness,
    analyzeBoardEvolution: holdemBrain.analyzeBoardEvolution,
    getSPRStrategy: holdemBrain.getSPRStrategy,
    getMultiwayAdjustment: holdemBrain.getMultiwayAdjustment,
    getCheckRaiseStrategy: holdemBrain.getCheckRaiseStrategy,
    getOOPDecisionMatrix: holdemBrain.getOOPDecisionMatrix,
    getCBetStrategy: holdemBrain.getCBetStrategy,
    get3BetStrategy: holdemBrain.get3BetStrategy,
    getDrawEquity: holdemBrain.getDrawEquity,
    getRiverStrategy: holdemBrain.getRiverStrategy,
    getDeepStackAdjustment: holdemBrain.getDeepStackAdjustment,
    getOptimalBetSize: holdemBrain.getOptimalBetSize,
    getGeometricSizing: holdemBrain.getGeometricSizing,
    applyExploitIntensifier: holdemBrain.applyExploitIntensifier,
    handleDonkBet: holdemBrain.handleDonkBet,
    applyTiltDegradation: holdemBrain.applyTiltDegradation,

    // ═══════════════════════════════════════════════════════════════════════
    // tournament-brain.js — Tournament-specific strategy adjustments
    // ═══════════════════════════════════════════════════════════════════════
    detectTournamentStage: tournamentBrain.detectTournamentStage,
    getICMRangeAdjustment: tournamentBrain.getICMRangeAdjustment,
    adjustTournamentPostflop: tournamentBrain.adjustTournamentPostflop,
    adjustTournamentBetSize: tournamentBrain.adjustTournamentBetSize,
    evaluateVarianceSpot: tournamentBrain.evaluateVarianceSpot,
    getTournamentStealAdjustment: tournamentBrain.getTournamentStealAdjustment,
    getAnteAdjustment: tournamentBrain.getAnteAdjustment,
    getPLOTournamentOverride: tournamentBrain.getPLOTournamentOverride,
    applyTournamentAdjustments: tournamentBrain.applyTournamentAdjustments,

    // ═══════════════════════════════════════════════════════════════════════
    // router.js — Master decision function
    // ═══════════════════════════════════════════════════════════════════════
    getDecision: router.getDecision,
    validateAndClamp: router.validateAndClamp,
    shouldAutoSeat: router.shouldAutoSeat,

    // ═══════════════════════════════════════════════════════════════════════
    // live-observer.js — Always-on opponent tracking
    // ═══════════════════════════════════════════════════════════════════════
    observeNewHand: liveObserver.observeNewHand,
    observeAction: liveObserver.observeAction,
    observeShowdown: liveObserver.observeShowdown,
    getLiveRead: liveObserver.getLiveRead,
    clearLiveObserver: liveObserver.clearLiveObserver,
    clearTableLiveObservers: liveObserver.clearTableLiveObservers,
    cleanupLiveObservers: liveObserver.cleanupLiveObservers,

    // ═══════════════════════════════════════════════════════════════════════
    // hand-result.js — Post-hand processing pipeline
    // ═══════════════════════════════════════════════════════════════════════
    processHandResult: handResult.processHandResult,
};
