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
import '../tests/no-stray-club-arena-build.test.mjs';
import '../tests/one-build-command.test.mjs';
import '../tests/spin-reserve-fund-contract.test.mjs';

// ─────────────────────────────────────────────────────────────────────────
// The 48 guards CI had never run.
//
// Found 2026-09-04 (#1312): build-safety-gate CHECK 8 runs an explicit
// allowlist, and 52 of 177 files in this directory were named by no workflow,
// no npm script and no import. They passed by hand and were invisible to every
// pull request - the same shape as the healthcheck that pinged an
// unauthenticated endpoint and let 58 cron jobs 401 for a full day.
//
// FOUR WERE FAILING when finally run, and each was a real defect:
//   api-routes-exist             the resolver could not read `${expr}` inside a
//                                path segment, so two live handlers read as
//                                missing handlers.
//   training-surface-inventory   fed a .json file to @babel/parser and died.
//                                Broken since #1125 on 2026-08-31.
//   news-intelligence-phase-7    three assertions pinned pre-Title-Case copy.
//   club-arena-generation-budget its script was correctly deleted with #1274
//                                when Club Arena moved to its own origin. The
//                                guard was left behind. Deleted.
//
// Imported here rather than added to CHECK 8 because that list needs a token
// with the `workflow` permission, which the automation PAT does not have.
// node:test registers every case declared during module evaluation.
//
// THREE ARE DELIBERATELY NOT IMPORTED, and the meta-guard below allowlists
// them by name with the reason. Two run their own harness and call
// process.exit() on import, which would truncate this whole run; one asserts
// that no Phase 2 training item is deferred, which is a roadmap state.
import './api-routes-exist.test.mjs';
import './bankroll-mobile-upgrades.test.mjs';
import './club-stats-maintenance-runtime-budget.test.mjs';
import './deployment-version-stamp.test.mjs';
import './events-calendar-ssr-fallback.test.mjs';
import './fallback-menu-safety.test.mjs';
import './global-header-approved.test.mjs';
import './horse-hand-reviews-panel.test.mjs';
import './horses-console-phase1.test.mjs';
import './horses-libs-review.test.mjs';
// Phase A, 2026-09-04: the horses run a deterministic engine, so no /horses
// source may offer them a language model. This one has to be reachable more
// than most: the control it removes has been named as "the thing to remove
// next" in three separate documents, which is the shape of a rule that keeps
// getting re-broken.
import './horses-no-language-model-for-the-fleet.test.mjs';
import './horses-operator-foundation.test.mjs';
import './horses-phase2-client.test.mjs';
import './horses-phase2-migration.test.mjs';
import './horses-phase2-server.test.mjs';
import './horses-phase3-client.test.mjs';
import './horses-phase3-migration.test.mjs';
import './horses-phase3-reverify.test.mjs';
// Phase 4, 2026-09-04. The law file is the one that must never become
// unreachable: it pins that no read excludes a horse, and that nothing tells
// an operator a restriction bites while enforcement is off.
import './horses-phase4-client.test.mjs';
import './horses-phase4-migration.test.mjs';
import './horses-phase4-players-are-players.law.test.mjs';
import './horses-phase4-server.test.mjs';
import './horses-an-rpc-write-has-a-where.test.mjs';
import './horses-reverify-client.test.mjs';
import './horses-reverify-panels.test.mjs';
import './horses-reverify-routes.test.mjs';
import './horses-routes-group-a.test.mjs';
import './horses-routes-group-b.test.mjs';
import './horses-subpages-phase1.test.mjs';
import './login-painted-auth-state.test.mjs';
import './messenger-prefs-sync.test.mjs';
import './mobile-foundation.test.mjs';
import './news-intelligence-phase-7.test.mjs';
import './no-slide-to-see.law.test.mjs';
import './overlays-leave-room-to-close.law.test.mjs';
import './pa-closeout-hardening.test.mjs';
import './preflop-accessibility-phase7.test.mjs';
import './poker-near-me-sitemap-parity.test.mjs';
import './poker-tours-hydration.test.mjs';
import './pre-push-typescript-baseline-safety.test.mjs';
import './safe-profile-columns-are-granted.test.mjs';
import './store-commerce-hardening.test.mjs';
import './training-arena-phase-5.test.mjs';
import './training-card-visual-contract.test.mjs';
import './training-hub-media-audit.test.mjs';
import './training-immersive-gameplay.test.mjs';
import './training-phase-3-closeout.test.mjs';
import './training-phase6-release-harness.test.mjs';
import './training-production-smoke-auth.test.mjs';
import './training-production-smoke-contract.test.mjs';
import './training-route-runtime-inventory.test.mjs';
import './world-command-destinations.test.mjs';
import './world-command-menu-law.test.mjs';
import './world-command-navigation-state.test.mjs';
import './world-copy-policy.test.mjs';

