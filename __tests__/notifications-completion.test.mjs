import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { persistNotificationReads } from '../src/lib/notificationReads.mjs';

const feedSource = readFileSync('pages/api/notifications/feed.js', 'utf8');
const component = readFileSync('src/components/notifications/HubNotificationsFeed.jsx', 'utf8');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const stamp = n => `2026-09-26T12:00:00.${String(n).padStart(6, '0')}Z`;
const response = success => ({ ok: success, json: async () => ({ success }) });
const evaluate = (code, context, returned) => new Function(...Object.keys(context), `${code}\nreturn ${returned};`)(...Object.values(context));
const slice = (from, to) => component.slice(component.indexOf(from), component.indexOf(to, component.indexOf(from)));

async function apiFixture(file = 'pages/api/notifications/feed.js') {
    const state = { calls: [], social: [], poker: [], reads: [], failedTable: null };
    const db = { from(table) {
        const call = { table, filters: [], orders: [], ors: [], limit: null };
        state.calls.push(call);
        const q = {
            select(_columns, options) { call.count = options?.count; return q; }, eq(key, value) { call.filters.push(row => row[key] === value); return q; },
            not(key, _operator, value) { call.filters.push(row => row[key] !== value); return q; },
            in(key, values) { call.filters.push(row => values.includes(row[key])); return q; },
            lt(key, value) { call.filters.push(row => row[key] < value); return q; },
            lte(key, value) { call.filters.push(row => row[key] <= value); return q; },
            gt(key, value) { call.filters.push(row => row[key] > value); return q; },
            or(value) {
                call.ors.push(value);
                if (value.startsWith('created_at.lt.')) {
                    const match = value.match(/^created_at\.lt\.(.*),and\(created_at\.eq\.(.*),id\.lt\.([^)]*)\)$/);
                    assert.ok(match, 'cursor must use a validated timestamp/UUID filter');
                    call.filters.push(row => row.created_at < match[1] || row.created_at === match[2] && row.id < match[3]);
                }
                return q;
            },
            order(key, opts) { call.orders.push([key, opts.ascending]); return q; },
            limit(value) { call.limit = value; return q; },
            maybeSingle() { call.single = true; return q; },
            then(resolve, reject) {
                if (state.failedTable === table) return Promise.resolve({ data: null, error: { message: 'Fixture Read Refused' } }).then(resolve, reject);
                let rows = [...({ personal_notifications: state.social, page_notifications: state.poker,
                    notification_reads: state.reads, page_followers: [{ user_id: 'fixture', page_type: 'venue', page_id: 'venue' }], profiles: [{ id: 'fixture', username: 'fixture' }] }[table] || [])];
                for (const predicate of call.filters) rows = rows.filter(predicate);
                rows.sort((a, b) => {
                    for (const [key, asc] of call.orders) {
                        const diff = String(a[key]).localeCompare(String(b[key]));
                        if (diff) return asc ? diff : -diff;
                    }
                    return 0;
                });
                if (call.limit !== null) rows = rows.slice(0, call.limit);
                return Promise.resolve({ data: call.single ? rows[0] : rows, count: call.count ? rows.length : null, error: null }).then(resolve, reject);
            },
        };
        return q;
    } };
    const context = vm.createContext({ process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'fixture-not-a-credential' } }, console: { warn() {} } });
    const module = new vm.SourceTextModule(file.endsWith('/feed.js') ? feedSource : readFileSync(file, 'utf8'), { context });
    const exports = { createClient: () => db, getServerUserWithFallback: async () => ({ user: { id: 'fixture' } }), reportApiError() {}, resolveNotificationRoute: () => '/fixture',
        applyRateLimit: () => true, LIMITS: { read: {} }, getMessengerUnreadSummary: async () => ({ total: 0, social: 0, clubs: {} }) };
    await module.link(() => new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context }));
    await module.evaluate();
    return { state, async request(query = {}) {
        const out = { statusCode: 200, headers: {}, status(value) { this.statusCode = value; return this; },
            setHeader(key, value) { this.headers[key] = value; }, json(value) { this.body = value; return this; } };
        await module.namespace.default({ method: 'GET', query }, out);
        return out;
    } };
}

