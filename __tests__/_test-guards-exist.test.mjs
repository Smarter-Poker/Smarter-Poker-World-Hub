import './auth-network-deadline.test.mjs';
import './notification-feed-recovery.test.mjs';
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
import './club-arena-shell-cache.test.mjs';
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
// TWO ARE DELIBERATELY NOT IMPORTED, and the meta-guard below allowlists
// them by name with the reason. Both run their own harness and call
// process.exit() on import, which would truncate this whole run.
import './api-routes-exist.test.mjs';
import './bankroll-mobile-upgrades.test.mjs';
import './club-stats-maintenance-runtime-budget.test.mjs';
// 2026-09-22: the same route schedules only its periodic steps. Runs the real
// handler through vm.SourceTextModule (CHECK 8 passes --experimental-vm-modules).
import './club-stats-maintenance-does-no-repair-work.law.test.mjs';
import './deployment-version-stamp.test.mjs';
import './events-calendar-ssr-fallback.test.mjs';
import './fallback-menu-safety.test.mjs';
import './footer-follows-the-reader-not-a-rail.test.mjs';
import './global-header-approved.test.mjs';
import './global-header-profile-frame-law.test.mjs';
// 2026-09-04, the "Log Out does nothing" fix. Its sibling guard
// hamburger-never-regresses runs from `prebuild`, which fires on `npm run
// build` but NOT on the `npx next build` the push script uses - so these two
// went in here, where CHECK 8 reaches them on every pull request.
// signout-contract pins that handleLogout clears the BACKUP key too: clearing
// only the primary meant ensureAuthReady restored the session from the backup
// on the way to the redirect, and the user was signed back in by their own
// logout. query-params pins that a menu row's ?section= / ?tab= / ?source= is
// one its destination page actually accepts - the existing route guard strips
// the query before checking, so it only ever proved the file exists, and
// Delete Account had been sending a value Settings ignores.
import './hamburger-signout-contract.test.mjs';
import './menu-query-params-are-real.test.mjs';
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
// Phase 5, 2026-09-06. Game-integrity findings remain review evidence, never
// automatic punishment; horses stay in every read; and detector gaps stay
// loud until the underlying hands have really been scanned.
import './horses-phase5-client.test.mjs';
import './horses-phase5-migration.test.mjs';
import './horses-phase5-server.test.mjs';
import './horses-phase5-integrity-is-honest.law.test.mjs';
import './horses-phase5-reverify.test.mjs';
import './horses-phase5-release-audit.test.mjs';
import './operator-console-visual-system.test.mjs';
import './horses-admin-states-are-honest.law.test.mjs';
import './horses-operator-console-parses.law.test.mjs';
import './horses-reverify-client.test.mjs';
import './horses-reverify-panels.test.mjs';
import './horses-reverify-routes.test.mjs';
import './horses-routes-group-a.test.mjs';
import './horses-routes-group-b.test.mjs';
import './horses-subpages-phase1.test.mjs';
import './login-painted-auth-state.test.mjs';
import './messenger-prefs-sync.test.mjs';
import './mobile-foundation.test.mjs';
import './modal-history-core.test.mjs';
import './news-intelligence-phase-7.test.mjs';
import './no-slide-to-see.law.test.mjs';
import './overlays-leave-room-to-close.law.test.mjs';
import './page-tutorials.test.mjs';
import './pa-closeout-hardening.test.mjs';
// Mobile phase 4 (Personal Assistant): pins the wrapping anchors, the restored
// Decision Loop label and session date, the wrapping trend row and coaching
// views, 100dvh, overflow-x clip, the 12px floor and the eight-step tutorial.
import './pa-mobile-upgrades.test.mjs';
// Mobile phase 5 (Training Games): pins the wrapping pills row, the 12px
// floor, the returned labels, the three breakpoints and the tutorial.
import './training-mobile-upgrades.test.mjs';
import './preflop-accessibility-phase7.test.mjs';
import './preflop-mobile-upgrades.test.mjs';
// Mobile phase 3 (Poker Near Me): pins the stacked-section discovery page,
// the retired swipe navigation, the sheets, the 12px floor and the tutorial.
import './pnm-mobile-upgrades.test.mjs';
import './poker-near-me-sitemap-parity.test.mjs';
import './poker-tours-hydration.test.mjs';
import './pre-push-typescript-baseline-safety.test.mjs';
// 21 of 26 advertised rewards had never paid a diamond. This pins the triggers
// that fix it, the shared reference-id that stops a trigger and an endpoint
// both paying, and every anti-farming guard.
import './an-advertised-reward-is-actually-payable.law.test.mjs';
import './safe-profile-columns-are-granted.test.mjs';
// Registered 2026-09-08. It had lived only as the npm script
// "test:social-poker-cards", so nothing ran it, and it had been RED on main
// since #1601 removed the copied PostCard from ClubPagesView and
// PublicGameBoard - the exact shape section 10.8 names: a check nobody can see
// is not a check. Fixed and wired in here so it runs in CHECK 8.
import './social-poker-card-picker.test.mjs';
import './store-commerce-hardening.test.mjs';
// 2026-09-05, the diamond wallet audit. Caught by this file's own meta-guard
// before it could become another guard nobody runs: the law was written, passed
// locally, and was reachable from no workflow, no npm script and no import -
// which is exactly the shape of the 52 guards found unreachable on 2026-09-04.
import './the-wallet-badges-count-the-whole-ledger.law.test.mjs';
// Trivia lifeline charges are client-requested but server-priced. This guard
// pins the database replay envelope so a cheaper or differently typed debit
// can never masquerade as the paid skip.
import './trivia-lifeline-spend-integrity.test.mjs';
// Horse Brain Phase 2, 2026-09-06: the canonical policy boundary and God Mode
// grading must run in required CI, not only in a developer's targeted command.
import './god-mode-policy-grading.test.mjs';
import './solver-policy-service.test.mjs';
// Horse Brain Phase 3, 2026-09-07: cache provenance, canonical regrading,
// atomic counters, the live drift schedule, and legacy writer retirement are
// release gates rather than an optional developer-only audit.
import './horse-phase3-training-cache-truth.test.mjs';
import './marketplace-phase-8-lifetime-entitlements.test.mjs';
import './training-arena-phase-5.test.mjs';
import './training-card-visual-contract.test.mjs';
import './training-history-outage-honesty.test.mjs';
import './training-hub-outage-honesty.test.mjs';
import './training-hub-media-audit.test.mjs';
import './training-immersive-gameplay.test.mjs';
import './training-phase-3-closeout.test.mjs';
import './training-phase6-release-harness.test.mjs';
import './training-production-smoke-auth.test.mjs';
import './training-production-smoke-contract.test.mjs';
import './training-route-runtime-inventory.test.mjs';
import './training-request-deadline.test.mjs';
import './training-surface-inventory.test.mjs';
import './trivia-pvp-containment.test.mjs';
import './trivia-tournament-containment.test.mjs';
import './trivia-ui-foundation.test.mjs';
import './world-command-destinations.test.mjs';
import './world-command-menu-law.test.mjs';
import './world-menu-presentation.test.mjs';
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
// Required CHECK 8 also enforces the recovered Video worker publication boundary.
import './openclaw-video-library-routing.test.mjs';
// The same boundary's shared 7-day availability-freshness contract: SQL,
// JavaScript readers, Python renewal target and daily verifier capacity.
import './video-library-freshness-contract.test.mjs';
import './video-library-official-publisher-migration.test.mjs';
import './yt-worker-release-safety.test.mjs';
// 2026-09-21, fleet recertification D1: /api/cron/video-library-reels reaches
// only the gated workers route, and the reels bridge script refuses to write
// while the fleet switch is off or as anything but a pinned non-horse
// profile. Same CHECK 8 reasoning as the block above.
import './video-library-reels-fails-closed.test.mjs';
// Video Library and Reels Phase 1 (2026-09-23): the suites behind
// `npm run test:video-reels-phase-1` that need nothing from node_modules, so
// CHECK 8 (which does not `npm ci`) executes them instead of only naming them.
// Poker-only canonical feed, fail-closed availability, owner-scoped state and
// the painted console surfaces. Left out on purpose: video-library-phase-8
// (imports eslint) and yt-transcode-worker-rights-guard (imports
// @supabase/supabase-js); both stay in the npm script.
import './auxiliary-reels-console.test.mjs';
import './background-video-upload-recovery.test.mjs';
import './news-live-wire-phase-4.test.mjs';
import './news-reels-club-arena-console.test.mjs';
import './profile-reels-console.test.mjs';
import './reels-carousel-console.test.mjs';
import './reels-console-dependencies.test.mjs';
import './reels-embedded-console-visual.test.mjs';
import './social-feed-request-sequencing.test.mjs';
import './user-reel-publication-recovery.test.mjs';
import './video-clipper-storage-namespace.test.mjs';
import './video-embed-report-adjudication.test.mjs';
import './video-library-access-phase-9.test.mjs';
import './video-library-club-arena-console.test.mjs';
import './video-library-phase-5.test.mjs';
import './video-library-phase-6.test.mjs';
import './video-library-phase-7.test.mjs';
import './video-reels-api-resilience.test.mjs';
import './video-reels-collections-integrity.test.mjs';
import './video-reels-integrity-phase-1.test.mjs';
import './video-reels-ui-integrity.test.mjs';
import './video-reels-youtube-sql-security.test.mjs';

