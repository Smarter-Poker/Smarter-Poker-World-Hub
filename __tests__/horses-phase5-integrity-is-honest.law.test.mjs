/**
 * Phase 5 law: an integrity console reports evidence and coverage honestly.
 *
 * The detector's dominant population is horse-versus-horse timing evidence.
 * That population may be grouped and explained, but it may never be silently
 * removed. A detector finding is also never authority to punish a player or
 * move chips. Those two boundaries are written here so a later refactor sees
 * a red build before it turns either one into an implementation detail.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const migrations = await readdir(path.join(ROOT, 'supabase', 'migrations'));
const migrationName = migrations.find((name) => name.includes('ca_phase5_integrity_cases_and_review_queue'));
assert.ok(migrationName, 'the Phase 5 integrity migration is missing');

const [sql, route, panel, model, approvals] = await Promise.all([
  readFile(path.join(ROOT, 'supabase', 'migrations', migrationName), 'utf8'),
  readFile(path.join(ROOT, 'pages', 'api', 'horses', 'integrity-admin.js'), 'utf8'),
  readFile(path.join(ROOT, 'src', 'components', 'horses', 'IntegrityPanel.jsx'), 'utf8'),
  readFile(path.join(ROOT, 'src', 'components', 'horses', 'integrityModel.js'), 'utf8'),
  readFile(path.join(ROOT, 'src', 'lib', 'horses', 'approvals.js'), 'utf8'),
]);

function executable(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*--.*$/gm, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/`(?:\\.|[^`])*`/g, '``');
}

function functionBody(name) {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  assert.ok(start >= 0, `${name} is missing from the Phase 5 migration`);
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION public.', start + 30);
  return sql.slice(start, next < 0 ? sql.length : next);
}

test('every include-horses argument defaults true', () => {
  const matches = [...sql.matchAll(/p_include_horses\s+boolean\s+DEFAULT\s+(true|false)/gi)];
  assert.ok(matches.length > 0, 'the queue must state its include-horses default in SQL');
  assert.deepEqual(
    matches.map((match) => match[1].toLowerCase()),
    matches.map(() => 'true'),
    'a missing parameter must always include horses'
  );
});

test('horse identity is disclosure, never a hidden suppression predicate', () => {
  const code = executable(sql);
  for (const forbidden of [
    /is_horse\s*=\s*false/i,
    /is_horse\s+is\s+false/i,
    /not\s+coalesce\([^)]*is_horse/i,
    /p_include_horses\s*:\s*false/i,
  ]) {
    assert.doesNotMatch(code, forbidden);
  }
  assert.doesNotMatch(panel, /Include Horses|Exclude Horses/i);
  assert.match(
    sql,
    /END AS composition/i,
    'the queue must disclose participant composition'
  );
});

test('the queue distinguishes review, quiet, unproduced and unknown states', () => {
  for (const state of ['review_available', 'nothing_to_review', 'nothing_produced', 'unknown']) {
    assert.ok(
      model.includes(state) || sql.includes(state),
      `the ${state} state is not represented in the integrity contract`
    );
  }
});

test('health is fetched live and the recorded detector gap remains loud', () => {
  assert.match(panel, /healthUrl\(/, 'the panel must call the health route');
  assert.match(
    panel,
    /const health = useIntegrityRead\(\{[\s\S]*?active: true,[\s\S]*?url: healthUrl\(\)/,
    'health must be an always-active live read, not a constant or Health-tab-only request'
  );
  assert.match(
    sql,
    /v_worker := public\.fn_ca_collusion_detector_health\(v_cadence\)/,
    'the Phase 5 health response must preserve the canonical worker health payload containing the gap'
  );
  assert.match(sql, /'worker', v_worker/);
  assert.doesNotMatch(
    executable(sql),
    /update\s+(?:public\.)?ca_collusion_scan_state[\s\S]{0,300}unscanned_/i,
    'the console migration must not clear an unscanned gap'
  );
});

test('detector reads cannot open cases or create sanctions', () => {
  for (const name of [
    'fn_ca_integrity_queue',
    'fn_ca_integrity_pairs',
    'fn_ca_integrity_timing',
    'fn_ca_integrity_detector_health',
  ]) {
    const body = executable(functionBody(name));
    assert.doesNotMatch(body, /insert\s+into\s+(?:public\.)?ca_integrity_(?:cases|sanctions)/i);
    assert.doesNotMatch(body, /update\s+(?:public\.)?ca_integrity_(?:cases|sanctions)/i);
  }
});

test('case evidence is append-only and corrected with a retraction row', () => {
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.ca_integrity_case_items/i);
  assert.match(sql, /fn_ca_integrity_case_retract_item/i);
  assert.match(sql, /item_type\s*=\s*'retraction'/i);
  assert.doesNotMatch(
    executable(route),
    /\.from\(['"]ca_integrity_case_items['"]\)[\s\S]{0,120}\.(?:delete|update)\(/i
  );
});

test('Phase 5 records confiscation but contains no chip-moving path', () => {
  const code = executable(`${sql}\n${route}`);
  for (const forbidden of [
    /fn_(?:debit|credit|mint|burn)_chips/i,
    /update\s+(?:public\.)?(?:club_chip_balances|diamond_wallets|user_balances)/i,
    /insert\s+into\s+(?:public\.)?chip_transactions/i,
  ]) {
    assert.doesNotMatch(code, forbidden);
  }
  assert.match(route, /requireApproval\(/, 'confiscation must pass through maker-checker');
  assert.match(route, /PERMISSIONS\.MONEY_WRITE/, 'confiscation also requires money.write');
});

test('sanctions remain human-executed outside the generic approvals queue', () => {
  const executableKinds = approvals.match(/EXECUTABLE_APPROVAL_KINDS[\s\S]*?\]\);/)?.[0] || '';
  assert.ok(executableKinds, 'the approvals executable-kind list is missing');
  assert.doesNotMatch(executableKinds, /['"]sanction['"]/);
  assert.match(route, /actionSanction|sanction/i);
});
