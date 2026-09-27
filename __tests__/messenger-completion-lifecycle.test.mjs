import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { restoreMessengerSendOperations, reconcileMessengerMessage, mergeMessengerPendingMessages,
    acknowledgeMessengerSend } from '../src/lib/messengerSendOperation.mjs';

const messenger = readFileSync(process.env.MESSENGER_COMPLETION_SOURCE || 'pages/hub/messenger.js', 'utf8');
const authGuard = readFileSync('src/utils/authGuard.js', 'utf8');
const slice = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const evaluate = (code, context, returned) => new Function(...Object.keys(context), `${code}\nreturn ${returned};`)(...Object.values(context));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const response = data => ({ ok: true, json: async () => data });
const compareMessageTimestamps = evaluate(slice(messenger, 'function compareMessageTimestamps(', '// ═══════════════════════════════════════════════════════════════════════════'), {}, 'typeof compareMessageTimestamps === \"function\" ? compareMessageTimestamps : (left, right) => Date.parse(left) - Date.parse(right)');
const quiet = { warn() {}, debug() {} };
const tick = async () => { for (let n = 0; n < 6; n++) await Promise.resolve(); };

function messageFixture() {
    const initial = { id: 'old', conversation_id: 'conversation-a', sender_id: 'account-b', content: 'Original', created_at: '2026-09-26T20:00:00Z' };
    const state = { rows: [initial], reads: [], intents: [], requests: [], handlers: [], toasts: [] };
    const workspaceRef = { current: 'scope-a' }, activeConversationRef = { current: { id: 'conversation-a' } };
    const setMessages = value => { state.rows = typeof value === 'function' ? value(state.rows) : value; };
    const channel = { on(_type, spec, handler) { state.handlers.push({ spec, handler }); return this; }, subscribe() { return this; } };
    const context = {
        workspaceKey: 'scope-a', workspaceRef, activeConversationRef, messagesRequestSequence: { current: 0 },
        messageCacheRef: { current: new Map([['conversation-a', [initial]]]) }, setMessages, setLoadingMessages() {}, setHasMoreMessages() {},
        getAccessToken: () => 'fixture', authedFetch: () => { const request = deferred(); state.requests.push(request); return request.promise; }, user: { id: 'account-a' },
        localStorage: { getItem: () => '[]' }, hiddenMessageIds: new Set(), markConversationRead: async (...args) => state.reads.push(args),
        setToast: value => state.toasts.push(value), loadMessagesRef: {}, console: quiet, compareMessageTimestamps,
        setIncomingRead: value => state.intents.push(value),
        sendOperationsRef: { current: new Map() }, restoreMessengerSendOperations, reconcileMessengerMessage,
        mergeMessengerPendingMessages, acknowledgeMessengerSend,
    };
    const load = evaluate(slice(messenger, '    const loadMessages =', '    const sendLockRef ='), context, 'loadMessages');
    evaluate(slice(messenger, '    // Subscribe to real-time messages for ACTIVE conversation', '    // Read only the message committed'), {
        ...context, useEffect: fn => fn(), activeConversation: { id: 'conversation-a' }, supabase: { channel: () => channel },
        preferencesRef: { current: { messageSounds: false } }, profileCacheRef: { current: new Map([['account-b', { id: 'account-b' }]]) }, PROFILE_CACHE_MAX: 50,
        setIncomingRead() {}, setConversations: update => update([]), typingChannelRef: { current: null },
    }, 'undefined');
    const deliver = async message => state.handlers.find(h => h.spec.event === 'INSERT').handler({ new: message });
    return { state, load, deliver, initial, workspaceRef, activeConversationRef };
}

test('a delayed snapshot preserves the incoming message displayed after its request began', async () => {
    const f = messageFixture(), pending = f.load('conversation-a');
    await f.deliver({ ...f.initial, id: 'new', content: 'New arrival', created_at: '2026-09-26T20:01:00Z' });
    assert.deepEqual(f.state.rows.map(m => m.id), ['old', 'new']);
    f.state.requests[0].resolve(response({ success: true, messages: [f.initial] })); await pending;
    assert.deepEqual(f.state.rows.map(m => m.id), ['old', 'new']);
    assert.deepEqual(f.state.reads, [], 'fetch does not mark records read before React commits');
    assert.deepEqual(f.state.intents, [{ scope: 'scope-a', conversationId: 'conversation-a', messageId: 'old' }]);
});

