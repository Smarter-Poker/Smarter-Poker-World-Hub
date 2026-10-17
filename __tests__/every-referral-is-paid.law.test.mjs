/**
 * EVERY REFERRAL IS RECORDED AND PAID WHEN THE NEW PLAYER CONFIRMS (2026-10-17).
 *
 * Dan: "YES PAY OUT DIAMONDS FOR ALL REFERRALS". Until then no referral had
 * ever been recorded: public.referrals held zero rows, because the sign-up
 * referrer lived only in the browser, every Referral Crew link pointed at a
 * homepage that dropped ?ref=, and the reward endpoint read a table nothing
 * wrote, then withheld payment behind a phone, seven days and five login days.
 *
 * The settlement itself (fn_settle_signup_referral, its triggers and the
 * backfill) lives in the shared database's migration in the Club Arena repo,
 * 20261017223126_a_referral_is_recorded_and_paid_when_the_new_player_confirms,
 * pinned there by tests/every-referral-is-paid.law.test.ts. These pins keep
 * every World Hub door feeding it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    isReferralInput,
    referralMetadata,
    refFromRedirect,
    signupHrefFor,
} from '../src/lib/pendingSignupCodes.mjs';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('a referral is a player number or a Referral Crew code, never a promo code', () => {
    for (const ok of ['1', '42', '0042', 'SP-56737B', 'sp-56737b', 'KINGFISH-AB12']) assert.equal(isReferralInput(ok), true, ok);
    for (const no of ['', '0', 'WELCOME500', 'LAUNCH2026', 'VIP30', 'A B-C', '1234567890']) assert.equal(isReferralInput(no), false, no);
});

test('the sign-up record carries the referral in the form the database resolves', () => {
    assert.deepEqual(referralMetadata('0042'), { referral_player_number: '42' });
    assert.deepEqual(referralMetadata('sp-56737b'), { referral_code: 'SP-56737B' });
    assert.deepEqual(referralMetadata('SP-56737B', { playerNumber: '7' }), {
        referral_code: 'SP-56737B',
        referral_player_number: '7',
    });
    assert.deepEqual(referralMetadata('WELCOME500', { playerNumber: '7' }), {}, 'a promo code is never a referral');
});

test('a Club Arena invite carries its referrer inside ?redirect=', () => {
    assert.equal(refFromRedirect('/hub/club-arena/invite/a41434bb-8d0c-400a-8f0d-e8b3d65afed4?ref=1'), '1');
    assert.equal(refFromRedirect(['/hub/club-arena/invite/x?ref=0042&i=ZG9YGMZ']), '42');
    assert.equal(refFromRedirect('/hub/club-arena/invite/x?i=ZG9YGMZ'), null);
    assert.equal(refFromRedirect('/hub/club-arena/invite/x?ref=abc'), null);
    assert.equal(refFromRedirect(undefined), null);
});

test('a shared link survives the homepage', () => {
    assert.equal(signupHrefFor('SP-56737B'), '/auth/signup?ref=SP-56737B');
    assert.equal(signupHrefFor(['42']), '/auth/signup?ref=42');
    assert.equal(signupHrefFor('<script>'), '/auth/signup');
    assert.equal(signupHrefFor(undefined), '/auth/signup');
    const home = read('pages/index.js');
    assert.match(home, /signupHrefFor\(router\.query\.ref\)/);
    assert.match(home, /<Link href=\{signupHref\}/);
    assert.doesNotMatch(home, /router\.push\('\/auth\/signup'\)/, 'every Sign Up door on the homepage keeps the ref');
});

test('the sign-up page records the referrer on the account itself, even on a fast tap', () => {
    const signup = read('pages/auth/signup.js');
    assert.match(signup, /refFromRedirect\(router\.query\.redirect\)/, 'the invite link referrer must be read');
    assert.match(signup, /\.\.\.referralMetadata\(formData\.promoCode, referralDetails\)/,
        'the referrer travels in the sign-up metadata, written from what was entered');
    assert.match(signup, /isReferralInput\(formData\.promoCode\)/);
    // Player 1 to 99 used to be skipped by a three-character minimum.
    assert.match(signup, /formData\.promoCode\.length < 3 && !isReferralInput\(formData\.promoCode\)/);
    // A 4xx carries the reason; only a 5xx is an unknown.
    assert.doesNotMatch(signup, /if \(!res\.ok\) throw new Error\(`Request failed/);
});

test('every World Hub referral door settles through the one database function', () => {
    const rewards = read('pages/api/rewards/referral.js');
    assert.match(rewards, /rpc\('fn_settle_signup_referral'/);
    for (const gate of [/MIN_LOGIN_DAYS/, /MIN_REFEREE_AGE_DAYS/, /MAX_QUALIFIED_PER_MONTH/, /phone_verified/]) {
        assert.doesNotMatch(rewards, gate, `the old ${gate} gate is back`);
    }
    const crew = read('pages/api/social/referral.js');
    assert.match(crew, /rpc\('fn_settle_signup_referral'/);
    assert.doesNotMatch(crew, /add_diamonds_to_balance/, 'no second payout path with its own amounts');
    assert.doesNotMatch(crew, /[`'"]https:\/\/smarter\.poker\/\?ref=/, 'a share link must not point at the homepage root');
    assert.match(crew, /https:\/\/smarter\.poker\/auth\/signup\?ref=/);
    assert.match(crew, /'referral_qualified', 'referral_bonus'/, 'earnings count the type referrals now pay under');
    const growth = read('src/components/social/ViralGrowthModule.js');
    assert.doesNotMatch(growth, /[`'"]https:\/\/smarter\.poker\/\?ref=/);
    assert.doesNotMatch(growth, /\.select\([^)]*referee:referee_id\(/, 'referee_id points at auth.users; the list comes from the API');
    const validate = read('pages/api/promo/validate-referral-code.js');
    assert.match(validate, /eq\('referral_code', raw\)/, 'a Referral Crew code validates on the sign-up form');
});

test('players are told the rule that is actually paid', () => {
    const tracker = read('src/components/diamonds/DiamondRewardTracker.tsx');
    assert.doesNotMatch(tracker, /5 Separate Days|5 separate days/);
    const crewCard = read('src/components/social/ReferralCrewCard.js');
    assert.doesNotMatch(crewCard, /bonusPerReferral \|\| 100\}/);
    const growth = read('src/components/social/ViralGrowthModule.js');
    assert.doesNotMatch(growth, /Both You And Your Friend Earn 500/);
});
