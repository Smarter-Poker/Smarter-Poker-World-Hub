// Wave 3 review of PRs #3250 and #3251 (2026-11-28).
//
// 1. useTokePrefs read the account's preferences on load and applied them
//    whenever they arrived. A toggle made before that read answered (in this
//    tab or another) was newer, and was itself written to the account, yet the
//    older answer flipped the switch back on screen and in localStorage.
// 2. A vault upload whose record failed always said "Nothing Was Stored",
//    even when taking the stored file back out had failed too.
// 3. /api/notifications/geofence-alert, which geofencePush reaches now that it
//    sends the token, returned the push provider's error and any thrown
//    error's message to the browser, and called a session-service outage an
//    invalid token.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TOKE_PREFS, prefsFromAccount } from '../src/lib/bankroll/tokePrefs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('an account read that answers after a newer toggle does not flip it back', () => {
  const shown = { ...DEFAULT_TOKE_PREFS, downTimerAlerts: false };
  const stale = { shiftNotifications: true, autoSaveShifts: true, downTimerAlerts: true };
  assert.equal(prefsFromAccount(shown, stale, true), null);
  assert.deepEqual(prefsFromAccount(DEFAULT_TOKE_PREFS, { downTimerAlerts: false }, false),
    { ...DEFAULT_TOKE_PREFS, downTimerAlerts: false });
  assert.equal(prefsFromAccount(shown, null, false), null);
  assert.equal(prefsFromAccount(shown, ['x'], false), null);
  assert.equal(prefsFromAccount(shown, 'on', false), null);
});

test('useTokePrefs counts every change and checks the count before applying the account copy', () => {
  const hook = read('src/components/bankroll/toke/useTokePrefs.js');
  assert.match(hook, /const editsAtRead = editsRef\.current;/);
  assert.match(hook, /prefsFromAccount\(prefsRef\.current, data\?\.settings\?\.tokeTracker, editsRef\.current !== editsAtRead\)/);
  // The toggle, the same-tab sync and the other-tab storage event all count.
  assert.equal((hook.match(/editsRef\.current \+= 1;/g) || []).length, 3);
  // The sync listeners only apply; they never write, so no tab echoes another.
  const listeners = hook.slice(hook.indexOf('const onSync'), hook.indexOf("window.addEventListener(TOKE_PREFS_EVENT"));
  assert.doesNotMatch(listeners, /writeStoredPrefs|dispatchEvent|\.update\(/);
});

test('a failed vault upload says nothing was stored only when the file was removed', () => {
  const vault = read('src/components/bankroll/DealerVault.jsx');
  assert.match(vault, /const removed = await removeBankrollObject\(supabase, fileUrl\);\s*throw new Error\(removed\s*\? 'The Document Could Not Be Saved\. Nothing Was Stored, Please Try Again\.'\s*: 'The Document Could Not Be Saved\. Please Try Again\.'\)/);
});

test('the geofence push route keeps internal errors in the log', () => {
  const route = read('pages/api/notifications/geofence-alert.js');
  assert.doesNotMatch(route, /error: err\.message/);
  assert.doesNotMatch(route, /error: pushResult\.error/);
  assert.match(route, /authStatus === 503\) return res\.status\(503\)/);
  // Method before body, and a missing body is a 400, not a TypeError.
  assert.ok(route.indexOf("req.method !== 'POST'") < route.indexOf('= req.body'));
  assert.match(route, /req\.body && typeof req\.body === 'object' \? req\.body : \{\}/);
});

test('the venue push heading is plain words, with no emoji', () => {
  const route = read('pages/api/notifications/geofence-alert.js');
  assert.equal(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(route), false, 'no emoji in the route');
  assert.match(route, /heading: `\$\{venueKind\} Nearby`/);
  assert.match(route, /\|\| 'Poker Venue'/);
});
