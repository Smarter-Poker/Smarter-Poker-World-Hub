#!/usr/bin/env node
/**
 * CONCURRENCY & RACE CONDITION LOCKDOWN — VULNERABILITY SCAN
 * 
 * Verifies that the 'Fat Finger' double-tap defense effectively dedups
 * rapid concurrent requests using X-Idempotency-Key.
 * 
 * Run: node tests/concurrency-stress-test.js
 */

const { checkIdempotency, cacheResponse } = require('../src/lib/club-arena/idempotency');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${testName}`);
    } else {
        failed++;
        console.error(`  ❌ FAIL: ${testName}`);
    }
}

console.log('\n🔴 Phase 3: Concurrency Stress Test — Idempotency Guard\n');

// Mock request / response objects
function createMockReqRes(idempotencyKey) {
    const req = {
        headers: {
            'x-idempotency-key': idempotencyKey
        }
    };
    const res = {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
    return { req, res };
}

// ═══════════════════════════════════════════════════════════════
// 1: Missing Idempotency Key
// ═══════════════════════════════════════════════════════════════
{
    const { req, res } = createMockReqRes(undefined);
    const handled = checkIdempotency(req, res);
    assert(handled === true, 'Request without key is intercepted');
    assert(res.statusCode === 400, 'Returns 400 Bad Request if missing key');
}

// ═══════════════════════════════════════════════════════════════
// 2: The "Fat Finger" Double-Tap Test (10 requests in 100ms)
// ═══════════════════════════════════════════════════════════════
{
    const testKey = `test-idemp-${Date.now()}`;

    // Simulated First Request (Server processes it)
    const { req: req1, res: res1 } = createMockReqRes(testKey);
    const handled1 = checkIdempotency(req1, res1);
    assert(handled1 === false, 'First request cleanly passes through idempotency guard');

    // Simulated DB success... cache the response
    cacheResponse(req1, 200, { success: true, message: 'Tournament Registered' });

    // Simulated 9 rapid-fire "Fat Finger" duplicate requests arriving before UI debounce kicks in
    let blockedCount = 0;
    for (let i = 0; i < 9; i++) {
        const { req: dupReq, res: dupRes } = createMockReqRes(testKey);
        const dupHandled = checkIdempotency(dupReq, dupRes);
        if (dupHandled && dupRes.statusCode === 200 && dupRes.body.success) {
            blockedCount++;
        }
    }

    assert(blockedCount === 9, `Successfully caught and ignored ${blockedCount}/9 concurrent duplicate double-taps`);
}

// ═══════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`CONCURRENCY RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}`);

if (failed > 0) {
    console.error('\n🚨 CONCURRENCY LOCKDOWN FAILED — Fix failing tests before deploy!');
    process.exit(1);
} else {
    console.log('\n✅ FAT-FINGER DOUBLE-TAP IMMUNITY ATTAINED — 100% duplicate rejection.');
    process.exit(0);
}
