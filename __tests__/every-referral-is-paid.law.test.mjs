/**
 * EVERY REFERRAL IS RECORDED AND PAID WHEN THE NEW PLAYER CONFIRMS (2026-10-17).
 *
 * Dan: "YES PAY OUT DIAMONDS FOR ALL REFERRALS". Until then no referral had
 * ever been recorded: public.referrals held zero rows, because the sign-up
 * referrer lived only in the browser and the reward endpoint read a table
 * nothing wrote, then withheld payment behind a phone, seven days and five
 * login days. These pins keep the referrer travelling with the account, the
 * database settling it on confirmation, and the gate gone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refFromRedirect } from '../src/lib/pendingSignupCodes.mjs';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const MIGRATION = 'supabase/migrations/20261017180200_a_referral_is_recorded_and_paid_when_the_new_player_confirms.sql';

test('a Club Arena invite carries its referrer inside ?redirect=', () => {
    assert.equal(refFromRedirect('/hub/club-arena/invite/a41434bb-8d0c-400a-8f0d-e8b3d65afed4?ref=1'), '1');
    assert.equal(refFromRedirect(['/hub/club-arena/invite/x?ref=0042&i=ZG9YGMZ']), '42');
    assert.equal(refFromRedirect('/hub/club-arena/invite/x?i=ZG9YGMZ'), null);
    assert.equal(refFromRedirect('/hub/club-arena/invite/x?ref=abc'), null);
    assert.equal(refFromRedirect('/hub/club-arena/invite/x?ref=0'), null);
    assert.equal(refFromRedirect(undefined), null);
});

test('the sign-up page records the referrer on the account itself', () => {
    const signup = read('pages/auth/signup.js');
    assert.match(signup, /refFromRedirect\(router\.query\.redirect\)/, 'the invite link referrer must be read');
    assert.match(signup, /referral_player_number: String\(referralDetails\.playerNumber\)/,
        'the referrer must travel in the sign-up metadata, not only in this browser');
});

test('the database settles a referral when the email is confirmed, without ever blocking the sign-up', () => {
    const sql = read(MIGRATION);
    assert.match(sql, /AFTER UPDATE OF email_confirmed_at ON auth\.users[\s\S]*OLD\.email_confirmed_at IS NULL AND NEW\.email_confirmed_at IS NOT NULL/);
    assert.match(sql, /AFTER INSERT ON auth\.users[\s\S]*NEW\.email_confirmed_at IS NOT NULL/);
    assert.match(sql, /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/, 'a referral failure must never fail a confirmation');
    // The idempotent award path, with the reference ids every door has always used.
    assert.match(sql, /'referral_qualified_' \|\| v_referrer \|\| '_' \|\| p_referee/);
    assert.match(sql, /'referral_referee_' \|\| p_referee \|\| '_' \|\| v_referrer/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.fn_settle_signup_referral\(uuid\) FROM PUBLIC, anon, authenticated/);
});

test('the reward endpoint pays through the same function and has no qualification gate', () => {
    const api = read('pages/api/rewards/referral.js');
    assert.match(api, /rpc\('fn_settle_signup_referral'/);
    for (const gate of [/MIN_LOGIN_DAYS/, /MIN_REFEREE_AGE_DAYS/, /MAX_QUALIFIED_PER_MONTH/, /phone_verified/]) {
        assert.doesNotMatch(api, gate, `the old ${gate} gate is back`);
    }
    const tracker = read('src/components/diamonds/DiamondRewardTracker.tsx');
    assert.doesNotMatch(tracker, /5 Separate Days|5 separate days/, 'players must not be told about a gate that no longer exists');
});
