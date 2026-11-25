/**
 * Personal Assistant / Sandbox — Phase 4 fortress gates.
 *
 *  1. Schema-to-deletion completeness: every user-owned PA/Sandbox table a migration
 *     creates is deleted by purge_personal_assistant_data AND pruned by
 *     apply_personal_assistant_retention, and account closure calls the purge.
 *  2. Dead-code resurrection: the verified-orphan components stay deleted.
 *  3. Audit lease renewal: a running checkpoint renews the lease; grants stay service_role only.
 *  4. Browser smoke contract: scripts/ci/pa-browser-smoke.mjs keeps its routes and checks.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const MIGRATIONS = 'supabase/migrations';
const PHASE2 = `${MIGRATIONS}/20261125060000_pa_phase2_rpc_and_lifecycle_hardening.sql`;
const PHASE4 = `${MIGRATIONS}/20261125120000_pa_phase4_lease_renewal_and_deletion_hardening.sql`;

function functionBody(sql, name) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = sql.lastIndexOf(marker);
  assert.ok(start >= 0, `${name} is defined`);
  const ends = ['\n$function$;', '\n$$;'].map((m) => sql.indexOf(m, start)).filter((i) => i > start);
  assert.ok(ends.length > 0, `${name} body ends`);
  return sql.slice(start, Math.min(...ends));
}

// ── 1. Schema-to-deletion completeness ───────────────────────────────────────

const PA_TABLE_NAME = /^(pa_|leak_|sandbox_|user_leaks$|user_training_leaks$|user_assistant_stats$|hand_audit_decisions$|solution_bookmarks$)/;
// Owned by a user but deliberately kept, or not owned by a user at all.
const NOT_PURGED = new Map([
  ['pa_data_lifecycle_receipts', 'the deletion receipt itself must outlive the deletion'],
  ['sandbox_weekly_spots', 'shared catalogue, no owner column'],
  ['leak_hand_examples', 'keyed by leak_id, deleted through the user_leaks id list'],
]);
// Settings the person chose: deleted on request, never aged out by retention.
const RETENTION_KEEPS = new Set(['pa_coaching_preferences']);
// Purge covers an owner column other than user_id for these.
const OWNER_COLUMN = /\b(user_id|creator_id)\b/;

function activeUserOwnedTables() {
  const tables = new Set();
  const files = fs.readdirSync(path.join(ROOT, MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  const create = /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?"?([a-z_0-9]+)"?\s*\(([\s\S]*?)\n\);/gi;
  for (const file of files) {
    const sql = read(`${MIGRATIONS}/${file}`);
    for (const match of sql.matchAll(create)) {
      const [, name, body] = match;
      if (PA_TABLE_NAME.test(name) && OWNER_COLUMN.test(body)) tables.add(name);
    }
  }
  return tables;
}

test('every PA/Sandbox user-owned table is deleted by the purge and pruned by retention', () => {
  const sql = read(PHASE2);
  const purge = functionBody(sql, 'purge_personal_assistant_data');
  const retention = functionBody(sql, 'apply_personal_assistant_retention');
  const tables = activeUserOwnedTables();
  assert.ok(tables.size >= 10, `the scan must see the PA/Sandbox schema (saw ${tables.size})`);
  // Sandbox tables created only in migrations/archive (outside the scan) are pinned by name.
  for (const table of [
    'sandbox_sessions', 'sandbox_coach_results', 'sandbox_equity_history', 'sandbox_saved_hands', 'sandbox_analytics',
    'sandbox_quiz_results', 'sandbox_bookmarks', 'sandbox_templates', 'sandbox_shared_scenarios', 'solution_bookmarks',
  ]) tables.add(table);
  for (const table of [...tables].sort()) {
    if (NOT_PURGED.has(table)) continue;
    assert.ok(purge.includes(`DELETE FROM public.${table} `), `purge_personal_assistant_data must delete public.${table}`);
    if (RETENTION_KEEPS.has(table)) continue;
    assert.ok(retention.includes(`DELETE FROM public.${table}`), `apply_personal_assistant_retention must prune public.${table}`);
  }
  // The tables this scan cannot see by CREATE TABLE (created outside the migration tree).
  for (const table of ['user_training_leaks', 'user_assistant_stats', 'leak_review_operations']) {
    assert.ok(purge.includes(`DELETE FROM public.${table} `), `purge must delete public.${table}`);
    assert.ok(retention.includes(`DELETE FROM public.${table}`), `retention must prune public.${table}`);
  }
  for (const [table] of NOT_PURGED) {
    assert.ok(!/^\s*DELETE FROM public\.pa_data_lifecycle_receipts/m.test(purge), 'the purge must not delete its own receipt');
    assert.ok(typeof table === 'string');
  }
});

test('the purge covers every scope and writes a receipt', () => {
  const purge = functionBody(read(PHASE2), 'purge_personal_assistant_data');
  for (const scope of ['coaching', 'analysis', 'sandbox', 'all']) assert.ok(purge.includes(`'${scope}'`), `scope ${scope}`);
  assert.match(purge, /INSERT INTO public\.pa_data_lifecycle_receipts/);
});

test('account closure purges Personal Assistant and Sandbox data for every closed account', () => {
  const route = read('pages/api/auth/delete-account.js');
  assert.match(route, /rpc\('purge_personal_assistant_data',\s*\{\s*p_user_id:\s*userId,\s*p_scope:\s*'all',?\s*\}\)/);
  const order = ['rpc(\'fn_close_account\'', 'rpc(\'purge_personal_assistant_data\'', 'removeTheirPictures(', 'deleteUser(userId, true)'];
  const at = order.map((needle) => route.indexOf(needle, route.indexOf('export default async function handler')));
  assert.ok(at.every((i) => i > 0), `all closure steps present ${at}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'purge runs after the database closes the account, before pictures and login');
  assert.ok(route.includes('export const REFUSALS'), 'REFUSALS stays exported');
});

// ── 2. Dead-code resurrection ────────────────────────────────────────────────

const DELETED_ORPHANS = [
  'src/components/personal-assistant/shared/index.js',
  'src/components/personal-assistant/shared/IntegrityBadge.jsx',
  'src/components/personal-assistant/shared/TrustSeal.jsx',
  'src/components/personal-assistant/shared/CardPicker.jsx',
  'src/components/sandbox/CustomDrillBuilder.jsx',
  'src/components/sandbox/ImportHHModal.jsx',
  'src/components/sandbox/SandboxPokerTable.jsx',
  'src/components/sandbox/VillainPresetPicker.jsx',
];
// Looked orphaned but are live: RangeHeatGrid imports RangeExplorer's helpers,
// SandboxComponents dynamically imports ExportCard, and Training Phase 17 (#3008)
// maintains HandReplay.jsx. They must NOT be deleted.
const LIVE_LOOKALIKES = [
  'src/components/sandbox/RangeExplorer.jsx',
  'src/components/sandbox/ExportCard.jsx',
  'src/components/sandbox/RangeHeatGrid.jsx',
  'src/components/sandbox/HandReplay.jsx',
];

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.(jsx?|mjs|cjs|tsx?)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test('deleted orphan components stay deleted and nothing imports them', () => {
  for (const file of DELETED_ORPHANS) assert.ok(!fs.existsSync(path.join(ROOT, file)), `${file} must stay deleted`);
  assert.ok(!fs.existsSync(path.join(ROOT, 'src/components/personal-assistant/shared')), 'the empty shared/ directory stays gone');
  const sources = ['src', 'pages'].flatMap((dir) => sourceFiles(dir));
  const names = DELETED_ORPHANS.filter((f) => !f.endsWith('index.js')).map((f) => path.basename(f).replace(/\.jsx$/, ''));
  const importPattern = (name) => new RegExp(`(?:from|import\\(|require\\()\\s*['"][^'"]*/${name}(?:\\.jsx?)?['"]`);
  for (const file of sources) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const name of names) assert.ok(!importPattern(name).test(text), `${file} imports deleted component ${name}`);
    assert.ok(!/personal-assistant\/shared['"/]/.test(text), `${file} imports the deleted personal-assistant/shared barrel`);
  }
});

