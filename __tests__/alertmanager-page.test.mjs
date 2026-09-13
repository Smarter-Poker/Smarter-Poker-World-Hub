/**
 * The 3am pager: every way it could page the wrong thing, or fail to page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const routePath = resolve(here, '../pages/api/internal/alertmanager-page.js');
const src = readFileSync(routePath, 'utf8');

// The route is ESM with a default export; import it with a stubbed env.
process.env.CRON_SECRET = 'test-secret';
process.env.TWILIO_ACCOUNT_SID = 'ACtest';
process.env.TWILIO_AUTH_TOKEN = 'tok';
process.env.TWILIO_PHONE_NUMBER = '+10000000000';

const mod = await import(routePath);
const handler = mod.default;
const { renderPage } = mod;

function fakeRes() {
  const r = { statusCode: 200, body: null, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

function firing(alertname, summary, extraLabels = {}) {
  return {
    status: 'firing',
    labels: { alertname, severity: 'critical', page: 'sms', ...extraLabels },
    annotations: { summary },
  };
}

test('renders a firing page: alertname, summary, link', () => {
  const text = renderPage({
    status: 'firing',
    externalURL: 'https://engine.smarter.poker/alertmanager',
    alerts: [firing('HandsAreFailingToSettle', '44% of hands are failing to settle')],
  });
  assert.match(text, /^\[PAGE\] smarter\.poker/);
  assert.match(text, /HandsAreFailingToSettle: 44% of hands are failing to settle/);
  assert.match(text, /engine\.smarter\.poker\/alertmanager/);
});

test('renders a resolved notification so the loop closes', () => {
  const text = renderPage({
    status: 'resolved',
    alerts: [{ status: 'resolved', labels: { alertname: 'EngineDown', page: 'sms' }, annotations: {} }],
  });
  assert.match(text, /^\[RESOLVED\] smarter\.poker/);
  assert.match(text, /resolved: EngineDown/);
});

test('ignores alerts that are not labelled page=sms, even if critical', () => {
  // A routing mistake in alertmanager.yml must not become a 3am text.
  const text = renderPage({
    status: 'firing',
    alerts: [{ status: 'firing', labels: { alertname: 'MoneyAlertsGoingUnread', severity: 'warning' }, annotations: { summary: 'x' } }],
  });
  assert.equal(text, null);
});

test('caps the text so a burst cannot become a novel', () => {
  const alerts = Array.from({ length: 40 }, (_, i) => firing(`Alert${i}`, 'y'.repeat(200)));
  const text = renderPage({ status: 'firing', alerts });
  assert.ok(Array.from(text).length <= 480, `got ${Array.from(text).length} chars`);
});

test('refuses a caller without CRON_SECRET and sends nothing', async () => {
  let called = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; return { ok: true, status: 201 }; };
  try {
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer wrong' }, body: { alerts: [firing('EngineDown', 'down')] } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(called, false, 'Twilio must not be called on a bad token');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('refuses non-POST', async () => {
  const res = fakeRes();
  await handler({ method: 'GET', headers: {}, body: null }, res);
  assert.equal(res.statusCode, 405);
});

test('the route obeys the house rules: no emoji, no .single(), no hardcoded secrets', () => {
  assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji in source');
  assert.doesNotMatch(src, /\.single\(\)/);
  assert.doesNotMatch(src, /AC[0-9a-f]{32}/, 'no Twilio SID literal');
});
