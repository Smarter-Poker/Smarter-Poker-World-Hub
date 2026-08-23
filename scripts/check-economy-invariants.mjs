#!/usr/bin/env node
/**
 * ECONOMY INVARIANTS CHECK
 * ═══════════════════════════════════════════════════════════════════════════
 * Calls public.economy_invariants() and fails the build if any assertion is
 * false.
 *
 * WHY THIS EXISTS
 *   Every economic defect fixed on 2026-08-06/08 was invisible because nothing
 *   asserted the property it broke, and each was found by a hand audit:
 *
 *     - deduct_diamonds wrote one balance column while credits wrote two,
 *       so every debit drifted the pair apart
 *     - award_diamonds_v2's VIP guard failed OPEN on NULL (`NULL = 'lifetime'`
 *       is NULL, not false), handing the VIP earning ceiling to 470 accounts
 *     - easter_egg counted toward the daily cap, so a 500 ◆ legendary was
 *       clamped to the daily remainder and the excess destroyed
 *     - a public view carried write grants to anon, so an unauthenticated
 *       request could rewrite tournament prize pools
 *     - the balance RPCs were revoked from `authenticated` while the browser
 *       kept calling them, so paid features failed silently for days
 *
 *   Hand audits do not run on Tuesday. These do.
 *
 * The assertions live in SQL (migration 20260808220000) rather than here, so
 * they inspect the live catalog and cannot drift from the database the way a
 * transcribed copy would. This file is only the runner.
 *
 * USAGE
 *   node scripts/check-economy-invariants.mjs
 *   exit 0 = all invariants hold
 *   exit 1 = a regression, printed check by check
 *
 * CREDENTIALS
 *   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. When absent the
 *   script SKIPS with exit 0 so it can be wired into CI before the secret
 *   exists — a skip prints loudly and must not be read as a pass.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.log('[economy-invariants] SKIPPED — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.');
    console.log('[economy-invariants] This is a SKIP, not a PASS. Nothing was checked.');
    process.exit(0);
}

// Dependency-free on purpose: the Build Safety Gate job does not npm install.
const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/rpc/economy_invariants`;

/* The retry budget has to outlast a PostgREST SCHEMA CACHE RELOAD.
 *
 * 4 attempts at 3s, 6s and 9s gives up about 18 seconds after the first
 * failure. That was enough for a statement timeout and not enough for the
 * thing that actually happens here several times a day: every DDL migration
 * applied to production makes PostgREST rebuild its schema cache, and while it
 * does, every request answers
 *
 *   HTTP 503 {"code":"PGRST002","message":"Could not query the database for
 *   the schema cache. Retrying."}
 *
 * On a schema this size - 831 tables and 2,024 functions - that window is
 * comfortably longer than 18 seconds. It closed this gate on 2026-08-22 for the
 * third time in one day, on a branch whose entire diff was a workflow file and
 * a test, while every assertion behind it was passing.
 *
 * 7 attempts with a 5s step capped at 30s spends up to ~105 seconds before
 * giving up. That is slower to report a genuinely dead database and much less
 * likely to report a live one as dead, which is the right trade for a gate that
 * blocks every merge in the repository.
 */
