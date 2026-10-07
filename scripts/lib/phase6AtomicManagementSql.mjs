import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

// Values are rendered, never identifiers or SQL supplied by an operator.
export function bindAtomicSql(text, params = []) {
  const literal = (value) => {
    if (value === null) return 'NULL';
    if (Array.isArray(value)) return `ARRAY[${value.map(literal).join(',')}]`;
    if (typeof value === 'number') {
      assert.ok(Number.isSafeInteger(value), 'atomic SQL numeric input must be a safe integer');
      return String(value);
    }
    assert.equal(typeof value, 'string', 'atomic SQL input must be a string, integer, array or null');
    assert.equal(value.includes('\0'), false, 'atomic SQL input contains NUL');
    return `E'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
  };
  return text.replace(/\$(\d+)\b/g, (_, index) => {
    assert.ok(Number(index) >= 1 && Number(index) <= params.length, 'atomic SQL parameter is missing');
    return literal(params[Number(index) - 1]);
  });
}

export function buildAtomicReadOnlySql(queries) {
  assert.ok(Array.isArray(queries) && queries.length > 0, 'atomic read-only query plan is empty');
  assert.equal(new Set(queries.map(({ key }) => key)).size, queries.length, 'atomic query keys repeat');
  const fields = queries.map(({ key, text, params }) => {
    assert.match(key, /^[a-zA-Z][a-zA-Z0-9_]*$/);
    assert.match(text.trim(), /^(?:\/\*[\s\S]*?\*\/\s*)?SELECT\b/i);
    const query = bindAtomicSql(text, params).trim().replace(/;$/, '');
    return `'${key}', (SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) FROM (${query}) q)`;
  });
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
SELECT jsonb_build_object(${fields.join(',\n')}) AS "phase6AtomicResult";
ROLLBACK;
-- This is supplementary same-request state checking, not alone rollback proof.
DO $phase6_idle$ BEGIN
  IF pg_current_xact_id_if_assigned() IS NOT NULL THEN
    RAISE EXCEPTION 'TRAINING_PHASE6_DATABASE_ROLLBACK_FAILED';
  END IF;
END $phase6_idle$;`;
}

export function buildAtomicNegativeSql(probes) {
  assert.equal(probes.length, 6, 'exactly six negative probes are required');
  assert.equal(new Set(probes.map(({ name }) => name)).size, 6, 'negative probe names repeat');
  const blocks = probes.map(({ name, input, expectation, postCheck }) => {
    assert.match(name, /^[a-zA-Z][a-zA-Z0-9]*$/);
    assert.ok(['error', 'result'].includes(expectation.outcome));
    const setup = (input.setup || []).map(({ text, params, expectedRowCount }) => `
      ${bindAtomicSql(text, params)};
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> ${expectedRowCount} THEN RAISE EXCEPTION 'PHASE6_SETUP_ROW_COUNT'; END IF;`).join('\n');
    const action = bindAtomicSql(input.text, input.params);
    const run = expectation.outcome === 'result'
      ? `SELECT action.result INTO observed FROM (${action}) action;
         IF observed->'authorized' IS DISTINCT FROM 'false'::jsonb OR
            observed->>'code' IS DISTINCT FROM ${bindAtomicSql('$1', [expectation.code])}
         THEN RAISE EXCEPTION 'PHASE6_NEGATIVE_RESULT_MISMATCH'; END IF;
         refusal_seen := true;`
      : `${action}; RAISE EXCEPTION 'PHASE6_EXPECTED_REFUSAL_MISSING';`;
    const catchAction = expectation.outcome === 'error'
      ? `GET STACKED DIAGNOSTICS refusal_code = RETURNED_SQLSTATE, refusal_message = MESSAGE_TEXT;
         IF refusal_code <> ${bindAtomicSql('$1', [expectation.code])} OR
            strpos(refusal_message, ${bindAtomicSql('$1', [expectation.message])}) = 0
         THEN RAISE; END IF;
         refusal_seen := true;`
      : 'RAISE;';
    const post = postCheck ? `
      SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) INTO post_rows
      FROM (${bindAtomicSql(postCheck.text, postCheck.params)}) p;
      IF post_rows IS DISTINCT FROM ${bindAtomicSql('$1', [JSON.stringify(postCheck.expectedRows)])}::jsonb
      THEN RAISE EXCEPTION 'PHASE6_POSTROLLBACK_MISMATCH'; END IF;` : '';
    return `
    refusal_seen := false;
    BEGIN
      ${setup}
      BEGIN ${run}
      EXCEPTION WHEN OTHERS THEN ${catchAction} END;
      IF NOT refusal_seen THEN RAISE EXCEPTION 'PHASE6_REFUSAL_NOT_OBSERVED'; END IF;
      RAISE EXCEPTION USING ERRCODE = 'P6001', MESSAGE = 'phase6_rollback_${name}';
    EXCEPTION WHEN SQLSTATE 'P6001' THEN
      IF NOT refusal_seen OR SQLERRM <> 'phase6_rollback_${name}' THEN RAISE; END IF;
    END;
    ${post}
    receipts := receipts || jsonb_build_object('${name}', jsonb_build_object(
      'status', 'passed', 'refusalObserved', true, 'subtransactionRolledBack', true,
      'postRollbackVerified', true));`;
  });
  return `BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DO $phase6_negative$
DECLARE observed jsonb; post_rows jsonb; affected bigint;
  refusal_seen boolean; refusal_code text; refusal_message text; receipts jsonb := '{}'::jsonb;
BEGIN
  ${blocks.join('\n')}
  PERFORM set_config('phase6.atomic_negative_receipt', receipts::text, true);
END $phase6_negative$;
SELECT current_setting('phase6.atomic_negative_receipt')::jsonb AS "phase6AtomicResult";
ROLLBACK;
DO $phase6_idle$ BEGIN
  IF pg_current_xact_id_if_assigned() IS NOT NULL THEN
    RAISE EXCEPTION 'TRAINING_PHASE6_DATABASE_ROLLBACK_FAILED';
  END IF;
END $phase6_idle$;`;
}

