import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

async function fixture(file = 'pages/api/notifications/feed.js') {
  const state = { userId: 'account-a', failedTable: null, calls: [], inserted: [],
    tables: {
      notifications: [{ id: 'social', user_id: 'account-a', title: 'Seat Open', created_at: '2026-09-10T00:00:00Z', read: false }],
      page_followers: [{ page_type: 'venue', page_id: '123', user_id: 'account-a' }],
      page_notifications: [{ id: 'page', page_type: 'venue', page_id: '123', created_at: '2026-09-10T00:00:00Z' }],
      notification_reads: [], profiles: [],
    },
  };
  const client = { from(table) {
    const call = { table, filters: [], order: null, limit: null };
    state.calls.push(call);
    const chain = {
      select() { return chain; },
      eq(key, value) { call.filters.push(['eq', key, value]); return chain; },
      in(key, value) { call.filters.push(['in', key, value]); return chain; },
      or(value) { call.or = value; return chain; },
      order(key, options) { call.order = [key, options]; return chain; },
      limit(value) { call.limit = value; return chain; },
      insert(rows) { call.insert = rows; return chain; },
      maybeSingle() { call.single = true; return chain; },
      then(resolve, reject) {
        if (state.failedTable === table) return Promise.resolve({
          data: null, error: { code: '57014', message: 'Fixture Read Refused' },
        }).then(resolve, reject);
        if (call.insert) {
          state.inserted.push(...(Array.isArray(call.insert) ? call.insert : [call.insert]));
          return Promise.resolve({ data: call.insert, error: null }).then(resolve, reject);
        }
        let rows = [...(state.tables[table] || [])];
        for (const [op, key, value] of call.filters) {
          rows = rows.filter(row => op === 'eq' ? row[key] === value : value.includes(row[key]));
        }
        if (call.order) {
          const [key, options] = call.order;
          rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (options.ascending ? 1 : -1));
        }
        if (call.limit != null) rows = rows.slice(0, call.limit);
        return Promise.resolve({ data: call.single ? (rows[0] || null) : rows, error: null }).then(resolve, reject);
      },
    };
    return chain;
  } };
  const context = vm.createContext({
    process: { env: {} }, console: { warn() {} },
    require: () => ({ applyCors: () => true }),
  });
  const module = new vm.SourceTextModule(readFileSync(file, 'utf8'), { context });
  const mocks = {
    createClient: () => client,
    getServerUserWithFallback: async () => ({ user: state.userId ? { id: state.userId } : null }),
    reportApiError() {},
    resolveNotificationRoute: () => '/hub/poker-near-me',
    applyRateLimit: () => true,
    LIMITS: { write: {} },
  };
  await module.link(() => new vm.SyntheticModule(Object.keys(mocks), function () {
    for (const [key, value] of Object.entries(mocks)) this.setExport(key, value);
  }, { context }));
  await module.evaluate();
  async function request(query = {}, method = 'GET', body = {}) {
    const res = { statusCode: null, payload: null, headers: {},
      status(value) { this.statusCode = value; return this; },
      json(value) { this.payload = value; return this; },
      setHeader(key, value) { this.headers[key] = value; },
    };
    await module.namespace.default({ method, query, body }, res);
    return res;
  }
  return { state, request };
}

for (const table of ['notifications', 'page_followers', 'page_notifications', 'notification_reads']) {
  test('feed refuses and does not cache an authoritative ' + table + ' read error', async () => {
    const { state, request } = await fixture();
    state.failedTable = table;
    const refused = await request();
    assert.equal(refused.statusCode, 500);
    assert.equal(refused.payload.success, false);
    assert.equal(refused.payload.notifications, undefined);
    state.failedTable = null;
    const recovered = await request();
    assert.equal(recovered.statusCode, 200);
    assert.equal(recovered.headers['X-Cache'], 'MISS');
    assert.equal(recovered.payload.notifications.length, 2);
  });
}
test('a confirmed empty feed succeeds without querying unrelated page notifications', async () => {
  const { state, request } = await fixture();
  state.tables.notifications = [];
  state.tables.page_followers = [];
  const result = await request();
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.notifications.length, 0);
  assert.equal(result.payload.totalUnread, 0);
  assert.equal(state.calls.some(call => call.table === 'page_notifications'), false);
});
test('bust=1 reads through the warm server cache', async () => {
  const { state, request } = await fixture();
  await request();
  state.tables.notifications[0].read = true;
  const recovered = await request({ bust: '1' });
  assert.equal(recovered.headers['X-Cache'], 'MISS');
  assert.equal(recovered.payload.notifications.find(row => row.id === 'social').read, true);
});
test('feed cache and database filters follow authenticated identity', async () => {
  const { state, request } = await fixture();
  await request();
  state.userId = 'account-b';
  const result = await request({ user_id: 'account-a' });
  assert.equal(result.payload.notifications.length, 0);
  assert.equal(result.headers['X-Cache'], 'MISS');
  state.userId = null;
  assert.equal((await request()).statusCode, 401);
});
test('unsafe followed page ids cannot broaden the service-role feed query', async () => {
  const { state, request } = await fixture();
  state.tables.page_followers = [
    { page_type: 'venue', page_id: '123),or(id.gt.0', user_id: 'account-a' },
    { page_type: 'venue', page_id: '456', user_id: 'account-a' },
  ];
  await request();
  assert.equal(state.calls.find(call => call.table === 'page_notifications').or,
    'and(page_type.eq.venue,page_id.eq.456)');
});
test('mark-all covers the latest page signals shown by the unified feed', async () => {
  const { state, request } = await fixture('pages/api/poker/notifications.js');
  state.tables.page_notifications = Array.from({ length: 130 }, (_, i) => ({
    id: 'page-' + i, created_at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
  }));
  const result = await request({}, 'PUT', { mark_all: true, user_id: 'account-b' });
  assert.equal(result.statusCode, 200);
  assert.equal(state.inserted.length, 100);
  assert.ok(state.inserted.some(row => row.notification_id === 'page-129'));
  assert.ok(state.inserted.every(row => row.user_id === 'account-a'));
});
