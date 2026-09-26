import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const messenger = readFileSync('pages/hub/messenger.js', 'utf8');
const notifications = readFileSync('src/components/notifications/HubNotificationsFeed.jsx', 'utf8');
const slice = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
function evaluate(code, context, returned) {
    return new Function(...Object.keys(context), `${code}\nreturn ${returned};`)(...Object.values(context));
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const response = data => ({ ok: true, json: async () => data });

function readFixture() {
    const state = { requests: [], broadcasts: [], receipts: [], cleared: [], refreshes: [], toasts: [], hidden: false };
    const workspaceRef = { current: 'scope-a' }, activeConversationRef = { current: { id: 'conversation-a' } };
    const code = slice(messenger, '    const markConversationRead =', '    const loadMessages =');
    const read = evaluate(code, {
        workspaceKey: 'scope-a', workspaceRef, activeConversationRef, markConversationReadRef: {},
        document: { get visibilityState() { return state.hidden ? 'hidden' : 'visible'; } },
        user: { id: 'account-a' }, getAccessToken: () => 'fixture',
        authedFetch: (url, options) => { const pending = deferred(); state.requests.push({ url, options, ...pending }); return pending.promise; },
        setConversations: update => state.cleared.push(update([{ id: 'conversation-a', unreadCount: 2 }])),
        loadConversationsRef: { current: (...args) => state.refreshes.push(args) },
        preferencesRef: { current: {} }, typingChannelRef: { current: { send: async msg => { state.receipts.push(msg); } } },
        refreshUnread: () => state.refreshes.push('header'), broadcastSync: (...args) => state.broadcasts.push(args),
        setToast: toast => state.toasts.push(toast), console: { warn() {} },
    }, 'markConversationRead');
    return { state, read, workspaceRef, activeConversationRef };
}

test('incoming reads never persist for a hidden or different conversation', async () => {
    const f = readFixture(); f.state.hidden = true;
    await f.read('conversation-a'); f.state.hidden = false;
    await f.read('conversation-b');
    assert.equal(f.state.requests.length, 0);
});

test('visible reads wait for persistence, then invalidate inbox and publish the receipt', async () => {
    const f = readFixture(), pending = f.read('conversation-a');
    assert.equal(f.state.cleared.length, 0); assert.equal(f.state.receipts.length, 0);
    f.state.requests[0].resolve(response({ success: true })); await pending;
    assert.equal(f.state.cleared[0][0].unreadCount, 0);
    assert.deepEqual(f.state.refreshes[0], ['account-a', { invalidate: true }]);
    assert.equal(f.state.receipts[0].payload.conversationId, 'conversation-a');
    assert.equal(f.state.broadcasts.length, 1);
});

test('rejected reads retain counts and a delayed read never sends on the newly selected channel', async () => {
    const failed = readFixture(), write = failed.read('conversation-a');
    failed.state.requests[0].resolve(response({ success: false })); await write;
    assert.equal(failed.state.cleared.length, 0); assert.equal(failed.state.broadcasts.length, 0);
    assert.equal(failed.state.toasts.length, 1);
    const moved = readFixture(), old = moved.read('conversation-a');
    moved.activeConversationRef.current = { id: 'conversation-b' };
    moved.workspaceRef.current = 'scope-b';
    moved.state.requests[0].resolve(response({ success: true })); await old;
    assert.equal(moved.state.receipts.length, 0); assert.equal(moved.state.broadcasts.length, 0);
});

test('the actual incoming-message subscription schedules a scoped read after displaying the message', async () => {
    const handlers = [], profile = deferred(), candidates = [], painted = [];
    const workspaceRef = { current: 'scope-a' }, activeConversationRef = { current: { id: 'conversation-a' } };
    const channel = { on(_type, spec, handler) { handlers.push({ spec, handler }); return this; }, subscribe() { return this; } };
    const query = { select() { return this; }, eq() { return this; }, maybeSingle() { return profile.promise; } };
    const block = slice(messenger, '    // Subscribe to real-time messages for ACTIVE conversation', '    // Typing indicator broadcast');
    let incomingRead;
    const f = readFixture();
    evaluate(block, {
        useEffect: fn => fn(), user: { id: 'account-a' }, activeConversation: { id: 'conversation-a' },
        workspaceKey: 'scope-a', workspaceRef, activeConversationRef,
        supabase: { channel: () => channel, from: () => query },
        preferencesRef: { current: { messageSounds: false } }, profileCacheRef: { current: new Map() }, PROFILE_CACHE_MAX: 50,
        setMessages: update => painted.push(update([])), setIncomingRead: value => { candidates.push(value); },
        setConversations: update => update([]), typingChannelRef: { current: null }, loadMessagesRef: {},
        incomingRead, markConversationReadRef: { current: f.read },
    }, 'undefined');
    const handler = handlers.find(h => h.spec.event === 'INSERT').handler;
    const event = { new: { id: 'new-message', sender_id: 'account-b', conversation_id: 'conversation-a', content: 'Hello' } };
    const pending = handler(event); profile.resolve({ data: { id: 'account-b' } }); await pending;
    assert.equal(painted[0][0].id, 'new-message');
    assert.deepEqual(candidates, [{ scope: 'scope-a', conversationId: 'conversation-a', messageId: 'new-message' }]);
    const effect = slice(messenger, '    // Read only the message committed', '    // Typing indicator broadcast');
    evaluate(effect, { useEffect: fn => fn(), incomingRead: candidates[0], workspaceRef, markConversationReadRef: { current: f.read } }, 'undefined');
    assert.equal(f.state.requests.length, 1);
    f.state.requests[0].resolve(response({ success: true }));
    workspaceRef.current = 'scope-b';
    await handler(event);
    assert.equal(candidates.length, 1, 'late prior-workspace message ignored');
});

function inboxFixture() {
    const pending = [], painted = [];
    const workspaceRef = { current: 'scope-a' };
    const code = slice(messenger, '    const loadConversations =', '    const markConversationRead =');
    const load = evaluate(code, {
        workspaceKey: 'scope-a', workspaceRef, workspaceSelection: { clubId: 'club-a', folder: 'messages' },
        loadConvInFlightRef: { current: null }, inboxRequestSequence: { current: 0 }, loadConversationsRef: {},
        isOnline: () => true, getAccessToken: () => 'fixture',
        authedFetch: () => { const p = deferred(); pending.push(p); return p.promise; },
        conversationsRef: { current: [] }, activeConversationRef: { current: null }, preferencesRef: { current: {} },
        setConversations: rows => painted.push(rows), setWorkspaceUnread: counts => painted.push(counts),
        setClubAccess() {}, setWeeklyPreview() {}, setInboxError() {}, setLoading() {}, setConnectionStatus() {},
    }, 'loadConversations');
    return { load, pending, painted, workspaceRef };
}

test('post-read inbox invalidation starts a fresh request and ignores the delayed unread snapshot', async () => {
    const f = inboxFixture(); const old = f.load('account-a'), joined = f.load('account-a');
    assert.equal(f.pending.length, 1);
    const fresh = f.load('account-a', { invalidate: true }); assert.equal(f.pending.length, 2);
    f.pending[1].resolve(response({ success: true, conversations: [], unreadCounts: { messages: 0, invoices: 0 } })); await fresh;
    f.pending[0].resolve(response({ success: true, conversations: [{ id: 'old', unreadCount: 32 }], unreadCounts: { messages: 32 } }));
    await Promise.all([old, joined]);
    assert.equal(f.painted.length, 2); assert.deepEqual(f.painted[1].counts, { messages: 0, invoices: 0 });
});

test('notification snapshots obey request ordering and persisted read invalidation', async () => {
    const pending = [], painted = [], feedRequestSequence = { current: 0 };
    const code = slice(notifications, '    const fetchNotifications =', '    // ── Delete notification');
    const fetchFeed = evaluate(code, {
        useCallback: fn => fn, mounted: { current: true }, getAuthUser: () => ({ id: 'account-a' }),
        getAccessToken: async () => 'fixture', setUser() {}, setLoading() {}, feedRequestSequence,
        fetch: () => { const p = deferred(); pending.push(p); return p.promise; }, isVisibleNotification: () => true,
        setNotifications: rows => painted.push(rows), notificationsRef: { current: [] },
        localStorage: { setItem() {} }, notificationCache: () => '',
    }, 'fetchNotifications');
    const first = fetchFeed(); await Promise.resolve();
    const second = fetchFeed(); await Promise.resolve();
    pending[1].resolve(response({ success: true, notifications: [{ id: 'notice', read: true }] })); await second;
    pending[0].resolve(response({ success: true, notifications: [{ id: 'notice', read: false }] })); await first;
    assert.deepEqual(painted, [[{ id: 'notice', read: true }]]);
    const beforeRead = fetchFeed(); await Promise.resolve(); feedRequestSequence.current++;
    pending[2].resolve(response({ success: true, notifications: [{ id: 'notice', read: false }] })); await beforeRead;
    assert.equal(painted.length, 1);
});

test('notification broadcasts refresh peer instances including matching React ids in another window', () => {
    let receive, refreshes = 0;
    const code = slice(notifications, "        const cleanupNotifBc = listenBroadcast(", '        const catchUp =');
    evaluate(code, {
        listenBroadcast: (_channel, handler) => { receive = handler; }, mounted: { current: true },
        BROADCAST_TAB_ID: 'window-a', instanceId: 'feed-a', user: { id: 'account-a' }, fetchNotifications: () => refreshes++,
    }, 'undefined');
    receive({ action: 'refresh_notifications', tabId: 'window-a', instanceId: 'feed-a' }); assert.equal(refreshes, 0);
    receive({ action: 'refresh_notifications', tabId: 'window-b', instanceId: 'feed-a' });
    receive({ action: 'refresh_notifications', tabId: 'window-a', instanceId: 'feed-b' });
    assert.equal(refreshes, 2);
    receive({ action: 'mark_all_read', userId: 'another-account' }); assert.equal(refreshes, 2);
});

test('Messenger return and cross-window events use current workspace handlers without reading a hidden window', () => {
    const listeners = new Map(), calls = [];
    let visibility = 'hidden', online = true, receive, cleanup;
    const code = slice(messenger, '    useEffect(() => {\n        const goOnline =', '    // Load user and conversations');
    evaluate(code, {
        useEffect: fn => { cleanup = fn(); }, isOnline: () => online,
        document: { get visibilityState() { return visibility; }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
        window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
        navigator: { onLine: true }, setConnectionStatus() {},
        goOnlineUserRef: { current: { id: 'current-user' } }, activeConversationRef: { current: { id: 'active' } },
        loadConversationsRef: { current: (...args) => calls.push(['inbox', ...args]) }, loadMessagesRef: { current: id => calls.push(['messages', id]) },
        listenBroadcast: (_channel, fn) => { receive = fn; return () => { receive = null; }; },
    }, 'undefined');
    listeners.get('visibilitychange')(); assert.equal(calls.length, 0);
    receive('refresh_unread'); assert.deepEqual(calls, [['inbox', 'current-user', { invalidate: true }]]);
    visibility = 'visible'; online = false; listeners.get('visibilitychange')(); assert.equal(calls.length, 1);
    online = true; listeners.get('visibilitychange')(); assert.equal(calls.length, 3);
    assert.deepEqual(calls[2], ['messages', 'active']);
    cleanup(); assert.equal(listeners.size, 0); assert.equal(receive, null);
});
