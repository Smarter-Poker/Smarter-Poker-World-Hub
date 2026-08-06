/**
 * __tests__/scroll-lock.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Guard for src/lib/scrollLock.js — GTOW parity roadmap #47, "/hub/training
 * will not scroll."
 *
 * WHY THIS TEST EXISTS
 * This bug has now been "fixed" twice and regressed once. The first fix
 * (GodModeArena restoring the overflow value it captured at mount) stranded
 * the app whenever an arena mounted while already locked. The second fix
 * (2026-07-26, a bare `window.__spScrollLocks` integer) removed that failure
 * but created a worse one: an integer that gets stuck positive makes every
 * safety valve in the app stand down forever, because each valve defers to
 * "a live locker owns it". The page is then permanently unscrollable — the
 * exact symptom #47 describes, now unreachable by the code meant to fix it.
 *
 * So the property under test is not "locking works". It is "a LEAKED lock is
 * recovered, and a LIVE lock is never stomped" — the two halves that every
 * previous attempt got right one at a time and wrong together. Scenario 4
 * below reproduces the stuck-counter failure directly; scenario 5 proves the
 * recovery mechanism cannot eat a lock the incoming page legitimately took.
 *
 * WHY THE REAL MODULE IS IMPORTED RATHER THAN RE-IMPLEMENTED
 * Unlike src/lib/rewards/__tests__/transferMath.test.mjs — which re-implements
 * its subject because that subject is entangled with Supabase — scrollLock.js
 * has zero imports and touches exactly two globals. Stubbing `window` and
 * `document.body.style` is enough to exercise the shipped code itself, so a
 * re-implementation would only test a copy and could drift silently.
 *
 * The stubs must be installed BEFORE the dynamic import: the module reads
 * `typeof window` on first call, and Node's static `import` would hoist above
 * the assignments.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = path.join(HERE, '..', 'src', 'lib', 'scrollLock.js');

// Minimal CSSStyleDeclaration stand-in. `removeProperty` genuinely deletes so
// that the difference between "set to empty string" and "property removed" —
// which is what the module actually does on last release — is observable.
function makeStyle() {
    return {
        _v: {},
        get overflow() { return this._v.overflow || ''; },
        set overflow(v) { this._v.overflow = v; },
        removeProperty(p) { delete this._v[p]; },
    };
}

const style = makeStyle();
globalThis.window = {};
globalThis.document = { body: { style } };

const {
    acquireScrollLock,
    advanceScrollLockGeneration,
    sweepStaleScrollLocks,
    clearBodyScrollLockIfUnheld,
    scrollLockCount,
} = await import(MODULE_PATH);

test('a single lock locks the body and its release clears it', () => {
    const release = acquireScrollLock('A');
    assert.equal(scrollLockCount(), 1);
    assert.equal(style.overflow, 'hidden');
    assert.equal(globalThis.window.__spScrollLocks, 1, 'legacy mirror stays truthful');

    release();
    assert.equal(scrollLockCount(), 0);
    assert.equal(style.overflow, '');
    assert.equal(globalThis.window.__spScrollLocks, 0);
});

test('overlapping locks: only the last release unlocks the page', () => {
    const a = acquireScrollLock('A');
    const b = acquireScrollLock('B');
    assert.equal(scrollLockCount(), 2, 'two lockers hold two distinct locks');

    a();
    assert.equal(scrollLockCount(), 1);
    assert.equal(style.overflow, 'hidden', 'B still holds it');

    b();
    assert.equal(scrollLockCount(), 0);
    assert.equal(style.overflow, '');
});

test('releasing the same lock twice is a no-op, not a double decrement', () => {
    const held = acquireScrollLock('HELD');
    const doubled = acquireScrollLock('DOUBLED');

    doubled();
    doubled();

    assert.equal(scrollLockCount(), 1, 'the second release must not free HELD');
    assert.equal(style.overflow, 'hidden');
    held();
    assert.equal(style.overflow, '');
});

test('REGRESSION #47: a leaked lock is reclaimed on the next navigation', () => {
    // Cleanup never runs — the release function is simply dropped. This is the
    // shape of every real leak: an unmount during an error, a torn-down
    // subtree, a component killed by a route change mid-render.
    acquireScrollLock('LEAKED');
    assert.equal(scrollLockCount(), 1);
    assert.equal(style.overflow, 'hidden');

    // This is the stuck state. Every safety valve in the app defers to the
    // count, so while it reads 1 the page cannot be freed by anyone.
    assert.equal(
        clearBodyScrollLockIfUnheld(), false,
        'valve must stand down while the count says somebody holds a lock',
    );

    advanceScrollLockGeneration();                  // routeChangeStart
    assert.equal(sweepStaleScrollLocks(), 1);       // routeChangeComplete
    assert.equal(scrollLockCount(), 0, 'the count healed itself');

    assert.equal(clearBodyScrollLockIfUnheld(), true, 'valve can now free the page');
    assert.equal(style.overflow, '', 'page scrolls again');
});

test('a lock taken by the INCOMING page survives the sweep', () => {
    // The ordering guarantee: the generation advances at routeChangeStart,
    // BEFORE the new page mounts, so the new page's lock carries the current
    // generation and the sweep at routeChangeComplete provably cannot match it.
    advanceScrollLockGeneration();                  // routeChangeStart
    const incoming = acquireScrollLock('NewPageArena');

    assert.equal(sweepStaleScrollLocks(), 0, 'sweep must not touch a current-generation lock');
    assert.equal(scrollLockCount(), 1);
    assert.equal(style.overflow, 'hidden');
    assert.equal(
        clearBodyScrollLockIfUnheld(), false,
        'valve must never stomp a lock a live arena is deliberately holding',
    );

    incoming();
    assert.equal(style.overflow, '');
});

test('a clean unmount during navigation leaves nothing for the sweep', () => {
    const outgoing = acquireScrollLock('OldPage');
    advanceScrollLockGeneration();
    const fresh = acquireScrollLock('NewPage');

    outgoing();                                     // cleanup ran normally
    assert.equal(sweepStaleScrollLocks(), 0, 'a released lock is already gone');
    assert.equal(scrollLockCount(), 1, 'only the new page holds one');

    fresh();
    assert.equal(scrollLockCount(), 0);
    assert.equal(style.overflow, '');
});

test('shallow navigation does not advance the generation on its own', () => {
    // Long-lived mounted lockers must not be swept just because some other
    // state changed; only an explicit generation advance can retire a lock.
    const longLived = acquireScrollLock('LongLivedArena');
    assert.equal(sweepStaleScrollLocks(), 0);
    assert.equal(sweepStaleScrollLocks(), 0, 'repeat sweeps stay idempotent');
    assert.equal(scrollLockCount(), 1);

    longLived();
    assert.equal(scrollLockCount(), 0);
});