// Open Claw cron auth guards, executed HERE for the same reason as the block
// above: CHECK 8's list in build-safety-gate.yml is workflow-permission
// territory. This suite pins the fix for the 2026-08-31 outage in which 58
// scheduled jobs answered 401 for a full day behind a green healthcheck. It
// had been sitting on disk unrun by CI since it was written - a guard nobody
// executes is the same kind of decoration as a healthcheck that pings an
// unauthenticated endpoint, which is the very failure it exists to prevent.
import './openclaw-workers-secret.test.mjs';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');

const REQUIRED_TEST_FILES = [
    '__tests__/auth-routes-exist.test.mjs',
    // Pins the two-hop cron auth boundary (Vercel 200 / workers 404). Deleting
    // it would silently un-protect the 2026-08-31 workers outage fix.
    '__tests__/openclaw-workers-secret.test.mjs',
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
    // A stray Club Arena build at the repo root. 966 files and 108 MB landed
    // there in one commit on 2026-08-21, none of it reachable, 345 of them
    // chunks from a build that no longer existed - so a grep for a symbol
    // found it twice with nothing to say which copy production served.
    'tests/no-stray-club-arena-build.test.mjs',
    // One build command. The E2E workflow built the app its own way, without
    // the patch step or the heap headroom package.json sets, and OOM'd on 14 of
    // 14 runs across every branch - so "E2E Tests: failure" became the normal
    // state of every PR and the job stopped meaning anything.
    'tests/one-build-command.test.mjs',
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

// ─────────────────────────────────────────────────────────────────────────
// META-GUARD: no guard file may be unreachable by CI.
//
// This is the actual fix for #1312. Everything above it is paying down the
// backlog so this can go green. A test nobody runs is worse than no test: it
// reads as coverage on the directory listing and asserts nothing on any pull
// request. Four of the 52 orphans found on 2026-09-04 were failing, and had
// been for days.
//
// A guard counts as reachable when it is named in a workflow, named in
// package.json, or imported by this file. Anything else must be allowlisted
// here WITH A REASON, so the exclusion is a decision somebody wrote down
// rather than an oversight nobody can see.
// ─────────────────────────────────────────────────────────────────────────
const CI_UNREACHABLE_ON_PURPOSE = {
    // Run their own harness and call process.exit() on import, which would
    // truncate this entire run and silently hide every case declared after
    // them. They pass standalone; they are simply not importable suites.
    'messenger-utils.test.mjs': 'self-executing harness, process.exit() on import',
    'server-auth-asymmetric.test.mjs': 'self-executing harness, process.exit() on import',
    // Asserts counts.functionPhaseReview === 0, i.e. that no Phase 2 training
    // item is deferred. Six are, each dispositioned with a followUpPhase. That
    // is a roadmap state, not a defect, and wiring it in would block every pull
    // request on unfinished product work. Its CRASH is fixed (it fed a .json
    // file to @babel/parser); re-enable when Phase 2 closes.
    'training-surface-inventory.test.mjs': 'asserts zero deferred Phase 2 items - roadmap state, see #1312',
};

test('every guard in __tests__ is reachable by CI', () => {
    const here = fs.readFileSync(path.join(REPO, '__tests__', '_test-guards-exist.test.mjs'), 'utf8');
    const workflows = fs.readdirSync(path.join(REPO, '.github', 'workflows'))
        .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
        .map((f) => fs.readFileSync(path.join(REPO, '.github', 'workflows', f), 'utf8'))
        .join('\n');
    const pkg = fs.readFileSync(path.join(REPO, 'package.json'), 'utf8');

    const orphans = fs.readdirSync(path.join(REPO, '__tests__'))
        .filter((f) => f.endsWith('.test.mjs'))
        .filter((f) => f !== '_test-guards-exist.test.mjs')
        .filter((f) => !(f in CI_UNREACHABLE_ON_PURPOSE))
        .filter((f) => !workflows.includes(f) && !pkg.includes(f) && !here.includes(`'./${f}'`));

    assert.deepEqual(
        orphans,
        [],
        `${orphans.length} guard file(s) are executed by NOTHING - no workflow, no npm script, ` +
        `no import. A test CI never runs asserts nothing. Either import it above, add it to a ` +
        `workflow, or record it in CI_UNREACHABLE_ON_PURPOSE with a reason:\n  ` +
        orphans.join('\n  '),
    );
});