test('snapshot merge preserves only concurrent field changes and drops obsolete cached rows', async () => {
    const f = messageFixture(), pending = f.load('conversation-a');
    f.state.rows = [{ ...f.initial, is_read: true }];
    f.state.requests[0].resolve(response({ success: true, messages: [{ ...f.initial, content: 'Server edit' }] })); await pending;
    assert.equal(f.state.rows[0].content, 'Server edit');
    assert.equal(f.state.rows[0].is_read, true);
    const removed = messageFixture(), second = removed.load('conversation-a');
    removed.state.requests[0].resolve(response({ success: true, messages: [] })); await second;
    assert.deepEqual(removed.state.rows, []);
    assert.deepEqual(removed.state.reads, [], 'empty snapshots cannot acknowledge unseen records');
    assert.deepEqual(removed.state.intents, []);
});

test('a previous conversation snapshot cannot paint or acknowledge after switching', async () => {
    const f = messageFixture(), pending = f.load('conversation-a');
    f.workspaceRef.current = 'scope-b'; f.activeConversationRef.current = { id: 'conversation-b' };
    f.state.rows = [{ id: 'other-account-message', conversation_id: 'conversation-b' }];
    f.state.requests[0].resolve(response({ success: true, messages: [f.initial] })); await pending;
    assert.deepEqual(f.state.rows.map(m => m.id), ['other-account-message']);
    assert.deepEqual(f.state.reads, []);
});

function paginationFixture() {
    const state = { requests: [], loading: [], rows: [], active: { id: 'conversation-a' } };
    const workspaceRef = { current: 'scope-a' }, activeConversationRef = { current: state.active }, lock = { current: null };
    const make = (scope, conversation) => evaluate(slice(messenger, '    const loadOlderMessages =', '    const handleSelectConversation ='), {
        useCallback: fn => fn, activeConversation: conversation, loadingOlderMessages: false, hasMoreMessages: true,
        messages: [{ id: 'oldest', created_at: '2026-09-26T20:00:00Z' }], paginationLockRef: lock, setLoadingOlderMessages: value => state.loading.push(value),
        workspaceKey: scope, workspaceRef, activeConversationRef, messagesContainerRef: { current: null }, getAccessToken: () => 'fixture',
        authedFetch: () => { const request = deferred(); state.requests.push(request); return request.promise; }, user: { id: 'account-a' },
        setHasMoreMessages() {}, setMessages: value => { state.rows = typeof value === 'function' ? value(state.rows) : value; },
        localStorage: { getItem: () => '[]' }, isPaginatingRef: {}, requestAnimationFrame: fn => fn(), console: quiet,
    }, 'loadOlderMessages');
    return { state, workspaceRef, activeConversationRef, lock, make };
}

test('pagination releases its operation after a conversation change and after network failure', async () => {
    const f = paginationFixture(), pending = f.make('scope-a', f.state.active)();
    f.workspaceRef.current = 'scope-b'; f.activeConversationRef.current = { id: 'conversation-b' };
    f.state.requests[0].resolve(response({ success: true, messages: [] })); await pending;
    assert.equal(f.lock.current, null); assert.equal(f.state.loading.at(-1), false);
    const failure = f.make('scope-b', f.activeConversationRef.current)();
    f.state.requests[1].resolve({ ok: false, status: 503 }); await failure;
    assert.equal(f.lock.current, null); assert.equal(f.state.loading.at(-1), false);
});

