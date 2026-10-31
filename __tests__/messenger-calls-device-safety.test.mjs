// Safety rails for the focused call suites. messenger-calls-webkit uses only
// throwaway example.com users; messenger-calls-device uses the designated test
// account solely as the phone its owner holds, never opens a browser as it,
// and removes only the Apple push subscription created for the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { probeEmail, PROBE_DOMAIN } from '../scripts/ci/messenger-calls-lib.mjs';
import { sanitizeIceUrl, attribute } from '../scripts/ci/messenger-calls-webkit.mjs';
import { iosVersion, sceneChanges, PROMPTS } from '../scripts/ci/messenger-calls-device.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const lib = read('../scripts/ci/messenger-calls-lib.mjs');
const webkit = read('../scripts/ci/messenger-calls-webkit.mjs');
const device = read('../scripts/ci/messenger-calls-device.mjs');

test('throwaway identities are example.com, never .invalid (hidden cert accounts)', () => {
  assert.equal(PROBE_DOMAIN, 'call-probe.example.com');
  assert.match(probeEmail('dev', 1, 'abcd1234'), /^messenger-call-probe-dev-1-abcd1234@call-probe\.example\.com$/);
  assert.doesNotMatch(lib, /@[a-z.-]*\.invalid/);
});

test('the WebKit suite never signs in the test account', () => {
  assert.doesNotMatch(webkit, /TEST_USER_(EMAIL|PASSWORD)|signInTestAccount/);
});

test('ICE URLs are recorded without credentials', () => {
  assert.equal(sanitizeIceUrl('turn:name:secret@turn.example.com:3478?transport=udp'), 'turn:turn.example.com:3478?transport=udp');
  assert.doesNotMatch(webkit, /\.credential\b|\.username\b/);
  assert.equal(attribute([{ carriesBug320931: true, callConnected: false }]).conclusion, 'inconclusive');
});

test('the device conductor opens a browser only as the throwaway partner', () => {
  const opens = [...device.matchAll(/openDevice\(chrome, ([A-Za-z.]+),/g)].map(m => m[1]);
  assert.deepEqual(opens, ['B.session']);
  assert.match(device, /const A = \(await signInTestAccount\(sb\.anon\)\)\.user\.id;/);
});

test('the device conductor removes only Apple subscriptions created for the test', () => {
  assert.match(device, /\.eq\('user_id', A\)\.eq\('is_active', true\)\.gte\('created_at', since\.toISOString\(\)\)/);
  assert.match(device, /APPLE_PUSH = \/\^https:\\\/\\\/web\\\.push\\\.apple\\\.com\\\/\//);
  assert.match(device, /delete\(\)\.in\('id', ids\)/);
  assert.doesNotMatch(device, /push_subscriptions'\)\.delete\(\)\.eq\('user_id'/);
});

test('push evidence keeps dispatch, delivery and accept separate', () => {
  for (const tier of ['dispatch:', 'delivery:', 'accept:']) assert.ok(device.includes(tier), tier);
  assert.match(device, /lastReceiptAdvanced/);
});

test('prompts and helpers', () => {
  assert.equal(iosVersion('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) Version/18.6').ios, '18.6.2');
  assert.equal(sceneChanges([]).length, 0);
  for (const prompt of Object.values(PROMPTS)) assert.doesNotMatch(prompt, /password|credential/i);
});

test('the notify suite uses throwaways only and labels emulated states', async () => {
  const notify = read('../scripts/ci/messenger-calls-notify.mjs');
  assert.doesNotMatch(notify, /TEST_USER_(EMAIL|PASSWORD)|signInTestAccount/);
  assert.match(notify, /\{ emulated: true \}/);
  assert.match(notify, /tier: 'worker-display'/);
  assert.match(notify, /delete\(\)\.eq\('user_id', C\.id\)/);
});