// 2026-09-04: a synthetic probe never signs a person out. login-probe was
// pointed at Dan's own account and called a bare signOut() - global scope -
// every 15 minutes, revoking his session on every device and parking every
// Club Arena table he opened on "Reconnecting To The Table" for 22 hours.
// Same CHECK 8 reasoning as the blocks above: imported here so CI runs it.
import './synthetic-probes-never-sign-out-a-person.law.test.mjs';
// 2026-09-04, the quiet half of the same incident: thirty-seven files carried
// Dan's personal address as the account to sign in as, e2e/00-auth.setup.ts
// among them, so every CI run signed in as him. The account is
// TEST_USER_EMAIL from the environment now, and this law keeps it there.
import './a-script-never-wears-a-persons-face.law.test.mjs';
// 2026-09-04: the hub notices a revoked session (it would have looked signed
// in for seven days; PostgREST checks signatures, not session rows).
import './the-hub-notices-a-revoked-session.law.test.mjs';
// 2026-09-04: a probe that cannot run says so where probes speak (recovery-probe
// had been silent for a day: unconfigured, and exiting before its heartbeat).
import './a-probe-that-cannot-run-says-so.law.test.mjs';
// 2026-09-07. A horse's avatar is uploaded where a human's is (bucket
// avatars, <profile uuid>/avatar.png), never under a name that says horse:
// the storage path is in the <img src> of every seat and post.
import './a-horse-avatar-is-uploaded-where-a-human-one-is.law.test.mjs';
// 2026-09-04: the 3am pager. Alertmanager posts page=sms alerts to the Hub
// route added in this commit; this suite pins the auth gate, Twilio call,
// retry semantics, and house rules (only the six named alerts wake anyone).
// Imported here because CHECK 8's explicit list needs the `workflow` PAT
// permission the automation token does not have.
import './alertmanager-page.test.mjs';
// 2026-09-06, phase 7 of the same programme: the twenty-two hours BEGAN with
// one environment variable, edited in a dashboard, leaving no commit and no
// log line. This pins the detector that would now notice - and pins that it
// never asks Vercel to decrypt, never carries a value, and exits 2 rather
// than 0 when it cannot see.
import './an-env-var-cannot-change-unseen.law.test.mjs';
// 2026-09-07: `env(safe-area-inset-top)` was applied on BOTH <body> and the
// sticky header, so on an installed PWA the header sat one whole status bar too
// low (118px of dead space on a Dynamic Island phone, where 59 is correct). It
// is invisible in a browser tab, where the inset is 0, which is precisely why
// it needs a test rather than an eye.
import './the-status-bar-inset-has-one-owner.test.mjs';
// 2026-09-07: two scrapers judged themselves on the absence of errors rather
// than on what they produced, in opposite directions. One reported success
// while every dispatch 401'd for five weeks; the other could never report
// success at all and was red every day for five months, hiding a real 42P10.
import './a-scraper-run-is-judged-on-what-it-produced.test.mjs';
// 2026-09-13: the installed PWA relaunched at start_url (/hub) every time iOS
// discarded it, and nothing recorded where the player was. Pins the recorder,
// the inline restore script in _document, and the urgent `tournament_resumed`
// push that tells a player their seat is being dealt again after the break.
import './the-app-reopens-where-you-left-it.test.mjs';
// 2026-09-22: a club's table count has one writer, the database's
// trg_tables_sync_club_counts_* triggers. manage-table decremented it again
// through decrement_club_table_count, dropped on 2026-09-20, and a
// read-and-write-back of count - 1 when that call failed. Runs the real
// handler through vm.SourceTextModule, which CHECK 8's
// --experimental-vm-modules provides for this file.
import './a-club-table-count-has-one-writer.law.test.mjs';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');

