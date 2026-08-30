import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  catalogReadiness,
  runMarketplaceReadiness,
} = require('../src/lib/store/marketplaceReadiness.js');
const { declaredObjects, rpcArgumentSets } = await import('../scripts/ci/check-migrations-applied.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function queryResult(rows, count = rows.length) {
  return {
    select() { return this; },
    eq() { return this; },
    range(from, to) {
      return Promise.resolve({ data: rows.slice(from, to + 1), count, error: null });
    },
  };
}

function marketplaceClient({
  items = [],
  variants = [],
  itemCount = items.length,
  variantCount = variants.length,
  rpcError = null,
} = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push({ type: 'from', table });
      return table === 'merchandise_items'
        ? queryResult(items, itemCount)
        : queryResult(variants, variantCount);
    },
    async rpc(name, args) {
      calls.push({ type: 'rpc', name, args });
      return { data: { success: false, error: 'no_items' }, error: rpcError };
    },
  };
}

const resolveMapping = (item, variant) => {
  const source = variant || item || {};
  return source.sync_variant_id ? { sync_variant_id: source.sync_variant_id } : null;
};

test('catalog readiness paginates, counts the full catalog, and scopes mappings to Printful items', async () => {
  const items = [
    { id: 'local', has_variants: false, metadata: { fulfillment_provider: 'manual' } },
    { id: 'printful', has_variants: true, metadata: { fulfillment_provider: 'printful' } },
  ];
  const variants = [
    { id: 'v1', item_id: 'printful', metadata: { sync_variant_id: 101 } },
    { id: 'v2', item_id: 'printful', metadata: { sync_variant_id: 102 } },
  ];
  const client = marketplaceClient({ items, variants });
  const result = await catalogReadiness(client, {
    resolvePrintfulMapping: resolveMapping,
    pageSize: 1,
    maxItems: 10,
    maxVariants: 10,
  });

  assert.equal(result.reachable, true);
  assert.equal(result.complete, true);
  assert.equal(result.total, 2);
  assert.equal(result.variantsTotal, 2);
  assert.equal(result.printfulItems, 1);
  assert.equal(result.fulfillmentReady, 1);
  assert.equal(result.allFulfillmentReady, true);
});

test('catalog readiness fails closed when a sentinel row exceeds its bounded scan', async () => {
  const client = marketplaceClient({
    items: [
      { id: 'first', has_variants: false, metadata: { fulfillment_provider: 'manual' } },
      { id: 'second', has_variants: false, metadata: { fulfillment_provider: 'manual' } },
    ],
  });
  const result = await catalogReadiness(client, {
    resolvePrintfulMapping: resolveMapping,
    pageSize: 1,
    maxItems: 1,
    maxVariants: 10,
  });
  assert.equal(result.reachable, true);
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'catalog_health_limit_exceeded');
  assert.equal(result.total, 2);
  assert.equal(result.loaded, 1);
});

test('strict readiness executes the non-mutating RPC signature and live provider probes', async () => {
  const client = marketplaceClient({
    items: [{ id: 'printful', has_variants: false, metadata: { fulfillment_provider: 'printful', sync_variant_id: 99 } }],
  });
  const requested = [];
  const fetchImpl = async (url, options) => {
    requested.push({ url, options });
    return { ok: true, status: 200 };
  };
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    STRIPE_SECRET_KEY: 'stripe-secret',
    STRIPE_WEBHOOK_SECRET: 'stripe-webhook-secret',
    PRINTFUL_API_TOKEN: 'printful-secret',
    PRINTFUL_AUTO_CONFIRM: 'true',
    PRINTFUL_STORE_ID: '42',
    PRINTFUL_WEBHOOK_SECRET: 'printful-webhook-secret',
  };

  const result = await runMarketplaceReadiness({
    env,
    createClient: () => client,
    fetchImpl,
    resolvePrintfulMapping: resolveMapping,
    isPrintfulReady: (candidate) => candidate.PRINTFUL_AUTO_CONFIRM === 'true' && Boolean(candidate.PRINTFUL_API_TOKEN),
  });

  assert.equal(result.ready, true);
  assert.deepEqual(result.capabilities, {
    cardCheckout: true,
    diamondCheckout: true,
    automaticMerchFulfillment: true,
  });
  assert.deepEqual(
    client.calls.find((call) => call.type === 'rpc'),
    { type: 'rpc', name: 'reserve_merch_order', args: { p_items: [], p_dry_run: true } }
  );
  assert.deepEqual(requested.map((request) => request.url).sort(), [
    'https://api.printful.com/store',
    'https://api.stripe.com/v1/balance',
  ]);
  const serialized = JSON.stringify(result);
  for (const secret of Object.values(env).filter((value) => String(value).includes('secret'))) {
    assert.doesNotMatch(serialized, new RegExp(secret));
  }
});

test('missing provider configuration is explicit and does not attempt external calls', async () => {
  let fetches = 0;
  const result = await runMarketplaceReadiness({
    env: {},
    createClient: () => { throw new Error('must not create a client'); },
    fetchImpl: async () => { fetches += 1; throw new Error('must not fetch'); },
    resolvePrintfulMapping: resolveMapping,
    isPrintfulReady: () => false,
  });
  assert.equal(fetches, 0);
  assert.equal(result.ready, false);
  assert.equal(result.status, 'degraded');
  assert.equal(result.dependencies.supabase.reason, 'missing_configuration');
  assert.equal(result.dependencies.stripe.reason, 'missing_configuration');
  assert.equal(result.dependencies.printful.reason, 'missing_configuration');
});