test('components that look orphaned but are live stay in place', () => {
  for (const file of LIVE_LOOKALIKES) assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is imported and must stay`);
  assert.match(read('src/components/sandbox/RangeHeatGrid.jsx'), /from '\.\/RangeExplorer'/);
  assert.match(read('src/components/sandbox/SandboxComponents.jsx'), /import\('\.\/ExportCard'\)/);
});

// ── 3. Audit lease renewal ───────────────────────────────────────────────────

test('a running audit checkpoint renews the lease and keeps service_role-only execution', () => {
  const sql = read(PHASE4);
  const body = functionBody(sql, 'checkpoint_pa_leak_audit_job');
  assert.match(
    body,
    /lease_expires_at\s*=\s*CASE\s+WHEN p_status = 'running' THEN GREATEST\(COALESCE\(lease_expires_at, now\(\)\), now\(\) \+ interval '180 seconds'\)\s+ELSE NULL\s+END/,
  );
  assert.match(body, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(body, /WHERE id = p_job_id AND status = 'running' AND worker_token = p_worker_token/);
  const signature = 'uuid, uuid, text, text, text, jsonb, jsonb, jsonb, text, text';
  assert.ok(body.includes('p_error_message text DEFAULT NULL\n)'), 'the signature is unchanged: no second overload');
  assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.checkpoint_pa_leak_audit_job(${signature}) FROM PUBLIC, anon, authenticated;`));
  assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION public.checkpoint_pa_leak_audit_job(${signature}) TO service_role;`));
  assert.ok(!/GRANT[^;]*checkpoint_pa_leak_audit_job[^;]*TO[^;]*(anon|authenticated|public)/i.test(sql));
  assert.ok(!/\bxp\w*\b/i.test(sql.replace(/--.*$/gm, '')), 'no XP-named identifier');
  assert.doesNotMatch(sql, /ADD COLUMN/i, 'no column is added');
});

test('the lease only ever grows across migrations', () => {
  const files = fs.readdirSync(path.join(ROOT, MIGRATIONS)).filter((f) => f.endsWith('.sql') && /checkpoint_pa_leak_audit_job/.test(read(`${MIGRATIONS}/${f}`))).sort();
  assert.equal(files.at(-1), path.basename(PHASE4), 'the phase 4 migration is the latest definition of the checkpoint');
});

// ── 4. Browser smoke contract ────────────────────────────────────────────────

test('the browser smoke script keeps its routes, viewports, checks and fail-closed header contract', async () => {
  const smoke = await import(pathToFileURL(path.join(ROOT, 'scripts/ci/pa-browser-smoke.mjs')).href);
  assert.equal(smoke.DEFAULT_BASE_URL, 'https://smarter.poker');
  assert.deepEqual([...smoke.ROUTES], [
    '/hub/personal-assistant',
    '/hub/personal-assistant/leaks',
    '/hub/personal-assistant/leaks?format=tournament',
    '/hub/personal-assistant/leaks?tab=coaching',
    '/hub/personal-assistant/sandbox',
    '/sandbox/demo-hand-001',
  ]);
  assert.deepEqual(smoke.VIEWPORTS.map((v) => [v.width, v.height]), [[1440, 900], [390, 844]]);
  assert.deepEqual([...smoke.PRIVATE_API_PATHS], ['/api/assistant/leaks', '/api/assistant/coaching', '/api/assistant/stats', '/api/sandbox/custom-drill']);
  for (const check of ['http-200', 'no-page-errors', 'no-horizontal-overflow', 'no-invalid-button-nesting', 'format-query-preserved', 'private-api-headers']) {
    assert.ok(smoke.CHECKS.includes(check), check);
  }
  assert.deepEqual(smoke.privateHeaderProblems({ 'cache-control': 'private, no-store, max-age=0', vary: 'Authorization' }), []);
  assert.equal(smoke.privateHeaderProblems({ 'cache-control': 'public, max-age=60' }).length, 2);
  assert.deepEqual(smoke.checkContract(), []);
  assert.equal(smoke.parseArgs([]).baseUrl, 'https://smarter.poker');
  assert.equal(smoke.parseArgs(['--base-url', 'http://localhost:3000/x']).baseUrl, 'http://localhost:3000');
  assert.equal(smoke.parseArgs(['--check-only']).checkOnly, true);
  assert.match(read('scripts/ci/pa-browser-smoke.mjs'), /channel: 'chrome'/);
});

test('the browser smoke --check-only dry run exits 0 without a browser', () => {
  const out = execFileSync(process.execPath, ['scripts/ci/pa-browser-smoke.mjs', '--check-only'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /contract ok/);
});

test('the private APIs the smoke script probes set fail-closed headers in source', () => {
  const expectations = [
    ['pages/api/assistant/leaks/index.js'],
    ['pages/api/assistant/coaching.js'],
    ['pages/api/assistant/stats.js'],
    ['pages/api/sandbox/[...path].js'],
  ];
  for (const [file] of expectations) {
    const text = read(file);
    assert.ok(text.includes("'Cache-Control', 'private, no-store, max-age=0'"), `${file} sets Cache-Control`);
    assert.ok(text.includes("'Vary', 'Authorization'"), `${file} sets Vary`);
  }
});
