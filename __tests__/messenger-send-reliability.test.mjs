import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { verifyAccountingMessage } from '../src/lib/accountingMessage.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CONVERSATION = '33333333-3333-4333-8333-333333333333';
const REQUEST = '44444444-4444-4444-8444-444444444444';
const MESSAGE = '55555555-5555-4555-8555-555555555555';
const PAGE = '66666666-6666-4666-8666-666666666666';

// Execute the maintained route with only its external I/O replaced. Database
// atomicity and concurrent duplicate writes have separate PostgreSQL coverage.
function fixture(options = {}) {
    const calls = [], notifications = [], access = [];
    let sendCount = 0;
    const db = {
        from(table) {
            const query = { table, filters: [] };
            calls.push(query);
            const result = () => {
                const others = query.filters.some(([kind]) => kind === 'neq');
                const fault = table === 'messenger_blocked' ? options.blocks
                    : table === 'social_conversation_participants' ? (others ? options.others : options.participant)
                    : table === 'social_pages' ? options.page : table === 'club_members' ? options.membership : null;
                if (fault === 'throw') throw new Error('Fixture Lookup Unavailable');
                if (fault === 'error') return { data: null, error: { code: '08006', message: 'Fixture Lookup Unavailable' } };
                if (table === 'social_conversation_participants') return { data: others ? [{ user_id: OTHER }] : fault === 'missing' ? null : { id: 'participant' } };
                if (table === 'messenger_blocked') return { data: options.blocked ? [{ blocker_id: OTHER, blocked_id: USER }] : [] };
                if (table === 'social_pages') return { data: options.pageData || null };
                if (table === 'club_members') return { data: options.membershipData || null };
                if (table === 'profiles') return { data: { username: 'Fixture Sender', avatar_url: '/fixture.png' } };
                throw new Error(`Unexpected Table ${table}`);
            };
            const chain = {
                select() { return this; },
                eq(k, v) { query.filters.push(['eq', k, v]); return this; },
                neq(k, v) { query.filters.push(['neq', k, v]); return this; },
                or() { return this; },
                maybeSingle: async () => result(),
                then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); },
            };
            return chain;
        },
        async rpc(name, args) {
            calls.push({ name, args });
            if (options.rpcThrow) throw new Error('Fixture Transport Failure');
            if (options.rpcError) return { data: null, error: options.rpcError };
            if (options.receipt !== undefined) return { data: options.receipt };
            return { data: { success: true, message_id: MESSAGE, replayed: sendCount++ > 0 } };
        },
    };
    const mocks = {
        randomUUID: () => REQUEST,
        createClient: () => db,
        getServerUserWithFallback: async () => ({ user: options.unauthenticated ? null : { id: USER } }),
        applyRateLimit: () => !options.limited, LIMITS: { write: {} }, reportApiError() {},
        sanitizeMessage: content => content.replace(/<script>.*?<\/script>/g, '[Removed Malicious Code]'),
        getMessengerWorkspace: async (_db, userId, request) => {
            access.push({ userId, request });
            if (options.workspaceStatus) throw Object.assign(new Error('Workspace Unavailable'), { status: options.workspaceStatus });
        },
        notifyNewMessage: async (...args) => {
            notifications.push(args);
            if (options.notifyThrows) throw new Error('Notification Unavailable');
            return { ok: true };
        },
    };
    const source = fs.readFileSync('pages/api/messenger/send-message.js', 'utf8');
    const code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'process', 'console', code)(
        () => mocks, module, module.exports, { env: { SUPABASE_SERVICE_ROLE_KEY: 'local-fixture' } }, { warn() {} });
    return { calls, notifications, access, async run(body = {}, request = {}) {
        let status = 200, payload;
        await module.exports.default({ method: 'POST', headers: { authorization: 'Bearer local-fixture' },
            body: { conversationId: CONVERSATION, requestId: REQUEST, content: 'Fixture Message', ...body }, ...request }, {
            status(value) { status = value; return this; }, json(value) { payload = value; return this; }, setHeader() {},
        });
        return { status, payload };
    } };
}

for (const lookup of ['participant', 'others', 'blocks']) {
    for (const failure of ['error', 'throw']) {
        test(`a ${lookup} lookup ${failure} fails closed before a send`, async () => {
            const f = fixture({ [lookup]: failure });
            const result = await f.run();
            assert.equal(result.status, 503);
            assert.equal(result.payload.success, false);
            assert.equal(f.calls.filter(c => c.name).length, 0);
            assert.equal(f.notifications.length, 0);
        });
    }
}

test('a denied identity, nonparticipant, or mutual block cannot send', async () => {
    for (const [options, expected] of [[{ unauthenticated: true }, 401], [{ participant: 'missing' }, 403], [{ blocked: true }, 403]]) {
        const f = fixture(options);
        assert.equal((await f.run()).status, expected);
        assert.equal(f.calls.filter(c => c.name).length, 0);
    }
});

