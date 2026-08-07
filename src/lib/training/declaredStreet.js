/**
 * DECLARED-STREET CONSISTENCY (roadmap #16)
 * ---------------------------------------------------------------------------
 * A game config may declare the street it teaches, via `pioStreet`. cash-001 --
 * "Preflop Mastery" -- declares 'preflop'. DeterministicGTOEngine honours that
 * declaration and routes to the preflop generator.
 *
 * `training_question_cache` does not. It is read FIRST by both question routes,
 * by deliberate design (Phase 92: cache rows carry the pedagogical rebalancing
 * and the enriched explanations that fresh generation loses), and the engine is
 * only consulted on a cache MISS. So a game whose cache was seeded before the
 * declaration existed keeps serving the old street forever, and the engine fix
 * is dead code in production.
 *
 * That is exactly what happened: b300c280 wired the preflop route and every
 * gate passed, but production still dealt flop. Measured 2026-08-07 against
 * smarter.poker -- /api/training/batch-preload returned {"flop":20} because the
 * cache holds 25 postflop rows per level for cash-001, 250 in total, and 25 is
 * more than the 20 a session asks for, so the engine branch never ran once.
 *
 * The rule this module enforces is narrow on purpose: when, and only when, a
 * game DECLARES a street, cached rows of a different street are not eligible.
 * A game with no declaration is untouched, so this cannot change behaviour for
 * the other games. When the filter empties the pool, the existing cache-miss
 * path takes over and generates from the engine -- which is the correct source
 * for a declaration the cache predates. It is self-healing rather than a purge:
 * reseed the cache with matching rows later and the cache-first path resumes on
 * its own, with no code change.
 */

/**
 * The street a game declares, or null if it declares none.
 * Accepts either shape of config object the routes have on hand.
 */
export function declaredStreetOf(gameConfig) {
    const s = gameConfig && gameConfig.pioStreet;
    if (typeof s !== 'string') return null;
    const v = s.trim().toLowerCase();
    return ['preflop', 'flop', 'turn', 'river'].includes(v) ? v : null;
}

/**
 * The street a cached row actually carries. Rows have been written by several
 * generations of seeding migration, so the field sits in more than one place --
 * check all of them before concluding a row has no street.
 */
export function streetOfCachedRow(row) {
    const q = (row && (row.question_data || row)) || {};
    const s = (q.scenario && q.scenario.street) || q.street || null;
    return typeof s === 'string' ? s.trim().toLowerCase() : null;
}

/**
 * Drop cached rows whose street contradicts the game's declaration.
 *
 * A row with NO street at all is kept. Absence is not contradiction, and the
 * older seeding migrations did not always write the field; dropping those would
 * silently empty the cache for games that are serving correctly today.
 *
 * Returns the input array unchanged (same reference) when the game declares
 * nothing, so the common path allocates nothing.
 */
export function filterRowsToDeclaredStreet(rows, gameConfig) {
    const want = declaredStreetOf(gameConfig);
    if (!want || !Array.isArray(rows)) return rows;
    return rows.filter((r) => {
        const got = streetOfCachedRow(r);
        return got === null || got === want;
    });
}
