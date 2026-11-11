import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildBusinessHubGuideEvent, captureBusinessHubGuideEvent } from '../src/lib/businessHubGuideActivity.mjs';

function client(overrides = {}) {
  const calls = [];
  const attribution = [];
  return {
    calls, attribution,
    browser: { navigator: {}, posthog: {
      has_opted_in_capturing: () => true,
      has_opted_out_capturing: () => false,
      capture: (...args) => calls.push(args),
      register_for_session: value => attribution.push(value),
      ...overrides,
    } },
  };
}

test('only fixed guide interactions and safe properties reach analytics', () => {
  const payload = buildBusinessHubGuideEvent('destination_click', {
    topic: 'training', language: 'es', source: 'business_hub', destination: 'training',
    password: 'secret', question: 'private question', url: '/auth/login?code=secret', userId: 'private', helpful: true,
  });
  assert.deepEqual(payload, { event: 'business_hub_destination_click', properties: {
    topic: 'training', language: 'es', source: 'business_hub', destination: 'training',
  } });
  assert.equal(buildBusinessHubGuideEvent('signup', {}), null);
  assert.equal(buildBusinessHubGuideEvent('destination_click', { destination: 'https://evil.example' }), null);
  assert.equal(buildBusinessHubGuideEvent('feedback', { helpful: 'yes' }), null);
  assert.deepEqual(buildBusinessHubGuideEvent('feedback', { helpful: false, topic: 'private question' }), {
    event: 'business_hub_feedback', properties: { helpful: false },
  });
});

test('missing SDK, snippet queue, absent or ambiguous consent never capture', () => {
  assert.equal(captureBusinessHubGuideEvent('guide_view', {}, undefined), false);
  assert.equal(captureBusinessHubGuideEvent('guide_view', {}, { posthog: [] }), false);
  for (const overrides of [
    { has_opted_in_capturing: undefined },
    { has_opted_in_capturing: () => false },
    { has_opted_in_capturing: () => 'true' },
    { has_opted_out_capturing: undefined },
    { has_opted_out_capturing: () => true },
    { has_opted_out_capturing: () => undefined },
  ]) {
    const c = client(overrides);
    assert.equal(captureBusinessHubGuideEvent('guide_view', {}, c.browser), false);
    assert.equal(c.calls.length, 0);
    assert.equal(c.attribution.length, 0);
  }
});

test('DNT, privacy control and consent revocation are respected on each call', () => {
  for (const field of ['navigator', 'window', 'gpc']) {
    const c = client();
    if (field === 'navigator') c.browser.navigator.doNotTrack = '1';
    if (field === 'window') c.browser.doNotTrack = 1;
    if (field === 'gpc') c.browser.navigator.globalPrivacyControl = true;
    assert.equal(captureBusinessHubGuideEvent('guide_view', {}, c.browser), false);
    assert.equal(c.calls.length, 0);
  }
  const c = client();
  assert.equal(captureBusinessHubGuideEvent('guide_view', {}, c.browser), true);
  c.browser.posthog.has_opted_out_capturing = () => true;
  assert.equal(captureBusinessHubGuideEvent('guide_view', {}, c.browser), false);
  assert.equal(c.calls.length, 1);
});

test('consented attribution is session-scoped and contains only fixed values', () => {
  const c = client();
  assert.equal(captureBusinessHubGuideEvent('feedback', {
    topic: 'bankroll', language: 'en', source: 'help', helpful: true, userId: 'private',
  }, c.browser), true);
  assert.deepEqual(c.attribution, [{ business_hub_guide_topic: 'bankroll', business_hub_guide_language: 'en', business_hub_guide_source: 'help' }]);
  assert.deepEqual(c.calls, [['business_hub_feedback', { topic: 'bankroll', language: 'en', source: 'help', helpful: true }]]);
});

test('SDK failures are isolated and no loader, opt-in action or SDK configuration exists', () => {
  for (const method of ['has_opted_in_capturing', 'has_opted_out_capturing', 'capture']) {
    const c = client({ [method]: () => { throw new Error('unavailable'); } });
    assert.equal(captureBusinessHubGuideEvent('guide_view', {}, c.browser), false);
  }
  const c = client({ register_for_session: () => { throw new Error('unavailable'); } });
  assert.equal(captureBusinessHubGuideEvent('guide_view', { language: 'en' }, c.browser), true);
  assert.equal(c.calls.length, 1);
  const source = readFileSync(new URL('../src/lib/businessHubGuideActivity.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bimport\b|\bfetch\s*\(|createElement|opt_in_capturing\s*\(|\.init\s*\(|set_config\s*\(/);
});
