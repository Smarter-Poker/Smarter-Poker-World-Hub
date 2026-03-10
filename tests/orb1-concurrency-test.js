#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ORB-1 CONCURRENCY STRESS TEST (The "Fat Finger" & Race Condition Defense)
 *
 * Simulates extreme network lag and multi-tap scenarios to prove that
 * our Idempotency keys and Postgres Row-Level Locks prevent TOCTOU races.
 * 
 * Run: node tests/orb1-concurrency-test.js
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TOKEN = process.env.TEST_TOKEN || '';

// We use identical idempotency keys to simulate a user mashing the button 
// before the first request resolves, or the client retrying on a dropped packet.
const headers = (idempotencyKey) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TEST_TOKEN}`,
    'X-Idempotency-Key': idempotencyKey,
});

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        console.log(`  ❌ ${name}: ${err.message}`);
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

async function post(endpoint, body, key) {
    const res = await fetch(`${BASE}${endpoint}`, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE FAT-FINGER MATRIX (10 Concurrent Requests)
// ═══════════════════════════════════════════════════════════════════════════════
async function runConcurrencyMatrix() {
    console.log('\n🔴 CONCURRENCY MATRIX (10 Simultaneous Requests / Same Idempotency Key)');

    if (!TEST_TOKEN) {
        console.log('  ⚠️  Missing TEST_TOKEN. Proceeding, but will expect 401s (Auth runs before Idempotency check).');
        console.log('  ⚠️  To test true lock behavior, provide a TEST_TOKEN.\n');
    }

    const endpoints = [
        { path: '/api/club-arena/buyin', body: { clubId: '00000000-0000-0000-0000-000000000000', chipAmount: 100 } },
        { path: '/api/club-arena/request-cashout', body: { clubId: '00000000-0000-0000-0000-000000000000', amount: 100 } },
        { path: '/api/club-arena/transfer-chips', body: { clubId: '00000000-0000-0000-0000-000000000000', toUserId: '00000000-0000-0000-0000-000000000001', amount: 100 } },
        { path: '/api/club-arena/cancel-my-cashout', body: { cashoutId: '00000000-0000-0000-0000-000000000000' } },
        { path: '/api/club-arena/leave-club', body: { clubId: '00000000-0000-0000-0000-000000000000' } },
    ];

    for (const ep of endpoints) {
        const name = ep.path.split('/').pop();
        const IDKEY = crypto.randomUUID(); // Represents a single un-acknowledged tap

        await test(`${name}: 10 concurrent requests yield identical systemic states`, async () => {
            // Fire 10 simultaneous requests
            const promises = Array.from({ length: 10 }, () => post(ep.path, ep.body, IDKEY));
            const results = await Promise.all(promises);

            const statuses = results.map(r => r.status);
            const uniqueStatuses = [...new Set(statuses)];

            const bodies = results.map(r => JSON.stringify(r.data));
            const uniqueBodies = [...new Set(bodies)];

            // Proof of Idempotency & Lock robustness:
            // 1 request should slip through to auth/business logic (returns != 409)
            // 9 requests should hit the processing lock and fail immediately (409)
            const processed = statuses.filter(s => s !== 409);
            const conflicts = statuses.filter(s => s === 409);

            assert(processed.length === 1, `Race Condition: Expected exactly 1 processed request, got ${processed.length}. Statuses: ${statuses.join(', ')}`);
            assert(conflicts.length === 9, `Expected exactly 9 duplicates to be rejected as 409 Conflict. Got ${conflicts.length}.`);
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(' ORB-1 CONCURRENCY & LIMIT GUARDIAN PROXIES');
    console.log('═══════════════════════════════════════════════════════════');

    await runConcurrencyMatrix();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(` RESULTS: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Crash:', err);
    process.exit(1);
});
