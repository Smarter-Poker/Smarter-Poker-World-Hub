-- Bind every solver metadata/read operation to the same active execution mode
-- that was sealed into the signed worker envelope. A provenance tuple alone
-- must never start backlog work while its ingest scope is held or canary-only.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $assert_solver_scope_binding_prerequisites$
BEGIN
  IF to_regclass('public.training_solver_ingest_scopes') IS NULL
     OR to_regclass('public.training_solver_provenance_authority') IS NULL
     OR to_regclass('public.training_solver_bounded_canary_targets') IS NULL
     OR to_regclass('public.training_solver_worker_receipts') IS NULL
     OR to_regclass('public.solver_status') IS NULL
     OR to_regprocedure(
       'public.training_ingest_solver_artifact_unscoped_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)'
     ) IS NULL
     OR to_regprocedure(
       'public.fn_training_solver_ingest_scope_guard_v1(text,text,text,text,text,text,jsonb)'
     ) IS NULL
     OR to_regprocedure(
       'public.training_solver_worker_row_states_v2(text,text,text,text,text,text,text[])'
     ) IS NULL
     OR to_regprocedure(
       'public.training_solver_worker_board_page_v1(text,integer,text,text,text,integer)'
     ) IS NULL THEN
    RAISE EXCEPTION 'TRAINING_SOLVER_SCOPE_BINDING_PREREQUISITE_MISSING';
  END IF;
END;
$assert_solver_scope_binding_prerequisites$;

-- The legacy status table predates this repository's migration history. Bind
-- the narrow heartbeat RPC only to the exact production shape we inspected;
-- PL/pgSQL creation alone would otherwise defer column/type errors until the
-- first live worker heartbeat.
DO $assert_solver_status_shape$
DECLARE
  v_status_oid pg_catalog.oid :=
    pg_catalog.to_regclass('public.solver_status');
BEGIN
  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class class_row
       WHERE class_row.oid = v_status_oid
         AND class_row.relkind = 'r'
         AND class_row.relpersistence = 'p'
         AND class_row.relrowsecurity
     )
     OR (
       SELECT count(*)
       FROM pg_catalog.pg_attribute attribute_row
       WHERE attribute_row.attrelid = v_status_oid
         AND attribute_row.attnum > 0
         AND NOT attribute_row.attisdropped
     ) <> 8
     OR EXISTS (
       SELECT 1
       FROM (VALUES
         ('machine_id', 1, 'text', true, NULL::text),
         ('phase', 2, 'text', false, NULL::text),
         ('board', 3, 'text', false, NULL::text),
         ('spots_done', 4, 'integer', false, '0'::text),
         ('rows_written', 5, 'integer', false, '0'::text),
         ('bad', 6, 'integer', false, '0'::text),
         ('note', 7, 'text', false, NULL::text),
         ('updated_at', 8, 'timestamp with time zone', false, 'now()'::text)
       ) expected(attname, attnum, type_name, attnotnull, default_expr)
       LEFT JOIN pg_catalog.pg_attribute actual
         ON actual.attrelid = v_status_oid
        AND actual.attname = expected.attname
        AND actual.attnum = expected.attnum
        AND NOT actual.attisdropped
       LEFT JOIN pg_catalog.pg_attrdef default_row
         ON default_row.adrelid = actual.attrelid
        AND default_row.adnum = actual.attnum
       WHERE actual.attname IS NULL
          OR pg_catalog.format_type(actual.atttypid, actual.atttypmod)
             IS DISTINCT FROM expected.type_name
          OR actual.attnotnull IS DISTINCT FROM expected.attnotnull
          OR pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid)
             IS DISTINCT FROM expected.default_expr
     )
     OR (SELECT count(*) FROM pg_catalog.pg_constraint constraint_row
         WHERE constraint_row.conrelid = v_status_oid) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint constraint_row
       WHERE constraint_row.conrelid = v_status_oid
         AND constraint_row.conname = 'solver_status_pkey'
         AND constraint_row.contype = 'p'
         AND constraint_row.convalidated
         AND NOT constraint_row.condeferrable
         AND NOT constraint_row.condeferred
         AND constraint_row.conkey = ARRAY[1]::smallint[]
     ) THEN
    RAISE EXCEPTION 'TRAINING_SOLVER_STATUS_CONTRACT_INCOMPLETE';
  END IF;
END;
$assert_solver_status_shape$;

