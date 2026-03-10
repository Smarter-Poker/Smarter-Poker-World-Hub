#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ORB-1 RED TEAM — E2E Stress Test
 *
 * Tests all ORB-1 API endpoints against hostile payloads.
 * Run: node tests/orb1-red-team.js
 *
 * Categories:
 *   1. Malicious Payload Injection (negative, fractional, massive, SQL, null)
 *   2. Idempotency Concurrency (5 concurrent requests, same key)
 *   3. Auth Spoofing (fake userId in body)
 *   4. Field Injection (unknown fields)
 *   5. Payload Size Attack (oversized body)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TOKEN = process.env.TEST_TOKEN || ''; // Set via env var

const headers = (idempotencyKey) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TEST_TOKEN}`,
    'X-Idempotency-Key': idempotencyKey || crypto.randomUUID(),
});

let passed = 0;
let failed = 0;
let skipped = 0;

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
// 1. MALICIOUS PAYLOAD INJECTION
// ═══════════════════════════════════════════════════════════════════════════════
async function testMaliciousPayloads() {
    console.log('\n🔴 MALICIOUS PAYLOAD INJECTION');

    const ENDPOINTS = [
        { path: '/api/club-arena/buyin', body: (v) => ({ clubId: '00000000-0000-0000-0000-000000000000', chipAmount: v }) },
        { path: '/api/club-arena/request-cashout', body: (v) => ({ clubId: '00000000-0000-0000-0000-000000000000', amount: v }) },
        { path: '/api/club-arena/transfer-chips', body: (v) => ({ clubId: '00000000-0000-0000-0000-000000000000', toUserId: '00000000-0000-0000-0000-000000000001', amount: v }) },
    ];

    const HOSTILE_AMOUNTS = [
        { val: -1, name: 'negative' },
        { val: -999999999, name: 'large negative' },
        { val: 0, name: 'zero' },
        { val: 0.0001, name: 'fractional (0.0001)' },
        { val: 0.5, name: 'fractional (0.5)' },
        { val: 99.99, name: 'fractional (99.99)' },
        { val: 1_000_000_000_000, name: 'trillion' },
        { val: Infinity, name: 'Infinity' },
        { val: NaN, name: 'NaN' },
        { val: 'abc', name: 'string "abc"' },
        { val: null, name: 'null' },
        { val: undefined, name: 'undefined' },
        { val: '', name: 'empty string' },
        { val: '1; DROP TABLE clubs;--', name: 'SQL injection' },
        { val: '<script>alert(1)</script>', name: 'XSS string' },
    ];

    for (const ep of ENDPOINTS) {
        const epName = ep.path.split('/').pop();
        for (const hostile of HOSTILE_AMOUNTS) {
            await test(`${epName} rejects ${hostile.name}`, async () => {
                const { status } = await post(ep.path, ep.body(hostile.val));
                assert(status === 400 || status === 401, `Expected 400/401, got ${status}`);
            });
        }
    }

    // UUID injection attacks
    const SQL_INJECTION_IDS = [
        "'; DROP TABLE clubs;--",
        "00000000-0000-0000-0000-000000000000' OR '1'='1",
        '../../../etc/passwd',
        '<img src=x onerror=alert(1)>',
        'null',
        '',
        '   ',
        12345,
    ];

    for (const badId of SQL_INJECTION_IDS) {
        await test(`buyin rejects hostile clubId: ${JSON.stringify(badId).slice(0, 40)}`, async () => {
            const { status } = await post('/api/club-arena/buyin', { clubId: badId, chipAmount: 100 });
            assert(status === 400 || status === 401, `Expected 400/401, got ${status}`);
        });

        await test(`transfer rejects hostile toUserId: ${JSON.stringify(badId).slice(0, 40)}`, async () => {
            const { status } = await post('/api/club-arena/transfer-chips', {
                clubId: '00000000-0000-0000-0000-000000000000',
                toUserId: badId, amount: 100,
            });
            assert(status === 400 || status === 401, `Expected 400/401, got ${status}`);
        });

        await test(`cancel-cashout rejects hostile cashoutId: ${JSON.stringify(badId).slice(0, 40)}`, async () => {
            const { status } = await post('/api/club-arena/cancel-my-cashout', { cashoutId: badId });
            assert(status === 400 || status === 401, `Expected 400/401, got ${status}`);
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. IDEMPOTENCY CONCURRENCY TEST
// ═══════════════════════════════════════════════════════════════════════════════
async function testIdempotencyConcurrency() {
    console.log('\n🔵 IDEMPOTENCY CONCURRENCY (5 concurrent, same key)');

    if (!TEST_TOKEN) {
        console.log('  ⏭️  Skipped (no TEST_TOKEN — requires live Supabase auth)');
        skipped++;
        return;
    }

    const KEY = crypto.randomUUID();
    const body = { clubId: '00000000-0000-0000-0000-000000000000', chipAmount: 100 };

    // Fire 5 concurrent requests with the SAME idempotency key
    const promises = Array.from({ length: 5 }, () => post('/api/club-arena/buyin', body, KEY));
    const results = await Promise.all(promises);

    // All should return the same status (either success or error, but CONSISTENT)
    const statuses = results.map(r => r.status);
    const uniqueStatuses = [...new Set(statuses)];

    await test('All 5 requests return same status code', async () => {
        assert(uniqueStatuses.length === 1, `Got ${uniqueStatuses.length} unique statuses: ${statuses.join(', ')}`);
    });

    await test('No double-processing (all responses identical)', async () => {
        const bodies = results.map(r => JSON.stringify(r.data));
        const uniqueBodies = [...new Set(bodies)];
        assert(uniqueBodies.length === 1, `Got ${uniqueBodies.length} unique response bodies`);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. AUTH & FIELD INJECTION
// ═══════════════════════════════════════════════════════════════════════════════
async function testFieldInjection() {
    console.log('\n🟡 FIELD INJECTION ATTACKS');

    await test('buyin rejects unknown fields', async () => {
        const { status } = await post('/api/club-arena/buyin', {
            clubId: '00000000-0000-0000-0000-000000000000',
            chipAmount: 100,
            userId: 'INJECTED-FAKE-USER',  // Attacker trying to spoof identity
            isAdmin: true,
            role: 'owner',
        });
        assert(status === 400 || status === 401, `Expected 400/401, got ${status}`);
    });

    await test('request-cashout rejects unknown fields', async () => {
        const { status } = await post('/api/club-arena/request-cashout', {
            clubId: '00000000-0000-0000-0000-000000000000',
            amount: 100,
            userId: 'INJECTED',
            status: 'approved',
        });
        assert(status === 400 || status === 401, `Expected 400/401, got ${status}`);
    });

    await test('transfer rejects unknown fields', async () => {
        const { status } = await post('/api/club-arena/transfer-chips', {
            clubId: '00000000-0000-0000-0000-000000000000',
            toUserId: '00000000-0000-0000-0000-000000000001',
            amount: 100,
            fromUserId: 'INJECTED-SENDER',
        });
        assert(status === 400 || status === 401, `Expected 400/401, got ${status}`);
    });

    await test('cancel-cashout rejects unknown fields', async () => {
        const { status } = await post('/api/club-arena/cancel-my-cashout', {
            cashoutId: '00000000-0000-0000-0000-000000000000',
            status: 'approved',           // Trying to force-approve
            agent_note: 'INJECTED',       // Trying to inject agent note
        });
        assert(status === 400 || status === 401, `Expected 400/401, got ${status}`);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PAYLOAD SIZE ATTACKS
// ═══════════════════════════════════════════════════════════════════════════════
async function testPayloadSize() {
    console.log('\n🟠 PAYLOAD SIZE ATTACKS');

    // 50KB note payload
    const megaNote = 'A'.repeat(50_000);

    await test('buyin rejects oversized payload', async () => {
        const { status } = await post('/api/club-arena/buyin', {
            clubId: '00000000-0000-0000-0000-000000000000',
            chipAmount: 100,
            note: megaNote, // This should hit field rejection first, then size
        });
        assert(status === 400 || status === 413, `Expected 400/413, got ${status}`);
    });

    await test('transfer rejects oversized note', async () => {
        const { status } = await post('/api/club-arena/transfer-chips', {
            clubId: '00000000-0000-0000-0000-000000000000',
            toUserId: '00000000-0000-0000-0000-000000000001',
            amount: 100,
            note: megaNote,
        });
        assert(status === 413, `Expected 413, got ${status}`);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. MISSING IDEMPOTENCY KEY
// ═══════════════════════════════════════════════════════════════════════════════
async function testMissingIdempotencyKey() {
    console.log('\n🟣 MISSING IDEMPOTENCY KEY');

    const noKeyHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN || 'fake-token'}`,
    };

    const endpoints = [
        '/api/club-arena/buyin',
        '/api/club-arena/request-cashout',
        '/api/club-arena/transfer-chips',
    ];

    for (const ep of endpoints) {
        const name = ep.split('/').pop();
        await test(`${name} rejects missing X-Idempotency-Key`, async () => {
            const res = await fetch(`${BASE}${ep}`, {
                method: 'POST',
                headers: noKeyHeaders,
                body: JSON.stringify({ clubId: '00000000-0000-0000-0000-000000000000', chipAmount: 100 }),
            });
            assert(res.status === 400, `Expected 400, got ${res.status}`);
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(' ORB-1 RED TEAM — E2E STRESS TEST');
    console.log(`  Target: ${BASE}`);
    console.log(`  Auth Token: ${TEST_TOKEN ? '✅ Present' : '⚠️ Missing (some tests skipped)'}`);
    console.log('═══════════════════════════════════════════════════════════');

    await testMaliciousPayloads();
    await testFieldInjection();
    await testPayloadSize();
    await testMissingIdempotencyKey();
    await testIdempotencyConcurrency();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(` RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    console.log('═══════════════════════════════════════════════════════════');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Test runner crashed:', err);
    process.exit(1);
});