export function parseAtomicManagementRows(rows, expectedKeys) {
  assert.ok(Array.isArray(rows) && rows.length === 1, 'atomic management result must contain exactly one row');
  assert.deepEqual(Object.keys(rows[0]), ['phase6AtomicResult'], 'atomic management result envelope mismatch');
  const result = rows[0].phase6AtomicResult;
  assert.ok(result && typeof result === 'object' && !Array.isArray(result), 'atomic management result is not an object');
  assert.deepEqual(Object.keys(result).sort(), [...expectedKeys].sort(), 'atomic management result keys mismatch');
  return result;
}

const normalizedQuery = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g,' ').trim();

// This is deliberately not a persistent query transport. Every phase executes
// exactly one CLI request, then replays ONLY its actual rows into existing
// validators. BEGIN/SET tokens below describe the already-executed batch.
export function createAtomicManagementTransport({workdir,scratchDirectory,expectedProjectRef,spawnSyncFn=spawnSync}) {
  assert.match(expectedProjectRef,/^[a-z0-9]{20}$/);
  assert.equal(readFileSync(resolve(workdir,'supabase/.temp/project-ref'),'utf8').trim(),expectedProjectRef,
    'Management CLI linked project differs from expected project');
  if (process.platform === 'darwin') assert.ok(resolve(scratchDirectory).startsWith('/Volumes/SmarterWork/agent-work/'), 'atomic SQL scratch must be on owned SSD');
  let active=null;
  const execute=(sql,keys)=>{
    const file=resolve(scratchDirectory,`phase6-atomic-${randomUUID()}.sql`);
    writeFileSync(file,sql,{mode:0o600,flag:'wx'});
    try {
      const run=spawnSyncFn('supabase',['db','query','--linked','--file',file,'--output','json','--agent','yes','--workdir',resolve(workdir)],
        {encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
      assert.equal(run.error,undefined,'atomic Management CLI request failed');
      assert.equal(run.status,0,'atomic Management CLI request did not complete');
      // CLI agent JSON wraps rows in an untrusted-data envelope. The owning
      // parser is supplied only once the exact installed shape is qualified.
      const parsed=JSON.parse(String(run.stdout));
      assert.deepEqual(Object.keys(parsed).sort(),['boundary','rows','warning']);
      assert.match(parsed.boundary,/^[a-f0-9]{32}$/);
      assert.equal(typeof parsed.warning,'string');
      assert.ok(parsed.warning.includes(`<${parsed.boundary}>`),'CLI boundary warning mismatch');
      const rows=parsed.rows;
      return parseAtomicManagementRows(rows,keys);
    } finally {unlinkSync(file);}
  };
  return {
    atomicManagement:true,
    async prepareReadOnly(queries) {
      assert.equal(active,null,'atomic read phase already active');
      const rows=execute(buildAtomicReadOnlySql(queries),queries.map(q=>q.key));
      active={queries,rows,consumed:new Set(),literalRollbackCompleted:true};
    },
    async query(text,params=[]) {
      assert.ok(active,'atomic reads require an explicit pre-executed plan');
      if(/^BEGIN\b|^SET LOCAL\b/.test(text)) return {rows:[]};
      const query=active.queries.find(q=>normalizedQuery(q.text)===normalizedQuery(text));
      assert.ok(query,'query not in atomic read-only plan');
      assert.deepEqual(params,query.params||[],'atomic read query parameters differ');
      assert.equal(active.consumed.has(query.key),false,'atomic read query repeated');
      active.consumed.add(query.key);
      assert.ok(Array.isArray(active.rows[query.key]),'atomic read rowset malformed');
      return {rows:active.rows[query.key]};
    },
    async finishReadOnly() {
      assert.ok(active?.literalRollbackCompleted,'atomic literal ROLLBACK did not complete');
      assert.equal(active.consumed.size,active.queries.length,'atomic read plan incompletely validated');
      active=null;
    },
    async collectNegative(probes) {
      assert.equal(active,null,'atomic read phase unfinished');
      return execute(buildAtomicNegativeSql(probes),probes.map(p=>p.name));
    },
    async close(){active=null;},
  };
}
