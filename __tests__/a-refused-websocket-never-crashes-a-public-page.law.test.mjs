// LAW: a refused WebSocket never crashes a public page.
//
// 2026-11-26 18:30Z to 2026-11-27 07:05Z: 49 client crashes on
// /hub/venues/<id> (client_crash_log, boundary 'page', every one anonymous),
// all "WebSocket not available: Failed to construct 'WebSocket': the provided
// URL is invalid", thrown synchronously by channel.subscribe() inside the
// venue page's live-update effect. The Daily Digest raised it as
// DailyDigest.client_crash (operational_alert_events 449588, 42 crashes on
// 2026-11-26 against 0-2 on every earlier day this month).
//
// The page now subscribes through subscribeOrDegrade, which keeps the page
// and turns the live push off for that browser only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subscribeOrDegrade, releaseChannel } from '../src/lib/realtimeSubscribeOrDegrade.mjs';

const REFUSAL = "WebSocket not available: Failed to construct 'WebSocket': Failed to create a WebSocket: the provided URL is invalid.";

function fakeClient({ refuse }) {
  const removed = [];
  const channel = {
    on() { return channel; },
    subscribe() { if (refuse) throw new Error(REFUSAL); return channel; },
  };
  return {
    removed,
    channel,
    channelFactory: (client) => client.channel('venue-pub:1').on('postgres_changes', {}, () => {}),
    client: { channel: () => channel, removeChannel: (c) => removed.push(c) },
  };
}

function quietly(fn) {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try { return { result: fn(), warnings }; } finally { console.warn = warn; }
}

test('a refused WebSocket returns null, says why, and releases the half-built channel', () => {
  const f = fakeClient({ refuse: true });
  const { result, warnings } = quietly(() => subscribeOrDegrade(f.client, f.channelFactory, 'venue-pub'));
  assert.equal(result, null);
  assert.deepEqual(f.removed, [f.channel]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /venue-pub: live updates unavailable in this browser: WebSocket not available/);
  releaseChannel(f.client, result);
  assert.equal(f.removed.length, 1, 'cleanup of a degraded page releases nothing twice');
});

test('an accepted WebSocket returns the subscribed channel and cleanup releases it', () => {
  const f = fakeClient({ refuse: false });
  const { result, warnings } = quietly(() => subscribeOrDegrade(f.client, f.channelFactory, 'venue-pub'));
  assert.equal(result, f.channel);
  assert.equal(warnings.length, 0);
  releaseChannel(f.client, result);
  assert.deepEqual(f.removed, [f.channel]);
});

test('the public venue page opens its live channel only through subscribeOrDegrade', () => {
  const src = readFileSync(new URL('../pages/hub/venues/[id].js', import.meta.url), 'utf8');
  assert.match(src, /import \{ subscribeOrDegrade, releaseChannel \} from '..\/..\/..\/src\/lib\/realtimeSubscribeOrDegrade\.mjs'/);
  assert.match(src, /subscribeOrDegrade\(supabase, \(client\) => client\s*\n\s*\.channel\(`venue-pub:\$\{id\}`\)/);
  assert.equal((src.match(/\.subscribe\(\)/g) || []).length, 0,
    'a bare .subscribe() on the venue page lets a refused WebSocket throw out of the effect and crash the page');
  assert.match(src, /releaseChannel\(supabase, _ch\)/);
});
