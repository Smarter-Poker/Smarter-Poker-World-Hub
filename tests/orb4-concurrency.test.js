/**
 * ═══════════════════════════════════════════════════════════════════
 * ORB-4 CONCURRENCY — Fat-Finger / Double-Tap Chaos Test
 * /tests/orb4-concurrency.test.js
 *
 * Simulates a user's laggy mobile network tapping a mutation button
 * 10 times in 100ms. Verifies the idempotency guard catches all
 * duplicates and only processes the first request.
 *
 * Run: node tests/orb4-concurrency.test.js
 * ═══════════════════════════════════════════════════════════════════
 */

const BASE = process.env.ORB4_TEST_BASE || 'http://localhost:3000';
const TOKEN = process.env.ORB4_TEST_TOKEN || 'FAKE_TOKEN_FOR_DRY_RUN';
const UNION_ID = process.env.ORB4_TEST_UNION_ID || '00000000-0000-0000-0000-000000000000';
const CLUB_ID = process.env.ORB4_TEST_CLUB_ID || '00000000-0000-0000-0000-000000000001';

let pass = 0, fail = 0, total = 0;

function assert(testName, condition, details = '') {
    total++;
    if (condition) { pass++; console.log(`  ✅ ${testName}`); }
    else { fail++; console.log(`  ❌ ${testName} ${details}`); }
}

async function api(endpoint, body, idempotencyKey) {
    try {
        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TOKEN}`,
        };
        if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
        const r = await fetch(`${BASE}${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        const data = await r.json().catch(() => ({}));
        return { status: r.status, data };
    } catch (err) {
        return { status: 0, data: { error: err.message } };
    }
}

// ═══════════════════════════════════════════════════════════════
// TEST 1: Fat-Finger — 10 identical requests with SAME idempotency key
// ═══════════════════════════════════════════════════════════════
async function testFatFingerSameKey() {
    console.log('\n🔴 SUITE 1: Fat-Finger Defense (10 taps, same X-Idempotency-Key)');

    const sameKey = `fat-finger-test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const body = { action: 'send_to_club', unionId: UNION_ID, clubId: CLUB_ID, amount: 100 };

    // Fire 10 requests simultaneously with the same idempotency key
    const promises = [];
    for (let i = 0; i < 10; i++) {
        promises.push(api('/api/club-arena/union-wallet', body, sameKey));
        // 10ms stagger to simulate rapid tapping
        if (i < 9) await new Promise(r => setTimeout(r, 10));
    }

    const results = await Promise.all(promises);

    // Count responses by type
    const processed = results.filter(r => r.status !== 409);
    const duplicates = results.filter(r => r.status === 409);

    assert('At most 1 request processed (others were 409)', processed.length <= 1,
        `processed=${processed.length}, duplicates=${duplicates.length}`);
    assert('At least 8 of 10 caught as duplicates', duplicates.length >= 8,
        `duplicates=${duplicates.length}/10`);
    assert('No 500 errors (no crashes)', results.every(r => r.status !== 500));

    console.log(`  📊 Breakdown: ${processed.length} processed, ${duplicates.length} caught as duplicates, ${results.filter(r => r.status !== 409 && !r.data?.success).length} other rejections`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 2: Unique keys — 5 requests with DIFFERENT keys all process
// ═══════════════════════════════════════════════════════════════
async function testUniqueKeysAllProcess() {
    console.log('\n🔴 SUITE 2: Unique Keys — each request gets its own key');

    const body = { action: 'send_to_club', unionId: UNION_ID, clubId: CLUB_ID, amount: 100 };
    const results = [];
    for (let i = 0; i < 5; i++) {
        const uniqueKey = `unique-test-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 10)}`;
        results.push(await api('/api/club-arena/union-wallet', body, uniqueKey));
    }

    const conflicts = results.filter(r => r.status === 409);
    assert('Zero 409 conflicts with unique keys', conflicts.length === 0,
        `conflicts=${conflicts.length}`);
    assert('No 500 errors', results.every(r => r.status !== 500));
}

// ═══════════════════════════════════════════════════════════════
// TEST 3: Missing key on mutation → 400
// ═══════════════════════════════════════════════════════════════
async function testMissingKeyRejected() {
    console.log('\n🔴 SUITE 3: Missing X-Idempotency-Key on mutation → 400');

    const r = await api('/api/club-arena/union-wallet', {
        action: 'send_to_club', unionId: UNION_ID, clubId: CLUB_ID, amount: 100,
    }, undefined); // No key!

    assert('Missing idempotency key → 400 or 429', r.status === 400 || r.status === 429, `status=${r.status}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 4: Read-only action works WITHOUT key
// ═══════════════════════════════════════════════════════════════
async function testReadOnlyNoKeyRequired() {
    console.log('\n🔴 SUITE 4: Read-only action works without X-Idempotency-Key');

    const r = await api('/api/club-arena/union-wallet', {
        action: 'get_balances', unionId: UNION_ID,
    }, undefined); // No key — should still work

    // Should get 401 (fake token) or 200 — but NOT 400 for missing key
    assert('get_balances without key → not 400', r.status !== 400, `status=${r.status}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 5: manage-union fat-finger
// ═══════════════════════════════════════════════════════════════
async function testManageUnionFatFinger() {
    console.log('\n🔴 SUITE 5: manage-union fat-finger (5 taps, same key)');

    const sameKey = `manage-fat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const body = { action: 'add_club', unionId: UNION_ID, clubId: CLUB_ID };

    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(api('/api/club-arena/manage-union', body, sameKey));
        if (i < 4) await new Promise(r => setTimeout(r, 10));
    }

    const results = await Promise.all(promises);
    const duplicates = results.filter(r => r.status === 409);
    const processed = results.filter(r => r.status !== 409);

    assert('At most 1 manage-union processed', processed.length <= 1,
        `processed=${processed.length}`);
    assert('At least 3 of 5 caught as duplicates', duplicates.length >= 3,
        `duplicates=${duplicates.length}/5`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 6: manage-union search_user (read-only) — no key required
// ═══════════════════════════════════════════════════════════════
async function testManageUnionReadNoKey() {
    console.log('\n🔴 SUITE 6: manage-union search_user without key');

    const r = await api('/api/club-arena/manage-union', {
        action: 'search_user', unionId: UNION_ID, query: 'test',
    }, undefined);

    assert('search_user without key → not 400', r.status !== 400, `status=${r.status}`);
}

// ═══════════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════════
async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ORB-4 CONCURRENCY — Fat-Finger Defense Test Suite');
    console.log(`  Target: ${BASE}`);
    console.log('═══════════════════════════════════════════════════════');

    await testFatFingerSameKey();
    await testUniqueKeysAllProcess();
    await testMissingKeyRejected();
    await testReadOnlyNoKeyRequired();
    await testManageUnionFatFinger();
    await testManageUnionReadNoKey();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${pass}/${total} passed, ${fail} failed`);
    console.log('═══════════════════════════════════════════════════════');

    if (fail > 0) process.exit(1);
}

main().catch(err => {
    console.error('Test runner crashed:', err);
    process.exit(1);
});
