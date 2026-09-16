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
  MARKETPLACE_PHASE7_SCHEMA_MARKER,
  catalogReadiness,
  runMarketplaceReadiness,
} = require('../src/lib/store/marketplaceReadiness.js');
const { declaredObjects, rpcArgumentSets } = await import('../scripts/ci/check-migrations-applied.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function queryResult(rows, count = rows.length) {
  return {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
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
  rpcData = MARKETPLACE_PHASE7_SCHEMA_MARKER,
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
      return { data: rpcData, error: rpcError };
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
  assert.equal(result.manualItems, 1);
  assert.equal(result.fulfillmentReady, 1);
  assert.equal(result.allFulfillmentReady, false);
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

test('strict readiness proves the exact Phase 7 schema marker and live provider probes', async () => {
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
    STRIPE_SECRET_KEY: 'sk_test_secret',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
    STRIPE_WEBHOOK_SECRET: 'whsec_marketplacefixture1234',
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
    manualMerchFulfillment: true,
    automaticMerchFulfillment: true,
  });
  assert.equal(result.fulfillmentMode, 'automatic');
  assert.deepEqual(
    client.calls.find((call) => call.type === 'rpc'),
    { type: 'rpc', name: 'marketplace_phase7_vip_acquisition_mutex_version', args: {} }
  );
  assert.equal(result.dependencies.supabase.schemaMarker, MARKETPLACE_PHASE7_SCHEMA_MARKER);
  assert.equal(result.dependencies.supabase.schemaMarkerReady, true);
  assert.deepEqual(requested.map((request) => request.url).sort(), [
    'https://api.printful.com/store',
    'https://api.stripe.com/v1/balance',
  ]);
  const serialized = JSON.stringify(result);
  for (const secret of Object.values(env).filter((value) => String(value).includes('secret'))) {
    assert.doesNotMatch(serialized, new RegExp(secret));
  }
});

test('readiness fails closed when production returns a stale Phase 7 schema marker', async () => {
  const result = await runMarketplaceReadiness({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
      STRIPE_SECRET_KEY: 'sk_test_secret',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
      STRIPE_WEBHOOK_SECRET: 'whsec_marketplacefixture1234',
    },
    createClient: () => marketplaceClient({
      items: [{ id: 'manual-item', has_variants: false, metadata: { fulfillment_provider: 'manual' } }],
      rpcData: 'marketplace_phase7_vip_acquisition_mutex:v0',
    }),
    fetchImpl: async () => ({ ok: true, status: 200 }),
    resolvePrintfulMapping: resolveMapping,
    isPrintfulReady: () => false,
  });

  assert.equal(result.ready, false);
  assert.equal(result.checks.supabase, false);
  assert.equal(result.dependencies.supabase.schemaMarkerReady, false);
  assert.equal(result.dependencies.supabase.schemaMarkerReason, 'schema_marker_mismatch');
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
      STRIPE_SECRET_KEY: 'sk_test_secret',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
      STRIPE_WEBHOOK_SECRET: 'whsec_marketplacefixture1234',
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
  assert.equal(result.capabilities.manualMerchFulfillment, true);
  assert.equal(result.checks.printful, true);
  assert.equal(result.fulfillmentMode, 'manual');
});

test('an explicitly disabled Printful switch remains deliberate manual fulfillment', async () => {
  const result = await runMarketplaceReadiness({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
      STRIPE_SECRET_KEY: 'sk_test_secret',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
      STRIPE_WEBHOOK_SECRET: 'whsec_marketplacefixture1234',
      PRINTFUL_AUTO_CONFIRM: 'false',
    },
    createClient: () => marketplaceClient({
      items: [{ id: 'manual-item', has_variants: false, metadata: { fulfillment_provider: 'manual' } }],
    }),
    fetchImpl: async () => ({ ok: true, status: 200 }),
    resolvePrintfulMapping: resolveMapping,
    isPrintfulConfigured: () => false,
    isAutoConfirmEnabled: () => false,
    isPrintfulReady: () => false,
  });

  assert.equal(result.ready, true);
  assert.equal(result.fulfillmentMode, 'manual');
  assert.equal(result.dependencies.printful.configurationPresent, false);
  assert.equal(result.dependencies.printful.autoConfirmConfigured, true);
  assert.equal(result.dependencies.printful.autoConfirmEnabled, false);
});