const TRANSIENT_ATTEMPTS = 7;
const TRANSIENT_STEP_MS = 5000;
const TRANSIENT_MAX_WAIT_MS = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* CALL AN RPC, RETRYING ONLY TRANSPORT TROUBLE.
 *
 * This gate is REQUIRED to merge on main, so it cannot fail for reasons
 * unrelated to the code. On 2026-08-22 it failed twice for exactly that, hours
 * apart, in two different calls in this one file:
 *
 *   HTTP 500 {"code":"57014","message":"canceling statement due to statement
 *   timeout"}
 *
 * Both times every assertion behind the call was passing. Measured immediately
 * after the first, three identical calls returned 200 in 879ms, 200 in 4915ms,
 * and a 503 in 2764ms - the endpoint is intermittently unavailable and it has
 * nothing to do with what this gate guards.
 *
 * The first fix wrapped only the invariants call and left the merch call bare,
 * which is why there was a second time. One helper both callers share is the
 * point: the next RPC added to this file gets the same treatment for free
 * instead of becoming the third incident.
 *
 * 5xx, 429, 57014, PGRST002 and a thrown fetch are the network having a bad
 * minute. PGRST002 arrives as a 503 so it is already caught by the status test;
 * it is named here because it is the most COMMON of them in this estate and the
 * least obviously transient-looking to someone reading the log for the first
 * time. It is what PostgREST answers while it rebuilds its schema cache after
 * a migration.
 * A FALSE ASSERTION IS NEVER RETRIED - that is the signal, and retrying it
 * would be hiding it.
 */
async function rpcWithRetry(label, target) {
    let lastProblem = '';
    for (let attempt = 1; attempt <= TRANSIENT_ATTEMPTS; attempt++) {
        try {
            const res = await fetch(target, {
                method: 'POST',
                headers: {
                    apikey: key,
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                body: '{}',
            });
            if (res.ok) return await res.json();
            const body = await res.text();
            lastProblem = `HTTP ${res.status} ${body}`;
            const transient = res.status >= 500 || res.status === 429 || body.includes('57014');
            if (!transient) break;
        } catch (err) {
            lastProblem = err?.message || String(err);
        }
        if (attempt < TRANSIENT_ATTEMPTS) {
            const wait = Math.min(attempt * TRANSIENT_STEP_MS, TRANSIENT_MAX_WAIT_MS);
            console.warn(
                `[${label}] transient failure (attempt ${attempt}/${TRANSIENT_ATTEMPTS}): ` +
                    `${lastProblem} — retrying in ${wait / 1000}s`
            );
            await sleep(wait);
        }
    }
    console.error(`[${label}] RPC failed after ${TRANSIENT_ATTEMPTS} attempts: ${lastProblem}`);
    console.error(`[${label}] This is a TRANSPORT failure, not a failing assertion.`);
    console.error(`[${label}] Check the Supabase project status before touching the code.`);
    process.exit(1);
}

const rows = await rpcWithRetry('economy-invariants', endpoint);

if (!Array.isArray(rows) || rows.length === 0) {
    // An empty result is not "no problems" — it means the function is missing
    // or returned nothing, and the checks did not run.
    console.error('[economy-invariants] economy_invariants() returned no rows. The check did not run.');
    process.exit(1);
}

// Guard against the function being silently truncated to a couple of checks.
const MIN_EXPECTED = 12;
if (rows.length < MIN_EXPECTED) {
    console.error(`[economy-invariants] only ${rows.length} invariants returned, expected at least ${MIN_EXPECTED}.`);
    console.error('[economy-invariants] Someone removed checks. That is itself the regression.');
    process.exit(1);
}

const failed = rows.filter((r) => r.ok !== true);

for (const r of rows) {
    console.log(`  ${r.ok === true ? 'PASS' : 'FAIL'}  ${r.check_name}`);
}

if (failed.length) {
    console.error('');
    console.error('ECONOMY INVARIANT VIOLATION — the diamond economy is not in a safe state.');
    console.error('');
    for (const r of failed) {
        console.error(`  ${r.check_name}`);
        console.error(`      ${r.detail}`);
    }
    console.error('');
    console.error('Each of these corresponds to a defect that has already happened once.');
    console.error('See supabase/migrations/20260808220000_economy_invariants_function.sql');
    console.error('');
    process.exit(1);
}

console.log(`[economy-invariants] OK — ${rows.length} invariants hold.`);

// ── Merchandise reservation regression tests ────────────────────────────────
// public.test_merch_reservation() exercises reserve/release_merch_order against
// the real catalog, each case inside a subtransaction that rolls back, so it is
// safe to run against production. These were hand-run probes during the stock
// work; running them here is what stops the next refactor from quietly
// reintroducing overselling.
// Same treatment as the invariants above. THIS is the call that failed the
// second time, because the first fix only covered half the file.
const tests = await rpcWithRetry(
    'merch-tests',
    `${url.replace(/\/+$/, '')}/rest/v1/rpc/test_merch_reservation`
);

if (!Array.isArray(tests) || tests.length < 7) {
    console.error(`[merch-tests] expected at least 7 tests, got ${Array.isArray(tests) ? tests.length : 'none'}.`);
    console.error('[merch-tests] A shrinking test set is itself the regression.');
    process.exit(1);
}

const failedTests = tests.filter((t) => t.ok !== true);
for (const t of tests) {
    console.log(`  ${t.ok === true ? 'PASS' : 'FAIL'}  ${t.test_name}`);
}

if (failedTests.length) {
    console.error('');
    console.error('MERCHANDISE RESERVATION TEST FAILURE — stock handling is not safe.');
    console.error('');
    for (const t of failedTests) {
        console.error(`  ${t.test_name}`);
        console.error(`      ${t.detail}`);
    }
    console.error('');
    process.exit(1);
}

console.log(`[merch-tests] OK — ${tests.length} reservation tests pass.`);
process.exit(0);