-- Status remains readable to the trusted server for diagnostics, but direct
-- writes are removed. Every mutation must pass the exact active operation
-- scope inside training_solver_worker_heartbeat_v1.
REVOKE ALL ON TABLE public.solver_status
  FROM PUBLIC, anon, authenticated, service_role;
DO $normalize_solver_status_column_acls$
DECLARE
  v_attribute record;
  v_grantee pg_catalog.oid;
  v_grantee_name name;
  v_owner pg_catalog.oid;
BEGIN
  SELECT class_row.relowner INTO STRICT v_owner
  FROM pg_catalog.pg_class class_row
  WHERE class_row.oid = 'public.solver_status'::pg_catalog.regclass;

  FOR v_grantee IN
    SELECT DISTINCT expanded_acl.grantee
    FROM pg_catalog.pg_class class_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(class_row.relacl, pg_catalog.acldefault('r', class_row.relowner))
    ) expanded_acl
    WHERE class_row.oid = 'public.solver_status'::pg_catalog.regclass
      AND expanded_acl.grantee <> v_owner
  LOOP
    IF v_grantee = 0 THEN
      EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.solver_status FROM PUBLIC CASCADE';
    ELSE
      SELECT role_row.rolname INTO STRICT v_grantee_name
      FROM pg_catalog.pg_roles role_row WHERE role_row.oid = v_grantee;
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON TABLE public.solver_status FROM %I CASCADE',
        v_grantee_name
      );
    END IF;
  END LOOP;

  FOR v_attribute IN
    SELECT attribute_row.attname, expanded_acl.grantee
    FROM pg_catalog.pg_attribute attribute_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_row.attacl) expanded_acl
    WHERE attribute_row.attrelid = 'public.solver_status'::pg_catalog.regclass
      AND attribute_row.attnum > 0
      AND NOT attribute_row.attisdropped
      AND expanded_acl.grantee <> v_owner
  LOOP
    IF v_attribute.grantee = 0 THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES (%I) ON TABLE public.solver_status FROM PUBLIC CASCADE',
        v_attribute.attname
      );
    ELSE
      SELECT role_row.rolname INTO STRICT v_grantee_name
      FROM pg_catalog.pg_roles role_row
      WHERE role_row.oid = v_attribute.grantee;
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES (%I) ON TABLE public.solver_status FROM %I CASCADE',
        v_attribute.attname, v_grantee_name
      );
    END IF;
  END LOOP;
END;
$normalize_solver_status_column_acls$;
GRANT SELECT ON TABLE public.solver_status TO service_role;

