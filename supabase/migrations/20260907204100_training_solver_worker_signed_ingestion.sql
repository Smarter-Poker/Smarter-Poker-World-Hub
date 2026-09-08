-- Phase 6: signed solver-worker ingress.
--
-- M1/M2 authenticate to the application gateway with distinct HMAC keys; they
-- never receive a Supabase credential. The gateway is the only caller of these
-- service-only RPCs. Nonces are consumed durably, provenance must match one
-- exact active operator-approved tuple, and one ingest call can update only one
-- pre-existing solver artifact with the same immutable relational identity.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.training_solver_worker_receipts (
  machine_id text NOT NULL,
  request_nonce uuid NOT NULL,
  operation text NOT NULL,
  signed_at timestamptz NOT NULL,
  body_sha256 text NOT NULL,
  solver_version text NOT NULL,
  solver_binary_checksum text NOT NULL,
  pipeline_commit text NOT NULL,
  manifest_version text NOT NULL,
  manifest_checksum text NOT NULL,
  artifact_id uuid,
  scenario_hash text,
  source_artifact_checksum text,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT training_solver_worker_receipts_pkey
    PRIMARY KEY (machine_id, request_nonce),
  CONSTRAINT training_solver_worker_receipts_machine_check
    CHECK (machine_id IN ('M1', 'M2')),
  CONSTRAINT training_solver_worker_receipts_operation_check
    CHECK (operation IN ('ingest_artifact', 'row_states', 'board_page', 'heartbeat')),
  CONSTRAINT training_solver_worker_receipts_body_check
    CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT training_solver_worker_receipts_provenance_check CHECK (
    char_length(btrim(solver_version)) BETWEEN 1 AND 120
    AND solver_binary_checksum ~ '^[0-9a-f]{64}$'
    AND pipeline_commit ~ '^[0-9a-f]{40}$'
    AND char_length(btrim(manifest_version)) BETWEEN 1 AND 160
    AND manifest_checksum ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT training_solver_worker_receipts_artifact_check CHECK (
    (operation = 'ingest_artifact') = (
      artifact_id IS NOT NULL
      AND scenario_hash IS NOT NULL
      AND char_length(scenario_hash) BETWEEN 1 AND 512
      AND source_artifact_checksum ~ '^[0-9a-f]{64}$'
    )
  )
);

COMMENT ON TABLE public.training_solver_worker_receipts IS
  'Private durable replay/idempotency ledger for HMAC-authenticated M1/M2 gateway requests. It contains no HMAC secrets.';

ALTER TABLE public.training_solver_worker_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_solver_worker_receipts
  FROM PUBLIC, anon, authenticated, service_role;
DO $revoke_worker_receipt_columns$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(quote_ident(attribute_row.attname), ',' ORDER BY attribute_row.attnum)
  INTO v_columns
  FROM pg_attribute attribute_row
  WHERE attribute_row.attrelid = 'public.training_solver_worker_receipts'::regclass
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped;
  IF v_columns IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.training_solver_worker_receipts FROM PUBLIC, anon, authenticated, service_role',
      v_columns
    );
  END IF;
END;
$revoke_worker_receipt_columns$;

DO $assert_worker_receipt_shape$
BEGIN
  IF (
       SELECT count(*)
       FROM pg_attribute attribute_row
       WHERE attribute_row.attrelid =
         'public.training_solver_worker_receipts'::regclass
         AND attribute_row.attnum > 0
         AND NOT attribute_row.attisdropped
     ) <> 14
     OR EXISTS (
       SELECT 1
       FROM (VALUES
         ('machine_id', 'text'::regtype, true),
         ('request_nonce', 'uuid'::regtype, true),
         ('operation', 'text'::regtype, true),
         ('signed_at', 'timestamp with time zone'::regtype, true),
         ('body_sha256', 'text'::regtype, true),
         ('solver_version', 'text'::regtype, true),
         ('solver_binary_checksum', 'text'::regtype, true),
         ('pipeline_commit', 'text'::regtype, true),
         ('manifest_version', 'text'::regtype, true),
         ('manifest_checksum', 'text'::regtype, true),
         ('artifact_id', 'uuid'::regtype, false),
         ('scenario_hash', 'text'::regtype, false),
         ('source_artifact_checksum', 'text'::regtype, false),
         ('received_at', 'timestamp with time zone'::regtype, true)
       ) AS expected(attname, atttypid, attnotnull)
       LEFT JOIN pg_attribute actual
         ON actual.attrelid = 'public.training_solver_worker_receipts'::regclass
        AND actual.attname = expected.attname
        AND actual.attnum > 0
        AND NOT actual.attisdropped
       WHERE actual.attname IS NULL
          OR actual.atttypid <> expected.atttypid
          OR actual.attnotnull <> expected.attnotnull
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_constraint constraint_row
       WHERE constraint_row.conrelid =
         'public.training_solver_worker_receipts'::regclass
         AND constraint_row.contype = 'p'
         AND constraint_row.conkey = ARRAY[
           (SELECT attnum FROM pg_attribute WHERE attrelid =
             'public.training_solver_worker_receipts'::regclass AND attname = 'machine_id'),
           (SELECT attnum FROM pg_attribute WHERE attrelid =
             'public.training_solver_worker_receipts'::regclass AND attname = 'request_nonce')
         ]::smallint[]
     ) THEN
    RAISE EXCEPTION 'TRAINING_SOLVER_WORKER_RECEIPT_CONTRACT_INCOMPLETE';
  END IF;
