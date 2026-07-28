/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * POSTFLOP POSITION ORDER — single source of truth for "who acts first"
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Position is RELATIVE. A seat is never "in position" on its own — it is only
 * in position with respect to a specific opponent. Postflop the blinds act
 * FIRST and the button acts LAST, which is not the preflop order: heads-up in
 * the blinds the SB acts first and the BB acts last, so the BB is the IN
 * POSITION player in a blind-vs-blind pot.
 *
 * Lower index = acts EARLIER postflop.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

export const POSTFLOP_ACTION_ORDER = ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'LJ', 'HJ', 'CO', 'BTN'];

/**
 * Index of a seat in the postflop action order. -1 when the seat is unknown.
 * @param {string} position
 * @returns {number}
 */
export function postflopActionIndex(position) {
    if (!position || typeof position !== 'string') return -1;
    return POSTFLOP_ACTION_ORDER.indexOf(position.trim().toUpperCase());
}

/**
 * Does hero act before villain postflop?
 * @param {string} heroPosition
 * @param {string} villainPosition
 * @returns {boolean} false when either seat is unknown or the seats are equal
 */
export function heroActsFirstPostflop(heroPosition, villainPosition) {
    const h = postflopActionIndex(heroPosition);
    const v = postflopActionIndex(villainPosition);
    if (h < 0 || v < 0 || h === v) return false;
    return h < v;
}

/**
 * Is hero in position (acts last) against this specific villain?
 * @param {string} heroPosition
 * @param {string} villainPosition
 * @returns {boolean} false when either seat is unknown or the seats are equal
 */
export function heroIsInPosition(heroPosition, villainPosition) {
    const h = postflopActionIndex(heroPosition);
    const v = postflopActionIndex(villainPosition);
    if (h < 0 || v < 0 || h === v) return false;
    return !heroActsFirstPostflop(heroPosition, villainPosition);
}

/**
 * 'IP' / 'OOP' label for solver tables keyed by position context.
 * @param {string} heroPosition
 * @param {string} villainPosition
 * @returns {'IP'|'OOP'}
 */
export function positionContext(heroPosition, villainPosition) {
    return heroIsInPosition(heroPosition, villainPosition) ? 'IP' : 'OOP';
}

export default {
    POSTFLOP_ACTION_ORDER,
    postflopActionIndex,
    heroActsFirstPostflop,
    heroIsInPosition,
    positionContext,
};
