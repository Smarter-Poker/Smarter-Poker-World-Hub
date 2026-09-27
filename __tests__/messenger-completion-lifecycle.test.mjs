import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { restoreMessengerSendOperations, reconcileMessengerMessage, mergeMessengerPendingMessages,
    acknowledgeMessengerSend } from '../src/lib/messengerSendOperation.mjs';

import { isMessageId, visibleMessageBoundary } from '../src/lib/messengerContinuity.mjs';

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
        paginationLockRef: { current: null }, newerPageRef: { current: null }, isPaginatingRef: { current: false }, setLoadingOlderMessages() {}, setLoadingNewerMessages() {},
        messages: state.rows, messagesRef: { current: state.rows }, historyWindowRef: { current: { conversationId: 'conversation-a', hasNewer: false } },
        messagesContainerRef: { current: null }, visibleMessageBoundary, pendingScrollRef: { current: null }, lastVisibleReadRef: { current: null },
        setHistoryError() {}, setHasNewerMessages() {}, setFirstUnreadMessageId() {}, continuity: { ingestSavedItems() {} },
        messageCacheRef: { current: new Map([['conversation-a', [initial]]]) }, setMessages, setLoadingMessages() {}, setHasMoreMessages() {},
        getAccessToken: () => 'fixture', authedFetch: () => { const request = deferred(); state.requests.push(request); return request.promise; }, user: { id: 'account-a' },
        localStorage: { getItem: () => '[]' }, hiddenMessageIds: new Set(), markConversationRead: async (...args) => state.reads.push(args),
        setToast: value => state.toasts.push(value), loadMessagesRef: {}, console: quiet, compareMessageTimestamps,
        setIncomingRead: value => state.intents.push(value),
        sendOperationsRef: { current: new Map() }, restoreMessengerSendOperations, reconcileMessengerMessage,
        mergeMessengerPendingMessages, acknowledgeMessengerSend,
    };
    const load = evaluate(slice(messenger, '    const loadMessages =', '    const sendLockRef ='), context, 'loadMessages');
    evaluate(slice(messenger, '    // Subscribe to real-time messages for ACTIVE conversation', '    // A rendered row outside the viewport'), {
        ...context, useEffect: fn => fn(), activeConversation: { id: 'conversation-a' }, supabase: { channel: () => channel },
        preferencesRef: { current: { messageSounds: false } }, profileCacheRef: { current: new Map([['account-b', { id: 'account-b' }]]) }, PROFILE_CACHE_MAX: 50,
        setIncomingRead() {}, setConversations: update => update([]), typingChannelRef: { current: null },
    }, 'undefined');
    const deliver = async message => state.handlers.find(h => h.spec.event === 'INSERT').handler({ new: message });
    return { state, load, deliver, initial, workspaceRef, activeConversationRef, context };
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

test('explicit latest navigation preserves a newer realtime arrival after its snapshot began', async () => {
    const f = messageFixture(), pending = f.load('conversation-a', { latest: true });
    await f.deliver({ ...f.initial, id: 'new', content: 'New arrival', created_at: '2026-09-26T20:01:00Z' });
    f.state.requests[0].resolve(response({ success: true, messages: [f.initial], hasNewer: false })); await pending;
    assert.deepEqual(f.state.rows.map(m => m.id), ['old', 'new']);
});

