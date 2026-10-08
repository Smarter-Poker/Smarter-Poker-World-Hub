/**
 * LAW: the welcome package is earned by verifying a phone, never at birth.
 *
 * Owner instruction (Dan, 2026-10-07): the signup form stopped collecting a
 * phone number. A new player confirms email, signs in, and is shown
 * /hub/verify-phone; verifying the handset is what pays the welcome package
 * (the 30-day VIP card and the 500 welcome diamonds). It can be skipped and
 * reached later from the hub hamburger menu.
 *
 * Why a law: the package is real money, and three separate places used to
 * pay it unconditionally the moment a profile existed (the handle_new_user
 * trigger, ensure-profile's INSERT, and ensure-profile's later-login re-ask).
 * Phone verification is the single strongest anti-multi-account control the
 * platform has, and the package has to stay behind it. A second audit on
 * 2026-10-08 also found verify-otp re-granting the VIP card on every
 * re-verification, so first-verification-only is part of the law.
 *
 * This test reads source only. The installed database was read back when the
 * migration was applied; this keeps the repository from drifting away from it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const signup = read('pages/auth/signup.js');
const ensureProfile = read('pages/api/auth/ensure-profile.js');
const verifyOtp = read('pages/api/sms/verify-otp.js');
const verifyPage = read('pages/hub/verify-phone.js');
const hubIndex = read('pages/hub/index.js');
const menus = read('src/config/hamburgerMenus.js');
const appRoot = read('pages/_app.js');
const avatarCtx = read('src/contexts/AvatarContext.jsx');

test('the signup form collects no phone number and sends none in metadata', () => {
  assert.doesNotMatch(signup, /\/api\/sms\/(send|verify)-otp/, 'signup must not verify a phone');
  assert.doesNotMatch(signup, /type="tel"/, 'signup must have no phone input');
  assert.match(signup, /phone: null,\s*\n\s*phone_verified: false,/, 'signup metadata sends phone: null, phone_verified: false');
  assert.match(signup, /\/hub\/verify-phone\?welcome=1/, 'the post-signup screen hands off to the welcome screen');
});

test('the latest handle_new_user migration grants no VIP card and mints nothing at birth', () => {
  const dir = join(root, 'supabase/migrations');
  const files = readdirSync(dir).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
  const latest = [...files].reverse().find((f) => readFileSync(join(dir, f), 'utf8').includes('FUNCTION public.handle_new_user()'));
  assert.ok(latest, 'a migration defining handle_new_user exists');
  assert.ok(latest >= '20261007220628_', `the newest handle_new_user source is ${latest}; it must be the phone-verification one or later`);
  const body = readFileSync(join(dir, latest), 'utf8');
  const fn = body.slice(body.indexOf('FUNCTION public.handle_new_user()'), body.indexOf('$function$;', body.indexOf('FUNCTION public.handle_new_user()')));
  assert.doesNotMatch(fn, /fn_ca_mint/, 'handle_new_user must not mint at birth');
  assert.match(fn, /false, NULL, NULL,/, 'the profile is born with is_vip=false, vip_tier=NULL, vip_expires_at=NULL');
  assert.doesNotMatch(fn, /is_vip\s*=\s*CASE/, 'ON CONFLICT must not re-grant VIP');
});

test('ensure-profile grants the package only behind a server-side phone verification', () => {
  assert.match(ensureProfile, /is_vip: !isDisposable && phoneVerified,/, 'VIP on INSERT requires phoneVerified');
  assert.match(ensureProfile, /if \(!phoneVerified\) return;/, 'grantWelcomeDiamonds refuses an unverified profile');
  assert.match(ensureProfile, /if \(existingProfile\.phone_verified === true\) \{/, 'the later-login re-ask is gated on phone_verified');
  assert.match(ensureProfile, /welcomePackageAlreadyPaid\(getSupabase\(\), user_id, existingProfile\.created_at\)/, 'the re-ask uses the same "already paid" answer as verify-otp');
  assert.match(ensureProfile, /\.select\('[^']*phone_verified[^']*'\)/, 'the EXISTS read selects phone_verified (it did not, once)');
  assert.match(ensureProfile, /withheldReason: 'phone_not_verified', claimAt: '\/hub\/verify-phone'/, 'the EXISTS response says the package is waiting on a phone');
  assert.match(ensureProfile, /const socialProfileCompleted = hadExplicitAlias;/, 'the social gate no longer requires a phone');
});

test('verify-otp is signed-in only, pays once, and honours the throwaway-inbox rule', () => {
  assert.match(verifyOtp, /if \(!authedUserId\) \{\s*\n\s*return res\.status\(401\)/, 'no session is a hard 401');
  assert.match(verifyOtp, /const firstVerification = profile\?\.phone_verified !== true;/, 'first verification is detected');
  assert.match(verifyOtp, /const shouldGrantVip = firstVerification\s*\n\s*&& !isDisposable/, 'the VIP card is first-verification only and never for a disposable domain');
  assert.match(verifyOtp, /p_op_id: `signup:\$\{authedUserId\}`/, 'the 500 is minted under the same idempotent op id handle_new_user used');
  assert.match(verifyOtp, /return res\.status\(503\)\.json\(\{\s*\n\s*success: false,/, 'a failed profile write fails closed');
  assert.match(verifyOtp, /packageStatus,/, 'the response reports what happened to the package');
  assert.match(verifyOtp, /welcomePackageAlreadyPaid\(supabase, authedUserId, profile\.created_at\)/, 'older accounts paid by seed:, signup_bonus or at birth are never paid a second 500');
  assert.match(verifyOtp, /\.select\('id'\);/, 'the profile write must return its row; zero rows is not "verified"');
  const lib = read('src/lib/welcomePackage.js');
  assert.match(lib, /WELCOME_PACKAGE_EARNED_SINCE = '2026-10-08T04:09:38Z'/, 'the cutover is the migration install time');
  assert.match(lib, /`seed:\$\{userId\}`/, 'seed: register rows count as paid');
  assert.match(lib, /transaction_type\.eq\.signup_bonus/, 'signup_bonus rows count as paid');
});

test('the welcome screen exists, is a hub page with the global header, and is reachable from the menu', () => {
  assert.match(verifyPage, /useRequireAuth\(/, 'the page uses the repo auth guard');
  assert.match(verifyPage, /authedFetch\('\/api\/sms\/verify-otp'/, 'the page verifies through authedFetch (bearer token)');
  assert.match(verifyPage, /\.select\('phone_verified'\)/, 'the page reads only phone_verified (profiles.phone is not browser-readable)');
  assert.doesNotMatch(verifyPage, /select\('[^']*\bphone\b[^_']/, 'the page must not select profiles.phone');
  assert.match(appRoot, /'\/hub\/verify-phone',/, '/hub/verify-phone inherits the approved global header');
  assert.match(menus, /createMenuItem\.navigation\(\s*\n\s*'Verify Phone Number',\s*\n\s*'\/hub\/verify-phone'/, 'unverified players get the menu item');
  assert.match(hubIndex, /router\.replace\('\/hub\/verify-phone\?welcome=1'\)/, 'the hub sends a young unverified player to the welcome screen');
  assert.match(hubIndex, /phone_prompt_dismissed_at/, 'the hub honours a dismissed prompt');
  assert.match(avatarCtx, /data\.welcomePackage\?\.granted === true/, 'the "500 Diamonds + VIP" popup only fires once the package was granted');
  assert.doesNotMatch(appRoot, /<PhoneVerifyGate/, 'the retired 90-day popup gate stays retired');
});