const REQUIRED_TEST_FILES = [
    '__tests__/auth-routes-exist.test.mjs',
    // A monitor must never revoke a person's sessions (2026-09-04 outage).
    '__tests__/synthetic-probes-never-sign-out-a-person.law.test.mjs',
    '__tests__/a-script-never-wears-a-persons-face.law.test.mjs',
    '__tests__/the-hub-notices-a-revoked-session.law.test.mjs',
    '__tests__/a-probe-that-cannot-run-says-so.law.test.mjs',
    // An env var cannot change unseen (2026-09-03 began with exactly one).
    '__tests__/an-env-var-cannot-change-unseen.law.test.mjs',
    // Pins the two-hop cron auth boundary (Vercel 200 / workers 404). Deleting
    // it would silently un-protect the 2026-08-31 workers outage fix.
    '__tests__/openclaw-workers-secret.test.mjs',
    '__tests__/signup-hardening.test.mjs',
    '__tests__/build-2-deliverables.test.mjs',
    '__tests__/retired-error-provider.test.mjs',
    '__tests__/phase-3-deliverables.test.mjs',
    '__tests__/phase-4-deliverables.test.mjs',
    // Personal Assistant guards. menu-routes catches dead hamburger links;
    // pa-no-undef catches the undefined-identifier class that white-screened
    // the Leak Finder in production. Both run in `prebuild`.
    '__tests__/menu-routes-exist.test.mjs',
    '__tests__/pa-no-undef.test.mjs',
    // The Log Out fix (2026-09-04). menu-routes-exist above is deliberately
    // NOT a substitute for query-params-are-real: it strips ?query before it
    // resolves a path, so it proves the destination file exists and nothing
    // about whether the destination reads the parameter the row sends it.
    '__tests__/hamburger-signout-contract.test.mjs',
    '__tests__/menu-query-params-are-real.test.mjs',
    // Proves the Blob-URL equity worker still computes the same numbers as
    // EquityEngine.js — the worker holds a generated COPY of the Monte Carlo
    // core, so drift is silent and user-visible.
    '__tests__/equity-worker-parity.test.mjs',
    // Body-scroll locking (roadmap #47). This bug has been fixed twice and
    // regressed once, each attempt trading one failure mode for another:
    // recover leaked locks and you stomp live ones, refuse to stomp live ones
    // and a leaked lock strands the app forever. The guard pins BOTH halves.
    '__tests__/scroll-lock.test.mjs',
    // The Trivia lobby catalogue is the shared contract for all fifteen
    // destinations, the retained Daily/Quick Stakes artwork, and the two
    // competitive modes that must fail closed until their audits land.
    '__tests__/trivia-ui-foundation.test.mjs',
    '__tests__/trivia-pvp-containment.test.mjs',
    '__tests__/trivia-tournament-containment.test.mjs',
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