test('a new history window invalidates both pagination owners within the same conversation', async () => {
    const f = messageFixture();
    const oldOwner = { scope: 'scope-a', conversationId: 'conversation-a' };
    f.context.paginationLockRef.current = oldOwner; f.context.newerPageRef.current = oldOwner;
    f.context.isPaginatingRef.current = true;
    const pending = f.load('conversation-a', { latest: true });
    assert.equal(f.context.paginationLockRef.current, null);
    assert.equal(f.context.newerPageRef.current, null);
    assert.equal(f.context.isPaginatingRef.current, false);
    f.state.requests[0].resolve(response({ success: true, messages: [f.initial], hasNewer: false })); await pending;
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
    const state = { requests: [], loading: [], rows: [], errors: [], frames: [], active: { id: 'conversation-a' } };
    const generation = { current: 0 }, container = { scrollTop: 40, scrollHeight: 200 };
    const workspaceRef = { current: 'scope-a' }, activeConversationRef = { current: state.active }, lock = { current: null };
    const make = (scope, conversation) => evaluate(slice(messenger, '    const loadOlderMessages =', '    const newerPageRef ='), {
        historyError: null, setHistoryError: error => state.errors.push(error), continuity: { ingestSavedItems() {} }, messagesRequestSequence: generation,
        useCallback: fn => fn, activeConversation: conversation, loadingOlderMessages: false, hasMoreMessages: true,
        messages: [{ id: 'oldest', created_at: '2026-09-26T20:00:00Z' }], paginationLockRef: lock, setLoadingOlderMessages: value => state.loading.push(value),
        workspaceKey: scope, workspaceRef, activeConversationRef, messagesContainerRef: { current: container }, getAccessToken: () => 'fixture',
        authedFetch: () => { const request = deferred(); state.requests.push(request); return request.promise; }, user: { id: 'account-a' },
        setHasMoreMessages() {}, setMessages: value => { state.rows = typeof value === 'function' ? value(state.rows) : value; },
        localStorage: { getItem: () => '[]' }, isPaginatingRef: {}, requestAnimationFrame: fn => state.frames.push(fn), console: quiet,
    }, 'loadOlderMessages');
    return { state, workspaceRef, activeConversationRef, lock, make, generation, container };
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

test('a same-conversation jump rejects pending older pages, errors and scroll restoration', async () => {
    const stale = paginationFixture(), pending = stale.make('scope-a', stale.state.active)();
    stale.generation.current++; stale.lock.current = null; stale.state.rows = [{ id: 'latest' }];
    stale.state.requests[0].resolve(response({ success: true, messages: [{ id: 'old-window' }] })); await pending;
    assert.deepEqual(stale.state.rows, [{ id: 'latest' }]); assert.deepEqual(stale.state.errors, []);
    const failed = paginationFixture(), error = failed.make('scope-a', failed.state.active)();
    failed.generation.current++; failed.lock.current = null;
    failed.state.requests[0].resolve({ ok: false, status: 503 }); await error;
    assert.deepEqual(failed.state.errors, [], 'old error must not disable current history');
    const layout = paginationFixture(), loaded = layout.make('scope-a', layout.state.active)();
    layout.state.requests[0].resolve(response({ success: true, messages: [{ id: 'older' }] })); await loaded;
    assert.equal(layout.state.frames.length, 1);
    layout.generation.current++; layout.container.scrollTop = 900; layout.container.scrollHeight = 1200;
    layout.state.frames[0](); assert.equal(layout.container.scrollTop, 900, 'old frame must not move the new window');
});

test('a same-conversation jump rejects pending newer pagination', async () => {
    const f = messageFixture();
    f.context.messages = [{ id: '00000000-0000-4000-8000-000000000001', created_at: '2026-09-26T20:00:00Z' }];
    const newer = evaluate(slice(messenger, '    const loadNewerMessages =', '    const rememberReadingPosition ='), { ...f.context, hasNewerMessages: true, isMessageId }, 'loadNewerMessages');
    const pendingPage = newer();
    const pendingWindow = f.load('conversation-a', { latest: true });
    f.state.requests[1].resolve(response({ success: true, messages: [{ ...f.initial, id: 'latest' }], hasNewer: false })); await pendingWindow;
    f.state.requests[0].resolve(response({ success: true, messages: [{ id: 'stale-page' }], hasNewer: true })); await pendingPage;
    assert.deepEqual(f.state.rows.map(m => m.id), ['latest']);
    assert.equal(f.context.historyWindowRef.current.hasNewer, false);
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

test('the after-render read selects the latest visible persisted message and leaves offscreen arrivals unread', () => {
    const reads = [], oldest = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', newest = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
    const unseen = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', conversationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const nodes = [[oldest, 5, 30], [newest, 30, 55], [unseen, 200, 220], ['temp-pending', 50, 70]].map(([id, top, bottom]) => ({ dataset: { messageId: id }, getBoundingClientRect: () => ({ top, bottom, left: 0, right: 100 }) }));
    const workspaceRef = { current: 'scope-a' }, lastVisibleReadRef = { current: null }, document = { visibilityState: 'visible' };
    const context = {
        useEffect: fn => fn(), incomingRead: { scope: 'scope-a', conversationId, messageId: oldest },
        workspaceRef, activeConversationRef: { current: { id: conversationId } }, pendingScrollRef: { current: null },
        visibleReadRef: { current: null }, lastVisibleReadRef, document, isMessageId, visibleMessageBoundary,
        requestAnimationFrame: fn => { fn(); return 1; }, cancelAnimationFrame() {},
        messagesContainerRef: { current: { getBoundingClientRect: () => ({ top: 0, bottom: 100, left: 0, right: 100 }), querySelectorAll: () => nodes } },
        messages: [oldest, newest, unseen].map(id => ({ id, conversation_id: conversationId })),
        markConversationReadRef: { current: (...args) => reads.push(args) },
    };
    const code = slice(messenger, '    // A rendered row outside the viewport', '    // Typing indicator broadcast');
    evaluate(code, context, 'undefined');
    assert.deepEqual(reads, [[conversationId, newest]]);
    document.visibilityState = 'hidden'; lastVisibleReadRef.current = null;
    evaluate(code, context, 'undefined'); assert.equal(reads.length, 1, 'hidden windows cannot acknowledge');
    document.visibilityState = 'visible'; workspaceRef.current = 'scope-b';
    evaluate(code, context, 'undefined'); assert.equal(reads.length, 1, 'stale workspace intent cannot acknowledge');
});
