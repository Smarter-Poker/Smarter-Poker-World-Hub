/* A failed monthly charge revokes Card VIP, and Stripe's renewal events are
   read whatever API version the endpoint signs them in (2026-11-27).
   Measured on production first: the installed projection kept VIP for the
   whole unpaid month after a failed charge, and the invoice handlers read a
   field the account's event version no longer sends. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20261127171926_vip_failed_renewal_revokes_card_vip.sql', import.meta.url),
  'utf8'
);

test('the non-active branch never preserves the period this subscription wrote', () => {
  const branch = migration.slice(migration.indexOf('v_preserve_non_card_entitlement :='));
  assert.match(branch, /vip_expires_at IS DISTINCT FROM p_current_period_end/);
  assert.match(branch, /vip_expires_at IS DISTINCT FROM v_subscription\.current_period_end/);
  assert.match(branch, /v_profile\.vip_tier = 'lifetime'/, 'Lifetime is never revoked by a Card subscription');
  assert.match(branch, /is_vip = false,\s+vip_tier = NULL,\s+vip_expires_at = NULL/);
});

test('the migration edits only the body it measured, and keeps the function service-only', () => {
  assert.match(migration, /18be1d30e81a5f55327b86173c8b2a19/);
  assert.match(migration, /^BEGIN;$/m);
  assert.match(migration, /^COMMIT;$/m);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /TO service_role/);
  assert.match(migration, /marketplace_phase7_vip_acquisition_mutex_version\(\)/);
});
