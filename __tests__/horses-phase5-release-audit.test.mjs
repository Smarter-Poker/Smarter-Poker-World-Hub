/** Regression pins discovered during the Phase 5 release audit. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [route, panel, sql, queueBudgetSql, narrowQueueSql, healthDisclosureSql] = await Promise.all([
  readFile(path.join(ROOT, 'pages/api/horses/integrity-admin.js'), 'utf8'),
  readFile(path.join(ROOT, 'src/components/horses/IntegrityPanel.jsx'), 'utf8'),
  readFile(path.join(
    ROOT,
    'supabase/migrations/20260906170000_integrity_sanctions_follow_human_decisions.sql'
  ), 'utf8'),
  readFile(path.join(
    ROOT,
    'supabase/migrations/20260906180000_integrity_queue_numeric_extraction_stays_inside_postgrest_budget.sql'
  ), 'utf8'),
  readFile(path.join(
    ROOT,
    'supabase/migrations/20260906200000_integrity_queue_uses_narrow_indexable_rows.sql'
  ), 'utf8'),
  readFile(path.join(
    ROOT,
    'supabase/migrations/20260906141131_integrity_health_discloses_latest_detector_run.sql'
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

test('the queue consumes the exact ranked RPC response contract', () => {
  assert.match(panel, /'tier_reason'/,
    'the queue must render the singular tier_reason returned by the RPC');
  assert.match(panel, /first\(row\?\.case, 'id', 'case_id', 'caseId'\)/,
    'an active queue row must open the nested case summary returned by the RPC');
  assert.match(panel, /queue\.loaded && !queue\.error \? 0 : 'Unknown'/,
    'an omitted zero-count tier must not be presented as an unknown count');
  assert.match(route, /filteredTotal: Number\.isFinite\(Number\(data\.totals\.filtered_groups\)\)/,
    'filtered queue pagination must use the filtered total returned by the RPC');
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

test('the hot numeric extractor uses SQL and remains server-only', () => {
  assert.match(queueBudgetSql, /LANGUAGE sql/i);
  assert.match(queueBudgetSql, /IMMUTABLE/i);
  assert.doesNotMatch(queueBudgetSql, /LANGUAGE plpgsql/i);
  assert.match(queueBudgetSql, /REVOKE ALL ON FUNCTION public\.fn_ca_integrity_json_numeric\(jsonb, text\) FROM PUBLIC, anon, authenticated/);
  assert.match(queueBudgetSql, /GRANT EXECUTE ON FUNCTION public\.fn_ca_integrity_json_numeric\(jsonb, text\) TO service_role/);
});

test('the queue optimization restores the partial index and narrows profiles', () => {
  assert.match(narrowQueueSql, /'c\.status = ''open'''/);
  assert.match(narrowQueueSql, /'coalesce\(pa\.is_horse, false\)'/);
  assert.match(narrowQueueSql, /'coalesce\(pb\.is_horse, false\)'/);
  assert.match(narrowQueueSql, /pa\.display_name, pa\.username/);
  assert.match(narrowQueueSql, /pb\.display_name, pb\.username/);
  assert.match(narrowQueueSql, /IF v_sql = v_before THEN/);
  assert.match(narrowQueueSql, /REVOKE ALL ON FUNCTION public\.fn_ca_integrity_queue/);
});

test('health reads the Open Claw job name and preserves detector disclosure', () => {
  assert.match(healthDisclosureSql, /regexp_replace\(replace\(lower\(e\.job_name\)/);
  assert.match(healthDisclosureSql, /detection_span_minutes/);
  assert.match(healthDisclosureSql, /detection_thresholds/);
  assert.match(healthDisclosureSql, /REVOKE ALL ON FUNCTION public\.fn_ca_integrity_detector_health/);
});

test('flags render named players and never expose reason JSON as the heading', () => {
  assert.match(panel, /patternLabel\(first\(row, 'flag_type', 'flagType'\)/);
  assert.match(panel, /'player_name', 'playerName', 'player_id', 'playerId'/);
  assert.match(panel, /'player_is_horse', 'playerIsHorse'/);
  assert.match(panel, /label="Events In Thirty Days"/);
});

test('timing expands the RPC distribution and renders its exact coverage', () => {
  assert.match(panel, /timingRowsOf\(timing\.data\)/);
  assert.match(panel, /label="Adjacent Action Pairs"/);
  assert.match(panel, /label="Distinct Hands"/);
  assert.match(panel, /label="Pairs Under 500 Milliseconds"/);
  assert.match(panel, /label="Hands Sampled"/);
  assert.match(panel, /label="Sample Truncated"/);
  assert.match(panel, /booleanLabel\(first\(timingCoverage, 'truncated'\)\)/,
    'a missing truncation field must remain unknown');
  assert.doesNotMatch(panel, /Ninety-Fifth Percentile/,
    'the UI must not ask for a percentile the timing RPC does not return');
});
