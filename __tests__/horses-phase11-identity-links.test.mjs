import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const migration = await readFile(
  path.join(ROOT, 'supabase/migrations/20261006022123_stable_admin_phase11_identity_links.sql'),
  'utf8',
);
const panel = await readFile(path.join(ROOT, 'src/components/horses/IntegrityPanel.jsx'), 'utf8');
const route = await readFile(path.join(ROOT, 'pages/api/horses/integrity-admin.js'), 'utf8');

function sqlCode(source) {
  return source.replace(/^\s*--.*$/gm, ' ');
}

const code = sqlCode(migration);

test('identity links are a service-role-only security definer read', () => {
  assert.match(code, /function public\.fn_ca_integrity_identity_links\(/i);
  assert.match(code, /security definer/i);
  assert.match(code, /set search_path = public, auth, pg_temp/i);
  assert.match(code, /revoke all on function public\.fn_ca_integrity_identity_links[\s\S]*from public, anon, authenticated/i);
  assert.match(code, /grant execute on function public\.fn_ca_integrity_identity_links[\s\S]*to service_role/i);
});

test('identity output is pair metadata and never a raw identifier', () => {
  const returned = code.slice(code.indexOf("RETURN jsonb_build_object(\n    'ok', true"));
  for (const forbidden of ['evidence_value', 'ip_address', 'device_id', 'device_fingerprint', 'raw_email', 'user_agent']) {
    assert.doesNotMatch(returned, new RegExp(`['\"]${forbidden}['\"]`, 'i'));
  }
  assert.match(returned, /'disclosure'.*correlation for human review, never a verdict/i);
  assert.match(code, /p_include_horses boolean default true/i);
});

test('identity ranking and cursor are bounded and stable', () => {
  assert.match(code, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 100\)/i);
  assert.match(code, /limit v_limit \+ 1/i);
  assert.match(code, /order by evidence_weight desc, shared_signal_count desc,[\s\S]*player_a_id asc, player_b_id asc/i);
  for (const key of ['evidence_weight', 'shared_signal_count', 'evidence_occurrences', 'last_seen', 'player_a_id', 'player_b_id']) {
    assert.match(code, new RegExp(`'${key}'`));
  }
});

test('all four evidence sources report explicit coverage state', () => {
  for (const source of ['auth_sessions', 'tracked_sessions', 'signup_abuse', 'registered_devices']) {
    assert.match(code, new RegExp(`'source', '${source}'`));
  }
  assert.match(code, /'nothing_produced'/);
  assert.match(code, /'stale'/);
  assert.match(code, /'producing'/);
});

test('the route owns the eighth section and cannot accept a horse exclusion', () => {
  assert.match(route, /'flags', 'links', 'timing'/);
  assert.match(route, /links: 'fn_ca_integrity_identity_links'/);
  const block = route.slice(route.indexOf("if (section === 'links')"), route.indexOf('const limit =', route.indexOf("if (section === 'links')")));
  assert.match(block, /p_include_horses: true/);
  assert.doesNotMatch(block, /queryBoolean\(query\.includeHorses/);
});

test('the panel discloses correlation and uses only existing case actions', () => {
  assert.match(panel, /\['links', 'Identity Links'\]/);
  assert.match(panel, /Shared Identity Evidence Requires Human Review\. It Does Not Prove Multi Accounting\./);
  assert.match(panel, /kind: 'multi_accounting'/);
  assert.match(panel, /itemType: 'observation'/);
  assert.match(panel, /openCaseBody\(/);
  assert.match(panel, /addItemBody\(/);
  assert.doesNotMatch(panel, /raw_email|device_fingerprint|device_id|ip_address|user_agent/i);
});
