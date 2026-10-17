import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldOfferPhoneWelcome } from '../src/lib/phoneWelcome.js';
test('verified users and VIP card holders never receive phone onboarding', () => {
  for (const profile of [null, {}, {phone_verified:true}, {phone_verified:false,is_vip:true}, {phone_verified:false,vip_tier:'monthly'}, {phone_verified:false,vip_tier:'lifetime'}]) {
    assert.equal(shouldOfferPhoneWelcome(profile), false);
  }
  assert.equal(shouldOfferPhoneWelcome({phone_verified:false,is_vip:false,vip_tier:null}), true);
});

import { readFileSync } from 'node:fs';
test('eligibility changes close the nudge and stale reads cannot restore it', () => {
  const nudge = readFileSync(new URL('../src/components/hub/WelcomePackageNudge.jsx', import.meta.url), 'utf8');
  const hub = readFileSync(new URL('../pages/hub/index.js', import.meta.url), 'utf8');
  assert.match(nudge, /if \(!open \|\| eligible !== true \|\| !userId\) return null/);
  assert.match(nudge, /\[eligible, userId\]/);
  assert.match(hub, /request !== generation/);
  assert.match(hub, /addEventListener\('profile-updated', checkPhoneWelcome\)/);
  assert.match(hub, /shouldOfferPhoneWelcome\(profile\)/);
});
