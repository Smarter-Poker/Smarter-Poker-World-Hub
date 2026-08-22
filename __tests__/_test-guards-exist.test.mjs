/**
 * META-GUARD: __tests__/_test-guards-exist.test.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Asserts that all OTHER signup-related test files still exist on disk.
 * Closes the "delete the guard" meta failure mode caught by the chaos
 * drill: if signup-hardening.test.mjs is deleted, no other assertion can
 * fail because there's no assertion left to fire. THIS file fires that
 * assertion from a different file.
 *
 * Filename is `_test-guards-exist.test.mjs` (leading underscore) so it
 * sorts FIRST alphabetically — node --test runs files in lexical order.
 * If you delete this one, build-safety-gate.yml CHECK 8 catches it
 * (the workflow greps for `node --test __tests__` and fails if no test
 * files match).
 *
 * The full chain of self-protection:
 *   - Delete this file → build-safety-gate workflow misses an expected
 *     test invocation → CI fails
 *   - Delete signup-hardening.test.mjs → THIS file fails
 *   - Delete auth-routes-exist.test.mjs → THIS file fails AND
 *     next.config.js IIFE fails the build
 *   - Delete a critical auth file → next.config.js IIFE +
 *     auth-routes-exist + signup-hardening all fail
 *
 * No single deletion can hide a regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────
// Club shop rules suite, executed HERE on purpose.
//
// CI invokes an explicit list of test files inside
// .github/workflows/build-safety-gate.yml (CHECK 8). Adding a file to that
// list requires a token with the GitHub `workflow` permission, which the
// automation PAT does not have. Importing the suite from a file CI ALREADY
// runs makes its 20 cases execute in CI regardless — node:test registers
// every test declared during module evaluation, including imported ones.
//
// If CHECK 16 is ever added to the workflow, this import becomes redundant
// (the cases would simply run twice) and can be dropped.
// See .agent/handoffs/2026-08-19-ci-check16-shop-rules.md
import '../tests/shop-item-rules.test.mjs';
import '../tests/unchecked-money-rpc.test.mjs';
import '../tests/club-ledger-rpc-envelope.test.mjs';
import '../tests/spin-500x-retired.test.mjs';
import '../tests/spin-reserve-fund-contract.test.mjs';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');

const REQUIRED_TEST_FILES = [
    '__tests__/auth-routes-exist.test.mjs',
    '__tests__/signup-hardening.test.mjs',
    '__tests__/build-2-deliverables.test.mjs',
    '__tests__/sentry-coverage.test.mjs',
    '__tests__/phase-3-deliverables.test.mjs',
    '__tests__/phase-4-deliverables.test.mjs',
    // Personal Assistant guards. menu-routes catches dead hamburger links;
    // pa-no-undef catches the undefined-identifier class that white-screened
    // the Leak Finder in production. Both run in `prebuild`.
    '__tests__/menu-routes-exist.test.mjs',
    '__tests__/pa-no-undef.test.mjs',
    // Proves the Blob-URL equity worker still computes the same numbers as
    // EquityEngine.js — the worker holds a generated COPY of the Monte Carlo
    // core, so drift is silent and user-visible.
    '__tests__/equity-worker-parity.test.mjs',
    // Body-scroll locking (roadmap #47). This bug has been fixed twice and
    // regressed once, each attempt trading one failure mode for another:
    // recover leaked locks and you stomp live ones, refuse to stomp live ones
    // and a leaked lock strands the app forever. The guard pins BOTH halves.
    '__tests__/scroll-lock.test.mjs',
    // Club shop item rules. shopItemRules.js is the single validator shared by
    // BOTH admin write paths; before it existed the two disagreed and items
    // created from the World Hub granted nothing on redeem, accepted any image
    // URL, and could be hard-deleted along with their purchase history.
    'tests/shop-item-rules.test.mjs',
    // Ratchet: money RPCs that RETURN {success:false} instead of raising, whose
    // return value is never read. This exact shape shipped a free-item exploit
    // in marketplace-purchase — a REJECTED debit looked identical to a
    // successful one because only the (null) transport error was checked.
    'tests/unchecked-money-rpc.test.mjs',
    'scripts/check-unchecked-money-rpc.mjs',
    // ClubLedger envelope contract. debit() had an insufficient-balance branch
    // that could never fire, because fn_debit_chips RETURNS {success:false}
    // rather than raising — so an over-draw reached the audit writer as a
    // completed debit. Five of these seven cases fail against the old code.
    'tests/club-ledger-rpc-envelope.test.mjs',
    // The retired 500x Spin tier. Dropping a column that a deployed client
    // still selects answers 42703 for the WHOLE request - that is how every
    // Spin lobby badge went dark at once on 2026-08-21. This guard keeps a
    // select off the three columns being removed from v_spin_reserve_health,
    // so the reader can never come back after the columns are gone.
    'tests/spin-500x-retired.test.mjs',
    // The union Spin reserve fund control. Two functions in the database differ
    // by a suffix: one claims an op id and refuses to mint, the other does
    // neither and returns the identical shape. This pins the endpoint to the
    // safe one, and pins it to reading { ok } rather than the { success } every
    // neighbouring money RPC returns.
    'tests/spin-reserve-fund-contract.test.mjs',
];

test('every signup-related guard test file exists on disk', () => {
    const missing = REQUIRED_TEST_FILES.filter(
        (rel) => !fs.existsSync(path.join(REPO, rel)),
    );
    assert.deepEqual(
        missing,
        [],
        `Guard test file(s) deleted — without these, regressions to the\nsignup flow can land without any CI signal. If you genuinely need to\nremove one, REPLACE it with a new guard that protects the same\nfailure class. Missing:\n${missing.map((m) => '  - ' + m).join('\n')}`,
    );
});

test('every signup-related guard test file is non-trivial (>500 bytes)', () => {
    for (const rel of REQUIRED_TEST_FILES) {
        const full = path.join(REPO, rel);
        if (!fs.existsSync(full)) continue; // covered above
        const size = fs.statSync(full).size;
        assert.ok(
            size > 500,
            `${rel} is suspiciously small (${size} bytes). Was it stubbed out / truncated?`,
        );
    }
});
