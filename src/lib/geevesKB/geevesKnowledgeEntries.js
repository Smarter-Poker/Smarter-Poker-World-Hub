/* Geeves Knowledge Entries — Master Index v2.0
   Strategy 1: 500+ entries across all platform domains
   Now includes Social Hub, Virtual Sandbox, and Synonyms engine
*/
import { WORLD_HUB_ENTRIES } from './worldHub';
import { TRAINING_ENTRIES, TRIVIA_ENTRIES, DIAMOND_ENTRIES } from './trainingAndDiamonds';
import { COMMANDER_ENTRIES } from './clubCommander';
import {
    CLUB_ARENA_ENTRIES,
    BANKROLL_ENTRIES,
    TOKE_TRACKER_ENTRIES,
    POKER_NEAR_ME_ENTRIES,
    MEMORY_GAMES_ENTRIES
} from './clubsAndFinancials';
import { POKER_STRATEGY_ENTRIES } from './pokerStrategy';
import { SOCIAL_HUB_ENTRIES, SANDBOX_ENTRIES } from './socialAndSandbox';

export const KNOWLEDGE_ENTRIES = [
    // Platform & World Hub
    ...WORLD_HUB_ENTRIES,

    // Training, Trivia, Diamond Economy
    ...TRAINING_ENTRIES,
    ...TRIVIA_ENTRIES,
    ...DIAMOND_ENTRIES,

    // Club Commander (all TD workflows)
    ...COMMANDER_ENTRIES,

    // Club Arena, Bankroll, Toke Tracker, Poker Near Me, Memory
    ...CLUB_ARENA_ENTRIES,
    ...BANKROLL_ENTRIES,
    ...TOKE_TRACKER_ENTRIES,
    ...POKER_NEAR_ME_ENTRIES,
    ...MEMORY_GAMES_ENTRIES,

    // Poker Strategy & GTO Theory
    ...POKER_STRATEGY_ENTRIES,

    // Social Hub & Virtual Sandbox (NEW — previously 0 coverage)
    ...SOCIAL_HUB_ENTRIES,
    ...SANDBOX_ENTRIES,
];
