import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(ROOT, file), 'utf8');
const VALID_HERO_ASSET = await readFile(
  path.join(ROOT, 'public/images/store-v3/diamond-vault-hero.webp')
);

test('fulfillment privacy and mutation guards cover every early exit and stale completion', async () => {
  const [api, page, migration] = await Promise.all([
    read('pages/api/store/fulfillment-operations.js'),
    read('pages/hub/merch-store/fulfillment.js'),
    read(
      'supabase/migrations/20260906150000_marketplace_phase6_lifetime_and_fulfillment_guards.sql'
    ),
  ]);

  const handler = api.indexOf('export default async function handler');
  const privacy = api.indexOf('setPrivateCommerceResponse(res)', handler);
  const method = api.indexOf('req.method', handler);
  const rateLimit = api.indexOf('applyRateLimit', handler);
  assert.ok(privacy > handler && privacy < method && privacy < rateLimit);

  assert.match(page, /if \(transitionInFlightRef\.current\) return/);
  assert.match(page, /transitionInFlightRef\.current = true/);
  assert.match(page, /transitionAbortRef\.current\?\.abort\(\)/);
  assert.match(page, /signal: controller\.signal/);
  assert.match(page, /controller\.signal\.aborted\s*\|\|\s*!mountedRef\.current/);
  assert.match(page, /const stillOwnsTransition = transitionAbortRef\.current === controller/);
  assert.match(page, /if \(stillOwnsTransition\) \{/);
  assert.match(
    page,
    /mountedRef\.current && authOwnerRef\.current === expectedAccountId\) setBusyId\(null\)/
  );
  assert.match(api, /refund_diamond_merch_order_atomic_v2/);
  assert.match(api, /p_expected_version: expectedVersion/);
  assert.match(migration, /v_order\.fulfillment_version IS DISTINCT FROM p_expected_version/);
  assert.match(migration, /'error', 'version_conflict'/);
  assert.match(migration, /FOR UPDATE/);
});

test('deployment verifier probes the complete private operations surface and accepts safe method rejection', async (t) => {
  const verifier = await read('scripts/verify-marketplace-deployment.mjs');
  for (const endpoint of [
    '/api/store/switch-vip-plan',
    '/api/store/cancel-vip',
    '/api/club-arena/manage-shop',
    '/api/club-arena/refund-purchase',
    '/api/club-arena/shop-analytics',
    '/api/club-arena/shop-items',
    '/api/club-arena/shop-purchases',
  ]) {
    assert.match(verifier, new RegExp(endpoint.replaceAll('/', '\\/')));
  }
  assert.match(
    verifier,
    /\{ path: '\/api\/store\/fulfillment-operations', method: 'POST', expectedStatus: 405 \}/
  );
  assert.match(verifier, /mapWithConcurrency\(privateProbeContracts, 4, probePrivate\)/);
  assert.match(verifier, /\/hub\/club-shop\/00000000-0000-4000-8000-000000000094\?clubId=/);
  assert.match(verifier, /response\.status === expectedStatus/);
  assert.match(verifier, /`expected_\$\{expectedStatus\}_received_\$\{response\.status\}`/);

  const server = createServer((req, res) => {
    if (req.url?.startsWith('/images/')) {
      res.writeHead(200, { 'Content-Type': 'image/webp' });
      return res.end(VALID_HERO_ASSET);
    }
    if (req.url === '/api/store/merch-catalog') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: 'verified-item',
                price_usd: 19.99,
                price_diamonds: 1_999,
                variants: [],
                fulfillment_ready: true,
                fulfillment_mode: 'manual',
                card_checkout_ready: true,
                diamond_checkout_ready: true,
                payment_methods: ['card', 'diamonds'],
              },
            ],
            count: 1,
            catalog_available: true,
            diamonds_per_dollar: 100,
            manual_fulfillment_available: true,
            print_on_demand_available: false,
          },
        })
      );
    }
    if (req.url === '/api/store/readiness') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          success: true,
          ready: true,
          capabilities: { cardCheckout: true, diamondCheckout: true },
        })
      );
    }
    if (req.url === '/api/store/fulfillment-operations' && req.method === 'POST') {
      res.writeHead(405, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: 'Authorization',
      });
      return res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
    }
    if (req.url === '/api/store/purchase-daily-vip' && req.method === 'POST') {
      res.writeHead(410, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: 'Authorization',
      });
      return res.end(JSON.stringify({ success: false, error: 'DAILY_VIP_RETIRED' }));
    }
    if (req.url?.startsWith('/api/')) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: 'Authorization',
      });
      return res.end(JSON.stringify({ success: false, error: 'Authorization Required' }));
    }
    const pathname = new URL(req.url, 'http://marketplace.test').pathname;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<main data-marketplace-route="${pathname}">Verified Marketplace Route</main>`);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/verify-marketplace-deployment.mjs', baseUrl], {
      cwd: ROOT,
      env: { ...process.env, MARKETPLACE_PROBE_TIMEOUT_MS: '3000' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });

  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS 405 \/api\/store\/fulfillment-operations \(post, private\)/);
  assert.match(result.stdout, /PASS marketplace deployment verified/);
});