test('missing credentials and wrong methods are rejected before access checks', async () => {
    for (const [request, expected] of [[{ headers: {} }, 401], [{ method: 'GET' }, 405]]) {
        const f = fixture();
        assert.equal((await f.run({}, request)).status, expected);
        assert.equal(f.calls.length, 0);
    }
});

test('supplied invalid request IDs never become fresh sends', async () => {
    for (const requestId of ['', null, {}, [], 1, 'not-a-uuid']) {
        const f = fixture();
        assert.equal((await f.run({ requestId })).status, 400);
        assert.equal(f.calls.length, 0);
    }
});

test('new sends preserve authenticated identity, canonical payload and existing response fields', async () => {
    const f = fixture();
    const result = await f.run({ userId: OTHER, content: '<script>bad()</script>Hello', message_type: 'image', media_metadata: { url: 'fixture' } });
    assert.equal(result.status, 200);
    assert.deepEqual(result.payload, { success: true, msgId: MESSAGE, content: '[Removed Malicious Code]Hello', requestId: REQUEST, replayed: false });
    assert.deepEqual(f.calls.find(c => c.name), { name: 'fn_send_message_once', args: {
        p_conversation_id: CONVERSATION, p_sender_id: USER, p_request_id: REQUEST,
        p_content: '[Removed Malicious Code]Hello', p_message_type: 'image', p_metadata: { url: 'fixture' },
    } });
    assert.deepEqual(f.access, [{ userId: USER, request: { workspace: 'resolve', conversationId: CONVERSATION } }]);
    assert.equal(f.notifications.length, 1);
    assert.equal(f.notifications[0][3], 'Sent a photo');
});

test('retry returns the persisted message ID without repeating notifications', async () => {
    const f = fixture();
    const original = await f.run();
    const retry = await f.run();
    assert.equal(original.payload.msgId, retry.payload.msgId);
    assert.equal(retry.payload.replayed, true);
    assert.equal(f.notifications.length, 1);
    assert.deepEqual(f.calls.filter(c => c.name).map(c => c.args.p_request_id), [REQUEST, REQUEST]);
});

test('legacy callers receive a generated operation ID while keeping the established payload shape', async () => {
    const f = fixture();
    const result = await f.run({ requestId: undefined });
    assert.equal(result.status, 200);
    assert.equal(result.payload.requestId, REQUEST);
    assert.equal(f.calls.find(c => c.name).args.p_request_id, REQUEST);
});

test('a reused key with a different payload is an explicit conflict', async () => {
    const f = fixture({ rpcError: { code: '23505', message: 'Message Request Conflicts With Previous Send' } });
    const result = await f.run();
    assert.equal(result.status, 409);
    assert.equal(result.payload.error, 'Message Request Conflicts With Previous Send');
    assert.equal(f.notifications.length, 0);
});

test('transaction authorization remains authoritative and unrelated unique failures are not payload conflicts', async () => {
    for (const [rpcError, expected] of [[{ code: '42501' }, 403], [{ code: '23505', message: 'Unrelated Unique Failure' }, 503]]) {
        const f = fixture({ rpcError });
        assert.equal((await f.run()).status, expected);
        assert.equal(f.notifications.length, 0);
    }
});

test('failed or malformed persistence receipts cannot become send success', async () => {
    for (const options of [{ rpcThrow: true }, { rpcError: { code: '08006' } }, { receipt: { success: false, message_id: MESSAGE } },
        { receipt: { success: true } }, { receipt: { success: true, message_id: 'bad', replayed: false } },
        { receipt: { success: true, message_id: MESSAGE } }]) {
        const f = fixture(options);
        assert.equal((await f.run()).status, 503);
        assert.equal(f.notifications.length, 0);
    }
});

test('workspace privacy and temporary errors are enforced before persistence', async () => {
    for (const status of [403, 404, 503]) {
        const f = fixture({ workspaceStatus: status });
        assert.equal((await f.run()).status, status);
        assert.equal(f.calls.filter(c => c.name).length, 0);
    }
});

test('club identity is server derived, and failed verification remains retryable', async () => {
    const input = { media_metadata: { is_club_identity: true, club_id: PAGE, club_name: 'Forged Club', club_avatar: 'forged' } };
    const verified = fixture({ pageData: { id: PAGE, owner_id: USER, name: 'Verified Club', avatar_url: 'verified' } });
    assert.equal((await verified.run(input)).status, 200);
    assert.deepEqual(verified.calls.find(c => c.name).args.p_metadata, { is_club_identity: true, club_id: PAGE, club_name: 'Verified Club', club_avatar: 'verified' });
    const unverified = fixture();
    assert.equal((await unverified.run(input)).status, 200);
    assert.deepEqual(unverified.calls.find(c => c.name).args.p_metadata, {});
    for (const page of ['error', 'throw']) {
        const unavailable = fixture({ page });
        assert.equal((await unavailable.run(input)).status, 503);
        assert.equal(unavailable.calls.filter(c => c.name).length, 0);
    }
    for (const membership of ['error', 'throw']) {
        const unavailable = fixture({ pageData: { id: PAGE, owner_id: OTHER, linked_entity_type: 'club', linked_entity_id: 'club' }, membership });
        assert.equal((await unavailable.run(input)).status, 503);
        assert.equal(unavailable.calls.filter(c => c.name).length, 0);
    }
});

