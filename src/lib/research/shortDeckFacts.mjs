/**
 * Short deck (6+ Hold'em) figures, computed exactly, never estimated.
 *
 * Produced by scripts/research/short-deck-math.mjs (full enumeration, no
 * sampling) on 2026-11-28. __tests__/the-research-figures-are-real.law.test.mjs
 * recomputes them, so a figure here that the arithmetic does not return fails
 * the build. The report this replaced printed "Flush 1.96% Vs Full House
 * 3.26%" and "AA 54.4% Vs JTs"; the enumeration returns neither.
 */

/** Two-card starting hands: C(36,2) and C(52,2). */
export const SHORT_DECK_STARTING_COMBOS = 630;
export const FULL_DECK_STARTING_COMBOS = 1326;
/** Distinct starting hands: 9 pairs + 36 suited + 36 offsuit, and 169 in 52 cards. */
export const SHORT_DECK_DISTINCT_HANDS = 81;
export const FULL_DECK_DISTINCT_HANDS = 169;
/** Five-card boards from a full 36-card deck: C(36,5). */
export const SHORT_DECK_BOARDS = 376992;

/** Seven-card sets in a 36-card deck, C(36,7), and how many make each hand. */
export const SHORT_DECK_SEVEN_CARD_SETS = 8347680;
export const SHORT_DECK_SEVEN_CARD_FLUSHES = 175560; // flush, not straight flush
export const SHORT_DECK_SEVEN_CARD_FULL_HOUSES = 633024; // full house, not quads

export const pct = (x, digits = 1) => `${(100 * x).toFixed(digits)}%`;

export const SHORT_DECK_FLUSH_PCT = pct(SHORT_DECK_SEVEN_CARD_FLUSHES / SHORT_DECK_SEVEN_CARD_SETS, 2); // 2.10%
export const SHORT_DECK_FULL_HOUSE_PCT = pct(SHORT_DECK_SEVEN_CARD_FULL_HOUSES / SHORT_DECK_SEVEN_CARD_SETS, 2); // 7.58%

/**
 * 52-card seven-card frequencies, from the standard published enumeration
 * (Wikipedia, Poker Probability, 7-card table): flush 3.03%, full house 2.60%.
 */
export const FULL_DECK_FLUSH_PCT = '3.03%';
export const FULL_DECK_FULL_HOUSE_PCT = '2.60%';
export const POKER_PROBABILITY_SOURCE_URL = 'https://en.wikipedia.org/wiki/Poker_probability';

/** Dealt pocket aces: 6 / C(n,2). */
export const SHORT_DECK_AA_PCT = pct(6 / SHORT_DECK_STARTING_COMBOS, 2); // 0.95%
export const FULL_DECK_AA_PCT = pct(6 / FULL_DECK_STARTING_COMBOS, 2); // 0.45%

/**
 * AA (spades, hearts) all in preflop against JT of diamonds, every board.
 * Short deck has two published rule sets for straight vs three of a kind, so
 * both are stated.
 */
export const FULL_DECK_AA_VS_JTS = 0.7828326628916361;
export const SHORT_DECK_AA_VS_JTS_STRAIGHT_BEATS_TRIPS = 0.6254618226600985;
export const SHORT_DECK_AA_VS_JTS_TRIPS_BEAT_STRAIGHT = 0.6679644048943271;

/** Flop to river, two cards to come: 8 outs (open-ended) and 9-out / 5-out flush draws. */
export const FULL_DECK_OESD_FLOP_TO_RIVER = 1 - 741 / 1081; // C(39,2)/C(47,2)
export const SHORT_DECK_OESD_FLOP_TO_RIVER = 1 - 253 / 465; // C(23,2)/C(31,2)
export const FULL_DECK_FLUSH_DRAW_FLOP_TO_RIVER = 1 - 703 / 1081; // C(38,2)/C(47,2)
export const SHORT_DECK_FLUSH_DRAW_FLOP_TO_RIVER = 1 - 325 / 465; // C(26,2)/C(31,2)