test('an old pagination response cannot unlock or paint a newer conversation operation', async () => {
    const f = paginationFixture(), first = f.make('scope-a', f.state.active)();
    f.workspaceRef.current = 'scope-b'; f.activeConversationRef.current = { id: 'conversation-b' };
    const second = f.make('scope-b', f.activeConversationRef.current)();
    assert.equal(f.state.requests.length, 2);
    const owner = f.lock.current;
    f.state.requests[0].resolve(response({ success: true, messages: [{ id: 'stale' }] })); await first;
    assert.equal(f.lock.current, owner); assert.equal(f.state.loading.at(-1), true); assert.deepEqual(f.state.rows, []);
    f.state.requests[1].resolve(response({ success: true, messages: [] })); await second;
    assert.equal(f.lock.current, null); assert.equal(f.state.loading.at(-1), false);
});

function authFixture() {
    const state = { actor: { id: 'account-a' }, pending: [], loading: [], refreshed: [], rows: ['private-row'], timer: null };
    let dispatch, cleanup;
    const supabase = {
        auth: { onAuthStateChange(fn) { dispatch = fn; return { data: { subscription: { unsubscribe() {} } } }; } },
        from() { return { select() { return this; }, eq() { return this; }, maybeSingle() { const request = deferred(); state.pending.push(request); return request.promise; } }; },
    };
    const createMultiDeviceAuthListener = evaluate(slice(authGuard, 'export function createMultiDeviceAuthListener', '// ═══════════════════════════════════════════════════════════════════════════\n// 🧪').replace('export function', 'function'), {
        setTimeout: fn => { state.timer = fn; return 1; }, clearTimeout() {}, clearPersistedSession() {}, persistSession() {}, console: quiet,
    }, 'createMultiDeviceAuthListener');
    const authIdentityRef = { current: 'account-a' }, authGenerationRef = { current: 0 };
    evaluate(slice(messenger, '    //  MULTI-DEVICE RESILIENCE:', '    // Check for pending calls'), {
        useEffect: fn => { cleanup = fn(); }, supabase, createMultiDeviceAuthListener, user: state.actor, authIdentityRef, authGenerationRef,
        workspaceRef: { current: 'scope-a' }, activeConversationRef: { current: { id: 'conversation-a' } }, messageCacheRef: { current: new Map() },
        sendOperationsRef: { current: new Map() }, forwardOperationRef: { current: null }, sendLockRef: { current: null },
        setConversations: rows => { state.rows = rows; }, setMessages() {}, setActiveConversation() {}, setFriends() {}, setIsVip() {},
        setUser: value => { state.actor = typeof value === 'function' ? value(state.actor) : value; }, setLoading: value => state.loading.push(value),
        loadConversations: async () => {}, loadConversationsRef: { current: (...args) => state.refreshed.push(args) }, console: quiet,
    }, 'undefined');
    return { state, authGenerationRef, cleanup: () => cleanup(), emit(event, user) { dispatch(event, user ? { user } : null); if (state.timer) { const timer = state.timer; state.timer = null; timer(); } } };
}

test('sign-out clears immediately and an outstanding profile response cannot restore the previous actor', async () => {
    const f = authFixture(); f.emit('TOKEN_REFRESHED', { id: 'account-a' });
    assert.equal(f.state.pending.length, 1);
    f.emit('SIGNED_OUT'); assert.equal(f.state.actor, null); assert.deepEqual(f.state.rows, []);
    f.state.pending[0].resolve({ data: { id: 'account-a', username: 'stale-profile' } }); await tick();
    assert.equal(f.state.actor, null); f.cleanup();
});

test('the newest account survives older profile responses and component cleanup', async () => {
    const f = authFixture(); f.emit('TOKEN_REFRESHED', { id: 'account-a' });
    f.emit('SIGNED_IN', { id: 'account-b' }); assert.equal(f.state.actor.id, 'account-b');
    assert.equal(f.state.pending.length, 2);
    f.state.pending[1].resolve({ data: { id: 'account-b', username: 'new-profile' } }); await tick();
    f.state.pending[0].resolve({ data: { id: 'account-a', username: 'stale-profile' } }); await tick();
    assert.deepEqual(f.state.actor, { id: 'account-b', username: 'new-profile', avatar_url: null });
    f.emit('TOKEN_REFRESHED', { id: 'account-b' }); f.cleanup();
    f.state.pending[2].resolve({ data: { id: 'account-b', username: 'unmounted-profile' } }); await tick();
    assert.equal(f.state.actor.username, 'new-profile');
});