test('notification failure never changes a committed send to a send failure', async () => {
    const f = fixture({ notifyThrows: true });
    const result = await f.run();
    assert.equal(result.status, 200);
    assert.equal(result.payload.msgId, MESSAGE);
});

function historyFixture(options = {}) {
    const ownMessage = { id: MESSAGE, conversation_id: CONVERSATION, sender_id: USER,
        content: 'Fixture Message', message_type: 'text', media_metadata: {}, profiles: { id: USER } };
    const messages = options.messages || [ownMessage];
    const queries = [];
    const mocks = {
        createClient: () => ({ rpc: async name => {
            assert.equal(name, 'fn_get_reactions_for_messages');
            return { data: [] };
        }, from(table) {
            const query = { table, filters: [] }; queries.push(query);
            return {
                select(columns) { query.columns = columns; return this; },
                eq(key, value) { query.filters.push([key, value]); return this; },
                in(key, ids) { query.ids = ids; assert.equal(key, 'id'); return this; },
                then(resolve, reject) { return Promise.resolve().then(() => {
                    if (options.failure === 'throw') throw new Error('Transport Failed');
                    if (options.failure === 'error') return { data: null, error: { code: '08006' } };
                    if (options.rows) return { data: options.rows };
                    return { data: query.ids.map(id => ({ id, request_id: options.legacy ? null : REQUEST })) };
                }).then(resolve, reject); },
            };
        } }),
        getServerUserWithFallback: async () => ({ user: { id: USER } }),
        readMessengerMessages: async (_db, userId, request) => {
            assert.equal(userId, USER);
            assert.equal(request.conversationId, CONVERSATION);
            if (options.denied) throw Object.assign(new Error('Denied'), { status: 403 });
            return messages;
        },
        verifyAccountingMessage, applyRateLimit: () => true, LIMITS: { read: {} }, reportApiError() {},
    };
    const code = ts.transpileModule(fs.readFileSync('pages/api/messenger/get-messages.js', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'process', 'console', code)(() => mocks, module, module.exports,
        { env: { SUPABASE_SERVICE_ROLE_KEY: 'local-fixture' } }, { warn() {} });
    return { queries, ownMessage, async run() {
        let status = 200, payload;
        await module.exports.default({ method: 'POST', headers: { authorization: 'Bearer local-fixture' },
            body: { conversationId: CONVERSATION, userId: OTHER } }, {
            status(value) { status = value; return this; }, json(value) { payload = value; return this; },
        });
        return { status, payload };
    } };
}

test('message history enriches the authorized own page and preserves request identity through normalization', async () => {
    const f = historyFixture();
    const { status, payload } = await f.run();
    assert.equal(status, 200);
    assert.equal(payload.messages[0].request_id, REQUEST);
    assert.equal(payload.messages[0].id, MESSAGE);
    assert.equal(payload.messages[0].text, 'Fixture Message');
    assert.deepEqual(f.queries, [{ table: 'social_messages', columns: 'id,request_id',
        filters: [['conversation_id', CONVERSATION], ['sender_id', USER]], ids: [MESSAGE] }]);
    assert.equal((await historyFixture({ legacy: true }).run()).payload.messages[0].request_id, null);
});

test('request enrichment never queries another sender or a page the reader denied', async () => {
    const peer = historyFixture({ messages: [{ id: OTHER, sender_id: OTHER, content: 'Peer Message', media_metadata: {} }] });
    const result = await peer.run();
    assert.equal(result.status, 200);
    assert.equal(peer.queries.length, 0);
    assert.equal(Object.hasOwn(result.payload.messages[0], 'request_id'), false);
    const denied = historyFixture({ denied: true });
    assert.equal((await denied.run()).status, 403);
    assert.equal(denied.queries.length, 0);
});

test('request enrichment batches only IDs from the returned visible own page', async () => {
    const { ownMessage } = historyFixture();
    const ownMessages = Array.from({ length: 101 }, (_, i) => ({ ...ownMessage, id: `77777777-7777-4777-8777-${String(i).padStart(12, '0')}` }));
    const peer = { ...ownMessage, id: OTHER, sender_id: OTHER };
    const f = historyFixture({ messages: [...ownMessages, peer] });
    assert.equal((await f.run()).status, 200);
    assert.deepEqual(f.queries.map(q => q.ids.length), [100, 1]);
    assert.deepEqual(new Set(f.queries.flatMap(q => q.ids)), new Set(ownMessages.map(m => m.id)));
});

test('unavailable or incomplete request enrichment cannot silently break committed-send recovery', async () => {
    for (const options of [{ failure: 'error' }, { failure: 'throw' }, { rows: [] },
        { rows: [{ id: OTHER, request_id: REQUEST }] }, { rows: [{ id: MESSAGE }] },
        { rows: [{ id: MESSAGE, request_id: 'invalid' }] }]) {
        assert.equal((await historyFixture(options).run()).status, 503);
    }
});