CREATE OR REPLACE FUNCTION public.training_claim_solver_worker_request_v2(
  p_machine_id text,
  p_solver_version text,
  p_solver_binary_checksum text,
  p_pipeline_commit text,
  p_manifest_version text,
  p_manifest_checksum text,
  p_expected_admission_mode text,
  p_nonce uuid,
  p_operation text,
  p_signed_at timestamptz,
  p_body_sha256 text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_inserted integer;
BEGIN
  IF p_machine_id NOT IN ('M1', 'M2')
     OR p_operation NOT IN ('row_states', 'board_page', 'heartbeat')
     OR p_expected_admission_mode NOT IN ('backlog', 'bounded_canary')
     OR (p_expected_admission_mode = 'bounded_canary'
         AND p_operation = 'board_page')
     OR p_nonce IS NULL
     OR p_signed_at IS NULL
     OR abs(extract(epoch FROM (clock_timestamp() - p_signed_at))) > 300
     OR coalesce(p_body_sha256, '') !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  PERFORM 1
  FROM public.training_solver_provenance_authority authority
  WHERE authority.machine_id = p_machine_id
    AND authority.solver_version = p_solver_version
    AND authority.solver_binary_checksum = p_solver_binary_checksum
    AND authority.pipeline_commit = p_pipeline_commit
    AND authority.manifest_version = p_manifest_version
    AND authority.manifest_checksum = p_manifest_checksum
    AND authority.retired_at IS NULL
  FOR SHARE OF authority;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM 1
  FROM public.training_solver_ingest_scopes scope
  WHERE scope.machine_id = p_machine_id
    AND scope.solver_version = p_solver_version
    AND scope.solver_binary_checksum = p_solver_binary_checksum
    AND scope.pipeline_commit = p_pipeline_commit
    AND scope.manifest_version = p_manifest_version
    AND scope.manifest_checksum = p_manifest_checksum
    AND scope.admission_mode = p_expected_admission_mode
    AND (
      (scope.admission_mode = 'backlog'
        AND scope.partition_count IS NULL
        AND scope.partition_index IS NULL)
      OR
      (scope.admission_mode = 'bounded_canary'
        AND scope.partition_count = 2
        AND scope.partition_index = CASE p_machine_id WHEN 'M1' THEN 0 ELSE 1 END)
    )
  FOR SHARE OF scope;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  WITH stale_candidates AS MATERIALIZED (
    SELECT candidate.machine_id, candidate.request_nonce
    FROM public.training_solver_worker_receipts candidate
    WHERE candidate.received_at < clock_timestamp() - interval '24 hours'
    ORDER BY candidate.received_at, candidate.machine_id
    FOR UPDATE SKIP LOCKED
    LIMIT 100
  )
  DELETE FROM public.training_solver_worker_receipts stale
  USING stale_candidates candidate
  WHERE stale.machine_id = candidate.machine_id
    AND stale.request_nonce = candidate.request_nonce;

  INSERT INTO public.training_solver_worker_receipts (
    machine_id, request_nonce, operation, signed_at, body_sha256,
    solver_version, solver_binary_checksum, pipeline_commit,
    manifest_version, manifest_checksum
  ) VALUES (
    p_machine_id, p_nonce, p_operation, p_signed_at, p_body_sha256,
    p_solver_version, p_solver_binary_checksum, p_pipeline_commit,
    p_manifest_version, p_manifest_checksum
  ) ON CONFLICT (machine_id, request_nonce) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.training_claim_solver_worker_request_v1(
  text, text, text, text, text, text, uuid, text, timestamptz, text
) FROM service_role;
REVOKE ALL ON FUNCTION public.training_claim_solver_worker_request_v2(
  text, text, text, text, text, text, text, uuid, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_claim_solver_worker_request_v2(
  text, text, text, text, text, text, text, uuid, text, timestamptz, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_training_solver_operation_scope_guard_v1(
  p_machine_id text,
  p_solver_version text,
  p_solver_binary_checksum text,
  p_pipeline_commit text,
  p_manifest_version text,
  p_manifest_checksum text,
  p_expected_admission_mode text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_mode text;
  v_partition_count integer;
  v_partition_index integer;
BEGIN
  IF p_expected_admission_mode NOT IN ('backlog', 'bounded_canary') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501', MESSAGE = 'SOLVER_WORKER_EXPECTED_SCOPE_INVALID';
  END IF;

  PERFORM 1
  FROM public.training_solver_provenance_authority authority
  WHERE authority.machine_id = p_machine_id
    AND authority.solver_version = p_solver_version
    AND authority.solver_binary_checksum = p_solver_binary_checksum
    AND authority.pipeline_commit = p_pipeline_commit
    AND authority.manifest_version = p_manifest_version
    AND authority.manifest_checksum = p_manifest_checksum
    AND authority.retired_at IS NULL
  FOR SHARE OF authority;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501', MESSAGE = 'SOLVER_WORKER_AUTHORITY_INACTIVE';
  END IF;

  SELECT scope.admission_mode, scope.partition_count, scope.partition_index
  INTO v_mode, v_partition_count, v_partition_index
  FROM public.training_solver_ingest_scopes scope
  WHERE scope.machine_id = p_machine_id
    AND scope.solver_version = p_solver_version
    AND scope.solver_binary_checksum = p_solver_binary_checksum
    AND scope.pipeline_commit = p_pipeline_commit
    AND scope.manifest_version = p_manifest_version
    AND scope.manifest_checksum = p_manifest_checksum
  FOR SHARE OF scope;

  IF NOT FOUND
     OR v_mode IS DISTINCT FROM p_expected_admission_mode
     OR (v_mode = 'backlog'
         AND (v_partition_count IS NOT NULL OR v_partition_index IS NOT NULL))
     OR (v_mode = 'bounded_canary'
         AND (v_partition_count IS DISTINCT FROM 2
              OR v_partition_index IS DISTINCT FROM
                 CASE p_machine_id WHEN 'M1' THEN 0 ELSE 1 END)) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501', MESSAGE = 'SOLVER_WORKER_EXECUTION_SCOPE_MISMATCH';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_training_solver_operation_scope_guard_v1(
  text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.training_ingest_solver_artifact_v2(
  p_machine_id text,
  p_solver_version text,
  p_solver_binary_checksum text,
  p_pipeline_commit text,
  p_manifest_version text,
  p_manifest_checksum text,
  p_expected_admission_mode text,
  p_nonce uuid,
  p_signed_at timestamptz,
  p_body_sha256 text,
  p_artifact jsonb
)
RETURNS TABLE(
  artifact_id uuid,
  scenario_hash text,
  source_artifact_checksum text,
  replayed boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.fn_training_solver_operation_scope_guard_v1(
    p_machine_id, p_solver_version, p_solver_binary_checksum,
    p_pipeline_commit, p_manifest_version, p_manifest_checksum,
    p_expected_admission_mode
  );
  PERFORM public.fn_training_solver_ingest_scope_guard_v1(
    p_machine_id, p_solver_version, p_solver_binary_checksum,
    p_pipeline_commit, p_manifest_version, p_manifest_checksum,
    p_artifact
  );
  RETURN QUERY
  SELECT ingest.artifact_id,
         ingest.scenario_hash,
         ingest.source_artifact_checksum,
         ingest.replayed
  FROM public.training_ingest_solver_artifact_unscoped_v1(
    p_machine_id, p_solver_version, p_solver_binary_checksum,
    p_pipeline_commit, p_manifest_version, p_manifest_checksum,
    p_nonce, p_signed_at, p_body_sha256, p_artifact
  ) ingest;
END;
$function$;

REVOKE ALL ON FUNCTION public.training_ingest_solver_artifact_v1(
  text, text, text, text, text, text, uuid, timestamptz, text, jsonb
) FROM service_role;
REVOKE ALL ON FUNCTION public.training_ingest_solver_artifact_v2(
  text, text, text, text, text, text, text, uuid, timestamptz, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_ingest_solver_artifact_v2(
  text, text, text, text, text, text, text, uuid, timestamptz, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.training_solver_worker_row_states_v3(
  p_machine_id text,
  p_solver_version text,
  p_solver_binary_checksum text,
  p_pipeline_commit text,
  p_manifest_version text,
  p_manifest_checksum text,
  p_expected_admission_mode text,
  p_scenario_hashes text[]
)
RETURNS TABLE(
  id uuid,
  scenario_hash text,
  game_type text,
  stack_depth integer,
  street text,
  node text,
  hero_position text,
  solved_v2_at timestamptz,
  quality_status text,
  solver_version text,
  solver_binary_checksum text,
  machine_id text,
  pipeline_commit text,
  manifest_version text,
  manifest_checksum text,
  source_artifact_checksum text,
  audited_at timestamptz,
  admitted boolean,
  admission_mode text,
  partition_count integer,
  partition_index integer,
  canary_target_role text,
  authorized_node text,
  authorized_hero_position text,
  canary_authorized boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
ROWS 150
AS $function$
DECLARE
  v_requested_hashes text[];
  v_target_hashes text[];
BEGIN
  PERFORM public.fn_training_solver_operation_scope_guard_v1(
    p_machine_id, p_solver_version, p_solver_binary_checksum,
    p_pipeline_commit, p_manifest_version, p_manifest_checksum,
    p_expected_admission_mode
  );

  -- Reject malformed or oversized requests before aggregating or touching the
  -- warehouse. The predecessor RPC bounded its query, but a canary request
  -- must not be able to make this wrapper aggregate an unbounded array first.
  IF p_scenario_hashes IS NULL
     OR cardinality(p_scenario_hashes) NOT BETWEEN 1 AND 75
     OR EXISTS (
       SELECT 1
       FROM unnest(p_scenario_hashes) requested_hash(value)
       WHERE requested_hash.value IS NULL
          OR char_length(requested_hash.value) NOT BETWEEN 1 AND 512
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SOLVER_WORKER_ROW_STATES_PAYLOAD_INVALID';
  END IF;

  IF p_expected_admission_mode = 'bounded_canary' THEN
    IF cardinality(p_scenario_hashes) IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501', MESSAGE = 'SOLVER_WORKER_CANARY_ROW_STATES_NOT_AUTHORIZED';
    END IF;
    SELECT array_agg(requested.scenario_hash ORDER BY requested.scenario_hash)
    INTO v_requested_hashes
    FROM (
      SELECT DISTINCT requested_hash.value AS scenario_hash
      FROM unnest(p_scenario_hashes) requested_hash(value)
      WHERE requested_hash.value IS NOT NULL
    ) requested;

    SELECT array_agg(locked_target.scenario_hash ORDER BY locked_target.scenario_hash)
    INTO v_target_hashes
    FROM (
      SELECT target.scenario_hash
      FROM public.training_solver_bounded_canary_targets target
      WHERE target.machine_id = p_machine_id
        AND target.solver_version = p_solver_version
        AND target.solver_binary_checksum = p_solver_binary_checksum
        AND target.pipeline_commit = p_pipeline_commit
        AND target.manifest_version = p_manifest_version
        AND target.manifest_checksum = p_manifest_checksum
      ORDER BY target.scenario_hash
      FOR SHARE OF target
    ) locked_target;

    IF cardinality(v_requested_hashes) IS DISTINCT FROM 2
       OR cardinality(v_target_hashes) IS DISTINCT FROM 2
       OR v_requested_hashes IS DISTINCT FROM v_target_hashes THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501', MESSAGE = 'SOLVER_WORKER_CANARY_ROW_STATES_NOT_AUTHORIZED';
    END IF;
  END IF;

  RETURN QUERY
  SELECT state.*
  FROM public.training_solver_worker_row_states_v2(
    p_machine_id, p_solver_version, p_solver_binary_checksum,
    p_pipeline_commit, p_manifest_version, p_manifest_checksum,
    p_scenario_hashes
  ) state;
END;
$function$;

REVOKE ALL ON FUNCTION public.training_solver_worker_row_states_v1(text[])
  FROM service_role;
REVOKE ALL ON FUNCTION public.training_solver_worker_row_states_v2(
  text, text, text, text, text, text, text[]
) FROM service_role;
REVOKE ALL ON FUNCTION public.training_solver_worker_row_states_v3(
  text, text, text, text, text, text, text, text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_solver_worker_row_states_v3(
  text, text, text, text, text, text, text, text[]
) TO service_role;

CREATE OR REPLACE FUNCTION public.training_solver_worker_heartbeat_v1(
  p_machine_id text,
  p_solver_version text,
  p_solver_binary_checksum text,
  p_pipeline_commit text,
  p_manifest_version text,
  p_manifest_checksum text,
  p_expected_admission_mode text,
  p_phase text,
  p_board text,
  p_spots_done integer,
  p_rows_written integer,
  p_bad integer,
  p_note text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.fn_training_solver_operation_scope_guard_v1(
    p_machine_id, p_solver_version, p_solver_binary_checksum,
    p_pipeline_commit, p_manifest_version, p_manifest_checksum,
    p_expected_admission_mode
  );
  IF p_phase IS NULL OR char_length(p_phase) > 160
     OR p_board IS NULL OR char_length(p_board) > 10
     OR p_note IS NULL OR char_length(p_note) > 500
     OR p_spots_done IS NULL OR p_rows_written IS NULL OR p_bad IS NULL
     OR p_spots_done < 0 OR p_rows_written < 0 OR p_bad < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SOLVER_WORKER_HEARTBEAT_PAYLOAD_INVALID';
  END IF;

  INSERT INTO public.solver_status (
    machine_id, phase, board, spots_done, rows_written, bad, note, updated_at
  ) VALUES (
    p_machine_id, p_phase, p_board, p_spots_done, p_rows_written,
    p_bad, p_note, clock_timestamp()
  )
  ON CONFLICT (machine_id) DO UPDATE
  SET phase = EXCLUDED.phase,
      board = EXCLUDED.board,
      spots_done = EXCLUDED.spots_done,
      rows_written = EXCLUDED.rows_written,
      bad = EXCLUDED.bad,
      note = EXCLUDED.note,
      updated_at = EXCLUDED.updated_at;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.training_solver_worker_heartbeat_v1(
  text, text, text, text, text, text, text,
  text, text, integer, integer, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_solver_worker_heartbeat_v1(
  text, text, text, text, text, text, text,
  text, text, integer, integer, integer, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.training_solver_worker_board_page_v2(
  p_machine_id text,
  p_solver_version text,
  p_solver_binary_checksum text,
  p_pipeline_commit text,
  p_manifest_version text,
  p_manifest_checksum text,
  p_expected_admission_mode text,
  p_game_type text,
  p_stack_depth integer,
  p_street text,
  p_position text,
  p_after_scenario text,
  p_limit integer
)
RETURNS TABLE(scenario_hash text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
ROWS 500
AS $function$
BEGIN
  IF p_expected_admission_mode IS DISTINCT FROM 'backlog' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501', MESSAGE = 'SOLVER_WORKER_BOARD_PAGE_REQUIRES_BACKLOG';
  END IF;
  PERFORM public.fn_training_solver_operation_scope_guard_v1(
    p_machine_id, p_solver_version, p_solver_binary_checksum,
    p_pipeline_commit, p_manifest_version, p_manifest_checksum,
    p_expected_admission_mode
  );
  RETURN QUERY
  SELECT page.scenario_hash
  FROM public.training_solver_worker_board_page_v1(
    p_game_type, p_stack_depth, p_street, p_position,
    p_after_scenario, p_limit
  ) page;
END;
$function$;

REVOKE ALL ON FUNCTION public.training_solver_worker_board_page_v1(
  text, integer, text, text, text, integer
) FROM service_role;
REVOKE ALL ON FUNCTION public.training_solver_worker_board_page_v2(
  text, text, text, text, text, text, text,
  text, integer, text, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_solver_worker_board_page_v2(
  text, text, text, text, text, text, text,
  text, integer, text, text, text, integer
) TO service_role;

-- Normalize every operation entrypoint to owner-only before restoring the
-- gateway's service-role access. CREATE OR REPLACE preserves historical ACLs,
-- and a newly-created function can inherit custom default privileges, so named
-- PUBLIC/anon/authenticated revokes alone are not a complete boundary.
DO $normalize_solver_operation_acls$
DECLARE
  v_function record;
  v_grantee oid;
  v_grantee_name name;
BEGIN
  FOR v_function IN
    SELECT function_row.oid,
           namespace_row.nspname,
           function_row.proname,
           function_row.proowner,
           pg_catalog.pg_get_function_identity_arguments(function_row.oid) AS arguments
    FROM pg_catalog.pg_proc function_row
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = function_row.pronamespace
    WHERE function_row.oid = ANY (ARRAY[
      'public.training_claim_solver_worker_request_v1(text,text,text,text,text,text,uuid,text,timestamp with time zone,text)'::regprocedure::oid,
      'public.training_ingest_solver_artifact_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)'::regprocedure::oid,
      'public.training_solver_worker_board_page_v1(text,integer,text,text,text,integer)'::regprocedure::oid,
      'public.training_solver_worker_row_states_v1(text[])'::regprocedure::oid,
      'public.training_solver_worker_row_states_v2(text,text,text,text,text,text,text[])'::regprocedure::oid,
      'public.training_claim_solver_worker_request_v2(text,text,text,text,text,text,text,uuid,text,timestamp with time zone,text)'::regprocedure::oid,
      'public.training_ingest_solver_artifact_v2(text,text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)'::regprocedure::oid,
      'public.training_solver_worker_row_states_v3(text,text,text,text,text,text,text,text[])'::regprocedure::oid,
      'public.training_solver_worker_heartbeat_v1(text,text,text,text,text,text,text,text,text,integer,integer,integer,text)'::regprocedure::oid,
      'public.training_solver_worker_board_page_v2(text,text,text,text,text,text,text,text,integer,text,text,text,integer)'::regprocedure::oid,
      'public.fn_training_solver_operation_scope_guard_v1(text,text,text,text,text,text,text)'::regprocedure::oid
    ])
  LOOP
    FOR v_grantee IN
      SELECT DISTINCT expanded_acl.grantee
      FROM pg_catalog.pg_proc acl_function
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(
          acl_function.proacl,
          pg_catalog.acldefault('f', acl_function.proowner)
        )
      ) expanded_acl
      WHERE acl_function.oid = v_function.oid
        AND expanded_acl.privilege_type = 'EXECUTE'
        AND expanded_acl.grantee <> v_function.proowner
    LOOP
      IF v_grantee = 0 THEN
        EXECUTE pg_catalog.format(
          'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM PUBLIC CASCADE',
          v_function.nspname, v_function.proname, v_function.arguments
        );
      ELSE
        SELECT role_row.rolname
        INTO STRICT v_grantee_name
        FROM pg_catalog.pg_roles role_row
        WHERE role_row.oid = v_grantee;
        EXECUTE pg_catalog.format(
          'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %I CASCADE',
          v_function.nspname, v_function.proname,
          v_function.arguments, v_grantee_name
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$normalize_solver_operation_acls$;

GRANT EXECUTE ON FUNCTION public.training_claim_solver_worker_request_v2(
  text, text, text, text, text, text, text, uuid, text, timestamptz, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.training_ingest_solver_artifact_v2(
  text, text, text, text, text, text, text, uuid, timestamptz, text, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.training_solver_worker_row_states_v3(
  text, text, text, text, text, text, text, text[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.training_solver_worker_heartbeat_v1(
  text, text, text, text, text, text, text,
  text, text, integer, integer, integer, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.training_solver_worker_board_page_v2(
  text, text, text, text, text, text, text,
  text, integer, text, text, text, integer
) TO service_role;

DO $assert_solver_operation_scope_binding$
BEGIN
  IF pg_catalog.has_function_privilege(
       'service_role',
       'public.training_claim_solver_worker_request_v1(text,text,text,text,text,text,uuid,text,timestamp with time zone,text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.training_ingest_solver_artifact_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.training_solver_worker_board_page_v1(text,integer,text,text,text,integer)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.training_solver_worker_row_states_v1(text[])',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.training_solver_worker_row_states_v2(text,text,text,text,text,text,text[])',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'TRAINING_SOLVER_UNSCOPED_OPERATION_EXECUTE_REMAINS';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.training_claim_solver_worker_request_v2(text,text,text,text,text,text,text,uuid,text,timestamp with time zone,text)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.training_ingest_solver_artifact_v2(text,text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.training_solver_worker_board_page_v2(text,text,text,text,text,text,text,text,integer,text,text,text,integer)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.training_solver_worker_row_states_v3(text,text,text,text,text,text,text,text[])',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.training_solver_worker_heartbeat_v1(text,text,text,text,text,text,text,text,text,integer,integer,integer,text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.fn_training_solver_operation_scope_guard_v1(text,text,text,text,text,text,text)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_table_privilege(
       'service_role', 'public.solver_status', 'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'service_role', 'public.solver_status',
       'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR pg_catalog.has_any_column_privilege(
       'service_role', 'public.solver_status', 'INSERT,UPDATE,REFERENCES'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.solver_status',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.solver_status',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     ) THEN
    RAISE EXCEPTION 'TRAINING_SOLVER_SCOPED_OPERATION_EXECUTE_MISSING';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc function_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         coalesce(
           function_row.proacl,
           pg_catalog.acldefault('f', function_row.proowner)
         )
       ) expanded_acl
       WHERE function_row.oid = ANY (ARRAY[
         'public.training_claim_solver_worker_request_v2(text,text,text,text,text,text,text,uuid,text,timestamp with time zone,text)'::regprocedure::oid,
         'public.training_ingest_solver_artifact_v2(text,text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)'::regprocedure::oid,
         'public.training_solver_worker_row_states_v3(text,text,text,text,text,text,text,text[])'::regprocedure::oid,
         'public.training_solver_worker_heartbeat_v1(text,text,text,text,text,text,text,text,text,integer,integer,integer,text)'::regprocedure::oid,
         'public.training_solver_worker_board_page_v2(text,text,text,text,text,text,text,text,integer,text,text,text,integer)'::regprocedure::oid
       ])
         AND expanded_acl.privilege_type = 'EXECUTE'
         AND (
           expanded_acl.grantee NOT IN (
             function_row.proowner,
             (SELECT role_row.oid
              FROM pg_catalog.pg_roles role_row
              WHERE role_row.rolname = 'service_role')
           )
           OR (
             expanded_acl.grantee = (
               SELECT role_row.oid
               FROM pg_catalog.pg_roles role_row
               WHERE role_row.rolname = 'service_role'
             )
             AND expanded_acl.is_grantable
           )
         )
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc function_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         coalesce(
           function_row.proacl,
           pg_catalog.acldefault('f', function_row.proowner)
         )
       ) expanded_acl
       WHERE function_row.oid =
         'public.fn_training_solver_operation_scope_guard_v1(text,text,text,text,text,text,text)'::regprocedure::oid
         AND expanded_acl.privilege_type = 'EXECUTE'
         AND expanded_acl.grantee <> function_row.proowner
     ) THEN
    RAISE EXCEPTION 'TRAINING_SOLVER_SCOPED_OPERATION_ACL_NOT_EXACT';
  END IF;
END;
$assert_solver_operation_scope_binding$;

COMMIT;
