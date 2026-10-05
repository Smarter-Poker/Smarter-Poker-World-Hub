import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from '@babel/parser';
import { ECONOMY_ACTIONS, ECONOMY_SECTIONS, economyAdminSpec } from '../pages/api/horses/economy-admin.js';
import { ECONOMY_CONTROLS } from '../src/components/horses/economyAdmin.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');
const SOURCES = [
  'pages/api/horses/economy-admin.js',
  'src/components/horses/EconomyPanel.jsx',
  'src/components/horses/MintPanel.jsx',
  'src/components/horses/EconomyExport.jsx',
  'src/components/horses/RakePanel.jsx',
  'src/components/horses/economyAdmin.js',
  'src/components/horses/economyModel.js',
];

test('Phase 7 economy route is GET-only, money-read gated and has no action map', () => {
  assert.deepEqual(economyAdminSpec.methods, ['GET']);
  assert.equal(economyAdminSpec.permission, 'money.read');
  assert.deepEqual(ECONOMY_ACTIONS, []);
  assert.equal(ECONOMY_SECTIONS.length, 19);
});

test('every Phase 7 economy control is classified', () => {
  for (const section of ECONOMY_SECTIONS) assert.ok(ECONOMY_CONTROLS[section], section);
  for (const value of Object.values(ECONOMY_CONTROLS)) assert.ok(['READ', 'LINK', 'EMBED', 'AUTHORITATIVE WRITE'].includes(value));
});

test('Phase 7 never calls a money mover, scheduled repair or wrong circulation function', async () => {
  const source = (await Promise.all(SOURCES.map(read))).join('\n');
  for (const name of ['fn_ca_circulation_total', 'fn_ca_mint(', 'fn_ca_burn(', 'fn_ca_fund_club', 'fn_mint_club_chips', 'settle_club_rakeback', 'fn_settle_club_rakeback_batch', 'fn_payout_leaderboard', 'bbj_atomic_payout_v2', 'fn_ca_ledger_day_manifest', 'fn_ca_weekly_revenue_digest', 'fn_ca_daily_attestation', 'fn_rake_law_check', 'reconcile_ledger_nightly']) assert.doesNotMatch(source, new RegExp(name.replace(/[()]/g, '\\$&')));
});

