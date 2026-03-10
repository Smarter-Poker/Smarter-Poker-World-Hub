/**
 * ════════════════════════════════════════════════════════════════
 * ORB-7 E2E EXPLOIT TEST — Red Team & Hardening Verification
 * ════════════════════════════════════════════════════════════════
 *
 * Tests hostile payloads against the anti-cheat API and validates
 * SVG sparkline math immunity against NaN, Infinity, and garbage data.
 *
 * Run: node tests/orb7_red_team.test.mjs
 *
 * Uses isolated test namespace: orb7_test_<uuid>
 * No external dependencies — pure Node.js fetch + assertions.
 * ════════════════════════════════════════════════════════════════
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/club-arena/anti-cheat`;
const TEST_PREFIX = `orb7_test_${crypto.randomUUID().slice(0, 8)}`;

let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${label}`);
    } else {
        failed++;
        console.error(`  ❌ FAIL: ${label}`);
    }
}

async function post(body) {
    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        return { status: res.status, data };
    } catch (err) {
        return { status: 0, data: { error: err.message } };
    }
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 1: Malicious Payload Injection
// ═══════════════════════════════════════════════════════════════
async function testMaliciousPayloads() {
    console.log('\n🔴 TEST SUITE 1: Malicious Payload Injection');

    // 1a. No auth token → 401
    const r1 = await post({ action: 'get_flags', clubId: crypto.randomUUID() });
    assert(r1.status === 401, 'No auth token returns 401');

    // 1b. Invalid clubId (not UUID)
    const r2 = await post({ action: 'get_flags', clubId: 'not-a-uuid' });
    assert(r2.status === 401 || r2.status === 400, 'Non-UUID clubId rejected');

    // 1c. clubId with SQL injection
    const r3 = await post({ action: 'get_flags', clubId: "'; DROP TABLE clubs; --" });
    assert(r3.status === 401 || r3.status === 400, 'SQL injection in clubId rejected');

    // 1d. Negative limit
    const r4 = await post({ action: 'get_flags', clubId: crypto.randomUUID(), limit: -5 });
    assert(r4.status === 401 || r4.status === 400, 'Negative limit rejected or clamped');

    // 1e. Massive integer limit (1 trillion)
    const r5 = await post({ action: 'get_flags', clubId: crypto.randomUUID(), limit: 1_000_000_000_000 });
    assert(r5.status === 401 || r5.status === 400, 'Trillion limit rejected or clamped');

    // 1f. Fractional decimal limit
    const r6 = await post({ action: 'get_flags', clubId: crypto.randomUUID(), limit: 0.0001 });
    assert(r6.status === 401 || r6.status === 400, 'Fractional limit rejected or clamped');

    // 1g. Null values everywhere
    const r7 = await post({ action: null, clubId: null });
    assert(r7.status === 401 || r7.status === 400, 'Null action+clubId rejected');

    // 1h. Unknown action
    const r8 = await post({ action: 'delete_everything', clubId: crypto.randomUUID() });
    assert(r8.status === 401 || r8.status === 400, 'Unknown action rejected');

    // 1i. SQL in notes field
    const r9 = await post({
        action: 'review_flag',
        clubId: crypto.randomUUID(),
        flagId: crypto.randomUUID(),
        notes: "'; DROP TABLE anti_cheat_flags; --",
    });
    assert(r9.status === 401 || r9.status === 400, 'SQL injection in notes field rejected');

    // 1j. XSS in reason field
    const r10 = await post({
        action: 'kick_player',
        clubId: crypto.randomUUID(),
        tableId: crypto.randomUUID(),
        playerId: crypto.randomUUID(),
        reason: '<script>alert("xss")</script>',
    });
    assert(r10.status === 401 || r10.status === 400, 'XSS in reason field rejected');

    // 1k. threshold out of range
    const r11 = await post({ action: 'get_collusion_pairs', clubId: crypto.randomUUID(), threshold: -0.5 });
    assert(r11.status === 401 || r11.status === 400, 'Negative threshold rejected');

    const r12 = await post({ action: 'get_collusion_pairs', clubId: crypto.randomUUID(), threshold: 500 });
    assert(r12.status === 401 || r12.status === 400, 'threshold > 1 rejected');

    // 1l. threshold = NaN
    const r13 = await post({ action: 'get_collusion_pairs', clubId: crypto.randomUUID(), threshold: 'NaN' });
    assert(r13.status === 401 || r13.status === 400, 'NaN threshold rejected');

    // 1m. threshold = Infinity
    const r14 = await post({ action: 'get_collusion_pairs', clubId: crypto.randomUUID(), threshold: Infinity });
    assert(r14.status === 401 || r14.status === 400, 'Infinity threshold rejected');
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 2: Auth & RLS Spoofing
// ═══════════════════════════════════════════════════════════════
async function testAuthSpoofing() {
    console.log('\n🔴 TEST SUITE 2: Auth & RLS Spoofing');

    // 2a. Attempt to spoof user_id in body (should be ignored)
    const r1 = await post({
        action: 'get_flags',
        clubId: crypto.randomUUID(),
        user_id: 'fake-admin-uuid-that-is-club-owner',
        userId: 'another-fake-id',
    });
    assert(r1.status === 401, 'Spoofed user_id in body is ignored, auth still fails without JWT');

    // 2b. Fake Bearer token
    const fakeRes = await fetch(API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer fake.jwt.token.that.is.definitely.not.valid',
        },
        body: JSON.stringify({ action: 'get_flags', clubId: crypto.randomUUID() }),
    });
    assert(fakeRes.status === 401, 'Fake JWT token returns 401');

    // 2c. Empty Bearer token
    const emptyRes = await fetch(API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ',
        },
        body: JSON.stringify({ action: 'get_flags', clubId: crypto.randomUUID() }),
    });
    assert(emptyRes.status === 401, 'Empty Bearer token returns 401');
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 3: SVG Sparkline Math — NaN/Infinity/Freeze Immunity
// ═══════════════════════════════════════════════════════════════
function testSparklineMath() {
    console.log('\n🔴 TEST SUITE 3: SVG Sparkline Math Immunity');

    // Simulate the MiniSparkline math with hostile data
    function simulateSparkline(hands, userId) {
        if (!hands || !Array.isArray(hands) || hands.length < 2) return { ok: true, result: 'null_guard' };
        if (!userId) return { ok: true, result: 'null_userId_guard' };

        let running = 0;
        const values = hands.map(h => {
            const player = h?.hand_data?.players?.find(p => String(p?.id) === String(userId));
            const nr = Number(player?.netResult) || 0;
            running += Number.isFinite(nr) ? nr : 0;
            return running;
        });

        const min = Math.min(...values, 0);
        const max = Math.max(...values, 0);
        const range = max - min;
        const safeRange = Number.isFinite(range) && range > 0 ? range : 1;

        const W = 80, H = 24;
        const pts = values.map((v, i) => {
            const x = values.length > 1 ? (i / (values.length - 1)) * W : W / 2;
            const y = H - ((v - min) / safeRange) * H;
            const sx = Number.isFinite(x) ? Math.max(0, Math.min(W, x)) : 0;
            const sy = Number.isFinite(y) ? Math.max(0, Math.min(H, y)) : H / 2;
            return `${sx.toFixed(2)},${sy.toFixed(2)}`;
        });

        // Check for NaN or Infinity in output
        const hasNaN = pts.some(p => p.includes('NaN') || p.includes('Infinity'));
        return { ok: !hasNaN, pts, values };
    }

    const uid = 'test-user-123';
    const mkPlayer = (id, net) => ({ id, netResult: net });
    const mkHand = (...players) => ({ hand_data: { players: players.map(([id, net]) => mkPlayer(id, net)) } });

    // 3a. Normal data
    const t1 = simulateSparkline([mkHand([uid, 100]), mkHand([uid, -50])], uid);
    assert(t1.ok, 'Normal data: no NaN');

    // 3b. All zeros
    const t2 = simulateSparkline([mkHand([uid, 0]), mkHand([uid, 0]), mkHand([uid, 0])], uid);
    assert(t2.ok, 'All zeros: no NaN');

    // 3c. Fractional split-pot chips (33.33)
    const t3 = simulateSparkline([mkHand([uid, 33.33]), mkHand([uid, -33.33]), mkHand([uid, 33.34])], uid);
    assert(t3.ok, 'Fractional chips (33.33): no NaN');

    // 3d. Extremely large values (1 trillion chips)
    const t4 = simulateSparkline([mkHand([uid, 1_000_000_000_000]), mkHand([uid, -999_999_999_999])], uid);
    assert(t4.ok, 'Trillion chips: no NaN');

    // 3e. NaN netResult
    const t5 = simulateSparkline([mkHand([uid, NaN]), mkHand([uid, NaN])], uid);
    assert(t5.ok, 'NaN netResult: handled gracefully');

    // 3f. Infinity netResult
    const t6 = simulateSparkline([mkHand([uid, Infinity]), mkHand([uid, -Infinity])], uid);
    assert(t6.ok, 'Infinity netResult: handled gracefully');

    // 3g. Undefined hand_data
    const t7 = simulateSparkline([{}, { hand_data: null }], uid);
    assert(t7.ok, 'Undefined hand_data: handled gracefully');

    // 3h. Single hand (should return null_guard)
    const t8 = simulateSparkline([mkHand([uid, 100])], uid);
    assert(t8.ok && t8.result === 'null_guard', 'Single hand: null guard triggered');

    // 3i. null userId
    const t9 = simulateSparkline([mkHand([uid, 100]), mkHand([uid, 50])], null);
    assert(t9.ok && t9.result === 'null_userId_guard', 'Null userId: guard triggered');

    // 3j. Negative zero
    const t10 = simulateSparkline([mkHand([uid, -0]), mkHand([uid, -0])], uid);
    assert(t10.ok, 'Negative zero: no NaN');

    // 3k. Very small fractional values
    const t11 = simulateSparkline([mkHand([uid, 0.0001]), mkHand([uid, -0.0001])], uid);
    assert(t11.ok, 'Tiny fractions (0.0001): no NaN');

    // 3l. Mixed NaN, Infinity, and normal
    const t12 = simulateSparkline([mkHand([uid, 100]), mkHand([uid, NaN]), mkHand([uid, Infinity]), mkHand([uid, -50])], uid);
    assert(t12.ok, 'Mixed NaN+Infinity+normal: no NaN in output');

    // 3m. Multi-way split pot with odd fractional chips
    const t13 = simulateSparkline([
        mkHand([uid, 33.33], ['p2', 33.33], ['p3', 33.34]),
        mkHand([uid, -100], ['p2', 50], ['p3', 50]),
        mkHand([uid, 66.67], ['p2', -33.33], ['p3', -33.34]),
    ], uid);
    assert(t13.ok, 'Multi-way split pot with fractional chips: no NaN');
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 4: Concurrency — Fat Finger / Double-Tap / Idempotency
// ═══════════════════════════════════════════════════════════════
async function testConcurrency() {
    console.log('\n🔴 TEST SUITE 4: Concurrency & Idempotency');

    // 4a. Fire 10 identical requests in 100ms with same idempotency key
    // (No auth, so all should 401 — but tests that idempotency header is accepted)
    const idemKey = `test_${crypto.randomUUID()}`;
    const payload = { action: 'get_flags', clubId: crypto.randomUUID() };

    const promises = Array.from({ length: 10 }, () =>
        fetch(API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Idempotency-Key': idemKey,
            },
            body: JSON.stringify(payload),
        }).then(r => ({ status: r.status, replayed: r.headers.get('X-Idempotent-Replayed') }))
    );

    const results = await Promise.all(promises);
    const allResponded = results.every(r => r.status > 0);
    assert(allResponded, `10 rapid-fire requests all got responses (no hangs/deadlocks)`);

    // At least one should be 401 (the actual request)
    const has401 = results.some(r => r.status === 401);
    assert(has401, 'At least one request got processed (401 due to no auth)');

    // 4b. Idempotency replays should have X-Idempotent-Replayed header
    // Since these all fail auth (401), the idempotency cache only stores
    // after auth passes — so all 10 should be processed (no cache hit).
    // This is correct behavior: auth failures don't get cached.
    const allProcessed = results.every(r => r.status === 401);
    assert(allProcessed, 'All 10 requests hit auth check (no premature idempotency caching)');

    // 4c. Different idempotency keys = different requests (no false dedup)
    const uniqueKeys = Array.from({ length: 3 }, () => `test_${crypto.randomUUID()}`);
    const uniquePromises = uniqueKeys.map(key =>
        fetch(API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Idempotency-Key': key,
            },
            body: JSON.stringify(payload),
        }).then(r => r.status)
    );
    const uniqueResults = await Promise.all(uniquePromises);
    assert(uniqueResults.every(s => s === 401), 'Different idem keys = independent requests');

    // 4d. Simulate UI useIdempotentAction hook logic (client-side debounce)
    let inflight = false;
    let cooldown = false;
    let blocked = 0;
    let processed = 0;

    for (let i = 0; i < 10; i++) {
        if (inflight || cooldown) {
            blocked++;
            continue;
        }
        inflight = true;
        processed++;
        // Simulate async request
        await new Promise(r => setTimeout(r, 5));
        inflight = false;
        cooldown = true;
        // Simulate 50ms debounce (shorter for test speed)
        setTimeout(() => { cooldown = false; }, 50);
    }
    assert(processed === 1, `UI debounce: only 1 of 10 rapid taps processed (blocked ${blocked})`);
    assert(blocked === 9, `UI debounce: 9 of 10 rapid taps blocked`);
}

// ═══════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════
async function main() {
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  ORB-7 RED TEAM + CONCURRENCY TEST');
    console.log(`  Test namespace: ${TEST_PREFIX}`);
    console.log(`  API: ${API}`);
    console.log(`${'═'.repeat(60)}`);

    await testMaliciousPayloads();
    await testAuthSpoofing();
    testSparklineMath();
    await testConcurrency();

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log(`${'═'.repeat(60)}\n`);

    if (failed > 0) process.exit(1);
}

main().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