test('bounded notification pages reach older unread rows across both sources and equal timestamps', async () => {
    const f = await apiFixture();
    f.state.social = Array.from({ length: 65 }, (_, i) => ({ id: uuid(i + 1), user_id: 'fixture', type: 'system', created_at: stamp(100), read: i !== 0, is_read: i !== 0 }));
    f.state.poker = Array.from({ length: 35 }, (_, i) => ({ id: uuid(i + 101), page_type: 'venue', page_id: 'venue', created_at: stamp(i < 5 ? 101 : 100) }));
    let cursor, rows = [], pages = 0;
    do {
        const result = await f.request({ limit: '10', bust: '1', ...(cursor ? { cursor } : {}) });
        assert.equal(result.statusCode, 200);
        assert.ok(result.body.notifications.length <= 10);
        rows.push(...result.body.notifications);
        cursor = result.body.nextCursor;
        assert.ok(++pages <= 10, 'cursor must make progress');
    } while (cursor);
    assert.equal(rows.length, 100);
    assert.equal(new Set(rows.map(n => n.id)).size, 100);
    assert.ok(rows.some(n => n.id === uuid(1) && !n.read), 'oldest social unread must be reachable');
    assert.deepEqual(rows.slice(0, 5).map(n => n.id), Array.from({ length: 5 }, (_, i) => 'poker-' + uuid(105 - i)), 'microseconds remain ordered before source/UUID ties');
    assert.ok(f.state.calls.filter(c => ['personal_notifications', 'page_notifications'].includes(c.table)).every(c => c.limit === 11));
});

test('header notification count reaches beyond old caps with bounded receipt queries', async () => {
    const f = await apiFixture('pages/api/user/get-header-stats.js');
    f.state.social = [{ id: uuid(1), user_id: 'fixture', read: false, is_read: false }];
    f.state.poker = Array.from({ length: 1235 }, (_, i) => ({ id: uuid(i + 100), page_type: 'venue', page_id: 'venue' }));
    f.state.reads = f.state.poker.slice(0, 1150).map(n => ({ notification_id: n.id, user_id: 'fixture' }));
    const result = await f.request();
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.notificationCount, 86);
    const pages = f.state.calls.filter(c => c.table === 'page_notifications');
    assert.equal(pages.length, 13);
    assert.ok(pages.every(c => c.limit === 100));
    assert.ok(f.state.calls.filter(c => c.table === 'notification_reads').every(c => c.limit <= 100));
});

for (const table of ['page_followers', 'page_notifications', 'notification_reads']) {
    test(`header preserves unavailable status when ${table} fails instead of fabricating a count`, async () => {
        const f = await apiFixture('pages/api/user/get-header-stats.js');
        f.state.poker = [{ id: uuid(1) }];
        f.state.failedTable = table;
        const result = await f.request();
        assert.equal(result.statusCode, 500);
        assert.equal(result.body.notificationCount, undefined);
    });
}

test('cursor validation refuses filter injection and invalid limits remain bounded', async () => {
    const f = await apiFixture();
    for (const cursor of ['invalid', JSON.stringify({ source: 'social', at: stamp(1), id: 'x),or(user_id.neq.fixture' })]) {
        assert.equal((await f.request({ cursor })).statusCode, 400);
    }
    assert.equal(f.state.calls.length, 0);
    await f.request({ limit: '100000', bust: '1' });
    assert.ok(f.state.calls.filter(c => ['personal_notifications', 'page_notifications'].includes(c.table)).every(c => c.limit === 101));
});

test('authoritative notification refresh bypasses browser and server caches and normalizes legacy read flags', async () => {
    const f = await apiFixture();
    f.state.social = [{ id: uuid(1), user_id: 'fixture', created_at: stamp(1), read: false, is_read: false }];
    const first = await f.request({ bust: '1' });
    assert.equal(first.headers['Cache-Control'], 'private, no-store');
    f.state.social[0].is_read = true;
    const next = await f.request({ bust: '1' });
    assert.equal(next.body.notifications[0].read, true);
    assert.equal(next.body.totalUnread, 0);
});

