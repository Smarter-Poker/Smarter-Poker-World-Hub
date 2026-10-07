"""Wrap reviewed generated activation with atomic irreversible old-pin retirement.

No database or network transport. The caller still owns protected builder
verification and qualified migration installation. Recovery only holds NEW.
"""
import argparse
from pathlib import Path
import re

OLD_COMMIT = '1ccf3907cf3298e24609eb6fbd903023d91dbddf'
OLD_MANIFEST = 'b27ad1f3575e106d7d7f73bb4655e94398955a1275ae1fea9b3af7f574dbece8'
SOLVER = 'PioSOLVER-pro 3.8.0 (Sep 22 2025, 11:05:45)'
BINARY = 'e21ea7ad1dbc2a9d826c25ac264688f632dd461b92de2bc35a53f6b78bcf5ceb'
IDS = ('2d7b403c-e4d3-4c20-bff8-ed5db7ecb50a', '21d75135-faa8-4c0d-acbe-91b55c98daf0')

def predicate(commit, manifest):
    return "machine_id = 'M1' AND solver_version = '%s' AND solver_binary_checksum = '%s' AND pipeline_commit = '%s' AND manifest_version = '5' AND manifest_checksum = '%s'" % (SOLVER, BINARY, commit, manifest)

def validate_pins(commit, manifest):
    if not re.fullmatch('[0-9a-f]{40}', commit) or not re.fullmatch('[0-9a-f]{64}', manifest) or commit == OLD_COMMIT or manifest == OLD_MANIFEST:
        raise ValueError('new exact protected pins required')

