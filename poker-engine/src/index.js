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

// Phase 10
const { TournamentController, TOURNAMENT_TYPE, TOURNAMENT_STATUS, ENTRY_STATUS, DEFAULT_BLIND_STRUCTURE, SNG_BLIND_STRUCTURE, SPIN_BLIND_STRUCTURE, SPIN_MULTIPLIERS, DEFAULT_PAYOUT_STRUCTURES, SNG_PAYOUT_STRUCTURES } = require('./TournamentController');
const { ClubLedger, TRANSACTION_TYPE } = require('./ClubLedger');
const { ClubGameBridge } = require('./ClubGameBridge');

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
  
  // Phase 10: Tournament Engine + Club Ledger
  TournamentController, TOURNAMENT_TYPE, TOURNAMENT_STATUS, ENTRY_STATUS,
  DEFAULT_BLIND_STRUCTURE, SNG_BLIND_STRUCTURE, SPIN_BLIND_STRUCTURE,
  SPIN_MULTIPLIERS, DEFAULT_PAYOUT_STRUCTURES, SNG_PAYOUT_STRUCTURES,
  ClubLedger, TRANSACTION_TYPE,
  ClubGameBridge,
};
