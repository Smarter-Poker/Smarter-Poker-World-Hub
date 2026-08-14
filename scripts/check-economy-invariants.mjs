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

let rows;
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
    if (!res.ok) {
        console.error(`[economy-invariants] RPC failed: HTTP ${res.status} ${await res.text()}`);
        process.exit(1);
    }
    rows = await res.json();
} catch (err) {
    console.error('[economy-invariants] RPC failed:', err?.message || err);
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
