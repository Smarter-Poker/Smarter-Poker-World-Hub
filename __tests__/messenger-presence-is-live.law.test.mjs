// MESSENGER PRESENCE IS LIVE (2026-11-11).
//
// Dan was chatting, as KINGS CLUB, with a Kings Club Super Agent who had
// messaged him two minutes earlier, and the conversation header said the
// Super Agent was "Offline". Production rows for that conversation: the
// Super Agent's profiles.last_seen was 15:02:57 UTC, they sent messages at
// 15:04:14 and 15:11:38, and Dan's 15:13:40 view asked fn_profile_presence,
// whose five-minute heartbeat was ten minutes old.
//
// Root causes pinned here:
//   1. The World Hub never kept a heartbeat. /hub/messenger wrote last_seen
//      once on mount and wrote OFFLINE on unmount and beforeunload; nothing
//      else on the World Hub beat at all.
//   2. Sending a message was not activity: nothing stamped the sender.
//   3. The header kept its own sticky status, set once when a chat opened and
//      overwritten to Offline by every realtime sync that did not include the
//      other person, instead of the one platform answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    startPresenceHeartbeat, activeStatusEnabled, ACTIVE_STATUS_KEY,
    PRESENCE_HEARTBEAT_MS, PRESENCE_WINDOW_MS, PRESENCE_MIN_GAP_MS,
} from '../src/lib/presenceHeartbeat.mjs';
import { stampSenderPresence } from '../src/lib/messenger/senderPresence.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const USER = 'eed278a8-3ca2-4e2d-a196-0a0cd9e74f90';
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness({ hidden = false, activeStatus = null, fail = 0 } = {}) {
    let clock = Date.parse('2026-11-11T15:02:57Z');
    const sent = [];
    let failures = fail;
    const listeners = { doc: new Map(), win: new Map() };
    const target = (name) => ({
        addEventListener: (type, fn) => listeners[name].set(type, fn),
        removeEventListener: (type, fn) => { if (listeners[name].get(type) === fn) listeners[name].delete(type); },
    });
    const doc = { visibilityState: hidden ? 'hidden' : 'visible', ...target('doc') };
    const win = target('win');
    const store = new Map(activeStatus === null ? [] : [[ACTIVE_STATUS_KEY, String(activeStatus)]]);
    const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    let intervalFn = null;
    let intervalMs = null;
    let cleared = false;
    const stop = startPresenceHeartbeat(USER, {
        send: async (id, online) => {
            sent.push({ id, online, at: new Date(clock).toISOString() });
            if (failures > 0) { failures -= 1; return { error: new Error('network') }; }
            return { error: null };
        },
        doc, win, storage,
        now: () => clock,
        setInterval: (fn, ms) => { intervalFn = fn; intervalMs = ms; return 1; },
        clearInterval: () => { cleared = true; },
    });
    return {
        sent, doc, win, storage, listeners, stop,
        advance: async (ms) => { clock += ms; },
        tick: async () => { intervalFn(); await flush(); },
        fire: async (where, type) => { listeners[where].get(type)?.(); await flush(); },
        get intervalMs() { return intervalMs; },
        get cleared() { return cleared; },
    };
}

test('one missed beat still leaves the person inside the online window', () => {
    assert.ok(PRESENCE_HEARTBEAT_MS * 2 < PRESENCE_WINDOW_MS);
    assert.equal(PRESENCE_WINDOW_MS, 5 * 60_000, 'fn_profile_presence answers with a five-minute window');
});

test('a visible page beats on start and every interval, online, for its own user', async () => {
    const h = harness();
    await flush();
    assert.deepEqual(h.sent.map((s) => [s.id, s.online]), [[USER, true]]);
    assert.equal(h.intervalMs, PRESENCE_HEARTBEAT_MS);
    for (let i = 0; i < 5; i += 1) {
        await h.advance(PRESENCE_HEARTBEAT_MS);
        await h.tick();
    }
    assert.equal(h.sent.length, 6, 'the 2026-11-11 Super Agent would have been stamped every two minutes');
    assert.ok(h.sent.every((s) => s.online === true));
});

test('a hidden page does not beat, and beats at once when it is looked at again', async () => {
    const h = harness({ hidden: true });
    await flush();
    await h.advance(PRESENCE_HEARTBEAT_MS);
    await h.tick();
    assert.equal(h.sent.length, 0);
    h.doc.visibilityState = 'visible';
    await h.fire('doc', 'visibilitychange');
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].online, true);
});

test('focus bursts are bounded but never block the scheduled beat', async () => {
    const h = harness();
    await flush();
    await h.fire('win', 'focus');
    await h.fire('win', 'pageshow');
    assert.equal(h.sent.length, 1, 'a focus inside the minimum gap does not write again');
    await h.advance(PRESENCE_MIN_GAP_MS);
    await h.fire('win', 'focus');
    assert.equal(h.sent.length, 2);
    await h.tick();
    assert.equal(h.sent.length, 3, 'the interval beat is always sent');
});

