/* Geeves Knowledge Entries — Master Index */
import { WORLD_HUB_ENTRIES } from './worldHub';
import { TRAINING_ENTRIES, TRIVIA_ENTRIES, DIAMOND_ENTRIES } from './trainingAndDiamonds';
import { COMMANDER_ENTRIES } from './clubCommander';
import { CLUB_ARENA_ENTRIES, BANKROLL_ENTRIES, TOKE_TRACKER_ENTRIES, POKER_NEAR_ME_ENTRIES, MEMORY_GAMES_ENTRIES } from './clubsAndFinancials';
import { POKER_STRATEGY_ENTRIES } from './pokerStrategy';

export const KNOWLEDGE_ENTRIES = [
    ...WORLD_HUB_ENTRIES,
    ...TRAINING_ENTRIES,
    ...TRIVIA_ENTRIES,
    ...DIAMOND_ENTRIES,
    ...COMMANDER_ENTRIES,
    ...CLUB_ARENA_ENTRIES,
    ...BANKROLL_ENTRIES,
    ...TOKE_TRACKER_ENTRIES,
    ...POKER_NEAR_ME_ENTRIES,
    ...MEMORY_GAMES_ENTRIES,
    ...POKER_STRATEGY_ENTRIES,
];
