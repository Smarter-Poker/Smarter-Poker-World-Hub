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

/* RETRY, BECAUSE THIS IS ABOUT TO BE A REQUIRED CHECK.
 *
 * On 2026-08-22 this failed CI with
 *   HTTP 500 {"code":"57014","message":"canceling statement due to statement
 *   timeout"}
 * after 49 seconds. Every one of the twelve invariants was passing at that
 * moment. Measured immediately afterwards, three identical calls returned
 * 200 in 879ms, 200 in 4915ms, and a 503 in 2764ms - the endpoint is
 * intermittently unavailable, and the failure had nothing to do with what
 * this gate guards.
 *
 * A check that is required to merge cannot fail for reasons unrelated to the
 * code. So transport-level trouble is retried and only a persistent failure
 * is reported; a FALSE INVARIANT is never retried, because that is the signal.
 *
 * The distinction matters: 5xx, 57014 and a thrown fetch are the network
 * having a bad minute. A row with ok=false is the economy being wrong, and
 * retrying that would be hiding it.
 */
const TRANSIENT_ATTEMPTS = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let rows;
let lastProblem = '';
for (let attempt = 1; attempt <= TRANSIENT_ATTEMPTS; attempt++) {
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: '{}',
        });
        if (res.ok) {
            rows = await res.json();
            break;
        }
        const body = await res.text();
        lastProblem = `HTTP ${res.status} ${body}`;
        // 5xx is the gateway or the database, not us. 57014 is the statement
        // timeout specifically, which Supabase returns inside a 500.
        const transient = res.status >= 500 || res.status === 429 || body.includes('57014');
        if (!transient) break;
    } catch (err) {
        lastProblem = err?.message || String(err);
    }
    if (attempt < TRANSIENT_ATTEMPTS) {
        const wait = attempt * 3000;
        console.warn(
            `[economy-invariants] transient failure (attempt ${attempt}/${TRANSIENT_ATTEMPTS}): ` +
                `${lastProblem} — retrying in ${wait / 1000}s`
        );
        await sleep(wait);
    }
}

if (!rows) {
    console.error(`[economy-invariants] RPC failed after ${TRANSIENT_ATTEMPTS} attempts: ${lastProblem}`);
    console.error('[economy-invariants] This is a TRANSPORT failure, not a failing invariant.');
    console.error('[economy-invariants] Check the Supabase project status before touching the economy.');
    process.exit(1);
}

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
let tests;
try {
    const testRes = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/test_merch_reservation`, {
        method: 'POST',
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: '{}',
    });
    if (!testRes.ok) {
        console.error(`[merch-tests] RPC failed: HTTP ${testRes.status} ${await testRes.text()}`);
        process.exit(1);
    }
    tests = await testRes.json();
} catch (err) {
    console.error('[merch-tests] RPC failed:', err?.message || err);
    process.exit(1);
}

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
