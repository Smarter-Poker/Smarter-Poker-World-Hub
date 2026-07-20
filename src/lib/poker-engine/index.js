/**
 * Smarter.Poker - Core Poker Engine
 * Barrel Exports
 * 
 * Phase 1: Core Engine
 * Phase 2: Real-Time Multiplayer
 */

// Phase 1
const DeckModule = require('./Deck');
const HandEvalModule = require('./HandEvaluator');
const { PotCalculator, Pot } = require('./PotCalculator');
const { ActionValidator, ACTION_TYPES, BETTING_STRUCTURES } = require('./ActionValidator');
const { BettingRound, ROUND_STATUS } = require('./BettingRound');
const { GameStateMachine, GAME_PHASE, GAME_VARIANT, STREETS } = require('./GameStateMachine');

// Phase 2
const { TableManager, TABLE_STATUS, SEAT_STATUS } = require('./TableManager');
const { ActionTimer, DEFAULT_TURN_TIME, DEFAULT_TIMEBANK } = require('./ActionTimer');
const { RealtimeSync, CHANNEL_EVENTS, createTableClient } = require('./RealtimeSync');
const { HandHistoryRecorder, HandHistoryQuery, MIGRATION_SQL } = require('./HandHistory');
const { LobbyManager, createLobbyClient } = require('./LobbyManager');
const CardAssets = require('./CardAssets');

// Phase 4
const { GameController, getController, getControllerSync } = require('./GameController');

// Phase 10 (2026-07-20 club-arena retirement: TournamentController +
// TournamentBridge removed — tournaments run on the Club Arena engine.
// Archived copies: archive/legacy-club-tournaments/.)
const { ClubLedger, TRANSACTION_TYPE } = require('./ClubLedger');

// Phase 48f: Autonomy & Resilience Layer
const SupabaseResilience = require('./SupabaseResilience');
const { HealthWatchdog } = require('./HealthWatchdog');
const { PerformanceTracker, tracker: performanceTracker } = require('./PerformanceTracker');

module.exports = {
  // Phase 1: Spread all Deck and HandEval exports (includes classes + helpers)
  ...DeckModule,
  ...HandEvalModule,
  PotCalculator, Pot,
  ActionValidator, ACTION_TYPES, BETTING_STRUCTURES,
  BettingRound, ROUND_STATUS,
  GameStateMachine, GAME_PHASE, GAME_VARIANT, STREETS,
  
  // Phase 2
  TableManager, TABLE_STATUS, SEAT_STATUS,
  ActionTimer, DEFAULT_TURN_TIME, DEFAULT_TIMEBANK,
  RealtimeSync, CHANNEL_EVENTS, createTableClient,
  HandHistoryRecorder, HandHistoryQuery, MIGRATION_SQL,
  LobbyManager, createLobbyClient,
  CardAssets,
  ...CardAssets,
  
  // Phase 4
  GameController, getController, getControllerSync,
  
  // Phase 10: Club Ledger (tournament engine retired 2026-07-20 — Club Arena owns tournaments)
  ClubLedger, TRANSACTION_TYPE,

  // Phase 48f: Autonomy & Resilience Layer
  SupabaseResilience,
  HealthWatchdog,
  PerformanceTracker,
  performanceTracker,
};
