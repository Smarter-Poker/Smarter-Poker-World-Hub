/**
 * A PROMO OR REFERRAL CODE ENTERED AT SIGN-UP IS NEVER DROPPED (2026-10-17).
 *
 * signup.js parked the code in localStorage and only /auth/callback redeemed
 * it, so a player who verified with the six-digit CODE (both 2026-10-17
 * referred signups did) lost it. These pins prove the shared helper redeems
 * and clears correctly, and that BOTH verification doors call it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    PENDING_PROMO_KEY,
    PENDING_REFERRAL_KEY,
    redeemPendingSignupCodes,
} from '../src/lib/pendingSignupCodes.mjs';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

function memoryStorage(seed = {}) {
    const map = new Map(Object.entries(seed));
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
        has: (k) => map.has(k),
    };
}

const fetchAnswering = (statusByUrl, calls) => async (url, init) => {
    calls.push({ url, init });
    const status = statusByUrl[url];
    if (status === 'throw') throw new Error('network down');
    return { status, ok: status >= 200 && status < 300 };
};

test('redeems a pending promo and referral with the bearer token, then clears both', async () => {
    const storage = memoryStorage({
        [PENDING_PROMO_KEY]: 'FREEROLL',
        [PENDING_REFERRAL_KEY]: JSON.stringify({ referrerId: 'kingfish-id', playerNumber: 1 }),
    });
    const calls = [];
    const out = await redeemPendingSignupCodes({
        accessToken: 'tok',
        userId: 'new-player',
        storage,
        fetchImpl: fetchAnswering({ '/api/promo/redeem-promo-code': 200, '/api/rewards/referral': 200 }, calls),
    });
    assert.equal(out.promo, '200');
    assert.equal(out.referral, '200');
    assert.equal(storage.has(PENDING_PROMO_KEY), false);
    assert.equal(storage.has(PENDING_REFERRAL_KEY), false);
    const ref = calls.find((c) => c.url === '/api/rewards/referral');
    assert.deepEqual(JSON.parse(ref.init.body), { referrerId: 'kingfish-id', refereeId: 'new-player' });
    assert.equal(ref.init.headers.Authorization, 'Bearer tok');
    // The code path navigates away straight after; the request must outlive it.
    assert.equal(ref.init.keepalive, true);
});

test('a final refusal clears the code; a network failure or 5xx keeps it for the next door', async () => {
    const storage = memoryStorage({
        [PENDING_PROMO_KEY]: 'USED',
        [PENDING_REFERRAL_KEY]: JSON.stringify({ referrerId: 'r' }),
    });
    await redeemPendingSignupCodes({
        accessToken: 't',
        userId: 'u',
        storage,
        fetchImpl: fetchAnswering({ '/api/promo/redeem-promo-code': 409, '/api/rewards/referral': 'throw' }, []),
    });
    assert.equal(storage.has(PENDING_PROMO_KEY), false, 'already-used promo is final');
    assert.equal(storage.has(PENDING_REFERRAL_KEY), true, 'a network failure must not lose the referral');

    await redeemPendingSignupCodes({
        accessToken: 't',
        userId: 'u',
        storage,
        fetchImpl: fetchAnswering({ '/api/rewards/referral': 503 }, []),
    });
    assert.equal(storage.has(PENDING_REFERRAL_KEY), true, 'a 5xx must not lose the referral');
});

test('a slow endpoint cannot hold the player on the verify screen', async () => {
    const storage = memoryStorage({ [PENDING_PROMO_KEY]: 'SLOW' });
    const started = Date.now();
    await redeemPendingSignupCodes({
        accessToken: 't',
        userId: 'u',
        storage,
        timeoutMs: 50,
        fetchImpl: () => new Promise(() => {}),
    });
    assert.ok(Date.now() - started < 1000);
});

test('nothing pending, no session, or no storage: no request and no throw', async () => {
    const calls = [];
    const f = fetchAnswering({}, calls);
    await redeemPendingSignupCodes({ accessToken: 't', userId: 'u', storage: memoryStorage(), fetchImpl: f });
    await redeemPendingSignupCodes({ accessToken: null, userId: 'u', storage: memoryStorage({ [PENDING_PROMO_KEY]: 'X' }), fetchImpl: f });
    await redeemPendingSignupCodes({ accessToken: 't', userId: 'u', storage: null, fetchImpl: f });
    assert.equal(calls.length, 0);
});

test('BOTH verification doors redeem through the helper', () => {
    const signup = read('pages/auth/signup.js');
    const callback = read('pages/auth/callback.js');
    const verify = signup.slice(signup.indexOf('const handleVerifyCode'), signup.indexOf('const handleVerifyCode') + 4000);
    assert.match(verify, /await redeemPendingSignupCodes\(/, 'the six-digit code path must redeem');
    assert.ok(
        verify.indexOf('redeemPendingSignupCodes') < verify.indexOf('window.location.replace'),
        'redeem before leaving for Club Arena'
    );
    assert.match(callback, /await redeemPendingSignupCodes\(/, 'the email-link path must redeem');
    // No second, drifting copy of the redemption logic.
    assert.doesNotMatch(callback, /\/api\/rewards\/referral/);
    assert.doesNotMatch(signup, /localStorage\.setItem\('smarter-poker-pending-/);
});

test('the verify screen offers a real Resend Code with a cooldown', () => {
    const signup = read('pages/auth/signup.js');
    assert.match(signup, /supabase\.auth\.resend\(\{\s*type: 'signup'/);
    assert.match(signup, /Resend Code In \$\{resendIn\}s/);
    assert.match(signup, /disabled=\{resending \|\| resendIn > 0\}/);
});