test('the burn-in read does not call the detector wrapper that writes detector evidence', async () => {
  const route = await read('pages/api/horses/economy-admin.js');
  assert.doesNotMatch(route, /db\.rpc\('fn_ca_midway_burnin_gate'/);
  assert.match(route, /fn_ca_verify_ledger_chain/);
  assert.match(route, /read-only reconstruction/i);
});

test('Phase 7 source parses and contains no forbidden copy', async () => {
  for (const path of SOURCES.filter((path) => path.endsWith('.jsx'))) parse(await read(path), { sourceType: 'module', plugins: ['jsx'] });
  const source = (await Promise.all(SOURCES.map(read))).join('\n');
  assert.ok(!source.includes('\u2014'));
  assert.ok(!source.includes('\u2013'));
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
  assert.doesNotMatch(source, /\b(bot|AI Model)\b/i);
});

test('Economy and Mint are code split and the legacy monolith got shorter', async () => {
  const registry = await read('src/components/horses/tabRegistry.js');
  const index = await read('pages/horses/index.js');
  assert.match(registry, /id: 'economy'[\s\S]*?import\('\.\/EconomyPanel'\)/);
  assert.match(registry, /id: 'mint'[\s\S]*?import\('\.\/MintPanel'\)/);
  assert.ok(index.split('\n').length < 8118);
  assert.doesNotMatch(index, /<h2>Diamond Economy<\/h2>/);
});

test('the extracted economy keeps diamonds and the Mint keeps safe recipient and retry wiring', async () => {
  const economy = await read('src/components/horses/EconomyPanel.jsx');
  const mint = await read('src/components/horses/MintPanel.jsx');
  assert.match(economy, /\/api\/horses\/economy-stats/);
  assert.match(economy, /Diamond Transaction Log/);
  assert.match(mint, /section=player_search/);
  assert.match(mint, /Horse/);
  assert.match(mint, /const payloadKey =/);
  assert.match(mint, /setOpId\(newOpId\(\)\)/);
  assert.match(mint, /setConfirm\(\{[\s\S]*?\.\.\.form,[\s\S]*?opId,/);
  assert.match(mint, /setReceipt\(/);
  assert.match(mint, /Prepare Opposite Operation/);
  assert.match(mint, /holderId/);
  assert.match(mint, /origin/);
  assert.match(mint, /if \(!data\?\.pending\) await load/);
});

test('the extracted Mint retains confirmation locking, balance disclosure and same-intent recovery', async () => {
  const mint = await read('src/components/horses/MintPanel.jsx');
  assert.match(mint, /const \[submitting, setSubmitting\] = useState\(false\)/);
  assert.match(mint, /if \(!confirm \|\| submitting\) return/);
  assert.match(mint, /busy=\{submitting\}/);
  assert.match(mint, /sticky=\{submitting\}/);
  assert.match(mint, /blockEscape=\{submitting\}/);
  assert.match(mint, /projected: balance === null/);
  assert.match(mint, /Projected Balance:/);
  assert.match(mint, /Operation ID: \{confirm\.opId\}/);
  assert.match(mint, /Retry This Unchanged Confirmation/);
  assert.doesNotMatch(mint, /catch \(cause\) \{\s*setConfirm\(null\)/);
  assert.match(mint, /Prepare Opposite Operation/);
  assert.match(mint, /Reversing .*Operation \$\{row\.op_id\}/);
});

test('the Mint register export walks every page and discloses any safety-cap truncation before download', async () => {
  const mint = await read('src/components/horses/MintPanel.jsx');
  assert.match(mint, /collectAllRows/);
  assert.match(mint, /EXPORT_PAGE = 500/);
  assert.match(mint, /EXPORT_MAX_PAGES = 200/);
  assert.match(mint, /section: 'ledger', limit: String\(limit\), offset: String\(offset\)/);
  for (const heading of ['Balance Before', 'Balance After', 'Net Issued Supply After', 'Reason', 'By', 'Operation Id']) {
    assert.match(mint, new RegExp(heading));
  }
  assert.match(mint, /Platform Exports Are Not Recorded/);
  assert.match(mint, /setExportConfirm\(prepared\)/);
  assert.match(mint, /Acknowledge Truncated Register Export/);
  assert.match(mint, /requireTyped="TRUNCATED"/);
  assert.match(mint, /the-mint-register\$\{prepared\.complete \? '' : '-truncated'\}/);
  assert.match(mint, /TRUNCATED EXPORT/);
});

test('Phase 7 queries match maintained production column names and do not expose raw signup email', async () => {
  const route = await read('pages/api/horses/economy-admin.js');
  assert.match(route, /basis_version/);
  assert.match(route, /\.order\('awarded_at'/);
  assert.match(route, /\.order\('settled_at'/);
  assert.match(route, /select\('severity,metadata,stored_balance,ledger_balance,created_at'\)/);
  assert.match(route, /ca_ledger_day_manifest_restatements'[\s\S]*?\.order\('restated_at'/);
  assert.doesNotMatch(route, /ca_ledger_day_manifest_restatements'\)\.select\('\*'\)\.order\('created_at'/);
  assert.doesNotMatch(route, /signup_abuse_log'\)\.select\('\*'\)/);
  assert.doesNotMatch(route, /raw_email/);
  assert.match(route, /ca_drift_incidents'[\s\S]*?\.order\('detected_at'/);
  assert.doesNotMatch(route, /ca_drift_incidents'\)\.select\([^\n]+\.order\('created_at'/);
  assert.match(route, /fn_ca_chip_store_coverage_gaps/);
  assert.match(route, /ca_supply_snapshots'[\s\S]*?select\('id,taken_at,total,unexplained,basis_version'\)/);
  assert.match(route, /select\('hand_id,seat_count_in_force,max_rake_cap_in_force'\)/);
  assert.match(route, /club_profit_reconcile_log'[\s\S]*?\.order\('ran_at'/);
  assert.match(route, /accounting_invoice_deliveries/);
  assert.match(route, /p_include_horses: true/);
  assert.doesNotMatch(route, /\.schema\(['"]cron['"]\)/);
});

test('chip-circulation disclosure does not read the writer supplied severity verdict', async () => {
  const route = await read('pages/api/horses/economy-admin.js');
  const query = route.match(/db\.from\('ledger_reconcile_log'\)\.select\('([^']+)'\)\.eq\('entity_type', 'chip_circulation'\)/);
  assert.ok(query, 'chip circulation evidence query exists');
  assert.doesNotMatch(query[1], /severity/);
});

test('every Phase 7 CSS module reference resolves to a maintained class', async () => {
  const css = await read('src/components/horses/shared.module.css');
  const definitions = new Set([...css.matchAll(/^\.([A-Za-z0-9_-]+)/gm)].map((match) => match[1]));
  for (const path of SOURCES.filter((value) => value.endsWith('.jsx'))) {
    const source = await read(path);
    for (const match of source.matchAll(/styles\.([A-Za-z0-9_]+)/g)) assert.ok(definitions.has(match[1]), `${path}: ${match[1]}`);
  }
});

test('truncated exports mark both the file name and the file content', async () => {
  const source = await read('src/components/horses/exportAllCsv.js');
  assert.match(source, /TRUNCATED EXPORT/);
  assert.match(source, /-truncated/);
  assert.match(source, /__export_state/);
});

test('Phase 7 panels render the evidence already returned by the economy route', async () => {
  const economy = await read('src/components/horses/EconomyPanel.jsx');
  const rake = await read('src/components/horses/RakePanel.jsx');
  const route = await read('pages/api/horses/economy-admin.js');
  assert.match(economy, /Supply Trend Evidence/);
  assert.match(economy, /value=\{velocityHours\}/);
  assert.match(economy, /value=\{720\}>30 Days/);
  assert.match(economy, /coverageGaps/);
  assert.match(route, /max: 720/);
  assert.match(economy, /Open Drift Incident Evidence/);
  assert.match(economy, /Chip Circulation Composition Evidence/);
  assert.match(economy, /Financial Health Is Historical Evidence/);
  for (const heading of ['Rakeback Periods', 'Leaderboard Payouts', 'Bad Beat Jackpot Payouts', 'Manifest Restatements', 'Weekly Digest Notification Evidence', 'Settlement Invoices', 'Money Job Evidence']) assert.match(economy, new RegExp(heading));
  assert.match(rake, /Rakeback Settle Evidence/);
  assert.match(rake, /Main, Separate/);
  assert.doesNotMatch(rake, /main_balance\s*\+/);
});

test('every Phase 7 evidence export declares completeness from its returned list', async () => {
  const economy = await read('src/components/horses/EconomyPanel.jsx');
  const rake = await read('src/components/horses/RakePanel.jsx');
  const exportComponent = await read('src/components/horses/EconomyExport.jsx');
  for (const prefix of ['economy-drift-incidents', 'economy-rakeback-periods', 'economy-bbj-payouts', 'economy-invoices', 'economy-job-evidence']) assert.match(economy, new RegExp(prefix));
  for (const prefix of ['rake-law-findings', 'rakeback-periods', 'leaderboard-payouts', 'bbj-payouts', 'promotion-awards']) assert.match(rake, new RegExp(prefix));
  assert.match(exportComponent, /TOTAL ROWS UNKNOWN/);
  assert.match(exportComponent, /filenamePrefix/);
  assert.match(exportComponent, /truncated/);
});