test('initial profile and friends requests cannot restore data after an account change', async () => {
    const requests = [], painted = [], authGenerationRef = { current: 0 };
    evaluate(slice(messenger, '    // Load user and conversations', '    // ═══════════════════════════════════════════════════════════════════════════'), {
        useEffect: fn => fn(), authGenerationRef, authIdentityRef: { current: 'account-a' },
        getAuthUser: () => ({ id: 'account-a' }), getAccessToken: () => 'fixture', loadConversations: async () => {},
        authedFetch: () => { const request = deferred(); requests.push(request); return request.promise; },
        setUser: value => painted.push(value), setIsVip() {}, setFriends: value => painted.push(value), setLoading() {}, console: quiet,
    }, 'undefined');
    assert.equal(requests.length, 2);
    authGenerationRef.current++;
    requests[0].resolve(response({ profile: { username: 'previous-account' } }));
    requests[1].resolve(response({ data: { friends: [{ id: 'previous-friend' }] } }));
    await tick();
    assert.deepEqual(painted, []);
});

test('a persisted read receipt only marks sent messages within its acknowledged boundary', () => {
    const handlers = [], state = { rows: [
        { id: 'seen', sender_id: 'account-a', created_at: '2026-09-26T20:00:00.123001Z' },
        { id: 'newer', sender_id: 'account-a', created_at: '2026-09-26T20:00:00.123999Z' },
    ] };
    const workspaceRef = { current: 'scope-a' };
    const channel = { on(_type, spec, handler) { handlers.push({ spec, handler }); return this; }, subscribe() { return this; } };
    evaluate(slice(messenger, '    // Typing indicator broadcast', '    // Listen for incoming calls'), {
        useEffect: fn => fn(), useRef: value => ({ current: value }), user: { id: 'account-a' }, activeConversation: { id: 'conversation-a' },
        supabase: { channel: () => channel }, typingChannelRef: {}, compareMessageTimestamps,
        workspaceKey: 'scope-a', workspaceRef, activeConversationRef: { current: { id: 'conversation-a' } },
        setMessages: update => { state.rows = update(state.rows); }, setOtherTyping() {},
    }, 'undefined');
    const receipt = handlers.find(handler => handler.spec.event === 'read_receipt').handler;
    receipt({ payload: { readerId: 'account-b', conversationId: 'conversation-a', readThrough: '2026-09-26T20:00:00.123001+00:00' } });
    assert.equal(state.rows[0].is_read, true); assert.equal(state.rows[1].is_read, undefined);
    receipt({ payload: { readerId: 'account-b', conversationId: 'conversation-a' } });
    assert.equal(state.rows[1].is_read, undefined, 'a receipt without a boundary cannot mark a later arrival');
    workspaceRef.current = 'scope-b';
    receipt({ payload: { readerId: 'account-b', conversationId: 'conversation-a', readThrough: '2026-09-26T20:02:00Z' } });
    assert.equal(state.rows[1].is_read, undefined, 'an old channel cannot acknowledge another workspace');
});

test('the after-render read selects the newest displayed persisted message including a batched arrival', () => {
    const reads = [], oldest = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', newest = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
    evaluate(slice(messenger, '    // Read only the message committed', '    // Typing indicator broadcast'), {
        useEffect: fn => fn(), incomingRead: { scope: 'scope-a', conversationId: 'conversation-a', messageId: oldest },
        workspaceRef: { current: 'scope-a' }, compareMessageTimestamps,
        messages: [
            { id: oldest, conversation_id: 'conversation-a', created_at: '2026-09-26T20:00:00.123001Z' },
            { id: newest, conversation_id: 'conversation-a', created_at: '2026-09-26T20:00:00.123999Z' },
            { id: 'pending-temp', conversation_id: 'conversation-a', created_at: '2026-09-26T20:01:00Z' },
            { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', conversation_id: 'conversation-b', created_at: '2026-09-26T20:02:00Z' },
        ], markConversationReadRef: { current: (...args) => reads.push(args) },
    }, 'undefined');
    assert.deepEqual(reads, [['conversation-a', newest]]);
});