END;
$assert_worker_receipt_shape$;

CREATE INDEX IF NOT EXISTS idx_training_solver_worker_receipts_received
  ON public.training_solver_worker_receipts (received_at, machine_id);

-- board_page is intentionally a keyset query on this exact left prefix. The
-- 80 GB reference table must already have the production index built by the
-- dedicated online index migration; never fall back to a hot-primary scan.
DO $assert_worker_board_page_index$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_row
    JOIN pg_class table_row ON table_row.oid = index_row.indrelid
    JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
    JOIN pg_class index_class ON index_class.oid = index_row.indexrelid
    JOIN pg_am access_method ON access_method.oid = index_class.relam
    WHERE namespace_row.nspname = 'public'
      AND table_row.relname = 'solved_spots_gold'
      AND access_method.amname = 'btree'
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indpred IS NULL
      AND index_row.indexprs IS NULL
      AND index_row.indnkeyatts = 4
      AND index_row.indnatts = 4
      AND (
        SELECT array_agg(attribute_row.attname::text ORDER BY key_column.ordinality)
        FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY
          AS key_column(attnum, ordinality)
        JOIN pg_attribute attribute_row
          ON attribute_row.attrelid = index_row.indrelid
         AND attribute_row.attnum = key_column.attnum
        WHERE key_column.ordinality <= 4
      ) = ARRAY['game_type', 'stack_depth', 'street', 'scenario_hash']::text[]
  ) THEN
    RAISE EXCEPTION 'TRAINING_SOLVER_WORKER_BOARD_PAGE_INDEX_MISSING';
  END IF;
END;
$assert_worker_board_page_index$;

-- row_states is keyed by scenario_hash alone. The four-column board index
-- cannot serve that equality predicate because scenario_hash is its trailing
-- column, so require one exact standalone physical btree as a deployment gate.
DO $assert_worker_scenario_hash_index$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_row
    JOIN pg_class index_table ON index_table.oid = index_row.indrelid
    JOIN pg_namespace table_schema ON table_schema.oid = index_table.relnamespace
    JOIN pg_class physical_index ON physical_index.oid = index_row.indexrelid
    JOIN pg_am access_method ON access_method.oid = physical_index.relam
    WHERE table_schema.nspname = 'public'
      AND index_table.relname = 'solved_spots_gold'
      AND access_method.amname = 'btree'
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indpred IS NULL
      AND index_row.indexprs IS NULL
      AND index_row.indnkeyatts = 1
      AND index_row.indnatts = 1
      AND (
        SELECT array_agg(attribute_row.attname::text ORDER BY key_column.ordinality)
        FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY
          AS key_column(attnum, ordinality)
        JOIN pg_attribute attribute_row
          ON attribute_row.attrelid = index_row.indrelid
         AND attribute_row.attnum = key_column.attnum
      ) = ARRAY['scenario_hash']::text[]
  ) THEN
    RAISE EXCEPTION 'TRAINING_SOLVER_WORKER_SCENARIO_HASH_INDEX_MISSING';
  END IF;
END;
$assert_worker_scenario_hash_index$;

