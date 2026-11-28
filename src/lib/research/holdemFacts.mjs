/**
 * 52-card preflop all-in equities, enumerated over all 1,712,304 boards by
 * exactEquity() in scripts/research/short-deck-math.mjs on 2026-11-28.
 * Aces and jacks are spades and hearts; the kings, and the ace-king suited,
 * are in the other two suits. The whitepaper used to print "85.20% (AA Vs
 * KK)", which is the equity of aces against a random hand, not against kings.
 */
export const AA_VS_KK = 0.8125548967940273;
export const JJ_VS_AKS = 0.5387139199581382;
