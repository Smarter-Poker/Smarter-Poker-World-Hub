/**
 * src/lib/scrollLock.js — body scroll locking that cannot strand the app
 * ─────────────────────────────────────────────────────────────────────────────
 * GTOW parity roadmap #47: "/hub/training will not scroll."
 *
 * The symptom came from four mutually-unaware mechanisms all writing
 * `document.body.style.overflow`:
 *
 *   1. GodModeArena locked on mount and restored the value it had captured at
 *      mount time. Mounting while already locked therefore restored 'hidden'
 *      and stranded the entire app. (Replaced by a counter on 2026-07-26.)
 *   2. pages/hub/training.js cleared the lock defensively, but only when
 *      `showArena` changed.
 *   3. pages/_app.js cleared `overflow` unconditionally on every
 *      routeChangeComplete — stomping a lock a live arena legitimately held.
 *   4. pages/_app.js ALSO had a second, counter-aware failsafe that did the
 *      opposite, so the two disagreed inside one file.
 *
 * The 2026-07-26 counter fixed (1) but introduced a worse failure mode: a
 * counter that gets stuck positive — a cleanup that never ran, an unmount
 * during an error, a torn-down subtree — makes BOTH remaining safety valves
 * stand down forever, because both defer to "a live locker owns it". The page
 * is then permanently unscrollable with no recovery short of a reload, which
 * is the exact bug #47 describes, now unreachable by the code meant to fix it.
 *
 * A bare integer cannot be audited: you cannot ask it whether its holders are
 * still alive. So locks are held in a registry keyed by token, and every token
 * is stamped with the navigation generation it was acquired in. A real page
 * change (pathname actually differs — shallow routing does not count) advances
 * the generation, and every lock stamped with an older generation is by
 * definition held by a component of a page that no longer exists. Sweeping
 * those is always safe and always correct:
 *
 *   - a lock released cleanly is already gone from the registry; the sweep is
 *     a no-op for it
 *   - a lock leaked by the outgoing page is swept, so the counter self-heals
 *     on the very next navigation rather than never
 *   - a lock taken by the INCOMING page is stamped with the new generation, so
 *     the sweep provably cannot touch it — this is why the generation advances
 *     at routeChangeStart and the sweep runs at routeChangeComplete
 *
 * Recovery is therefore bounded (one navigation) instead of absent, and no
 * live lock is ever cleared.
 *
 * State lives on `window` rather than in module scope because Next.js can hand
 * different chunks their own copy of a module; two registries would each think
 * they were the only locker and the last one to release would clear a lock the
 * other still held.
 */

const REGISTRY_KEY = '__spScrollLockRegistry';
const GENERATION_KEY = '__spScrollGeneration';
// The pre-existing integer. Kept in sync as a read-only mirror of the registry
// size so anything still reading it — including code outside this repo's
// training surface — keeps seeing a truthful number.
const MIRROR_KEY = '__spScrollLocks';

function hasWindow() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function getRegistry() {
    if (!hasWindow()) return null;
    if (!(window[REGISTRY_KEY] instanceof Map)) {
        window[REGISTRY_KEY] = new Map();
    }
    return window[REGISTRY_KEY];
}

function currentGeneration() {
    if (!hasWindow()) return 0;
    if (typeof window[GENERATION_KEY] !== 'number') window[GENERATION_KEY] = 0;
    return window[GENERATION_KEY];
}

function syncMirror(registry) {
    if (!hasWindow()) return;
    window[MIRROR_KEY] = registry ? registry.size : 0;
}

/**
 * Number of locks currently held. Callers use this to decide whether clearing
 * body overflow would be stomping somebody's live lock.
 */
export function scrollLockCount() {
    const registry = getRegistry();
    return registry ? registry.size : 0;
}

/**
 * Take a body scroll lock. Returns the release function — call it from effect
 * cleanup. Releasing twice is safe and releasing a lock that was already swept
 * is safe, because release is keyed on a token and the registry is a Map.
 *
 * Overflow is CLEARED by the last release rather than restored to whatever it
 * was at acquire time. Restoring a captured value is what stranded the app in
 * the first place: the value captured could itself be a stale 'hidden'.
 */
export function acquireScrollLock(label = 'anonymous') {
    if (!hasWindow()) return () => {};

    const registry = getRegistry();
    const generation = currentGeneration();
    // Unique per acquisition. Deliberately not derived from `label`: two arenas
    // (multi-table, or an arena mounting while the previous one animates out)
    // must hold two distinct locks, not collide onto one.
    const token = Symbol(`scroll-lock:${label}`);

    registry.set(token, { label, generation });
    syncMirror(registry);
    document.body.style.overflow = 'hidden';

    let released = false;
    return function releaseScrollLock() {
        if (released) return;
        released = true;
        const reg = getRegistry();
        if (!reg) return;
        reg.delete(token);
        syncMirror(reg);
        if (reg.size === 0) {
            document.body.style.removeProperty('overflow');
        }
    };
}

/**
 * Called at routeChangeStart, BEFORE the incoming page mounts, so that any lock
 * the new page takes is stamped with the new generation and is therefore immune
 * to the sweep that follows.
 */
export function advanceScrollLockGeneration() {
    if (!hasWindow()) return;
    window[GENERATION_KEY] = currentGeneration() + 1;
}

/**
 * Called at routeChangeComplete. Drops every lock stamped with a generation
 * older than the current one — those belong to components of a page that has
 * been navigated away from, so they are leaks by definition.
 * @returns {number} how many stale locks were released
 */
export function sweepStaleScrollLocks() {
    const registry = getRegistry();
    if (!registry) return 0;

    const generation = currentGeneration();
    let swept = 0;
    registry.forEach((entry, token) => {
        if (!entry || entry.generation < generation) {
            registry.delete(token);
            swept += 1;
        }
    });

    if (swept > 0) {
        syncMirror(registry);
        console.debug(`[ScrollLock] Swept ${swept} stale lock(s) left by the previous page`);
    }
    return swept;
}

/**
 * Clear body overflow if — and only if — nobody holds a lock. This is the one
 * safe way to write `overflow` from outside a locker: it can free a stranded
 * page but can never unlock a page a live arena is deliberately holding.
 * @returns {boolean} whether a stale lock was cleared
 */
export function clearBodyScrollLockIfUnheld() {
    if (!hasWindow()) return false;
    if (scrollLockCount() > 0) return false;
    if (document.body.style.overflow !== 'hidden') return false;
    document.body.style.removeProperty('overflow');
    console.debug('[ScrollLock] Cleared a stranded body scroll lock');
    return true;
}
