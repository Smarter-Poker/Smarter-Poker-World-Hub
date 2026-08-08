/**
 * TABLE AVATARS — shared seat-portrait selection for every felt in the app.
 * ═══════════════════════════════════════════════════════════════════════════
 * Extracted out of src/components/training/games/UniversalDynamicTable.jsx so
 * TrainingGameTable.jsx and LivePokerTable.jsx stop carrying their own
 * hardcoded nine/ten-element avatar arrays. All three now draw seat portraits
 * from the same catalogue with the same guarantees:
 *
 *   - the pool is built from src/data/AVATAR_LIBRARY.js, deduped BY IMAGE PATH
 *     (not by entry id -- two entries share musician.png)
 *   - selection is DETERMINISTIC: FNV-1a hashes a caller-supplied stable key
 *     into a mulberry32 seed, so one key always deals one cast and a re-render
 *     never reshuffles faces already on screen
 *   - selection is DISTINCT: a partial Fisher-Yates over a copy of the pool,
 *     so no two seats in one deal share a face
 *   - a "hero" or "self" source, when supplied, is filtered out of the pool
 *     before dealing so it can never be handed to anyone else
 *
 * scripts/avatar-library-check.js lifts this file's real source (not a
 * paraphrase of it) and asserts every path it can yield resolves under
 * public/ -- a missing asset degrades to a monogram disc silently, which is
 * how vip_pirate.png hid for weeks.
 */

import { AVATAR_LIBRARY } from '../data/AVATAR_LIBRARY';

// ═══════════════════════════════════════════════════════════════════════════
// SEAT PORTRAITS — the whole avatar library, not a hardcoded nine
// ═══════════════════════════════════════════════════════════════════════════
// Deduped BY IMAGE PATH rather than by entry id: two library entries
// ('Pop Star' and 'Street Musician') point at the same musician.png, and an
// id-keyed pool would happily seat that one face twice while insisting the two
// seats held different avatars.
export const VILLAIN_AVATAR_POOL = (() => {
    const seen = new Set();
    const pool = [];
    for (const entry of (AVATAR_LIBRARY || [])) {
        const src = entry && entry.image;
        if (!src || seen.has(src)) continue;
        seen.add(src);
        pool.push(src);
    }
    return pool;
})();

// Hero's face when the account has not chosen one: the fox the design template
// puts in the bottom seat.
export const HERO_DEFAULT_AVATAR = '/avatars/table/free_fox.png';

// FNV-1a. Any stable string in, the same 32-bit seed out. There is deliberately
// no Math.random anywhere near a felt: a re-render that reshuffles the
// portraits reads as the table swapping its entire cast mid-hand, and these
// components re-render on every hover, timer tick and feedback flip.
export function hashHandKey(key) {
    const s = String(key == null ? '' : key);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

// mulberry32 — small, fast, and completely determined by its seed.
export function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Deal one hand's portraits, in HERO-RELATIVE order: entry 0 is hero's seat,
// entry 1 the seat to his left, and so on clockwise -- the same ordering
// SEAT_CONFIGS, DEALER_BUTTON_SEAT_KEYS and CHIP_STACK_POSITIONS use in
// UniversalDynamicTable. Callers holding ABSOLUTE seat indices must rotate
// before indexing this.
//
// Distinctness is structural, not statistical: this is a partial Fisher-Yates
// over a copy of the pool, so an index leaves play the moment it is drawn.
// Reaching for the pool with a modulus and relying on it being at least as
// long as the table is exactly how two seats used to end up sharing a face.
// Hero's own portrait is filtered out of the pool first, so no villain can
// wear hero's face either.
export function dealSeatAvatars(handKey, count, heroSrc) {
    const pool = VILLAIN_AVATAR_POOL.filter((src) => src !== heroSrc);
    const villains = Math.max(0, Math.min(count - 1, pool.length));
    const idx = pool.map((_, i) => i);
    const rnd = seededRandom(hashHandKey(handKey));
    const out = [heroSrc || HERO_DEFAULT_AVATAR];
    for (let i = 0; i < villains; i++) {
        const j = i + Math.floor(rnd() * (idx.length - i));
        const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
        out.push(pool[idx[i]]);
    }
    return out;
}