test('Active Status off beats offline once, and back on beats online', async () => {
    const h = harness({ activeStatus: false });
    await flush();
    await h.advance(PRESENCE_HEARTBEAT_MS);
    await h.tick();
    assert.deepEqual(h.sent.map((s) => s.online), [false]);
    h.storage.setItem(ACTIVE_STATUS_KEY, 'true');
    await h.fire('win', 'storage');
    assert.deepEqual(h.sent.map((s) => s.online), [false, true]);
    assert.equal(activeStatusEnabled(null), true);
    assert.equal(activeStatusEnabled({ getItem: () => { throw new Error('blocked'); } }), true);
});

test('a failed beat is retried on the next chance instead of waiting out the gap', async () => {
    const h = harness({ fail: 1 });
    await flush();
    await h.fire('win', 'focus');
    assert.equal(h.sent.length, 2);
});

test('stopping never writes offline and removes every listener', async () => {
    const h = harness();
    await flush();
    h.stop();
    await flush();
    assert.ok(h.sent.every((s) => s.online === true));
    assert.equal(h.cleared, true);
    assert.equal(h.listeners.doc.size + h.listeners.win.size, 0);
});

test('the World Hub mounts one heartbeat for every page', () => {
    const app = read('pages/_app.js');
    assert.match(app, /import usePresenceHeartbeat from '..\/src\/hooks\/usePresenceHeartbeat'/);
    assert.match(app, /usePresenceHeartbeat\(user\?\.id \|\| null\)/);
    assert.match(app, /\{automaticPlayerWrites && !isEmbedded && <PresenceHeartbeat \/>\}/);
    const hook = read('src/hooks/usePresenceHeartbeat.js');
    assert.match(hook, /rpc\('fn_update_presence', \{ p_user_id: userId, p_is_online: online \}\)/);
    assert.match(hook, /startPresenceHeartbeat\(userId,/);
});

test('the messenger page never writes presence and never keeps a sticky status', () => {
    const page = read('pages/hub/messenger.js');
    assert.doesNotMatch(page, /update-presence/);
    assert.doesNotMatch(page, /fn_update_presence/);
    assert.doesNotMatch(page, /updateDbPresence/);
    assert.doesNotMatch(page, /otherUserStatus/);
    assert.match(page, /const isActiveOtherOnline = !!activeConversation\?\.isJarvis \|\| \(!!activeOtherId && mergedOnlineUsers\.has\(activeOtherId\)\);/);
    assert.match(page, /const platformOnline = usePresence\(presenceIds\);/);
});

test('an incoming message and opening a chat both ask the presence door again', () => {
    const page = read('pages/hub/messenger.js');
    const incoming = page.indexOf('refreshPresence([newMsg.sender_id]);');
    const ownReturn = page.indexOf('if (newMsg.sender_id === user.id) {');
    assert.ok(ownReturn > 0 && incoming > ownReturn, 'refresh runs for the other person\'s message, after the own-message branch');
    assert.match(page, /if \(conversation\.otherUser\?\.id\) refreshPresence\(\[conversation\.otherUser\.id\]\);/);
    const hook = read('src/hooks/usePresence.js');
    assert.match(hook, /export function refreshPresence\(ids\)/);
});

function profilesStub(result = { error: null }) {
    const calls = [];
    const builder = {
        update(values) { calls.push(['update', values]); return this; },
        eq(column, value) { calls.push(['eq', column, value]); return this; },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    };
    return { calls, client: { from(table) { calls.push(['from', table]); return builder; } } };
}

test('a sent message stamps the sender heartbeat, only when their presence is visible', async () => {
    const stub = profilesStub();
    const at = new Date('2026-11-11T15:11:38.483Z');
    assert.equal(await stampSenderPresence(stub.client, USER, at), true);
    assert.deepEqual(stub.calls, [
        ['from', 'profiles'],
        ['update', { last_seen: '2026-11-11T15:11:38.483Z' }],
        ['eq', 'id', USER],
        ['eq', 'is_online', true],
    ]);
    // With this stamp the 15:13:40 view is 2m02s after the heartbeat: online.
    assert.ok(Date.parse('2026-11-11T15:13:40Z') - at.getTime() < PRESENCE_WINDOW_MS);
});

test('a refused stamp never fails the send', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
        assert.equal(await stampSenderPresence(profilesStub({ error: new Error('refused') }).client, USER), false);
        assert.equal(await stampSenderPresence({}, USER), false);
    } finally {
        console.warn = warn;
    }
});

test('the human send route stamps presence for a new message, never for a replay', () => {
    const route = read('pages/api/messenger/send-message.js');
    const confirmed = route.indexOf("typeof rpcResult.replayed !== 'boolean') throw unavailable();");
    const stamp = route.indexOf('if (!rpcResult.replayed) await stampSenderPresence(getSupabase(), userId);');
    assert.ok(confirmed > 0 && stamp > confirmed, 'stamped only after the send is confirmed');
});
