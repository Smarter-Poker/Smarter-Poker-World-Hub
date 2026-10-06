import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');
const MIGRATION = 'supabase/migrations/20261006022120_stable_admin_phase11_finance_records.sql';

test('Phase 11 installs the five durable finance records under service-role-only access', async () => {
  const sql = await read(MIGRATION);
  for (const table of ['ca_daily_closes', 'ca_weekly_revenue_digest_runs', 'ca_weekly_revenue_digest_recipients', 'ca_club_pnl_snapshots', 'ca_operator_export_jobs']) {
    assert.match(sql, new RegExp(`CREATE TABLE public\\.${table}`));
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`));
  }
});

test('daily closes bind an exact manifest and use maker-checker without moving chips', async () => {
  const sql = await read(MIGRATION);
  assert.match(sql, /fn_ca_operator_request_daily_close/);
  assert.match(sql, /fn_ca_operator_sign_daily_close/);
  assert.match(sql, /lower\(v_manifest\.sha256\) <> lower\(p_manifest_sha256\)/);
  assert.match(sql, /status NOT IN \('approved','auto_approved','executed'\)/);
  assert.doesNotMatch(sql, /fn_ca_(mint|burn|fund_club)|chip_ledger\s*\(/i);
});

test('browser exports record a hash-bound receipt before requesting a download', async () => {
  const source = await read('src/components/horses/EconomyExport.jsx');
  const recordAt = source.indexOf("action: 'record_export_prepared'");
  const downloadAt = source.indexOf('downloadCsv(name, csv)');
  assert.ok(recordAt > 0);
  assert.ok(downloadAt > recordAt);
  assert.match(source, /SHA-256/);
  assert.match(source, /Browser Download Requested/);
});

test('economy write actions are bounded, idempotent and audited', async () => {
  const route = await read('pages/api/horses/economy-admin.js');
  for (const action of ['record_export_prepared', 'record_pnl_snapshot', 'sign_daily_close']) assert.match(route, new RegExp(action));
  assert.match(route, /\.eq\('op_id', opId\)\.maybeSingle\(\)/);
  assert.match(route, /economy\.export_prepared/);
  assert.match(route, /economy\.pnl_recorded/);
  assert.match(route, /economy\.close_signed/);
  assert.match(route, /hasPermission\(op\.permissions, PERMISSIONS\.MONEY_WRITE\)/);
});
