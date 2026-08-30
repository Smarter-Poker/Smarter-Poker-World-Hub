import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const API = read('pages/api/store/order-ledger.js');
const ORDERS = read('pages/hub/diamond-store/orders.js');
const RECEIPT = read('pages/hub/diamond-store/orders/[orderId].js');
const VERIFIER = read('scripts/verify-marketplace-deployment.mjs');

function createResponse() {
  return {
    headers: {},
    headersSent: false,
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
}

async function loadHandler({ user = { id: '11111111-1111-4111-8111-111111111111' }, rows = {}, errors = {} } = {}) {
  const calls = [];
  const client = {
    from(table) {
      const state = { table, equals: [], included: [], cursor: null };
      calls.push(state);
      const query = {
        select() { return query; },
        eq(column, value) { state.equals.push([column, value]); return query; },
        order() { return query; },
        in(column, values) { state.included.push([column, values]); return query; },
        or(value) { state.cursor = value; return query; },
        async maybeSingle() {
          if (errors[table]) return { data: null, error: new Error(errors[table]) };
          const data = filterRows(rows[table] || [], state);
          return { data: data[0] || null, error: null };
        },
        async limit(limit) {
          if (errors[table]) return { data: null, error: new Error(errors[table]) };
          return { data: filterRows(rows[table] || [], state).slice(0, limit), error: null };
        },
      };
      return query;
    },
  };

  function filterRows(input, state) {
    let output = [...input];
    for (const [column, value] of state.equals) {
      output = output.filter((row) => row[column] === value);
    }
    for (const [column, values] of state.included) {
      output = output.filter((row) => values.includes(row[column]));
    }
    const cursorMatch = state.cursor?.match(
      /^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/
    );
    if (cursorMatch) {
      const [, before, sameTime, beforeId] = cursorMatch;
      output = output.filter(
        (row) => row.created_at < before || (row.created_at === sameTime && row.id < beforeId)
      );
    }
    return output.sort(
      (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
    );
  }

  const dependencyExports = {
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => user
        ? { user, error: null }
        : { user: null, error: new Error('unauthorized') },
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
  };
  const module = new SourceTextModule(API, { identifier: 'order-ledger.js' });
  await module.link(async (specifier) => {
    const exports = dependencyExports[specifier];
    assert.ok(exports, `unexpected module dependency: ${specifier}`);
    const synthetic = new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
    return synthetic;
  });
  await module.evaluate();
  return { handler: module.namespace.default, calls };
}

test('unified marketplace ledger is authenticated, owner-scoped, and explicitly allowlisted', () => {
  assert.match(API, /getServerUserWithFallback/);
  assert.match(API, /authError \|\| !user\?\.id/);
  assert.match(API, /\.eq\(definition\.ownerColumn, userId\)/);
  assert.match(API, /data\?\.\[definition\.ownerColumn\] !== userId/);
  assert.match(API, /Cache-Control', 'private, no-store'/);
  assert.match(API, /Vary', 'Authorization'/);
  assert.doesNotMatch(API, /select\(['"]\*['"]/);
  assert.doesNotMatch(API, /shipping_address|stripe_subscription_id|stripe_customer_id/);
  assert.match(API, /Object\.hasOwn\(SOURCES, source\)/);
  assert.match(API, /CURSOR_TIMESTAMP_RE\.test\(createdAt\)/);
  assert.match(API, /ownerColumn/);
});

test('ledger merges every marketplace settlement source with cursor pagination', () => {
  for (const table of [
    'diamond_purchases',
    'merchandise_orders',
    'vip_subscriptions',
    'diamond_transactions',
    'club_shop_purchases',
  ]) {
    assert.match(API, new RegExp(`table: '${table}'`));
  }
  assert.match(API, /parseCursor/);
  assert.match(API, /encodeCursor/);
  assert.match(API, /query\.limit\(limit \+ 1\)/);
  assert.match(API, /flatMap\(\(result\) => result\.rows\)/);
  assert.match(API, /\.sort\(/);
  assert.match(API, /const selected = merged\.slice\(0, limit\)/);
  assert.match(API, /nextCursor: hasMore \? encodeCursor\(nextPositions\) : null/);
  assert.doesNotMatch(API, /new Date\(createdAt\)\.toISOString\(\)/);
  assert.match(API, /String\(b\?\.createdAt \|\| ''\)\.localeCompare/);
  assert.doesNotMatch(API, /MAX_LIMIT = 500|count: 'exact'|\.range\(0, limit\)/);
  assert.match(API, /unavailableSources/);
});

test('order history uses the private API with cancellation and latest-request-wins protection', () => {
  assert.match(ORDERS, /authedFetch\(`\/api\/store\/order-ledger\?limit=50\$\{cursorQuery\}`/);
  assert.match(ORDERS, /loadAbortRef\.current\?\.abort\(\)/);
  assert.match(ORDERS, /signal: controller\.signal/);
  assert.match(ORDERS, /requestId !== loadRequestRef\.current/);
  assert.match(ORDERS, /error\?\.name === 'AbortError'/);
  assert.match(ORDERS, /loadOrders\(\{ append: true, cursor: nextCursor \}\)/);
  assert.match(ORDERS, /new Map\(current\.map/);
  assert.match(ORDERS, /String\(b\?\.created_at \|\| ''\)\.localeCompare/);
  assert.match(ORDERS, /visibilitychange/);
  assert.match(ORDERS, /ordersOwnerId === user\?\.id \? loadedOrders : \[\]/);
  assert.match(ORDERS, /setOrdersOwnerId\(ownerId\)/);
  assert.doesNotMatch(ORDERS, /\.channel\(|from '.*supabase'/);
  assert.doesNotMatch(ORDERS, /\.from\(['"](?:diamond_purchases|merchandise_orders|vip_subscriptions)['"]\)/);
});

test('private receipts use the same server-owned ledger and never query commerce tables in-browser', () => {
  assert.match(RECEIPT, /authedFetch/);
  assert.match(RECEIPT, /\/api\/store\/order-ledger\?source=/);
  assert.match(RECEIPT, /cache: 'no-store'/);
  assert.match(RECEIPT, /controller\.abort\(\)/);
  assert.match(RECEIPT, /setRecord\(null\)/);
  assert.match(RECEIPT, /requestId !== requestRef\.current/);
  assert.match(RECEIPT, /loadedRecord\?\._routeSource === source/);
  assert.match(RECEIPT, /loadedRecord\?\._routeOrderId === String\(rawOrderId \|\| ''\)/);
  assert.match(RECEIPT, /loadedRecord\?\._ownerId === user\?\.id/);
  assert.match(RECEIPT, /Object\.hasOwn\(ORDER_SOURCES/);
  assert.doesNotMatch(RECEIPT, /\.from\(['"](?:diamond_purchases|merchandise_orders|vip_subscriptions)['"]\)/);
});

test('refund progress and marketplace-wide purchase categories stay visible', () => {
  assert.match(API, /refunded_amount_cents/);
  assert.match(API, /refunded_diamonds/);
  assert.match(API, /refunded_at/);
  assert.match(API, /transactionTypes: \['vip_daily', 'vip_membership'\]/);
  assert.match(ORDERS, /Refunded \{formatAmount\(order\.refundAmount/);
  assert.match(RECEIPT, /Net Settled/);
});

test('pre-idempotency backup code is not shipped in the API route tree', () => {
  assert.equal(existsSync(join(ROOT, 'pages/api/store/.purchase-daily-vip.js.bak-preidem')), false);
  assert.match(VERIFIER, /'\/api\/store\/order-ledger'/);
});

test('ledger handler rejects anonymous and prototype-source receipt requests', async () => {
  const anonymous = await loadHandler({ user: null });
  const anonymousRes = createResponse();
  await anonymous.handler({ method: 'GET', query: {}, headers: {} }, anonymousRes);
  assert.equal(anonymousRes.statusCode, 401);
  assert.equal(anonymous.calls.length, 0);

  const authenticated = await loadHandler();
  for (const source of ['constructor', '__proto__']) {
    const res = createResponse();
    await authenticated.handler(
      { method: 'GET', query: { source, id: '11111111-1111-4111-8111-111111111111' }, headers: {} },
      res
    );
    assert.equal(res.statusCode, 400);
  }
  const malformedCursor = Buffer.from(JSON.stringify({
    v: 1,
    positions: {
      diamonds: {
        createdAt: 'August 29, 2026 12:00:00',
        id: '11111111-1111-4111-8111-111111111111',
      },
    },
  })).toString('base64url');
  const cursorRes = createResponse();
  await authenticated.handler(
    { method: 'GET', query: { cursor: malformedCursor }, headers: {} },
    cursorRes
  );
  assert.equal(cursorRes.statusCode, 400);
});

test('receipt lookup remains owner-scoped and indistinguishable from a missing id', async () => {
  const { handler } = await loadHandler({
    rows: {
      diamond_purchases: [{
        id: '22222222-2222-4222-8222-222222222222',
        user_id: '99999999-9999-4999-8999-999999999999',
        package_name: 'Vault',
        created_at: '2026-08-29T12:00:00.000Z',
      }],
    },
  });
  const res = createResponse();
  await handler({
    method: 'GET',
    query: { source: 'diamonds', id: '22222222-2222-4222-8222-222222222222' },
    headers: {},
  }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'Order not found');
});

test('cursor pages advance without duplicates and preserve bounded reads', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const diamondRows = Array.from({ length: 24 }, (_, index) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(100000000000 + index)}`,
    user_id: userId,
    package_name: `Package ${index}`,
    price_usd: 9.99,
    diamonds_amount: 100,
    refunded_amount_cents: 0,
    refunded_diamonds: 0,
    status: 'completed',
    created_at: new Date(Date.UTC(2026, 7, 29, 12, 0, 24 - index)).toISOString(),
  }));
  const { handler } = await loadHandler({ rows: { diamond_purchases: diamondRows } });
  const first = createResponse();
  await handler({ method: 'GET', query: { limit: '10' }, headers: {} }, first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.data.orders.length, 10);
  assert.equal(first.body.data.hasMore, true);
  assert.ok(first.body.data.nextCursor);

  const second = createResponse();
  await handler({
    method: 'GET',
    query: { limit: '10', cursor: first.body.data.nextCursor },
    headers: {},
  }, second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.data.orders.length, 10);
  const firstIds = new Set(first.body.data.orders.map((order) => order.id));
  assert.equal(second.body.data.orders.some((order) => firstIds.has(order.id)), false);
});

test('cursor preserves PostgreSQL microseconds inside the same millisecond', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const rows = ['000900', '000800'].map((fraction, index) => ({
    id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(100000000000 + index)}`,
    user_id: userId,
    package_name: `Precision ${index}`,
    price_usd: 1,
    diamonds_amount: 10,
    status: 'completed',
    created_at: `2026-08-29T12:00:00.${fraction}Z`,
  }));
  const { handler } = await loadHandler({ rows: { diamond_purchases: rows } });
  const first = createResponse();
  await handler({ method: 'GET', query: { limit: '1' }, headers: {} }, first);
  const second = createResponse();
  await handler({
    method: 'GET',
    query: { limit: '1', cursor: first.body.data.nextCursor },
    headers: {},
  }, second);
  assert.equal(first.body.data.orders[0].id, rows[0].id);
  assert.equal(second.body.data.orders[0].id, rows[1].id);
});

test('partial and total source failures produce truthful response states', async () => {
  const partial = await loadHandler({ errors: { club_shop_purchases: 'club unavailable' } });
  const partialRes = createResponse();
  await partial.handler({ method: 'GET', query: {}, headers: {} }, partialRes);
  assert.equal(partialRes.statusCode, 200);
  assert.equal(partialRes.body.data.partial, true);
  assert.deepEqual(partialRes.body.data.unavailableSources, ['Club Shop purchases']);

  const allErrors = Object.fromEntries([
    'diamond_purchases',
    'merchandise_orders',
    'vip_subscriptions',
    'diamond_transactions',
    'club_shop_purchases',
  ].map((table) => [table, 'offline']));
  const unavailable = await loadHandler({ errors: allErrors });
  const unavailableRes = createResponse();
  await unavailable.handler({ method: 'GET', query: {}, headers: {} }, unavailableRes);
  assert.equal(unavailableRes.statusCode, 503);
});