CREATE OR REPLACE FUNCTION public.training_claim_solver_worker_request_v1(
  p_machine_id text,
  p_solver_version text,
  p_solver_binary_checksum text,
  p_pipeline_commit text,
  p_manifest_version text,
  p_manifest_checksum text,
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
     OR p_nonce IS NULL
     OR p_signed_at IS NULL
     OR abs(extract(epoch FROM (clock_timestamp() - p_signed_at))) > 300
     OR coalesce(p_body_sha256, '') !~ '^[0-9a-f]{64}$'
     OR NOT EXISTS (
       SELECT 1
       FROM public.training_solver_provenance_authority authority
       WHERE authority.machine_id = p_machine_id
         AND authority.solver_version = p_solver_version
         AND authority.solver_binary_checksum = p_solver_binary_checksum
         AND authority.pipeline_commit = p_pipeline_commit
         AND authority.manifest_version = p_manifest_version
         AND authority.manifest_checksum = p_manifest_checksum
         AND authority.retired_at IS NULL
     ) THEN
    RETURN false;
  END IF;

  -- A signature older than five minutes can never be accepted again. Retain
  -- receipts for 24 hours for incident evidence and prune only a bounded batch
  -- so heartbeat/poll nonces cannot grow this private ledger without limit.
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
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_claim_solver_worker_request_v1(
  text, text, text, text, text, text, uuid, text, timestamptz, text
) TO service_role;

-- Worker resume state must distinguish a reservable warehouse identity from a
-- currently admitted artifact. A field-shaped warehouse row is not certified
-- unless the catalog identity and exact active provenance tuple join in this
-- same statement/snapshot.
CREATE OR REPLACE FUNCTION public.training_solver_worker_row_states_v1(
  p_scenario_hashes text[]
)
RETURNS TABLE(
  id uuid,
  scenario_hash text,
  game_type text,
  stack_depth integer,
  street text,
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
  admitted boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
ROWS 150
AS $function$
  WITH requested AS MATERIALIZED (
    SELECT DISTINCT requested_hash.value AS scenario_hash
    FROM unnest(
      CASE
        WHEN cardinality(p_scenario_hashes) BETWEEN 1 AND 75
        THEN p_scenario_hashes
        ELSE ARRAY[]::text[]
      END
    ) AS requested_hash(value)
    WHERE char_length(requested_hash.value) BETWEEN 1 AND 512
  )
  SELECT
    artifact.id,
    artifact.scenario_hash,
    artifact.game_type,
    artifact.stack_depth,
    artifact.street,
    artifact.solved_v2_at,
    artifact.quality_status,
    artifact.solver_version,
    artifact.solver_binary_checksum,
    artifact.machine_id,
    artifact.pipeline_commit,
    artifact.manifest_version,
    artifact.manifest_checksum,
    artifact.source_artifact_checksum,
    artifact.audited_at,
    EXISTS (
      SELECT 1
      FROM public.training_solver_artifact_catalog catalog
      JOIN public.training_solver_provenance_authority authority
        ON authority.machine_id = artifact.machine_id
       AND authority.solver_version = artifact.solver_version
       AND authority.solver_binary_checksum = artifact.solver_binary_checksum
       AND authority.pipeline_commit = artifact.pipeline_commit
       AND authority.manifest_version = artifact.manifest_version
       AND authority.manifest_checksum = artifact.manifest_checksum
       AND authority.source_combo_order_sha256 =
         artifact.strategy_matrix_v2 ->> 'source_combo_order_sha256'
       AND authority.training_game_contracts_sha256 =
         artifact.strategy_matrix_v2 ->> 'training_game_contracts_sha256'
       AND authority.retired_at IS NULL
      WHERE catalog.artifact_id = artifact.id
        AND catalog.scenario_hash = artifact.scenario_hash
        AND catalog.game_type = artifact.game_type
        AND catalog.stack_depth = artifact.stack_depth
        AND catalog.street = artifact.street
        AND catalog.hero_position = artifact.strategy_matrix_v2 ->> 'position'
    ) AS admitted
  FROM requested
  JOIN public.solved_spots_gold artifact
    ON artifact.scenario_hash = requested.scenario_hash
  ORDER BY artifact.scenario_hash, artifact.id
  LIMIT 150
$function$;

REVOKE ALL ON FUNCTION public.training_solver_worker_row_states_v1(text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_solver_worker_row_states_v1(text[])
  TO service_role;

-- Board discovery is the only worker operation that needs to enumerate the
-- warehouse. Keep it behind a narrow function so the application service key
-- never receives direct SELECT on the 80 GB table. The explicit lower/upper
-- prefix bounds plus keyset cursor match the required four-column btree under
-- any production collation; no LIKE predicate is used.
CREATE OR REPLACE FUNCTION public.training_solver_worker_board_page_v1(
  p_game_type text,
  p_stack_depth integer,
  p_street text,
  p_position text,
  p_after_scenario text DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS TABLE(scenario_hash text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
ROWS 500
AS $function$
DECLARE
  v_prefix text;
  v_upper_bound text;
BEGIN
  IF NOT (
       (p_game_type = 'hu_cash' AND p_stack_depth IN (40, 100, 200))
       OR (p_game_type = 'mtt_3max_chipev' AND p_stack_depth = 20)
       OR (p_game_type = 'mtt_6max_chipev' AND p_stack_depth IN (10, 20, 40, 100))
       OR (p_game_type = 'mtt_9max_chipev' AND p_stack_depth IN (20, 40, 80, 100))
       OR (p_game_type = 'mtt_hu_chipev' AND p_stack_depth = 40)
       OR (p_game_type = 'postflop_complete' AND p_stack_depth = 100)
       OR (p_game_type = 'spin_3max_chipev' AND p_stack_depth IN (20, 25))
       OR (p_game_type = 'spin_hu_chipev' AND p_stack_depth IN (10, 20))
     )
     OR p_street IS DISTINCT FROM 'flop'
     OR coalesce(p_position, '') !~
       '^(UTG|UTG\+1|UTG\+2|UTG1|UTG2|MP|MP\+1|MP\+2|MP1|MP2|LJ|HJ|CO|BTN|SB|BB)$'
     OR p_limit IS NULL
     OR p_limit NOT BETWEEN 1 AND 500 THEN
    RETURN;
  END IF;

  v_prefix := p_game_type || '_' || p_position || '_'
    || p_stack_depth::text || 'bb_';
  -- The disposable verifier runs SQL_ASCII, where a Unicode escape above
  -- U+00FF cannot be converted to text.  All canonical board/hash suffix
  -- bytes are printable ASCII below DEL, so DEL is a portable strict upper
  -- bound under the production C/UTF-8 collations as well.
  v_upper_bound := v_prefix || chr(127);
  IF p_after_scenario IS NOT NULL
     AND (
       NOT starts_with(p_after_scenario, v_prefix)
       OR substring(p_after_scenario FROM char_length(v_prefix) + 1)
          !~ '^([2-9TJQKA][cdhs]){3}$'
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT artifact.scenario_hash
  FROM public.solved_spots_gold artifact
  WHERE artifact.game_type = p_game_type
    AND artifact.stack_depth = p_stack_depth
    AND artifact.street = p_street
    AND artifact.scenario_hash >= v_prefix
    AND artifact.scenario_hash < v_upper_bound
    AND (p_after_scenario IS NULL OR artifact.scenario_hash > p_after_scenario)
  ORDER BY artifact.scenario_hash
  LIMIT p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.training_solver_worker_board_page_v1(
  text, integer, text, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_solver_worker_board_page_v1(
  text, integer, text, text, text, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.training_ingest_solver_artifact_v1(
  p_machine_id text,
  p_solver_version text,
  p_solver_binary_checksum text,
  p_pipeline_commit text,
  p_manifest_version text,
  p_manifest_checksum text,
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
DECLARE
  v_artifact_id uuid;
  v_audited_at timestamptz;
  v_existing public.training_solver_worker_receipts%ROWTYPE;
  v_expected_keys text[] := ARRAY[
    'audited_at', 'game_type', 'id', 'machine_id', 'manifest_checksum',
    'manifest_version', 'pipeline_commit', 'quality_status', 'scenario_hash',
    'solved_v2_at', 'solver_binary_checksum', 'solver_version',
    'source_artifact_checksum', 'stack_depth', 'strategy_matrix_v2', 'street'
  ]::text[];
  v_inserted integer;
  v_solved_at timestamptz;
  v_updated integer;
BEGIN
  IF p_machine_id NOT IN ('M1', 'M2')
     OR p_nonce IS NULL
     OR p_signed_at IS NULL
     OR abs(extract(epoch FROM (clock_timestamp() - p_signed_at))) > 300
     OR coalesce(p_body_sha256, '') !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(p_artifact) IS DISTINCT FROM 'object'
     OR pg_column_size(p_artifact) > 2097152
     OR NOT EXISTS (
       SELECT 1
       FROM public.training_solver_provenance_authority authority
       WHERE authority.machine_id = p_machine_id
         AND authority.solver_version = p_solver_version
         AND authority.solver_binary_checksum = p_solver_binary_checksum
         AND authority.pipeline_commit = p_pipeline_commit
         AND authority.manifest_version = p_manifest_version
         AND authority.manifest_checksum = p_manifest_checksum
         AND authority.source_combo_order_sha256 =
           p_artifact -> 'strategy_matrix_v2' ->> 'source_combo_order_sha256'
         AND authority.training_game_contracts_sha256 =
           p_artifact -> 'strategy_matrix_v2' ->> 'training_game_contracts_sha256'
         AND authority.retired_at IS NULL
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SOLVER_WORKER_INGEST_AUTHORITY_INVALID';
  END IF;

  IF (
       SELECT array_agg(artifact_key.value ORDER BY artifact_key.value COLLATE "C")
       FROM jsonb_object_keys(p_artifact) AS artifact_key(value)
     ) IS DISTINCT FROM v_expected_keys THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SOLVER_WORKER_ARTIFACT_SHAPE_INVALID';
  END IF;

  BEGIN
    v_artifact_id := (p_artifact ->> 'id')::uuid;
    v_solved_at := (p_artifact ->> 'solved_v2_at')::timestamptz;
    v_audited_at := (p_artifact ->> 'audited_at')::timestamptz;
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023', MESSAGE = 'SOLVER_WORKER_ARTIFACT_TYPES_INVALID';
  END;

  IF p_artifact ->> 'machine_id' IS DISTINCT FROM p_machine_id
     OR p_artifact ->> 'solver_version' IS DISTINCT FROM p_solver_version
     OR p_artifact ->> 'solver_binary_checksum' IS DISTINCT FROM p_solver_binary_checksum
     OR p_artifact ->> 'pipeline_commit' IS DISTINCT FROM p_pipeline_commit
     OR p_artifact ->> 'manifest_version' IS DISTINCT FROM p_manifest_version
     OR p_artifact ->> 'manifest_checksum' IS DISTINCT FROM p_manifest_checksum
     OR p_artifact ->> 'quality_status' IS DISTINCT FROM 'validated'
     OR p_artifact ->> 'game_type' LIKE '%\_icm' ESCAPE '\'
     OR jsonb_typeof(p_artifact -> 'stack_depth') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_artifact -> 'strategy_matrix_v2') IS DISTINCT FROM 'object'
     OR v_solved_at IS DISTINCT FROM v_audited_at
     OR abs(extract(epoch FROM (p_signed_at - v_audited_at))) > 300 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SOLVER_WORKER_ARTIFACT_BINDING_INVALID';
  END IF;

  IF NOT public.fn_training_solver_artifact_servable_v2(
    p_artifact ->> 'scenario_hash',
    p_artifact ->> 'game_type',
    (p_artifact ->> 'stack_depth')::integer,
    p_artifact ->> 'street',
    p_artifact -> 'strategy_matrix_v2',
    p_solver_version,
    p_solver_binary_checksum,
    p_machine_id,
    p_pipeline_commit,
    p_manifest_version,
    p_manifest_checksum,
    p_artifact ->> 'source_artifact_checksum',
    p_artifact ->> 'quality_status',
    v_audited_at
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514', MESSAGE = 'SOLVER_WORKER_ARTIFACT_NOT_SERVABLE';
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

  SELECT receipt.*
  INTO v_existing
  FROM public.training_solver_worker_receipts receipt
  WHERE receipt.machine_id = p_machine_id
    AND receipt.request_nonce = p_nonce
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.operation = 'ingest_artifact'
       AND v_existing.body_sha256 = p_body_sha256
       AND v_existing.solver_version = p_solver_version
       AND v_existing.solver_binary_checksum = p_solver_binary_checksum
       AND v_existing.pipeline_commit = p_pipeline_commit
       AND v_existing.manifest_version = p_manifest_version
       AND v_existing.manifest_checksum = p_manifest_checksum
       AND v_existing.artifact_id = v_artifact_id
       AND v_existing.scenario_hash = p_artifact ->> 'scenario_hash'
       AND v_existing.source_artifact_checksum =
         p_artifact ->> 'source_artifact_checksum' THEN
      IF EXISTS (
        SELECT 1
        FROM public.solved_spots_gold artifact
        JOIN public.training_solver_artifact_catalog catalog
          ON catalog.artifact_id = artifact.id
         AND catalog.scenario_hash = artifact.scenario_hash
         AND catalog.game_type = artifact.game_type
         AND catalog.stack_depth = artifact.stack_depth
         AND catalog.street = artifact.street
        WHERE artifact.id = v_artifact_id
          AND artifact.scenario_hash = p_artifact ->> 'scenario_hash'
          AND artifact.game_type = p_artifact ->> 'game_type'
          AND artifact.stack_depth = (p_artifact ->> 'stack_depth')::integer
          AND artifact.street = p_artifact ->> 'street'
          AND artifact.strategy_matrix_v2 IS NOT DISTINCT FROM
            p_artifact -> 'strategy_matrix_v2'
          AND artifact.solved_v2_at IS NOT DISTINCT FROM v_solved_at
          AND artifact.solver_version = p_solver_version
          AND artifact.solver_binary_checksum = p_solver_binary_checksum
          AND artifact.machine_id = p_machine_id
          AND artifact.pipeline_commit = p_pipeline_commit
          AND artifact.manifest_version = p_manifest_version
          AND artifact.manifest_checksum = p_manifest_checksum
          AND artifact.source_artifact_checksum =
            p_artifact ->> 'source_artifact_checksum'
          AND artifact.quality_status = 'validated'
          AND artifact.audited_at IS NOT DISTINCT FROM v_audited_at
      ) THEN
        RETURN QUERY SELECT
          v_existing.artifact_id,
          v_existing.scenario_hash,
          v_existing.source_artifact_checksum,
          true;
        RETURN;
      END IF;
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SOLVER_WORKER_REPLAY_ARTIFACT_NOT_CURRENT';
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = '23505', MESSAGE = 'SOLVER_WORKER_NONCE_REUSE_CONFLICT';
  END IF;

  INSERT INTO public.training_solver_worker_receipts (
    machine_id, request_nonce, operation, signed_at, body_sha256,
    solver_version, solver_binary_checksum, pipeline_commit,
    manifest_version, manifest_checksum, artifact_id, scenario_hash,
    source_artifact_checksum
  ) VALUES (
    p_machine_id, p_nonce, 'ingest_artifact', p_signed_at, p_body_sha256,
    p_solver_version, p_solver_binary_checksum, p_pipeline_commit,
    p_manifest_version, p_manifest_checksum, v_artifact_id,
    p_artifact ->> 'scenario_hash', p_artifact ->> 'source_artifact_checksum'
  ) ON CONFLICT (machine_id, request_nonce) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> 1 THEN
    -- A concurrent request consumed the nonce. Re-enter once now that the
    -- unique-index wait has completed; it must be byte-identical to replay.
    SELECT receipt.*
    INTO v_existing
    FROM public.training_solver_worker_receipts receipt
    WHERE receipt.machine_id = p_machine_id
      AND receipt.request_nonce = p_nonce
    FOR UPDATE;
    IF v_existing.operation = 'ingest_artifact'
       AND v_existing.body_sha256 = p_body_sha256
       AND v_existing.solver_version = p_solver_version
       AND v_existing.solver_binary_checksum = p_solver_binary_checksum
       AND v_existing.pipeline_commit = p_pipeline_commit
       AND v_existing.manifest_version = p_manifest_version
       AND v_existing.manifest_checksum = p_manifest_checksum
       AND v_existing.artifact_id = v_artifact_id
       AND v_existing.scenario_hash = p_artifact ->> 'scenario_hash'
       AND v_existing.source_artifact_checksum =
         p_artifact ->> 'source_artifact_checksum' THEN
      IF EXISTS (
        SELECT 1
        FROM public.solved_spots_gold artifact
        JOIN public.training_solver_artifact_catalog catalog
          ON catalog.artifact_id = artifact.id
         AND catalog.scenario_hash = artifact.scenario_hash
         AND catalog.game_type = artifact.game_type
         AND catalog.stack_depth = artifact.stack_depth
         AND catalog.street = artifact.street
        WHERE artifact.id = v_artifact_id
          AND artifact.scenario_hash = p_artifact ->> 'scenario_hash'
          AND artifact.game_type = p_artifact ->> 'game_type'
          AND artifact.stack_depth = (p_artifact ->> 'stack_depth')::integer
          AND artifact.street = p_artifact ->> 'street'
          AND artifact.strategy_matrix_v2 IS NOT DISTINCT FROM
            p_artifact -> 'strategy_matrix_v2'
          AND artifact.solved_v2_at IS NOT DISTINCT FROM v_solved_at
          AND artifact.solver_version = p_solver_version
          AND artifact.solver_binary_checksum = p_solver_binary_checksum
          AND artifact.machine_id = p_machine_id
          AND artifact.pipeline_commit = p_pipeline_commit
          AND artifact.manifest_version = p_manifest_version
          AND artifact.manifest_checksum = p_manifest_checksum
          AND artifact.source_artifact_checksum =
            p_artifact ->> 'source_artifact_checksum'
          AND artifact.quality_status = 'validated'
          AND artifact.audited_at IS NOT DISTINCT FROM v_audited_at
      ) THEN
        RETURN QUERY SELECT
          v_existing.artifact_id,
          v_existing.scenario_hash,
          v_existing.source_artifact_checksum,
          true;
        RETURN;
      END IF;
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SOLVER_WORKER_REPLAY_ARTIFACT_NOT_CURRENT';
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = '23505', MESSAGE = 'SOLVER_WORKER_NONCE_REUSE_CONFLICT';
  END IF;

  UPDATE public.solved_spots_gold artifact
  SET strategy_matrix_v2 = p_artifact -> 'strategy_matrix_v2',
      solved_v2_at = v_solved_at,
      solver_version = p_solver_version,
      solver_binary_checksum = p_solver_binary_checksum,
      machine_id = p_machine_id,
      pipeline_commit = p_pipeline_commit,
      manifest_version = p_manifest_version,
      manifest_checksum = p_manifest_checksum,
      source_artifact_checksum = p_artifact ->> 'source_artifact_checksum',
      quality_status = 'validated',
      audited_at = v_audited_at
  WHERE artifact.id = v_artifact_id
    AND artifact.scenario_hash = p_artifact ->> 'scenario_hash'
    AND artifact.game_type = p_artifact ->> 'game_type'
    AND artifact.stack_depth = (p_artifact ->> 'stack_depth')::integer
    AND artifact.street = p_artifact ->> 'street';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.training_solver_artifact_catalog catalog
    WHERE catalog.artifact_id = v_artifact_id
      AND catalog.scenario_hash = p_artifact ->> 'scenario_hash'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SOLVER_WORKER_EXACT_ARTIFACT_NOT_UPDATED';
  END IF;

  RETURN QUERY SELECT
    v_artifact_id,
    p_artifact ->> 'scenario_hash',
    p_artifact ->> 'source_artifact_checksum',
    false;
END;
$function$;

REVOKE ALL ON FUNCTION public.training_ingest_solver_artifact_v1(
  text, text, text, text, text, text, uuid, timestamptz, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_ingest_solver_artifact_v1(
  text, text, text, text, text, text, uuid, timestamptz, text, jsonb
) TO service_role;

-- The service key may invoke the narrow SECURITY DEFINER read/write RPCs, but
-- it cannot bypass HMAC/nonces/catalog admission or enumerate the warehouse
-- directly. Operators retain postgres/migration-role access for explicit
-- quarantine and offline auditing.
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.solved_spots_gold FROM service_role;
DO $revoke_worker_warehouse_column_dml$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(quote_ident(attribute_row.attname), ', ' ORDER BY attribute_row.attnum)
  INTO v_columns
  FROM pg_attribute attribute_row
  WHERE attribute_row.attrelid = 'public.solved_spots_gold'::regclass
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped;
  IF v_columns IS NOT NULL THEN
    EXECUTE format(
      'REVOKE SELECT (%s), INSERT (%s), UPDATE (%s) ON public.solved_spots_gold FROM service_role',
      v_columns,
      v_columns,
      v_columns
    );
  END IF;
END;
$revoke_worker_warehouse_column_dml$;

-- Preserve the operator-facing aggregate without restoring raw warehouse
-- access to the service key. Its implementation is bounded to a narrow RPC
-- and remains unavailable to browser roles.
ALTER FUNCTION public.analyze_spots_by_game_type(text, integer)
  SECURITY DEFINER;

DO $worker_ingest_contract_assertions$
DECLARE
  v_claim_definition text;
  v_board_page_definition text;
  v_ingest_definition text;
  v_row_states_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.training_claim_solver_worker_request_v1(text,text,text,text,text,text,uuid,text,timestamp with time zone,text)'::regprocedure
  ) INTO v_claim_definition;
  SELECT pg_get_functiondef(
    'public.training_ingest_solver_artifact_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)'::regprocedure
  ) INTO v_ingest_definition;
  SELECT pg_get_functiondef(
    'public.training_solver_worker_row_states_v1(text[])'::regprocedure
  ) INTO v_row_states_definition;
  SELECT pg_get_functiondef(
    'public.training_solver_worker_board_page_v1(text,integer,text,text,text,integer)'::regprocedure
  ) INTO v_board_page_definition;

  IF NOT (
       SELECT class_row.relrowsecurity
       FROM pg_class class_row
       WHERE class_row.oid = 'public.training_solver_worker_receipts'::regclass
     )
     OR has_table_privilege('anon', 'public.training_solver_worker_receipts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_solver_worker_receipts', 'SELECT')
     OR has_table_privilege('service_role', 'public.training_solver_worker_receipts', 'SELECT')
     OR has_table_privilege('service_role', 'public.solved_spots_gold', 'INSERT')
     OR has_table_privilege('service_role', 'public.solved_spots_gold', 'UPDATE')
     OR has_table_privilege('service_role', 'public.solved_spots_gold', 'DELETE')
     OR has_table_privilege('service_role', 'public.solved_spots_gold', 'SELECT')
     OR has_any_column_privilege(
       'service_role', 'public.solved_spots_gold', 'SELECT'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_attribute attribute_row
       WHERE attribute_row.attrelid = 'public.solved_spots_gold'::regclass
         AND attribute_row.attnum > 0
         AND NOT attribute_row.attisdropped
         AND (
           has_column_privilege(
             'service_role', 'public.solved_spots_gold', attribute_row.attname, 'SELECT'
           )
           OR
           has_column_privilege(
             'service_role', 'public.solved_spots_gold', attribute_row.attname, 'INSERT'
           )
           OR has_column_privilege(
             'service_role', 'public.solved_spots_gold', attribute_row.attname, 'UPDATE'
           )
         )
     )
     OR has_function_privilege(
       'anon',
       'public.training_ingest_solver_artifact_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.training_ingest_solver_artifact_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.training_ingest_solver_artifact_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.training_claim_solver_worker_request_v1(text,text,text,text,text,text,uuid,text,timestamp with time zone,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.training_solver_worker_row_states_v1(text[])',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.training_solver_worker_row_states_v1(text[])',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.training_solver_worker_board_page_v1(text,integer,text,text,text,integer)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.training_solver_worker_board_page_v1(text,integer,text,text,text,integer)',
       'EXECUTE'
     )
     OR position('artifact.scenario_hash >= v_prefix' IN v_board_page_definition) = 0
     OR position('artifact.scenario_hash < v_upper_bound' IN v_board_page_definition) = 0
     OR position('artifact.scenario_hash > p_after_scenario' IN v_board_page_definition) = 0
     OR position('ORDER BY artifact.scenario_hash' IN v_board_page_definition) = 0
     OR position('LIMIT p_limit' IN v_board_page_definition) = 0
     OR position('training_solver_artifact_catalog catalog' IN v_row_states_definition) = 0
     OR position('authority.retired_at IS NULL' IN v_row_states_definition) = 0
     OR position('LIMIT 150' IN v_row_states_definition) = 0
     OR position('training_solver_provenance_authority' IN v_claim_definition) = 0
     OR position('ON CONFLICT (machine_id, request_nonce) DO NOTHING' IN v_claim_definition) = 0
     OR position('LIMIT 100' IN v_claim_definition) = 0
     OR position('FOR UPDATE ' || 'SKIP LOCKED' IN v_claim_definition) = 0
     OR position('fn_training_solver_artifact_servable_v2' IN v_ingest_definition) = 0
     OR position('UPDATE public.solved_spots_gold artifact' IN v_ingest_definition) = 0
     OR position('artifact.id = v_artifact_id' IN v_ingest_definition) = 0
     OR position('SOLVER_WORKER_NONCE_REUSE_CONFLICT' IN v_ingest_definition) = 0
     OR position('LIMIT 100' IN v_ingest_definition) = 0
     OR position('FOR UPDATE ' || 'SKIP LOCKED' IN v_ingest_definition) = 0
     OR (
       char_length(v_ingest_definition)
       - char_length(replace(
           v_ingest_definition,
           'SOLVER_WORKER_REPLAY_ARTIFACT_NOT_CURRENT',
           ''
         ))
     ) / char_length('SOLVER_WORKER_REPLAY_ARTIFACT_NOT_CURRENT') < 2
     OR (
       char_length(v_ingest_definition)
       - char_length(replace(
           v_ingest_definition,
           'JOIN public.training_solver_artifact_catalog catalog',
           ''
         ))
     ) / char_length('JOIN public.training_solver_artifact_catalog catalog') < 2
     OR position(
       'search_path=pg_catalog' IN coalesce(array_to_string((
         SELECT function_row.proconfig FROM pg_proc function_row
         WHERE function_row.oid =
           'public.training_ingest_solver_artifact_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)'::regprocedure
         ), ','), '')
     ) = 0
     OR NOT (
       SELECT function_row.prosecdef
       FROM pg_proc function_row
       WHERE function_row.oid =
         'public.analyze_spots_by_game_type(text,integer)'::regprocedure
     ) THEN
    RAISE EXCEPTION 'TRAINING_SOLVER_WORKER_INGEST_CONTRACT_INCOMPLETE';
  END IF;
END;
$worker_ingest_contract_assertions$;

COMMIT;
