import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// These immutable DML qualifications never grant production release authority.
const TRANSITIONS = [
  {
    name: 'version',
    path: 'supabase/migrations/20261023233140_training_m1_version_attestation_repin.sql',
    sha256: 'db76250600559267781decf480070d5e177e01cd62b5207b0f944fa1ef9c3b41',
    oldCommit: '002cb37bbd89df86f4cc054fcf370f794b14f413',
    newCommit: '7d1154f84b7220462f896f30af1c9ed1a8cbc200',
    newManifest: '0c1559f64b10903f410bf07f15b1760bff3cf9d5bf89626ad0f0ef0eac650a6c',
    holdsOldScope: true,
    predecessorError: 'M1_EXACT_OLD_ACTIVE_PIN_REQUIRED',
    receiptError: 'M1_OLD_PIN_HAS_ARTIFACT_OR_UNEXPECTED_RECEIPTS',
  },
  {
    name: 'low_memory',
    path: 'supabase/migrations/20261024014250_training_m1_low_memory_repin.sql',
    sha256: 'db6442684fe844523877d31b6111d9818312080dcac08fb27dbb9a8b390d0900',
    oldCommit: '7d1154f84b7220462f896f30af1c9ed1a8cbc200',
    newCommit: '1ff1f0bfad564607908136a73c37c80ba0d7f325',
    newManifest: '31e68135275a192b89af0068a1d984365eba872a1cb67fe73dde59069039e3e1',
    holdsOldScope: false,
    predecessorError: 'M1_EXACT_FLOAT32_PIN_REQUIRED',
    receiptError: 'M1_FLOAT32_PIN_HAS_ARTIFACT_OR_UNEXPECTED_RECEIPTS',
  },
  {
    name: 'float16_normalization',
    path: 'supabase/migrations/20261024040402_training_m1_float16_normalization_repin.sql',
    sha256: 'b6deee756e3426b8a9fa67e74cb490a3aaf68f53ebea7fe6df58bf234979ed8d',
    oldCommit: '1ff1f0bfad564607908136a73c37c80ba0d7f325',
    newCommit: '932f0a21c5f6bb6e8b6f73f540e1271b9f69b8d4',
    newManifest: '2613f123d69974275abfbfb2a1e49e88e5286c9278d154cda9ea6def74a9c69c',
    holdsOldScope: false,
    predecessorError: 'M1_EXACT_PRIOR_EXPORT_PIN_REQUIRED',
    receiptError: 'M1_PRIOR_EXPORT_PIN_HAS_ARTIFACT_OR_UNEXPECTED_RECEIPTS',
  },
];

