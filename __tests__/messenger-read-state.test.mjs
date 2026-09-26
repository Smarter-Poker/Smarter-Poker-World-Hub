import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { persistNotificationReads } from '../src/lib/notificationReads.mjs';

test('visible social and poker notifications persist through their own endpoints once', async () => {
    const calls = [];
    await persistNotificationReads(['one', 'poker-two', 'one'], 'fixture', async (url, options) => {
        calls.push([url, options.method, JSON.parse(options.body)]);
        return { ok: true, json: async () => ({ success: true }) };
    });
    assert.deepEqual(calls, [
        ['/api/notifications/mark-read', 'POST', { ids: ['one'] }],
        ['/api/poker/notifications', 'PUT', { notification_id: 'two' }],
    ]);
});

test('an empty read list performs no mark-all write', async () => {
    await persistNotificationReads([], 'fixture', () => assert.fail('unexpected write'));
});

test('HTTP errors and rejected receipts never claim notification read success', async () => {
    for (const [ok, success] of [[false, false], [true, false], [false, true]]) {
        await assert.rejects(persistNotificationReads(['one'], 'fixture', async () => ({ ok, json: async () => ({ success }) })));
    }
});

function readRoute({ participant = true, allowed = true, receipt = { success: true }, error = null } = {}) {
    const calls = [];
    const chain = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: participant ? { id: 'member' } : null }) };
    const db = { from: () => chain, rpc: async (name, args) => { calls.push({ name, args }); return { data: receipt, error }; } };
    const mocks = {
        createClient: () => db,
        getServerUserWithFallback: async () => ({ user: { id: 'authenticated-user' } }),
        applyRateLimit: () => true, LIMITS: {}, reportApiError() {},
        getMessengerWorkspace: async (_db, userId, request) => {
            assert.equal(userId, 'authenticated-user');
            assert.equal(request.workspace, 'resolve');
            if (!allowed) throw Object.assign(new Error('Private Invoice'), { status: 403 });
        },
    };
    const code = ts.transpileModule(fs.readFileSync('pages/api/messenger/mark-read.js', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'process', code)(() => mocks, module, module.exports, { env: { SUPABASE_SERVICE_ROLE_KEY: 'fixture' } });
    return { calls, async run(body = {}) {
        let status = 200, payload;
        await module.exports.default({ method: 'POST', headers: { authorization: 'Bearer fixture' }, body: { conversationId: 'conversation', userId: 'forged-user', ...body } }, {
            status(n) { status = n; return this; }, json(data) { payload = data; return this; },
        });
        return { status, payload };
    } };
}

test('message read receipts use authenticated identity and require acknowledged persistence', async () => {
    const route = readRoute();
    assert.equal((await route.run()).payload.success, true);
    assert.deepEqual(route.calls, [{ name: 'fn_mark_messages_read', args: { p_user_id: 'authenticated-user', p_conversation_id: 'conversation' } }]);
    for (const config of [{ receipt: { success: false } }, { error: { code: '57014' } }]) {
        const result = await readRoute(config).run();
        assert.equal(result.status, 503);
        assert.equal(result.payload.success, false);
    }
});

test('private invoices and nonparticipants cannot be silently marked read', async () => {
    for (const config of [{ allowed: false }, { participant: false }]) {
        const route = readRoute(config);
        assert.equal((await route.run()).payload.success, false);
        assert.equal(route.calls.length, 0);
    }
});

test('notification opening observes visible rows without clearing unseen records', () => {
    const source = fs.readFileSync('src/components/notifications/HubNotificationsFeed.jsx', 'utf8');
    assert.doesNotMatch(source, /fetch\('\/api\/notifications\/mark-seen'/);
    assert.match(source, /feedRoot\.current\?\.querySelectorAll\('\.unread-notification-row'\)/);
    assert.match(source, /await persistNotificationReads\(ids/);
    const write = source.indexOf('await persistNotificationReads(ids');
    const clear = source.indexOf('setNotifications(next)', write);
    assert.ok(clear > write);
});

function refreshFixture() {
    const source = fs.readFileSync('src/hooks/useUnreadCount.jsx', 'utf8');
    const implementation = source.slice(source.indexOf('    const refreshCounts ='), source.indexOf('    const refreshUnread ='));
    const pending = [], painted = [];
    const identityRef = { current: 'account-a' }, refreshSequence = { current: 0 };
    let invalidations = 0;
    const refresh = new Function('context', `const {userId, identityRef, refreshSequence, getHeaderStats, invalidateHeaderStats, setMessageCount, setNotificationCount, setMessengerUnread} = context; ${implementation}; return refreshCounts;`)({
        userId: 'account-a', identityRef, refreshSequence,
        getHeaderStats: () => new Promise(resolve => pending.push(resolve)),
        invalidateHeaderStats: () => { invalidations++; },
        setMessageCount: n => painted.push(['messages', n]),
        setNotificationCount: n => painted.push(['notifications', n]),
        setMessengerUnread: summary => painted.push(['summary', summary]),
    });
    return { refresh, pending, painted, identityRef, invalidations: () => invalidations };
}

test('a delayed pre-read response cannot restore a cleared badge', async () => {
    const f = refreshFixture();
    const old = f.refresh(), fresh = f.refresh({ force: true, invalidate: true });
    f.pending[1]({ success: true, unreadMessages: 0, notificationCount: 0 });
    await fresh;
    f.pending[0]({ success: true, unreadMessages: 32, notificationCount: 97 });
    await old;
    assert.deepEqual(f.painted, [['messages', 0], ['notifications', 0], ['summary', null]]);
    assert.equal(f.invalidations(), 1);
});

test('old-account responses and failed counts cannot paint another accounts badges', async () => {
    const f = refreshFixture();
    const old = f.refresh(); f.identityRef.current = 'account-b';
    f.pending[0]({ success: true, unreadMessages: 32, notificationCount: 97 });
    await old;
    assert.deepEqual(f.painted, []);
    const failed = refreshFixture();
    const request = failed.refresh(); failed.pending[0]({ success: false });
    await request;
    assert.deepEqual(failed.painted, []);
});
