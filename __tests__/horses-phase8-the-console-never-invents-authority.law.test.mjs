import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { MISSING_CONTROL_ROWS, PLATFORM_ADMIN_SECTIONS } from '../src/lib/horses/platformAdmin.js';
import { platformAdminSpec } from '../pages/api/horses/platform-admin.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');
const SOURCES = [
  'pages/api/horses/platform-admin.js',
  'src/lib/horses/platformAdmin.js',
  'src/components/horses/platformAdmin.js',
  'src/components/horses/PlatformPanel.jsx',
];

test('Phase 8 projection remains read-only except the Phase 11 incident ownership overlay', async () => {
  assert.deepEqual(platformAdminSpec.methods, ['GET', 'POST']);
  assert.deepEqual(platformAdminSpec.permission, { GET: 'console.read', POST: 'incidents.ack' });
  assert.deepEqual(PLATFORM_ADMIN_SECTIONS, ['engine', 'maintenance', 'breaks', 'releases', 'crons', 'alerts', 'incidents', 'registry']);
  const source = (await Promise.all(SOURCES.map(read))).join('\n');
  assert.doesNotMatch(source, /genericUpdater:\s*true/);
  assert.doesNotMatch(source, /\.from\([^)]*\)\.(?:insert|update|upsert|delete)\s*\(/);
  const route = await read('pages/api/horses/platform-admin.js');
  const rpcNames = [...route.matchAll(/\.rpc\(['"]([^'"]+)/g)].map((match) => match[1]);
  assert.deepEqual(rpcNames, ['fn_ca_operator_record_incident_ack_event']);
  assert.doesNotMatch(route, /(?:ca_drift_incidents|operational_alert_events|engine_alerts|deploy_alerts|financial_alerts)[\s\S]{0,200}\.(?:update|upsert|delete)\s*\(/);
});

test('retired dispatchers and evidence writers cannot be invoked from Phase 8', async () => {
  const source = (await Promise.all(SOURCES.map(read))).join('\n');
  for (const name of [
    'fn_dispatch_ca_engine_deploy', 'fn_ca_dispatch_engine_deploy', 'dispatch_engine_deploy',
    'fn_record_break_scorecard', 'fn_ca_record_break_scorecard', 'fn_capture_freeze',
    'fn_ca_capture_freeze', 'fn_record_engine_maintenance', 'fn_ca_maintenance_break_capture',
  ]) assert.doesNotMatch(source, new RegExp(`(?:rpc|fetch)[^\\n]{0,120}${name}`, 'i'), name);
  assert.doesNotMatch(source, /dispatch\s*:\s*true|retry\s*:\s*true/);
});

test('allowlisted registry sources are explicit and human-only authorities remain read-only', async () => {
  const route = await read('pages/api/horses/platform-admin.js');
  for (const key of ['create_club', 'find_player', 'join_club']) assert.match(route, new RegExp(`['"]${key}['"]`));
  for (const table of ['club_entry_feature_flags', 'ca_horse_fleet_policy', 'ca_operator_policy', 'video_reels_pipeline_controls', 'ca_arena_settings', 'ca_payout_freeze', 'trivia_ledger_switches']) assert.match(route, new RegExp(`['"]${table}['"]`));
  assert.match(route, /Human Owner Only/);
  assert.match(route, /Human Finance Authority Only/);
  assert.match(route, /Written Human-Only Trivia Authority/);
  assert.doesNotMatch(route, /writable:\s*true/);
});

test('missing control inventory never represents absent authority as Off', () => {
  const expected = new Set(['tournament_registration_global', 'cashout_dedicated', 'chip_issuance_positive']);
  assert.deepEqual(new Set(MISSING_CONTROL_ROWS.map((row) => row.key)), expected);
  for (const row of MISSING_CONTROL_ROWS) {
    assert.equal(row.state, 'missing');
    assert.equal(row.enabled, null);
    assert.equal(row.writable, false);
    assert.match(row.writeAuthority, /Not Implemented In The Authoritative Path/);
  }
});

test('Phase 8 ships no forbidden copy, emoji or client database access', async () => {
  const source = (await Promise.all(SOURCES.map(read))).join('\n');
  assert.ok(!source.includes('\u2014'));
  assert.ok(!source.includes('\u2013'));
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
  assert.doesNotMatch(source, /\b(bot|AI Model)\b/i);
  const client = (await Promise.all(SOURCES.filter((path) => path.startsWith('src/components/')).map(read))).join('\n');
  assert.doesNotMatch(client, /supabase|\.rpc\s*\(/i);
});