def wrap_activation(sql, commit, manifest):
    validate_pins(commit, manifest)
    if len(re.findall(r'^BEGIN;$', sql, re.M)) != 1 or len(re.findall(r'^COMMIT;$', sql, re.M)) != 1:
        raise ValueError('exact single generated transaction required')
    if sql.index('BEGIN;') > sql.index('COMMIT;') or not sql.rstrip().endswith('COMMIT;'):
        raise ValueError('generated transaction boundary invalid')
    if OLD_COMMIT in sql or OLD_MANIFEST in sql or any(value not in sql for value in (commit, manifest, SOLVER, BINARY, *IDS)):
        raise ValueError('generated activation does not bind exact replacement tuple and targets')
    for guard in ('TRAINING_SOLVER_MACHINE_INGEST_SCOPE_ALREADY_ACTIVE', 'TRAINING_SOLVER_M1_CANARY_CHILD_IDENTITY_MISMATCH', 'M1 bounded canary approval did not activate exactly one scope'):
        if guard not in sql:
            raise ValueError('generated activation safeguard missing')
    old = predicate(OLD_COMMIT, OLD_MANIFEST)
    new = predicate(commit, manifest)
    # Preserve every existing activation safeguard and add only an exact-pin
    # safety-hold transition. The installed guard otherwise forbids holds.
    source = (Path(__file__).resolve().parents[2] / 'supabase/migrations/20260910120000_training_solver_bounded_canary_authority.sql').read_text()
    start = source.index('CREATE OR REPLACE FUNCTION public.fn_training_solver_scope_transition_guard_v1()')
    end = source.index('$function$;', start) + len('$function$;')
    guard = source[start:end]
    hold = """BEGIN
  IF NEW.admission_mode = 'held' AND NEW.partition_count IS NULL AND NEW.partition_index IS NULL
     AND ROW(NEW.machine_id, NEW.solver_version, NEW.solver_binary_checksum, NEW.pipeline_commit, NEW.manifest_version, NEW.manifest_checksum)
       IS NOT DISTINCT FROM ROW(OLD.machine_id, OLD.solver_version, OLD.solver_binary_checksum, OLD.pipeline_commit, OLD.manifest_version, OLD.manifest_checksum)
     AND NEW.machine_id = 'M1' AND NEW.solver_version = '{solver}' AND NEW.solver_binary_checksum = '{binary}' AND NEW.manifest_version = '5'
     AND ((NEW.pipeline_commit = '{old_commit}' AND NEW.manifest_checksum = '{old_manifest}')
       OR (NEW.pipeline_commit = '{new_commit}' AND NEW.manifest_checksum = '{new_manifest}')) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-solver-ingest-scope:M1', 0));
    RETURN NEW;
  END IF;
""".format(solver=SOLVER, binary=BINARY, old_commit=OLD_COMMIT, old_manifest=OLD_MANIFEST, new_commit=commit, new_manifest=manifest)
    guard = guard.replace('BEGIN\n', hold, 1)
    preimage = """DO $m1_guard_preimage$
BEGIN
  IF md5(pg_catalog.pg_get_functiondef('public.fn_training_solver_scope_transition_guard_v1()'::regprocedure))
       IS DISTINCT FROM '5080a6fb62d078a04931e3389dda5942' THEN
    RAISE EXCEPTION 'TRAINING_M1_SCOPE_GUARD_PREIMAGE_MISMATCH';
  END IF;
END;
$m1_guard_preimage$;
"""
    preamble = """
-- Serialize with the actual maintained M1 activation guard, not a new lock.
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-solver-ingest-scope:M1', 0));
LOCK TABLE public.training_solver_worker_receipts IN SHARE MODE;
DO $m1_pin_transition$
DECLARE v_count integer;
BEGIN
  PERFORM 1 FROM public.training_solver_provenance_authority WHERE {old} FOR UPDATE;
  PERFORM 1 FROM public.training_solver_ingest_scopes WHERE {old} FOR UPDATE;
  IF (SELECT count(*) FROM public.training_solver_provenance_authority WHERE {old} AND retired_at IS NULL) <> 1
     OR (SELECT count(*) FROM public.training_solver_ingest_scopes WHERE {old} AND admission_mode = 'bounded_canary' AND partition_count = 2 AND partition_index = 0) <> 1 THEN
    RAISE EXCEPTION 'TRAINING_M1_OLD_PIN_NOT_EXACT_ACTIVE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.training_solver_worker_receipts WHERE {old}) THEN
    RAISE EXCEPTION 'TRAINING_M1_OLD_PIN_HAS_RECEIPTS';
  END IF;
  UPDATE public.training_solver_provenance_authority SET retired_at = clock_timestamp() WHERE {old} AND retired_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'TRAINING_M1_RETIRE_COUNT'; END IF;
  UPDATE public.training_solver_ingest_scopes SET admission_mode = 'held', partition_count = NULL, partition_index = NULL,
    configured_at = clock_timestamp(), configured_by = 'phase6-pio38-incompatible-old-pin-retirement' WHERE {old};
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'TRAINING_M1_OLD_HOLD_COUNT'; END IF;
END;
$m1_pin_transition$;
""".format(old=old)
    # Classification includes the SECDEF guard change and irreversible old-pin
    # retirement. CREATE OR REPLACE preserves the installed owner and ACL.
    sql = sql.replace('-- TIER:        2', '-- TIER:        3', 1)
    sql = sql.replace('training_solver_ingest_scopes (DML only)', 'training_solver_ingest_scopes; fn_training_solver_scope_transition_guard_v1 (function + DML)', 1)
    sql = sql.replace('-- IRREVERSIBLE: no', '-- IRREVERSIBLE: yes (old authority retirement; qualified recovery holds NEW only)', 1)
    sql = sql.replace("SET LOCAL lock_timeout = '5s';", '').replace("SET LOCAL statement_timeout = '120s';", '')
    wrapped = sql.replace('BEGIN;', "BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '120s';\n" + preimage + guard + '\n' + preamble, 1)
    return wrapped + '\n-- ROLLBACK / RECOVERY: execute only to hold NEW; old retirement is permanent.\n' + '\n'.join('-- ' + line for line in recovery_sql(commit, manifest).splitlines()) + '\n'

def recovery_sql(commit, manifest):
    validate_pins(commit, manifest)
    return """BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-solver-ingest-scope:M1', 0));
DO $m1_hold_new$
BEGIN
 IF (SELECT count(*) FROM public.training_solver_provenance_authority WHERE {old} AND retired_at IS NOT NULL) <> 1 THEN
   RAISE EXCEPTION 'TRAINING_M1_OLD_PIN_RETIREMENT_REQUIRED';
 END IF;
 IF (SELECT count(*) FROM public.training_solver_ingest_scopes WHERE {new}) <> 1 THEN
   RAISE EXCEPTION 'TRAINING_M1_NEW_PIN_REQUIRED';
 END IF;
 UPDATE public.training_solver_ingest_scopes SET admission_mode = 'held', partition_count = NULL, partition_index = NULL,
 configured_at = clock_timestamp(), configured_by = 'phase6-hold-new-pin-only' WHERE {new};
END;
$m1_hold_new$;
COMMIT;
""".format(old=predicate(OLD_COMMIT, OLD_MANIFEST), new=predicate(commit, manifest))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--activation', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--recovery', action='store_true')
    args = parser.parse_args()
    print(recovery_sql(args.commit, args.manifest) if args.recovery else wrap_activation(Path(args.activation).read_text(), args.commit, args.manifest), end='')