test('deferred Printful does not take card and diamond checkout offline', async () => {
  const client = marketplaceClient({
    items: [{
      id: 'deferred-printful-item',
      has_variants: false,
      metadata: { fulfillment_provider: 'printful', sync_variant_id: 99 },
    }],
  });
  const result = await runMarketplaceReadiness({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
      STRIPE_SECRET_KEY: 'stripe-secret',
      STRIPE_WEBHOOK_SECRET: 'stripe-webhook-secret',
    },
    createClient: () => client,
    fetchImpl: async () => ({ ok: true, status: 200 }),
    resolvePrintfulMapping: resolveMapping,
    isPrintfulReady: () => false,
  });
  assert.equal(result.ready, true);
  assert.equal(result.capabilities.cardCheckout, true);
  assert.equal(result.capabilities.diamondCheckout, true);
  assert.equal(result.capabilities.automaticMerchFulfillment, false);
  assert.equal(result.checks.printful, true);
});

test('migration gate distinguishes overloaded RPC arguments instead of accepting name-only matches', () => {
  const sql = `
    CREATE FUNCTION public.reserve_merch_order(p_items jsonb, p_dry_run boolean)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
  `;
  assert.deepEqual(declaredObjects(sql).fns, [{
    name: 'reserve_merch_order',
    args: ['p_items', 'p_dry_run'],
  }]);

  const oldDoc = {
    paths: {
      '/rpc/reserve_merch_order': {
        post: { parameters: [{ in: 'body', schema: { properties: { p_items: {} } } }] },
      },
    },
  };
  const newDoc = {
    paths: {
      '/rpc/reserve_merch_order': {
        post: { parameters: [{ in: 'body', schema: { properties: { p_items: {}, p_dry_run: {} } } }] },
      },
    },
  };
  assert.deepEqual([...rpcArgumentSets(oldDoc, 'reserve_merch_order')[0]], ['p_items']);
  assert.deepEqual([...rpcArgumentSets(newDoc, 'reserve_merch_order')[0]], ['p_items', 'p_dry_run']);
});

test('deployment verifier preserves a non-JSON readiness HTTP status', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/api/store/readiness') {
      res.writeHead(404, { 'content-type': 'text/html' });
      return res.end('<h1>Not Found</h1>');
    }
    if (req.url === '/api/store/vip-membership-status') {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end('{"success":false}');
    }
    if (req.url === '/api/store/order-ledger') {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end('{"success":false}');
    }
    if (req.url?.startsWith('/images/')) {
      res.writeHead(200, { 'content-type': 'image/webp' });
      return res.end('image');
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end('<main>VIP Command Center Verified Reward Telemetry</main>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/verify-marketplace-deployment.mjs', base], {
      cwd: ROOT,
      env: { ...process.env, MARKETPLACE_PROBE_TIMEOUT_MS: '3000' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /FAIL 404 \/api\/store\/readiness \(http_404\)/);
  assert.doesNotMatch(result.stdout, /FAIL 0\s+\/api\/store\/readiness/);
});

test('Vercel build and scheduled health probe enforce marketplace operations without reordering platform prerequisites', async () => {
  const [pkgText, vercelText, vercelIgnore, cron] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
    readFile(new URL('../.vercelignore', import.meta.url), 'utf8'),
    readFile(new URL('../pages/api/cron/marketplace-health.js', import.meta.url), 'utf8'),
  ]);
  const pkg = JSON.parse(pkgText);
  const vercel = JSON.parse(vercelText);
  assert.match(pkg.scripts['test:marketplace'], /marketplace-operations\.test\.mjs/);
  assert.match(pkg.scripts.build, /npm run test:marketplace/);
  assert.ok(vercel.buildCommand.indexOf('prune-platform-bins') < vercel.buildCommand.indexOf('patch-next'));
  assert.ok(vercel.buildCommand.indexOf('patch-next') < vercel.buildCommand.indexOf('test:marketplace'));
  assert.ok(vercel.buildCommand.indexOf('test:marketplace') < vercel.buildCommand.indexOf('next build'));
  for (const file of pkg.scripts['test:marketplace'].match(/__tests__\/[^ ]+\.mjs/g) || []) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(vercelIgnore, new RegExp(`!/${escaped}`));
  }
  for (const dependency of [
    'e2e/05-diamond-store.spec.ts',
    'supabase/migrations/20260828010000_neural_steel_catalog_expansion.sql',
    'supabase/migrations/20260829120000_reserve_merch_order_dry_run.sql',
  ]) {
    const escaped = dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(vercelIgnore, new RegExp(`!/${escaped}`));
  }
  assert.ok(vercel.crons.some((entry) => entry.path === '/api/cron/marketplace-health'));
  assert.match(cron, /withCronHealth\('marketplace-health'/);
  assert.match(cron, /requireAdminSecret/);
  assert.match(cron, /status\(healthy \? 200 : 503\)/);
});
