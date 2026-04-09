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
 * Phase 3 COMPLETE: The 20,482-line HorsePokerBrain.js monolith is no longer
 * loaded. All 246+ exports are served entirely from the 12 modular brain files.
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

// Phase 3: Legacy monolith REMOVED — all functions now served from modular brain/
// The 20,482-line HorsePokerBrain.js monolith is no longer loaded.
// All 246 exports come from the 12 extracted modules below.

// Wire the live observer into the router + holdem modules
router.setRouterLiveReadFn(liveObserver.getLiveRead);

// All exports from modular brain — zero legacy dependency
module.exports = {
    // ═══════════════════════════════════════════════════════════════════════
    // core.js — Card utilities, position, hash, timing, Supabase, horse identity
    // ═══════════════════════════════════════════════════════════════════════
    cardIntToString: core.cardIntToString,
    cardsToStrings: core.cardsToStrings,
    mapPosition: core.mapPosition,
    formatHandString: core.formatHandString,
    getPreflopStrength: core.getPreflopStrength,
    getActionDelay: core.getActionDelay,
    parseCard: core.parseCard,
    parseCards: core.parseCards,
    loadHorseIds: core.loadHorseIds,
    isHorse: core.isHorse,
    isHorseSync: core.isHorseSync,
    getHorseIdsAtTable: core.getHorseIdsAtTable,
    // Constants & shared state
    RANKS: core.RANKS,
    SUITS: core.SUITS,
    RANK_ORDER: core.RANK_ORDER,
    RANK_NAMES: core.RANK_NAMES,
    PREFLOP_STRENGTH: core.PREFLOP_STRENGTH,
    POSITION_MAP: core.POSITION_MAP,
    getSupabase: core.getSupabase,
    getHash: core.getHash,
    resolveESM: core.resolveESM,
    getGTOModule: core.getGTOModule,
    getPersonalityModule: core.getPersonalityModule,
    getAdvancedModule: core.getAdvancedModule,
    chatMessages: core.chatMessages,
    multiTableTracker: core.multiTableTracker,
    evolutionTracker: core.evolutionTracker,

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
    analyzeStreetNarrative: antiExploit.analyzeStreetNarrative,
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
    clearTableSessions: sessionAnalytics.clearTableSessions,
    persistOpponentJournal: sessionAnalytics.persistOpponentJournal,
    loadOpponentJournal: sessionAnalytics.loadOpponentJournal,
    persistTableJournals: sessionAnalytics.persistTableJournals,
    loadTableJournals: sessionAnalytics.loadTableJournals,
    _applyJournalToProfile: sessionAnalytics._applyJournalToProfile,
    _journalCache: sessionAnalytics._journalCache,
    dailyPlayTracker: sessionAnalytics.dailyPlayTracker,
    getTodayString: sessionAnalytics.getTodayString,
    performanceStats: sessionAnalytics.performanceStats,
    softPlayLog: sessionAnalytics.softPlayLog,
    JOURNAL_CACHE_TTL: sessionAnalytics.JOURNAL_CACHE_TTL,
    JOURNAL_PERSIST_INTERVAL: sessionAnalytics.JOURNAL_PERSIST_INTERVAL,

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
    _calcPLOPotRaiseSimple: ploCore._calcPLOPotRaiseSimple,
    calcPLOBetSize: ploCore.calcPLOBetSize,
    getAdaptivePLOBetSize: ploCore.getAdaptivePLOBetSize,
    getPLOGeometricSizing: ploCore.getPLOGeometricSizing,
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
    evaluatePLO5FlushHierarchy: plo5Brain.evaluatePLO5FlushHierarchy,
    evaluatePLO5NutDistance: plo5Brain.evaluatePLO5NutDistance,
    classifyPLO5Draws: plo5Brain.classifyPLO5Draws,
    getPLO5EquityRealization: plo5Brain.getPLO5EquityRealization,
    getPLO5ProtectionBet: plo5Brain.getPLO5ProtectionBet,
    getPLO5MultiwayStrategy: plo5Brain.getPLO5MultiwayStrategy,
    evaluatePLO5FifthCardAdvantage: plo5Brain.evaluatePLO5FifthCardAdvantage,
    reassessPLO5Turn: plo5Brain.reassessPLO5Turn,
    handlePLO5MissedDraw: plo5Brain.handlePLO5MissedDraw,
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
    classifyPLO6Draws: plo6Brain.classifyPLO6Draws,
    getPLO6DrawEquity: plo6Brain.getPLO6DrawEquity,
    getPLO6MultiStreetDrawPlan: plo6Brain.getPLO6MultiStreetDrawPlan,
    reassessPLO6Turn: plo6Brain.reassessPLO6Turn,
    getPLO6ProtectionBet: plo6Brain.getPLO6ProtectionBet,
    evaluatePLO6DrawVsDraw: plo6Brain.evaluatePLO6DrawVsDraw,
    detectPLO6Freeroll: plo6Brain.detectPLO6Freeroll,
    handlePLO6MissedDraw: plo6Brain.handlePLO6MissedDraw,
    getPLO6CardRemoval: plo6Brain.getPLO6CardRemoval,
    getPLO6MultiwayStrategy: plo6Brain.getPLO6MultiwayStrategy,
    getPLO6BetSize: plo6Brain.getPLO6BetSize,
    getPLO6EquityRealization: plo6Brain.getPLO6EquityRealization,
    makePLO6Decision: plo6Brain.makePLO6Decision,

    // ═══════════════════════════════════════════════════════════════════════
    // holdem-brain.js — Hold'em decision engine (32 functions)
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
    setLiveReadFn: holdemBrain.setLiveReadFn,
    // Advanced NLHE strategy (Phase 5 expansion — 10 functions)
    getBlindBattleStrategy: holdemBrain.getBlindBattleStrategy,
    getHoldemBlockerAnalysis: holdemBrain.getHoldemBlockerAnalysis,
    getThinValueStrategy: holdemBrain.getThinValueStrategy,
    getBluffCatchStrategy: holdemBrain.getBluffCatchStrategy,
    calculatePotAndImpliedOdds: holdemBrain.calculatePotAndImpliedOdds,
    getRangeAdvantage: holdemBrain.getRangeAdvantage,
    getPolarizationStrategy: holdemBrain.getPolarizationStrategy,
    getPositionStrategy: holdemBrain.getPositionStrategy,
    getMultiStreetPlan: holdemBrain.getMultiStreetPlan,
    getShortStackNLHEStrategy: holdemBrain.getShortStackNLHEStrategy,

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
    calculatePayJumpPressure: tournamentBrain.calculatePayJumpPressure,
    getStackDynamicsAdjustment: tournamentBrain.getStackDynamicsAdjustment,
    getRebuyPeriodAdjustment: tournamentBrain.getRebuyPeriodAdjustment,
    getSatelliteAdjustment: tournamentBrain.getSatelliteAdjustment,
    getHeadsUpTournamentStrategy: tournamentBrain.getHeadsUpTournamentStrategy,
    getPLOTournamentAllInEquity: tournamentBrain.getPLOTournamentAllInEquity,
    calculateBlindLevelUrgency: tournamentBrain.calculateBlindLevelUrgency,

    // ═══════════════════════════════════════════════════════════════════════
    // router.js — Master decision function
    // ═══════════════════════════════════════════════════════════════════════
    getDecision: router.getDecision,
    validateAndClamp: router.validateAndClamp,
    shouldAutoSeat: router.shouldAutoSeat,
    setRouterLiveReadFn: router.setRouterLiveReadFn,

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
    liveObserver: liveObserver.liveObserver,
    // Internal (exposed for testing and cross-module wiring)
    _getTableObserver: liveObserver._getTableObserver,
    _createLiveProfile: liveObserver._createLiveProfile,
    _createInHandModel: liveObserver._createInHandModel,
    _evictLRUProfiles: liveObserver._evictLRUProfiles,
    _evictLRUTables: liveObserver._evictLRUTables,

    // ═══════════════════════════════════════════════════════════════════════
    // hand-result.js — Post-hand processing pipeline
    // ═══════════════════════════════════════════════════════════════════════
    processHandResult: handResult.processHandResult,

    // ═══════════════════════════════════════════════════════════════════════
    // Internal state Maps (exposed for testing and HealthWatchdog)
    // ═══════════════════════════════════════════════════════════════════════
    collusionTracker: antiExploit.collusionTracker,
    tiltMap: antiExploit.tiltMap,
    frequencyObfuscatorMap: antiExploit.frequencyObfuscatorMap,
    showdownExposureMap: antiExploit.showdownExposureMap,
    patternProfitMap: antiExploit.patternProfitMap,
    chaosSuppressionMap: antiExploit.chaosSuppressionMap,
    suspectBotMap: antiExploit.suspectBotMap,
    threatIntelCache: antiExploit.threatIntelCache,
    threatPersistTimers: antiExploit.threatPersistTimers,
    crossTableRadar: antiExploit.crossTableRadar,
    rangeRotationMap: antiExploit.rangeRotationMap,
    timeAbuseSuspicion: antiExploit.timeAbuseSuspicion,
    tableTimebankBlacklist: antiExploit.tableTimebankBlacklist,
    probeBetMap: antiExploit.probeBetMap,
    imageExposureMap: antiExploit.imageExposureMap,
    isoSizingMap: antiExploit.isoSizingMap,
    minRaiseMap: antiExploit.minRaiseMap,
    squeezeMap: antiExploit.squeezeMap,
    coldCallMap: antiExploit.coldCallMap,
    angleShootMap: antiExploit.angleShootMap,
    ritRefusalMap: antiExploit.ritRefusalMap,
    chipLeakMap: antiExploit.chipLeakMap,
    streetMemoryMap: antiExploit.streetMemoryMap,
    opponentSessionModel: antiExploit.opponentSessionModel,
    RANGE_GEARS: antiExploit.RANGE_GEARS,
    GEAR_ADJUSTMENTS: antiExploit.GEAR_ADJUSTMENTS,
    sessionTracker: sessionAnalytics.sessionTracker,
};
