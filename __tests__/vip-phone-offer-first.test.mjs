/**
 * PHONE VERIFICATION REWARD FIRST (Dan, 2026-11-27).
 *
 * "If a user hasn't already verified their phone number and received their
 * 1st month free and 500 diamonds, they should do that now (if they try to
 * use any feature or game or anything else that requires diamonds or a VIP
 * membership). If they haven't used the free one, they should be prompted to
 * do that first, or skip and sign up."
 *
 * Pins: the eligibility decision mirrors what verify-otp pays, unknown is
 * never eligible, every VIP / Diamond prompt shows the phone step first, Skip
 * reveals the existing prompt, and the verify page returns the member to
 * where they were (same-origin /hub paths only).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PHONE_VERIFY_PATH,
  PHONE_WELCOME_DIAMONDS,
  PHONE_WELCOME_VIP_DAYS,
  decidePhoneWelcomeOffer,
  parsePhoneWelcomeOffer,
  phoneOfferCopy,
  phoneVerifyHref,
  readPhoneOfferSkipped,
  rememberPhoneOfferSkipped,
  safeHubReturnPath,
} from '../src/lib/store/phoneWelcomeOfferTerms.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');
const NOW = new Date('2026-11-27T12:00:00Z');
const unverified = { phone_verified: false, is_vip: false, vip_tier: null, vip_expires_at: null, created_at: '2026-11-01T00:00:00Z' };
const facts = (over = {}) => ({ profile: unverified, email: 'p@example.com', disposable: false, paid: { paid: false }, now: NOW, ...over });

test('an unverified non-VIP account that was never paid is offered the free month and 500 diamonds', () => {
  assert.deepEqual(decidePhoneWelcomeOffer(facts()), { eligible: true, reason: null, vipDays: 30, diamonds: 500 });
});

test('an account already paid the welcome diamonds is still offered the free month, without the diamonds', () => {
  assert.deepEqual(decidePhoneWelcomeOffer(facts({ paid: { paid: true, reason: 'paid_at_birth' } })), { eligible: true, reason: null, vipDays: 30, diamonds: 0 });
});

test('verified, VIP, lifetime and temporary-email accounts are not offered it', () => {
  assert.equal(decidePhoneWelcomeOffer(facts({ profile: { ...unverified, phone_verified: true } })).reason, 'already_verified');
  assert.equal(decidePhoneWelcomeOffer(facts({ profile: { ...unverified, is_vip: true, vip_expires_at: '2026-12-20T00:00:00Z' } })).reason, 'vip_active');
  assert.equal(decidePhoneWelcomeOffer(facts({ profile: { ...unverified, is_vip: true, vip_tier: 'lifetime' } })).reason, 'lifetime');
  assert.equal(decidePhoneWelcomeOffer(facts({ disposable: true })).reason, 'disposable_email');
});

test('a lapsed VIP card does not block the offer (verify-otp grants the month again)', () => {
  const lapsed = { ...unverified, is_vip: true, vip_tier: 'monthly', vip_expires_at: '2026-11-01T00:00:00Z' };
  assert.equal(decidePhoneWelcomeOffer(facts({ profile: lapsed })).eligible, true);
});

test('anything unknown fails closed: never eligible', () => {
  for (const over of [
    { profile: null },
    { profile: { ...unverified, phone_verified: null } },
    { email: '' },
    { disposable: undefined },
    { paid: null },
    { paid: { paid: true, reason: 'unknown' } },
  ]) {
    const answer = decidePhoneWelcomeOffer(facts(over));
    assert.equal(answer.eligible, false, JSON.stringify(over));
  }
});

test('the client reads only an explicit eligible answer from a successful response', () => {
  const body = { success: true, phoneOffer: { eligible: true, reason: null, vipDays: 30, diamonds: 500 } };
  assert.deepEqual(parsePhoneWelcomeOffer(true, body), { eligible: true, reason: null, vipDays: 30, diamonds: 500 });
  assert.equal(parsePhoneWelcomeOffer(false, body).eligible, false);
  assert.equal(parsePhoneWelcomeOffer(true, { success: false, phoneOffer: body.phoneOffer }).eligible, false);
  assert.equal(parsePhoneWelcomeOffer(true, { success: true }).eligible, false);
  assert.equal(parsePhoneWelcomeOffer(true, { success: true, phoneOffer: { eligible: 'yes' } }).eligible, false);
  assert.equal(parsePhoneWelcomeOffer(true, null).eligible, false);
  assert.equal(parsePhoneWelcomeOffer(true, { success: true, phoneOffer: { eligible: true, diamonds: -5 } }).diamonds, 0);
});

test('the return path is a same-origin hub path only', () => {
  assert.equal(safeHubReturnPath('/hub/trivia/endless'), '/hub/trivia/endless');
  assert.equal(safeHubReturnPath('/hub/diamond-store?tab=vip#vip-plans'), '/hub/diamond-store?tab=vip#vip-plans');
  assert.equal(safeHubReturnPath('/hub'), '/hub');
  for (const bad of ['https://evil.example/hub', '//evil.example/hub', '/hubx', '/auth/login', '/hub/../admin', '/hub/%2e%2e/admin', '/hub\\x', '/hub/verify-phone', null, 7]) {
    assert.equal(safeHubReturnPath(bad), null, String(bad));
  }
  assert.equal(phoneVerifyHref('/hub/trivia/endless'), `${PHONE_VERIFY_PATH}?next=%2Fhub%2Ftrivia%2Fendless`);
  assert.equal(phoneVerifyHref('https://evil.example'), PHONE_VERIFY_PATH);
});

test('the words are Title Case with no em dash, and the diamonds line appears only when owed', () => {
  const owed = phoneOfferCopy({ vipDays: 30, diamonds: 500 });
  assert.equal(owed.title, 'Claim Your Free VIP Month');
  assert.equal(owed.amount, 'Free');
  assert.equal(owed.unit, 'First Month');
  assert.equal(owed.bonus, '+500 Diamonds');
  assert.equal(owed.cta, 'Verify Phone Number');
  assert.equal(owed.skip, 'Skip');
  assert.equal(phoneOfferCopy({ vipDays: 30, diamonds: 0 }).bonus, null);
  for (const value of Object.values(owed).filter(Boolean)) {
    assert.ok(!value.includes('—'), value);
    for (const word of value.split(/\s+/)) {
      if (/^[a-z]/.test(word)) assert.fail(`not Title Case: "${word}" in "${value}"`);
    }
  }
});

test('Skip is remembered per account for the session only', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readPhoneOfferSkipped(storage, 'a'), false);
  rememberPhoneOfferSkipped(storage, 'a');
  assert.equal(readPhoneOfferSkipped(storage, 'a'), true);
  assert.equal(readPhoneOfferSkipped(storage, 'b'), false);
  assert.equal(readPhoneOfferSkipped(null, 'a'), false);
});

test('the figures match what verify-otp actually pays', async () => {
  const otp = await read('pages/api/sms/verify-otp.js');
  assert.match(otp, new RegExp(`PHONE_VIP_TRIAL_DAYS\\s*=\\s*${PHONE_WELCOME_VIP_DAYS}\\b`));
  assert.match(otp, new RegExp(`p_amount:\\s*${PHONE_WELCOME_DIAMONDS},`));
  assert.match(otp, /firstVerification = profile\?\.phone_verified !== true/);
  assert.match(otp, /welcomePackageAlreadyPaid/);
});

test('the membership status route publishes phoneOffer from the shared decision', async () => {
  const route = await read('pages/api/store/vip-membership-status.js');
  assert.match(route, /select\('is_vip, vip_tier, vip_expires_at, phone_verified, created_at'\)/);
  assert.match(route, /resolvePhoneWelcomeOffer\(getSupabase\(\), user, profile\)/);
  assert.match(route, /phoneOffer = \{ eligible: false, reason: 'unknown' \}/);
  assert.match(route, /success: true,\s*phoneOffer,/);
  const adapter = await read('src/lib/store/phoneWelcomeOffer.js');
  assert.match(adapter, /decidePhoneWelcomeOffer/);
  assert.match(adapter, /welcomePackageAlreadyPaid/);
  assert.match(adapter, /catch \(_error\) \{\s*return \{ eligible: false, reason: 'unknown' \};/);
});

test('every VIP and Diamond prompt shows the phone step first', async () => {
  const kit = await read('src/components/vip/VipKit.jsx');
  const prompt = kit.slice(kit.indexOf('export function VipUpgradePrompt'));
  assert.ok(prompt.indexOf('usePhoneOfferStep(') > 0 && prompt.indexOf('usePhoneOfferStep(') < prompt.indexOf('data-vip-upgrade-prompt'),
    'VipUpgradePrompt asks for the phone step before rendering the VIP price');
  assert.match(kit, /data-vip-phone-offer="verify"/);
  assert.match(kit, /data-vip-phone-offer="skip"/);

  const wired = {
    'src/components/gates/OutOfDiamondsModal.jsx': /phoneStep\.show/,
    'src/components/gates/GameCostPopup.jsx': /phoneStep\.show/,
    'src/components/trivia/StrategyTrivia.jsx': /<VipUpgradePrompt/,
    'pages/hub/memory-games.js': /<VipPhoneOfferGate/,
    'pages/hub/diamond-store.js': /<VipPhoneOfferGate/,
  };
  for (const [path, pattern] of Object.entries(wired)) {
    assert.match(await read(path), pattern, path);
  }
  // Pages that render the shared VipUpgradePrompt inherit the step.
  for (const path of [
    // The Bankroll Manager's dashboard view (2026-11-28 page split).
    'src/components/bankroll/sections/DashboardSection.jsx',
    'pages/hub/settings.js',
    'pages/hub/trivia/[mode].js',
    'pages/hub/trivia/endless.js',
    'pages/hub/trivia/mixed.js',
    'pages/hub/trivia/survival-game.js',
    'pages/hub/trivia/time-attack.js',
  ]) {
    assert.match(await read(path), /<VipUpgradePrompt/, path);
  }
});

test('the verify page returns the member to the hub page they came from', async () => {
  // The page's own ?next= path (same-origin, relative only) carries the return.
  const page = await read('pages/hub/verify-phone.js');
  assert.match(page, /router\.query\.next/);
  assert.match(page, /const nextPath = queryNext \|\| pendingNext;/);
});
