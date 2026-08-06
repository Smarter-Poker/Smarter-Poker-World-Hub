/**
 * 🥚 EGG COVERAGE — which easter eggs the server can currently prove
 * ═══════════════════════════════════════════════════════════════════════════
 * A deliberately tiny module holding ONLY the list of egg keys that have a
 * working verifier. It exists so user-facing copy can state the truth without
 * pulling src/lib/rewards/eggVerifiers.js — and its 28 database queries — into
 * the client bundle.
 *
 * The store page used to advertise "Discover 67 Hidden Achievements". 67 is
 * the catalog size; the number a player can actually unlock is the length of
 * this list. The rest are documented in UNVERIFIABLE_EGGS with the telemetry
 * each one still needs.
 *
 * KEEPING IT HONEST: eggVerifiers.js imports this list and its test asserts
 * that the two agree exactly in both directions, so adding a verifier without
 * adding it here (or vice versa) fails the suite rather than quietly making
 * the store copy wrong again.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Egg keys with a server-side proof in EGG_VERIFIERS. Keep sorted by group. */
export const VERIFIED_EGG_KEYS = [
    // lifetime / milestone
    'millionaire',
    'to_infinity',
    'level_100_boss',
    'old_guard',
    'beta_tester',
    'high_roller',
    // timing / loyalty
    'the_centurion',
    'the_anniversary',
    'new_year',
    'night_owl',
    'weekend_warrior',
    'daily_legend',
    'the_ghost',
    // referrals / social
    'the_ambassador',
    'the_whale',
    'the_diplomat',
    'squad_goals',
    'comment_king',
    'meme_lord',
    // training performance
    'perfectionist',
    'multi_level_master',
    'comeback_kid',
    'dead_reckoning',
    // discovery
    'bankroll_builder',
    'the_librarian',
    'road_tripper',
    'the_collector',
    'the_optimizer',
];

/** How many hidden achievements a player can actually unlock today. */
export const EARNABLE_EGG_COUNT = VERIFIED_EGG_KEYS.length;

export default { VERIFIED_EGG_KEYS, EARNABLE_EGG_COUNT };
