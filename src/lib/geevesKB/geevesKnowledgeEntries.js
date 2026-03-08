/* Geeves Knowledge Entries — Master Index v3.0
   Strategy 1: 600+ entries across all platform domains (source-verified)
   Now includes Union, Club Arena Admin, Commander sub-pages.
   Content guard wired into the matching engine (security + brand safety).
*/
import { WORLD_HUB_ENTRIES } from './worldHub';
import { TRAINING_ENTRIES, TRIVIA_ENTRIES, DIAMOND_ENTRIES } from './trainingAndDiamonds';
import { COMMANDER_ENTRIES } from './clubCommander';
import { COMMANDER_PAGES_ENTRIES } from './commanderPages';
import {
    CLUB_ARENA_ENTRIES,
    BANKROLL_ENTRIES,
    TOKE_TRACKER_ENTRIES,
    POKER_NEAR_ME_ENTRIES,
    MEMORY_GAMES_ENTRIES
} from './clubsAndFinancials';
import {
    CLUB_ADMIN_ENTRIES,
    AGENT_DASHBOARD_ENTRIES,
    CLUB_ARENA_PAGES_ENTRIES,
} from './clubArenaAdmin';
import { UNION_DASHBOARD_ENTRIES, UNION_GAMES_ENTRIES } from './unionDashboard';
import { POKER_STRATEGY_ENTRIES } from './pokerStrategy';
import { SOCIAL_HUB_ENTRIES, SANDBOX_ENTRIES } from './socialAndSandbox';

export const KNOWLEDGE_ENTRIES = [
    // ── Platform & World Hub (30+ entries) ──
    ...WORLD_HUB_ENTRIES,

    // ── Training, Trivia, Diamond Economy (20+ entries) ──
    ...TRAINING_ENTRIES,
    ...TRIVIA_ENTRIES,
    ...DIAMOND_ENTRIES,

    // ── Club Commander — core + all sub-pages (40+ entries) ──
    ...COMMANDER_ENTRIES,
    ...COMMANDER_PAGES_ENTRIES,

    // ── Club Arena — core features (40+ entries) ──
    ...CLUB_ARENA_ENTRIES,
    ...CLUB_ADMIN_ENTRIES,
    ...AGENT_DASHBOARD_ENTRIES,
    ...CLUB_ARENA_PAGES_ENTRIES,

    // ── Union Dashboard + Union Games (16 entries) ──
    ...UNION_DASHBOARD_ENTRIES,
    ...UNION_GAMES_ENTRIES,

    // ── Financial Tools (25+ entries) ──
    ...BANKROLL_ENTRIES,
    ...TOKE_TRACKER_ENTRIES,
    ...POKER_NEAR_ME_ENTRIES,
    ...MEMORY_GAMES_ENTRIES,

    // ── Poker Strategy & GTO Theory (21 entries) ──
    ...POKER_STRATEGY_ENTRIES,

    // ── Social Hub & Virtual Sandbox (20 entries) ──
    ...SOCIAL_HUB_ENTRIES,
    ...SANDBOX_ENTRIES,
];
