/**
 * A push-health read failure is never reported as "[object Object]"
 * (Production Alerts incident 283044, 2026-10-27 and 283xxx 2026-10-28).
 *
 * push-health counts push_outbox and push_subscriptions with
 * `{ count: 'exact', head: true }`. A HEAD request that fails has no body, so
 * postgrest-js (2.112.4, processResponse) returns its error as
 * `{ message: '' }`. errorText used `String(error?.message || error)`, the
 * empty message fell through to String(object), and the store row and the
 * admins' line both read "push-health could not observe PushDeliveryFailing:
 * [object Object]" - a failed observation with every detail lost.
 *
 * These cases fail on the pre-fix code (errorText was not exported, and the
 * observation evidence carried "[object Object]") and pass after it.
 *
 * Run: node --test __tests__/push-health-error-text.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as alerts from '../src/lib/push/pushHealthOperationalAlerts.mjs';

const { CONDITION, pushHealthObservations } = alerts;
// What postgrest-js returns for a failed HEAD count read: no body, no message.
const EMPTY_HEAD_ERROR = Object.freeze({ message: '' });

test('errorText is exported so every push-health failure path shares one rendering', () => {
  assert.equal(typeof alerts.errorText, 'function', 'errorText must be exported from the owning module');
});

test('an empty-bodied postgrest error is described, not stringified to [object Object]', () => {
  const text = alerts.errorText(EMPTY_HEAD_ERROR);
  assert.doesNotMatch(text, /\[object Object\]/);
  assert.match(text, /no message/);
});

test('a postgrest error keeps its message, code, details and hint', () => {
  const text = alerts.errorText({ message: 'canceling statement due to statement timeout', code: '57014', details: null, hint: '' });
  assert.equal(text, 'canceling statement due to statement timeout; code 57014');
  assert.equal(alerts.errorText({ message: '', code: 'PGRST002', details: 'schema cache' }), 'code PGRST002; details schema cache');
});

test('strings, Errors and nothing still render as before', () => {
  assert.equal(alerts.errorText('a delivery count was not returned'), 'a delivery count was not returned');
  assert.equal(alerts.errorText(new Error('fetch failed')), 'fetch failed');
  assert.equal(alerts.errorText(null), 'unknown error');
  assert.equal(alerts.errorText(undefined), 'unknown error');
  assert.ok(alerts.errorText('x'.repeat(1000)).length <= 300);
});

test('the PushDeliveryFailing observation that reached the store as [object Object] now carries a readable error', () => {
  const health = pushHealthObservations();
  health.unobserved(CONDITION.DELIVERY_FAILING, EMPTY_HEAD_ERROR);
  const failed = health.conditions().find((c) => c.alertname === CONDITION.CHECK_FAILED && c.check === CONDITION.DELIVERY_FAILING);
  assert.ok(failed, 'the failed observation is still recorded');
  assert.equal(failed.state, 'present');
  assert.doesNotMatch(failed.summary, /\[object Object\]/);
  assert.doesNotMatch(failed.evidence.error, /\[object Object\]/);
});

test('push-health.js renders every caught error through errorText, never `e?.message || e`', () => {
  const source = readFileSync(new URL('../pages/api/cron/push-health.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /e\?\.message \|\| e\b/);
  assert.match(source, /\berrorText\b/);
});
