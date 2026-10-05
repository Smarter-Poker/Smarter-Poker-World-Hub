import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const client = read('src/lib/store/storeAnalytics.js');
const intake = read('pages/api/store/analytics-events.js');
const summary = read('pages/api/store/operations-summary.js');
const migration = read('supabase/migrations/20261001180000_marketplace_first_party_operations.sql');

test('Marketplace analytics writes only first-party privacy-minimized receipts', () => {
  assert.match(client, /fetch\('\/api\/store\/analytics-events'/);
  assert.doesNotMatch(client, /posthog|from '\.\.\/analytics'/i);
  assert.match(client, /sessionStorage/);
  assert.match(intake, /Cross-site event refused/);
  assert.match(intake, /EVENTS\.has\(eventName\)/);
  assert.match(intake, /PROPERTY_KEYS/);
  assert.match(intake, /Buffer\.byteLength[\s\S]*2048/);
});

test('raw funnel data is service-only and the operator report is aggregated', () => {
  assert.match(migration, /REVOKE ALL ON public\.marketplace_funnel_events FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /marketplace_operations_summary/);
  assert.match(summary, /is_admin/);
  assert.match(summary, /getMarketplaceReadiness\(\{ force: true \}\)/);
  assert.match(summary, /marketplace_operations_summary/);
});
