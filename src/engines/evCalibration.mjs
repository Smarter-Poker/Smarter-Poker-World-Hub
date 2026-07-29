/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * EV CALIBRATION — the two heuristic "biases" the trainer's grades hinge on
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Isolated here (with ZERO imports) so the numbers can be tuned in one place
 * without touching EVCalculator's pricing logic, and so the calibration test
 * (__tests__/ev-calibration.test.mjs) can import and pin them under `node --test`
 * without dragging in the rest of the engine graph.
 *
 * These replace two mis-calibrated heuristics in the old EVCalculator:
 *   1. A flat `check EV = equity * pot * 0.6` — position-blind, and it wrongly
 *      discounted river check-downs (a river check is showdown, realization ~1.0).
 *   2. `foldEquity = baseFold[street] * min(1.5, bet/pot) + strengthAdj` — the
 *      multiplicative form collapsed small-bet fold equity far too far (a 1/3-pot
 *      flop bet priced at ~0.15 vs an MDF-implied ~0.25), and made turn barrels
 *      look weaker than flop bets.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// Equity-realization factor applied to a CHECK's share of the current pot.
// A check does not build the pot and, out of position and pre-river, concedes
// realization (free cards, getting bet off equity). On the RIVER a check goes
// straight to showdown, so realization is ~1.0 and must never be discounted.
export const CHECK_REALIZATION = {
    river: 1.00,
    turn:  { IP: 0.90, OOP: 0.78 },
    flop:  { IP: 0.85, OOP: 0.72 },
};

// Fold-equity model, anchored on Minimum Defence Frequency: a defender folds
// about bet/(pot+bet) of the time, so that pot-odds ratio is the backbone.
export const FE_ELASTICITY = 1.0;                                      // villain (in)elasticity vs MDF
export const STREET_FE_ADJ = { flop: 0.00, turn: 0.03, river: -0.02 }; // range narrowing by street
export const FE_STRENGTH_ADJ = 0.05;                                   // +/- blocker/removal proxy
export const FE_MIN = 0.10;
export const FE_MAX = 0.85;

/**
 * Equity-realization factor for a check, by street and position.
 * River is position-independent (showdown). Falls back to flop for unknown streets.
 */
export function checkRealization(street, position) {
    const r = CHECK_REALIZATION[street] ?? CHECK_REALIZATION.flop;
    if (typeof r === 'number') return r;              // river: showdown
    return position === 'IP' ? r.IP : r.OOP;
}

/**
 * Estimate fold equity from bet size, street, and hero's made-hand strength.
 *
 * @param {number} madeHandStrength - hero's made-hand strength in [0,1]
 * @param {string} street - 'flop' | 'turn' | 'river'
 * @param {number} betAmount - bet size (BB)
 * @param {number} potSize - pot before the bet (BB)
 * @returns {number} fold equity in [FE_MIN, FE_MAX]
 *
 * The strength term is a small blocker/removal proxy only — villain does not see
 * hero's cards, so it stays small by design.
 */
export function estimateFoldEquity(madeHandStrength, street, betAmount, potSize) {
    const potOdds = potSize > 0 ? betAmount / (potSize + betAmount) : 0;
    const streetAdj = STREET_FE_ADJ[street] ?? 0;
    const strengthAdj = (madeHandStrength ?? 0) > 0.5 ? FE_STRENGTH_ADJ : -FE_STRENGTH_ADJ;
    const fe = potOdds * FE_ELASTICITY + streetAdj + strengthAdj;
    return Math.max(FE_MIN, Math.min(FE_MAX, fe));
}
