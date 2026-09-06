/** Regression pins discovered during the Phase 5 release audit. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [route, panel, sql] = await Promise.all([
  readFile(path.join(ROOT, 'pages/api/horses/integrity-admin.js'), 'utf8'),
  readFile(path.join(ROOT, 'src/components/horses/IntegrityPanel.jsx'), 'utf8'),
  readFile(path.join(
    ROOT,
    'supabase/migrations/20260906170000_integrity_sanctions_follow_human_decisions.sql'
  ), 'utf8'),
]);

test('the API validates a matching verdict before opening maker-checker', () => {
  const caseRead = route.indexOf("callIntegrityRpc(db, READ_RPCS.case");
  const approval = route.indexOf('await requireApproval(op, req');
  assert.ok(caseRead > 0 && approval > caseRead,
    'case validation must happen before any confiscation approval is raised');
  assert.match(route, /caseRecord\.status !== 'decided'/);
  assert.match(route, /caseRecord\.decision !== expectedDecision/);
});

test('the UI withholds sanction controls until a matching verdict exists', () => {
  assert.match(panel, /caseStatus === 'decided' && expectedSanction/);
  assert.match(panel, /!sanctionReady/);
  assert.match(panel, /The Recorded Decision Is No Action\./);
});

test('the database repeats the verdict guard under the case row lock', () => {
  const lock = sql.indexOf('WHERE c.id = p_case_id FOR UPDATE');
  const required = sql.indexOf("v_case.status <> 'decided'");
  const mismatch = sql.indexOf("'SANCTION_DECISION_MISMATCH'");
  const insert = sql.indexOf('INSERT INTO public.ca_integrity_sanctions');
  assert.ok(lock > 0 && required > lock && mismatch > required && insert > mismatch);
  assert.match(sql, /WHEN 'warning' THEN 'warned'/);
  assert.match(sql, /WHEN 'restriction' THEN 'restricted'/);
  assert.match(sql, /WHEN 'confiscation' THEN 'confiscated'/);
  assert.doesNotMatch(sql, /fn_(?:debit|credit|mint|burn)_chips/i);
  assert.doesNotMatch(sql, /UPDATE\s+(?:public\.)?(?:chip|diamond|wallet|balance)/i);
});

test('the replacement RPC remains server-only', () => {
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = public, pg_temp/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.fn_ca_integrity_sanction\([^)]+\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.fn_ca_integrity_sanction\([^)]+\) TO service_role/);
});
