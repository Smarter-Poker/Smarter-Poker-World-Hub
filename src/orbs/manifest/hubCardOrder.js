/* ═══════════════════════════════════════════════════════════════════════════
   POKER ARENA IS ALWAYS THE FIRST CARD IN THE WORLD HUB (Dan, 2026-10-11)

   Dan, verbatim: "Poker Arena needs to ALWAYS be first card DISPLAYED INSIDE
   THE WORLD HUB."

   The hub builds its card lists from several sources that each have their own
   idea of order: the registry, the Toke Tracker and Club Commander injections,
   the reader's hidden-card list (localStorage + profiles.hub_preferences), the
   "last visited / most visited" history that drives the quick-launch row, and
   the carousel position remembered between visits. Editing a default array
   was never enough, because every one of those runs after it.

   So the order is enforced at the END of each pipeline, by this one function,
   immediately before the list is rendered. It is plain JavaScript with no
   imports so node:test can exercise it directly
   (__tests__/poker-arena-is-always-first.law.test.mjs).
   ═══════════════════════════════════════════════════════════════════════════ */

/** The registry id of the Poker Arena card (the product at /hub/club-arena). */
export const POKER_ARENA_ORB_ID = 'club-arena';

/**
 * Return `cards` with Poker Arena at index 0.
 *
 * @template {{id: string}} T
 * @param {T[]} cards  the list as some earlier step ordered it
 * @param {object}   [options]
 * @param {T}        [options.arena]   the Poker Arena card to insert when the
 *                                     list does not contain it (hidden by an
 *                                     old preference, absent from the visit
 *                                     history, and so on)
 * @param {number}   [options.limit]   maximum length of the result; cards are
 *                                     trimmed from the end
 * @param {string[]} [options.keepIds] ids that trimming must never remove
 *                                     (Poker Arena itself is always kept)
 * @returns {T[]} a new array; the input is never mutated
 */
export function pinPokerArenaFirst(cards, options = {}) {
    const { arena = null, limit, keepIds = [] } = options || {};
    const list = Array.isArray(cards) ? cards.filter((card) => card && card.id) : [];

    const found = list.find((card) => card.id === POKER_ARENA_ORB_ID);
    const pokerArena = found || (arena && arena.id === POKER_ARENA_ORB_ID ? arena : null);
    const rest = list.filter((card) => card.id !== POKER_ARENA_ORB_ID);
    const ordered = pokerArena ? [pokerArena, ...rest] : rest;

    if (!Number.isFinite(limit) || limit < 1 || ordered.length <= limit) return ordered;

    // Too long: drop from the end, skipping protected cards. Index 0 is
    // Poker Arena and is never considered.
    const trimmed = [...ordered];
    for (let i = trimmed.length - 1; i > 0 && trimmed.length > limit; i -= 1) {
        if (keepIds.includes(trimmed[i].id)) continue;
        trimmed.splice(i, 1);
    }
    return trimmed;
}
