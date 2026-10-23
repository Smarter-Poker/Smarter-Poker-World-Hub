/**
 * Phone verification uptake (2026-10-23, DailyDigest.phone_verification_low).
 *
 *  - A sign-up that never reached Auth (iOS "Authentication request aborted")
 *    is retried once and, if the first had landed, signed straight in.
 *  - Every new player's first screen offers the welcome package, invited or
 *    not; a sign-in returning to Club Arena is routed through the offer too.
 *  - The offer names the perks: 1 month free VIP and 500 diamonds.
 *  - Every send attempt is logged durably (no phone, no code) for the digest.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAbortedAuthRequest, signUpWithRecovery } from '../src/lib/signupOutcome.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const aborted = { data: { user: null, session: null }, error: { name: 'AuthRetryableFetchError', message: 'Authentication request aborted' } };
const payload = { email: 'player@example.invalid', password: 'Local-Only-Test-Password', options: {} };

test('an aborted auth request is recognised; ordinary refusals are not', () => {
  assert.equal(isAbortedAuthRequest(aborted.error), true);
  assert.equal(isAbortedAuthRequest({ name: 'AbortError', message: 'x' }), true);
  assert.equal(isAbortedAuthRequest({ message: 'Load failed' }), true);
  assert.equal(isAbortedAuthRequest({ code: 'user_already_exists', message: 'User already registered' }), false);
  assert.equal(isAbortedAuthRequest({ code: 'weak_password', message: 'Password is too weak' }), false);
  assert.equal(isAbortedAuthRequest(null), false);
});

test('a sign-up that succeeds first time is sent once', async () => {
  const calls = [];
  const ok = { data: { user: { id: 'u1', identities: [{}] }, session: { access_token: 't' } }, error: null };
  const out = await signUpWithRecovery({ signUp: async (p) => { calls.push(p); return ok; } }, payload);
  assert.equal(calls.length, 1);
  assert.equal(out, ok);
});

test('an aborted sign-up is retried once on a fresh request', async () => {
  const replies = [aborted, { data: { user: { id: 'u1', identities: [{}] }, session: { access_token: 't' } }, error: null }];
  let n = 0;
  const out = await signUpWithRecovery({ signUp: async () => replies[n++] }, payload);
  assert.equal(n, 2);
  assert.equal(out.data.user.id, 'u1');
});

test('an aborted sign-up that had landed signs the player in instead of refusing them', async () => {
  const signIns = [];
  const auth = {
    signUp: (() => { let n = 0; return async () => (n++ === 0 ? aborted : { data: null, error: { code: 'user_already_exists', message: 'User already registered' } }); })(),
    signInWithPassword: async (p) => { signIns.push(p); return { data: { user: { id: 'u1' }, session: { access_token: 't' } }, error: null }; },
  };
  const out = await signUpWithRecovery(auth, payload);
  assert.deepEqual(signIns, [{ email: payload.email, password: payload.password }]);
  assert.equal(out.error, null);
  assert.equal(out.recovered, true);
  assert.equal(out.data.session.access_token, 't');
});

test('signup uses the recovering sign-up and explains a dropped connection', () => {
  const signup = read('pages/auth/signup.js');
  assert.match(signup, /await signUpWithRecovery\(supabase\.auth, \{/);
  assert.doesNotMatch(signup, /await supabase\.auth\.signUp\(/);
  assert.match(signup, /isAbortedAuthRequest\(err\)/);
});

test('the post-signup screen leads with the welcome package and its perks', () => {
  const welcome = read('src/components/auth/SignupWelcome.jsx');
  assert.match(welcome, /1 Month Free VIP And 500 Diamonds/);
  assert.ok(welcome.indexOf('onClick={onVerifyPhone}') < welcome.indexOf('onClick={onContinue}'), 'Verify is the primary action, Skip the secondary');
  assert.match(welcome, /Skip For Now/);
  const console = read('src/components/gates/VerificationConsole.jsx');
  assert.match(console, /Enter The Code To Claim 1 Month Free VIP And 500 Diamonds/);
  assert.match(read('src/config/hamburgerMenus.js'), /1 Month Free VIP \+ 500 Diamonds/);
});

test('a sign-in returning to Club Arena passes through the welcome offer first', () => {
  const login = read('pages/auth/login.js');
  assert.match(login, /navigateWithFreshAuth\(await withPhoneWelcome\(getRedirectUrl\(\), data\?\.user\), router\)/);
  assert.match(login, /phone_prompt_dismissed_at\) return destination;/);
  assert.match(login, /\/hub\/verify-phone\?welcome=1&next=\$\{encodeURIComponent\(club\)\}/);
  assert.match(login, /shouldOfferPhoneWelcome\(profile\)/);
});

test('every send attempt is logged durably without the phone or the code', () => {
  const send = read('pages/api/sms/send-otp.js');
  const helper = send.slice(send.indexOf('async function logSendAttempt'), send.indexOf('/* ── Rate limit'));
  assert.match(helper, /\.from\('sms_otp_send_log'\)\.insert\(\{/);
  assert.doesNotMatch(helper, /cleanPhone|otpCode|phone:/);
  assert.match(send, /await logSendAttempt\(supabase, 'sent'\);/);
  assert.match(send, /await logSendAttempt\(supabase, 'failed', error\?\.code \?\? null\);/);
  assert.match(send, /await logSendAttempt\(supabase, 'rate_limited'\);/);
  assert.ok(send.indexOf("logSendAttempt(supabase, 'sent')") > send.indexOf('client.messages.create('), 'sent is logged only after Twilio accepted the message');
});