test('partial notification receipts await every launched write and retain acknowledged IDs', async () => {
    let settleLast;
    const waiting = new Promise(resolve => { settleLast = resolve; });
    let complete = false;
    const pending = persistNotificationReads(['social', 'poker-failed', 'poker-saved'], 'fixture', async (url, options) => {
        if (url.endsWith('mark-read')) return response(true);
        if (JSON.parse(options.body).notification_id === 'failed') return response(false);
        await waiting; return response(true);
    }).catch(error => { complete = true; return error; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(complete, false, 'a fast failure cannot abandon a launched sibling receipt');
    settleLast();
    assert.deepEqual((await pending).savedIds.sort(), ['poker-saved', 'social']);
});

test('the actual notification read handler applies partial success, refreshes counts and requires explicit failure retry', async () => {
    const notificationsRef = { current: [{ id: 'social', read: false }, { id: 'poker-failed', read: false }] };
    let writes = 0, refreshes = 0, broadcasts = 0, fail = true;
    const context = {
        getAuthUser: () => ({ id: 'fixture' }), user: { id: 'fixture' }, document: { visibilityState: 'visible' },
        processingReadIds: { current: new Set() }, failedReadIds: { current: new Set() }, notificationsRef, mounted: { current: true },
        getAccessToken: async () => 'fixture', persistNotificationReads: (ids, token) => persistNotificationReads(ids, token, async url => { writes++; return response(!fail || url.endsWith('mark-read')); }),
        feedRequestSequence: { current: 0 }, paginationRef: { current: { loading: false } }, setLoadingMore() {},
        setNotifications: rows => { notificationsRef.current = rows; }, localStorage: { setItem() {} }, notificationCache: () => '',
        eventBus: { emit() {} }, EventType: {}, busEmit: { dataMutated() {} }, broadcastSync: () => broadcasts++, BROADCAST_TAB_ID: 'tab', instanceId: 'feed',
        refreshNotifications: async () => { refreshes++; return { notificationCount: notificationsRef.current.filter(n => !n.read).length }; },
        publishCount() {}, window: { self: 1, top: 1 }, console: { warn() {} }, toast: { error() {} },
    };
    const read = evaluate(slice('    const markAsRead =', '    // Opening notifications'), context, 'markAsRead');
    assert.equal(await read(['social', 'poker-failed'], { automatic: true }), false);
    assert.deepEqual(notificationsRef.current.map(n => n.read), [true, false]);
    assert.equal(refreshes, 1); assert.equal(broadcasts, 1);
    await read(['poker-failed'], { automatic: true });
    assert.equal(writes, 2, 'rendering a partial success cannot start a retry loop');
    fail = false;
    assert.equal(await read(['poker-failed']), true);
    assert.equal(writes, 3); assert.equal(notificationsRef.current[1].read, true);
});

test('the actual feed client appends pages once, uses no-store, and ignores superseded pagination', async () => {
    const requests = [], notificationsRef = { current: [] }, paginationRef = { current: { cursor: null, loading: false } }, feedRequestSequence = { current: 0 };
    const context = { useCallback: fn => fn, getAuthUser: () => ({ id: 'fixture' }), mounted: { current: true }, paginationRef,
        getAccessToken: async () => 'fixture', setUser() {}, setLoading() {}, setLoadingMore() {}, setNextCursor() {}, feedRequestSequence,
        fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })), isVisibleNotification: () => true, notificationsRef,
        setNotifications: rows => { notificationsRef.current = rows; }, notificationCache: () => '', localStorage: { setItem() {} }, toast: { error() {} }, console: { warn() {} } };
    const fetchFeed = evaluate(slice('    const fetchNotifications =', '    // ── Delete notification'), context, 'fetchNotifications');
    const done = (request, rows, cursor) => request.resolve({ ok: true, json: async () => ({ success: true, notifications: rows, nextCursor: cursor }) });
    const initial = fetchFeed(); await Promise.resolve(); done(requests[0], [{ id: 'one', read: true }], 'cursor-one'); await initial;
    const more = fetchFeed(undefined, { append: true }); await Promise.resolve();
    const duplicate = fetchFeed(undefined, { append: true }); await Promise.resolve();
    assert.equal(requests.length, 2); await duplicate;
    done(requests[1], [{ id: 'one', read: true }, { id: 'two', read: false }], 'cursor-two'); await more;
    assert.deepEqual(notificationsRef.current.map(n => n.id), ['one', 'two']);
    assert.equal(requests[1].options.cache, 'no-store'); assert.match(requests[1].url, /cursor=cursor-one/);
    const stale = fetchFeed(undefined, { append: true }); await Promise.resolve();
    const fresh = fetchFeed(); await Promise.resolve();
    done(requests[3], [{ id: 'new', read: true }], null); await fresh;
    done(requests[2], [{ id: 'stale', read: false }], null); await stale;
    assert.deepEqual(notificationsRef.current.map(n => n.id), ['new']);
});
