import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const migration = read(
  'supabase/migrations/20261001173000_lifetime_vip_monthly_expiring_diamonds.sql'
);
const cron = read('pages/api/cron/vip-stipend.js');
const catalog = read('src/data/diamondStoreData.js');

test('monthly Lifetime grants are fixed, unique, promotional, and expire after 90 days', () => {
  assert.match(migration, /UNIQUE \(user_id, grant_month\)/);
  assert.match(migration, /granted_amount integer NOT NULL DEFAULT 2000/);
  assert.match(migration, /fn_ca_mint\([\s\S]*2000[\s\S]*'promotional'/);
  assert.match(migration, /expires_at = v_now \+ interval '90 days'/);
  assert.match(migration, /p_grant_month <> v_current_month/);
  assert.match(migration, /lifetime_vip_since >[\s\S]*America\/Chicago/);
});

test('spending retires overdue lots first and allocates the oldest active lot without replacing wallet RPCs', () => {
  assert.match(migration, /expire_lifetime_vip_diamond_lots_for_user\(/);
  assert.match(migration, /LIKE 'lifetime-vip-expiry:%'/);
  assert.match(migration, /ORDER BY expires_at, issued_at, id/);
  assert.match(migration, /lifetime_vip_diamond_lot_allocations/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.(?:add|deduct)_diamonds/);
});

test('grant and batch expiry RPCs are service-only', () => {
  assert.match(
    migration,
    /grant_lifetime_vip_monthly_diamonds[\s\S]*auth\.role\(\)[\s\S]*service_role_required/
  );
  assert.match(
    migration,
    /expire_lifetime_vip_diamond_lots[\s\S]*auth\.role\(\)[\s\S]*service_role_required/
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.grant_lifetime_vip_monthly_diamonds\(uuid,date\)[\s\S]*FROM PUBLIC, anon, authenticated/
  );
});

test('the stipend job expires old lots and grants only the current monthly Lifetime contract', () => {
  assert.match(cron, /expire_lifetime_vip_diamond_lots/);
  assert.match(cron, /grant_lifetime_vip_monthly_diamonds/);
  assert.match(cron, /p_grant_month: `\$\{monthKey\}-01`/);
  assert.match(cron, /PAYING/);
  assert.match(cron, /vip_subscriptions/);
});

test('the storefront explains amount, issue date, FIFO use, and expiration', () => {
  assert.match(catalog, /2,000 Promotional Diamonds Issued Every Month/);
  assert.match(catalog, /First Of Each Month/);
  assert.match(catalog, /Oldest Promotional Diamonds Spend First/);
  assert.match(catalog, /Expire 90 Days After Issue/);
});
