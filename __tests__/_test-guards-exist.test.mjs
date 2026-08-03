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
