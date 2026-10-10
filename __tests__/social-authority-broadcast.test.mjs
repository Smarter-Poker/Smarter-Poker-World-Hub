import assert from 'node:assert/strict';
import test from 'node:test';

import { subscribeSocialAuthority } from '../src/lib/socialAuthorityBroadcast.mjs';

function fakeClient() {
  const calls = { channel: 0, subscribe: 0, remove: 0 };
  let broadcast = null;
  let status = null;
  const channel = {
    on(_kind, _filter, callback) { broadcast = callback; return this; },
    subscribe(callback) { calls.subscribe += 1; status = callback; return this; },
  };
  return {
    calls,
    client: {
      channel(topic) {
        calls.channel += 1;
        assert.equal(topic, 'social-video-authority');
        return channel;
      },
      async removeChannel(removed) {
        calls.remove += 1;
        assert.equal(removed, channel);
      },
    },
    emit(payload) { broadcast?.({ payload }); },
    status(value) { status?.(value); },
  };
}

test('authority broadcast shares one channel until the final consumer leaves', async () => {
  const fake = fakeClient();
  const first = [];
  const second = [];
  const removeFirst = subscribeSocialAuthority(fake.client, (event) => first.push(event));
  const removeSecond = subscribeSocialAuthority(fake.client, (event) => second.push(event));
  assert.deepEqual(fake.calls, { channel: 1, subscribe: 1, remove: 0 });

  fake.status('SUBSCRIBED');
  fake.emit({ kind: 'post', id: '20000000-0000-4000-8000-000000000001' });
  assert.deepEqual(first.map((event) => event.type), ['status', 'broadcast']);
  assert.deepEqual(second.map((event) => event.type), ['status', 'broadcast']);

  const late = [];
  const removeLate = subscribeSocialAuthority(fake.client, (event) => late.push(event));
  assert.deepEqual(late, [{ type: 'status', status: 'SUBSCRIBED' }],
    'a late consumer learns the current subscribed state immediately');
  fake.status('SUBSCRIBED');
  assert.equal(first.filter((event) => event.type === 'status').length, 2);
  assert.equal(second.filter((event) => event.type === 'status').length, 2);
  assert.equal(late.filter((event) => event.type === 'status').length, 2,
    'the next subscribed status is a reconnect for every consumer');
  removeLate();

  removeFirst();
  fake.emit({ kind: 'reel', id: '30000000-0000-4000-8000-000000000001' });
  assert.equal(first.length, 3, 'a removed consumer receives no late callback');
  assert.equal(second.length, 4, 'the remaining consumer stays subscribed');
  assert.equal(fake.calls.remove, 0);

  removeSecond();
  fake.emit({ kind: 'post', id: '20000000-0000-4000-8000-000000000002' });
  fake.status('SUBSCRIBED');
  assert.equal(second.length, 4, 'the inactive shared entry ignores late callbacks');
  assert.equal(fake.calls.remove, 1, 'the final consumer removes the channel once');
  removeSecond();
  assert.equal(fake.calls.remove, 1, 'unsubscribe is idempotent');
});