test('every partial Printful configuration is misconfigured instead of safe deferral', async () => {
  const partialConfigurations = [
    { PRINTFUL_API_TOKEN: 'printful-secret' },
    { PRINTFUL_AUTO_CONFIRM: 'true' },
    { PRINTFUL_AUTO_CONFIRM: 'sometimes' },
    { PRINTFUL_STORE_ID: '42' },
    { PRINTFUL_WEBHOOK_SECRET: 'printful-webhook-secret' },
  ];

  for (const partial of partialConfigurations) {
    const result = await runMarketplaceReadiness({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
        STRIPE_SECRET_KEY: 'sk_test_secret',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
        STRIPE_WEBHOOK_SECRET: 'whsec_marketplacefixture1234',
        ...partial,
      },
      createClient: () => marketplaceClient({
        items: [{ id: 'manual-item', has_variants: false, metadata: { fulfillment_provider: 'manual' } }],
      }),
      fetchImpl: async () => ({ ok: true, status: 200 }),
      resolvePrintfulMapping: resolveMapping,
      isPrintfulConfigured: (candidate) => Boolean(candidate.PRINTFUL_API_TOKEN),
      isAutoConfirmEnabled: (candidate) => candidate.PRINTFUL_AUTO_CONFIRM === 'true',
      isPrintfulReady: () => false,
    });

    assert.equal(result.ready, false, JSON.stringify(partial));
    assert.equal(result.checks.printful, false, JSON.stringify(partial));
    assert.equal(result.fulfillmentMode, 'misconfigured', JSON.stringify(partial));
    assert.equal(result.dependencies.printful.configurationPresent, true, JSON.stringify(partial));
    assert.equal(result.dependencies.printful.configured, false, JSON.stringify(partial));
  }
});

test('a healthy Printful connection reports mixed mode while any active item remains manual', async () => {
  const client = marketplaceClient({
    items: [
      { id: 'printful', has_variants: false, metadata: { fulfillment_provider: 'printful', sync_variant_id: 99 } },
      { id: 'manual', has_variants: false, metadata: { fulfillment_provider: 'manual' } },
    ],
  });
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    STRIPE_SECRET_KEY: 'sk_test_secret',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
    STRIPE_WEBHOOK_SECRET: 'whsec_marketplacefixture1234',
    PRINTFUL_API_TOKEN: 'printful-secret',
    PRINTFUL_AUTO_CONFIRM: 'true',
    PRINTFUL_STORE_ID: '42',
    PRINTFUL_WEBHOOK_SECRET: 'printful-webhook-secret',
  };
  const result = await runMarketplaceReadiness({
    env,
    createClient: () => client,
    fetchImpl: async () => ({ ok: true, status: 200 }),
    resolvePrintfulMapping: resolveMapping,
    isPrintfulConfigured: () => true,
    isAutoConfirmEnabled: () => true,
    isPrintfulReady: () => true,
  });

  assert.equal(result.ready, true);
  assert.equal(result.fulfillmentMode, 'mixed');
  assert.equal(result.catalog.printfulItems, 1);
  assert.equal(result.catalog.manualItems, 1);
  assert.equal(result.capabilities.manualMerchFulfillment, true);
  assert.equal(result.capabilities.automaticMerchFulfillment, false);
});

test('a configured Printful catalog fails readiness while any provider item is unmapped', async () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    STRIPE_SECRET_KEY: 'sk_test_secret',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
    STRIPE_WEBHOOK_SECRET: 'whsec_marketplacefixture1234',
    PRINTFUL_API_TOKEN: 'printful-secret',
    PRINTFUL_AUTO_CONFIRM: 'true',
    PRINTFUL_STORE_ID: '42',
    PRINTFUL_WEBHOOK_SECRET: 'printful-webhook-secret',
  };
  const result = await runMarketplaceReadiness({
    env,
    createClient: () => marketplaceClient({
      items: [{ id: 'unmapped-printful', has_variants: false, metadata: { fulfillment_provider: 'printful' } }],
    }),
    fetchImpl: async () => ({ ok: true, status: 200 }),
    resolvePrintfulMapping: resolveMapping,
    isPrintfulConfigured: () => true,
    isAutoConfirmEnabled: () => true,
    isPrintfulReady: () => true,
  });

  assert.equal(result.ready, false);
  assert.equal(result.checks.printful, false);
  assert.equal(result.fulfillmentMode, 'misconfigured');
  assert.equal(result.catalog.fulfillmentReady, 0);
});

test('Card readiness fails closed for a missing, mismatched, or non-live production key pair', async () => {
  const cases = [
    {
      name: 'missing publishable key',
      env: { STRIPE_SECRET_KEY: 'sk_test_secret' },
      expectedMode: 'invalid',
    },
    {
      name: 'mismatched key modes',
      env: {
        STRIPE_SECRET_KEY: 'sk_test_secret',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_public',
      },
      expectedMode: 'invalid',
    },
    {
      name: 'test keys in production',
      env: {
        STRIPE_SECRET_KEY: 'sk_test_secret',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
        VERCEL_ENV: 'production',
      },
      expectedMode: 'test',
    },
  ];

  for (const scenario of cases) {
    let providerFetches = 0;
    const result = await runMarketplaceReadiness({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
        STRIPE_WEBHOOK_SECRET: 'whsec_marketplacefixture1234',
        ...scenario.env,
      },
      createClient: () => marketplaceClient(),
      fetchImpl: async () => { providerFetches += 1; return { ok: true, status: 200 }; },
      resolvePrintfulMapping: resolveMapping,
      isPrintfulReady: () => false,
    });
    assert.equal(result.capabilities.cardCheckout, false, scenario.name);
    assert.equal(result.dependencies.stripe.configured, false, scenario.name);
    assert.equal(result.dependencies.stripe.keyMode, scenario.expectedMode, scenario.name);
    assert.equal(providerFetches, 0, scenario.name);
  }
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