export function qualifyM1Repins({ root, tool, command, commandExpectFailure,
  prepareDatabase, activationMigration, transitionSql }) {
  return TRANSITIONS.map((transition, index) => {
    const { path: REPIN_PATH, sha256: REPIN_SHA256, oldCommit: OLD_COMMIT,
      newCommit: NEW_COMMIT, newManifest: NEW_MANIFEST } = transition;
    const bytes = readFileSync(path.join(root, REPIN_PATH));
    if (createHash('sha256').update(bytes).digest('hex') !== REPIN_SHA256) {
      throw new Error('M1 repin qualification refuses different migration bytes');
    }
    const migration = bytes.toString('utf8');
    const execute = (connection, input) => command(tool('psql'),
      ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], { input, quiet: true });
    const scalar = (connection, input) => command(tool('psql'),
      ['-X', '-v', 'ON_ERROR_STOP=1', '-tA', ...connection], { input, quiet: true }).stdout.trim();
    const refuse = (connection, input, expected) => commandExpectFailure(tool('psql'),
      ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], { input, expected });
    const schema = (connection) => command(tool('pg_dump'),
      ['--schema-only', ...connection], { quiet: true }).stdout
      .replace(/^\\(?:un)?restrict .*\r?\n/gm, '');
    const stateSql = `SELECT jsonb_build_object(
      'authority', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM training_solver_provenance_authority t),
      'scopes', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM training_solver_ingest_scopes t),
      'targets', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM training_solver_bounded_canary_targets t),
      'receipts', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM training_solver_worker_receipts t),
      'warehouse', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM solved_spots_gold t),
      'catalog', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM training_solver_artifact_catalog t)
    );`;
    const state = (connection) => JSON.parse(scalar(connection, stateSql));
    const identical = (before, after, message) => {
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(message);
    };
    const prepare = (name) => {
      const connection = prepareDatabase(`${name}_${index}`, 'r:0:c:b412:c:2d:c');
      command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection,
        '-f', activationMigration], { quiet: true });
      execute(connection, transitionSql);
      // Execute each actual predecessor migration, never fabricate its resulting rows.
      for (const prior of TRANSITIONS.slice(0, index)) {
        const priorBytes = readFileSync(path.join(root, prior.path));
        if (createHash('sha256').update(priorBytes).digest('hex') !== prior.sha256) {
          throw new Error('M1 repin predecessor bytes changed');
        }
        execute(connection, priorBytes.toString('utf8'));
      }
      return connection;
    };
    const receipt = (connection, operation, nonce) => execute(connection, `
      INSERT INTO training_solver_worker_receipts
        (machine_id,request_nonce,operation,signed_at,body_sha256,solver_version,
         solver_binary_checksum,pipeline_commit,manifest_version,manifest_checksum)
      SELECT machine_id,'${nonce}','${operation}',clock_timestamp(),repeat('c',64),
        solver_version,solver_binary_checksum,pipeline_commit,manifest_version,manifest_checksum
      FROM training_solver_ingest_scopes WHERE machine_id='M1' AND pipeline_commit='${OLD_COMMIT}';`);

    const success = prepare('phase6_m1_version_repin');
    receipt(success, 'heartbeat', '00000000-0000-4000-8000-000000000201');
    receipt(success, 'row_states', '00000000-0000-4000-8000-000000000202');
    execute(success, `INSERT INTO training_solver_provenance_authority
      (machine_id,solver_version,solver_binary_checksum,pipeline_commit,manifest_version,
       manifest_checksum,source_combo_order_sha256,training_game_contracts_sha256,manifest_contracts,approved_by)
      SELECT 'M2',solver_version,solver_binary_checksum,pipeline_commit,manifest_version,
        manifest_checksum,source_combo_order_sha256,training_game_contracts_sha256,manifest_contracts,'isolated qualification sentinel'
      FROM training_solver_provenance_authority WHERE machine_id='M1' AND pipeline_commit='${OLD_COMMIT}';`);
    const before = state(success);
    const beforeSchema = schema(success);
    execute(success, migration);
    const after = state(success);
    identical(beforeSchema, schema(success), 'M1 repin changed schema, ownership, or privileges');
    for (const key of ['receipts', 'warehouse', 'catalog']) {
      identical(before[key], after[key], `M1 repin changed ${key}`);
    }
    for (const key of ['authority', 'scopes', 'targets']) {
      identical(before[key].filter((r) => r.machine_id === 'M2'),
        after[key].filter((r) => r.machine_id === 'M2'), `M1 repin changed M2 ${key}`);
    }
    identical(before.targets, after.targets.filter((r) => r.pipeline_commit !== NEW_COMMIT),
      'M1 repin changed historical targets');
    const oldScope = transition.holdsOldScope
      ? "admission_mode='held' AND partition_count IS NULL AND partition_index IS NULL"
      : "admission_mode='bounded_canary' AND partition_count=2 AND partition_index=0";
    if (!transition.holdsOldScope) {
      identical(before.scopes, after.scopes.filter((r) => r.pipeline_commit !== NEW_COMMIT),
        'Low-memory repin changed historical scopes');
    }
    const guard = (commit, mode = 'bounded_canary') => `SELECT public.fn_training_solver_operation_scope_guard_v1(
      machine_id,solver_version,solver_binary_checksum,pipeline_commit,manifest_version,manifest_checksum,'${mode}')
      FROM training_solver_provenance_authority WHERE machine_id='M1' AND pipeline_commit='${commit}';`;
    if (scalar(success, `SELECT
      (SELECT count(*) FROM training_solver_provenance_authority WHERE machine_id='M1' AND retired_at IS NULL)=1
      AND (SELECT count(*) FROM training_solver_provenance_authority WHERE machine_id='M1' AND pipeline_commit='${OLD_COMMIT}' AND retired_at IS NOT NULL)=1
      AND (SELECT count(*) FROM training_solver_provenance_authority WHERE machine_id='M1' AND pipeline_commit='${NEW_COMMIT}' AND manifest_checksum='${NEW_MANIFEST}' AND retired_at IS NULL)=1
      AND (SELECT count(*) FROM training_solver_ingest_scopes WHERE machine_id='M1' AND pipeline_commit='${OLD_COMMIT}' AND ${oldScope})=1
      AND (SELECT count(*) FROM training_solver_ingest_scopes WHERE machine_id='M1' AND pipeline_commit='${NEW_COMMIT}' AND manifest_checksum='${NEW_MANIFEST}' AND admission_mode='bounded_canary' AND partition_count=2 AND partition_index=0)=1
      AND (SELECT count(*) FROM training_solver_bounded_canary_targets WHERE machine_id='M1' AND pipeline_commit='${NEW_COMMIT}' AND manifest_checksum='${NEW_MANIFEST}')=2
      AND (SELECT count(*) FROM training_solver_bounded_canary_targets WHERE machine_id='M1' AND pipeline_commit='${NEW_COMMIT}' AND manifest_checksum='${NEW_MANIFEST}' AND
        (target_role,artifact_id,scenario_hash,node,hero_position) IN (
         ('parent','2d7b403c-e4d3-4c20-bff8-ed5db7ecb50a'::uuid,'hu_cash_BTN_100bb_2c4c7c','r:0:c','BTN'),
         ('child','21d75135-faa8-4c0d-acbe-91b55c98daf0'::uuid,'turn_hu_cash_BTN_100bb_2c4c7c2d','r:0:c:b412:c:2d:c','BTN')))=2;`) !== 't') {
      throw new Error('M1 repin did not install the exact independent two-target postcondition');
    }
    execute(success, guard(NEW_COMMIT));
    refuse(success, guard(NEW_COMMIT, 'backlog'), 'SOLVER_WORKER_EXECUTION_SCOPE_MISMATCH');
    refuse(success, guard(OLD_COMMIT), 'SOLVER_WORKER_AUTHORITY_INACTIVE');
    refuse(success, migration, transition.predecessorError);
    identical(after, state(success), 'Duplicate M1 repin changed state');

    const wrongPredecessor = prepare('phase6_m1_predecessor_refusal');
    execute(wrongPredecessor, `UPDATE training_solver_provenance_authority SET retired_at=clock_timestamp()
      WHERE machine_id='M1' AND pipeline_commit='${OLD_COMMIT}';`);
    const predecessorState = state(wrongPredecessor);
    refuse(wrongPredecessor, migration, transition.predecessorError);
    identical(predecessorState, state(wrongPredecessor), 'Wrong predecessor refusal changed state');

    const wrongGuard = prepare('phase6_m1_version_guard_refusal');
    execute(wrongGuard, 'ALTER FUNCTION fn_training_solver_scope_transition_guard_v1() SET search_path TO public;');
    const guardState = state(wrongGuard);
    refuse(wrongGuard, migration, 'M1_SCOPE_GUARD_PREIMAGE_CHANGED');
    identical(guardState, state(wrongGuard), 'Guard refusal changed state');

    const unexpectedReceipt = prepare('phase6_m1_version_receipt_refusal');
    receipt(unexpectedReceipt, 'board_page', '00000000-0000-4000-8000-000000000203');
    const receiptState = state(unexpectedReceipt);
    refuse(unexpectedReceipt, migration, transition.receiptError);
    identical(receiptState, state(unexpectedReceipt), 'Unexpected receipt refusal changed state');

    const wrongChild = prepare('phase6_m1_version_child_refusal');
    // Move the reserved legacy row to a different UUID without altering its
    // payload. A direct payload edit is correctly refused by the provenance
    // trigger before the repin can exercise its own target-identity guard.
    if (scalar(wrongChild, `WITH moved AS (
      UPDATE solved_spots_gold SET id='00000000-0000-4000-8000-000000000205'
      WHERE id='21d75135-faa8-4c0d-acbe-91b55c98daf0' RETURNING id
    ) SELECT count(*) FROM moved;`) !== '1') {
      throw new Error('Wrong-target qualification did not move exactly one reserved child');
    }
    const childState = state(wrongChild);
    refuse(wrongChild, migration, 'TRAINING_SOLVER_M1_CANARY_CHILD_IDENTITY_MISMATCH');
    identical(childState, state(wrongChild), 'Wrong target refusal did not roll back retirement');

    const rollback = prepare('phase6_m1_version_atomic_rollback');
    const rollbackState = state(rollback);
    refuse(rollback, migration.replace(/^COMMIT;\r?$/m, 'SELECT 1/0;\nCOMMIT;'), 'division by zero');
    identical(rollbackState, state(rollback), 'Interrupted M1 repin was not atomic');
    execute(success, `BEGIN;
      SELECT pg_advisory_xact_lock(hashtextextended('training-solver-ingest-scope:M1',0));
      UPDATE training_solver_provenance_authority SET retired_at=clock_timestamp()
        WHERE machine_id='M1' AND pipeline_commit='${NEW_COMMIT}' AND manifest_checksum='${NEW_MANIFEST}' AND retired_at IS NULL;
      COMMIT;`);
    if (scalar(success, `SELECT NOT EXISTS(SELECT 1 FROM training_solver_provenance_authority WHERE machine_id='M1' AND retired_at IS NULL);`) !== 't') {
      throw new Error('M1 repin recovery left active authority');
    }
    const recovered = state(success);
    for (const key of ['scopes', 'targets', 'receipts', 'warehouse', 'catalog']) {
      identical(after[key], recovered[key], `M1 recovery changed historical ${key}`);
    }
    identical(after.authority.filter((r) => r.pipeline_commit !== NEW_COMMIT),
      recovered.authority.filter((r) => r.pipeline_commit !== NEW_COMMIT),
      'M1 recovery changed unrelated or previously retired authority');
    refuse(success, guard(NEW_COMMIT), 'SOLVER_WORKER_AUTHORITY_INACTIVE');
    refuse(success, guard(OLD_COMMIT), 'SOLVER_WORKER_AUTHORITY_INACTIVE');
    for (const retiredCommit of [OLD_COMMIT, NEW_COMMIT]) {
      if (scalar(success, `SELECT public.training_claim_solver_worker_request_v2(
        machine_id,solver_version,solver_binary_checksum,pipeline_commit,manifest_version,manifest_checksum,
        'bounded_canary','00000000-0000-4000-8000-000000000204'::uuid,'heartbeat',clock_timestamp(),repeat('d',64))
        FROM training_solver_provenance_authority WHERE machine_id='M1' AND pipeline_commit='${retiredCommit}';`) !== 'f') {
        throw new Error('Retired M1 authority accepted a worker request');
      }
    }
    refuse(success, `UPDATE training_solver_provenance_authority SET retired_at=NULL WHERE machine_id='M1' AND pipeline_commit='${OLD_COMMIT}';`,
      'TRAINING_SOLVER_PROVENANCE_RETIREMENT_IMMUTABLE');
    identical(recovered, state(success), 'Retired request or revival refusal changed state');
    return {
      path: REPIN_PATH, sha256: REPIN_SHA256, postgresMajor: 17,
      exactTwoTargets: true, schemaUnchanged: true, m2Unchanged: true,
      receiptsAndArtifactsPreserved: true, duplicateRefused: true,
      guardDriftRefused: true, unexpectedReceiptRefused: true,
      wrongTargetRolledBack: true, interruptedTransactionRolledBack: true,
      recoveryRetiresNewOnly: true, oldRetirementImmutable: true,
      wrongPredecessorRefused: true, retiredRequestsRefused: true, backlogRefused: true,
    };
  });
}
