-- One Daily Challenge means one immutable hand for every player, and a hand
-- validly served before America/Chicago midnight remains completable after
-- midnight while its sealed attempt is still open. The prior implementation
-- selected over mutable cache count/order and compared completion to the
-- current product date, which could change both truths underneath a player.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog;

-- Freeze the three immutable-identity inputs while historical seals and
-- conflicts are derived and the enforcing hand trigger is installed. Without
-- this narrow migration window, an old application instance could register a
-- Daily hand after the backfill scan but before the trigger existed, leaving a
-- permanently unsealed attempt that neither recovery nor completion may trust.
LOCK TABLE
  public.training_attempts,
  public.training_attempt_hands,
  public.training_question_snapshots
IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.training_daily_question_seals (
  daily_id text PRIMARY KEY,
  snapshot_key text NOT NULL
    REFERENCES public.training_question_snapshots(snapshot_key) ON DELETE RESTRICT,
  source_question_id text NOT NULL,
  source_policy_checksum text NOT NULL,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_daily_question_seals_daily_id_check
    CHECK (daily_id ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT training_daily_question_seals_source_id_length
    CHECK (char_length(source_question_id) BETWEEN 1 AND 180),
  CONSTRAINT training_daily_question_seals_policy_checksum_check
    CHECK (source_policy_checksum ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS public.training_daily_question_conflicts (
  attempt_id uuid PRIMARY KEY
    REFERENCES public.training_attempts(id) ON DELETE RESTRICT,
  daily_id text NOT NULL,
  snapshot_key text NOT NULL
    REFERENCES public.training_question_snapshots(snapshot_key) ON DELETE RESTRICT,
  distinct_snapshot_count integer NOT NULL,
  hand_status text NOT NULL,
  scored_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_daily_question_conflicts_daily_id_check
    CHECK (daily_id ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT training_daily_question_conflicts_count_check
    CHECK (distinct_snapshot_count > 1),
  CONSTRAINT training_daily_question_conflicts_hand_status_check
    CHECK (hand_status IN ('allocated', 'scored')),
  CONSTRAINT training_daily_question_conflicts_scored_check CHECK (
    (hand_status = 'allocated' AND scored_at IS NULL)
    OR (hand_status = 'scored' AND scored_at IS NOT NULL)
  )
);

-- CREATE TABLE IF NOT EXISTS must never bless a partial or attacker-created
-- authority table. Prove the complete storage and constraint contract before
-- any historical evidence is copied into it.
DO $daily_table_shape$
DECLARE
  seals_oid pg_catalog.oid := pg_catalog.to_regclass('public.training_daily_question_seals');
  conflicts_oid pg_catalog.oid := pg_catalog.to_regclass('public.training_daily_question_conflicts');
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class
       WHERE oid = seals_oid AND relkind = 'r'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class
       WHERE oid = conflicts_oid AND relkind = 'r'
     )
     OR (SELECT count(*) FROM pg_catalog.pg_attribute
         WHERE attrelid = seals_oid AND attnum > 0 AND NOT attisdropped) <> 5
     OR (SELECT count(*) FROM pg_catalog.pg_attribute
         WHERE attrelid = conflicts_oid AND attnum > 0 AND NOT attisdropped) <> 7
     OR EXISTS (
       SELECT 1
       FROM (VALUES
         ('daily_id', 1, 'text', true, NULL::text),
         ('snapshot_key', 2, 'text', true, NULL::text),
         ('source_question_id', 3, 'text', true, NULL::text),
         ('source_policy_checksum', 4, 'text', true, NULL::text),
         ('sealed_at', 5, 'timestamp with time zone', true, 'now()'::text)
       ) expected(attname, attnum, type_name, not_null, default_expr)
       LEFT JOIN pg_catalog.pg_attribute attributes
         ON attributes.attrelid = seals_oid
        AND attributes.attname = expected.attname
        AND attributes.attnum = expected.attnum
        AND NOT attributes.attisdropped
       LEFT JOIN pg_catalog.pg_attrdef defaults
         ON defaults.adrelid = attributes.attrelid
        AND defaults.adnum = attributes.attnum
       WHERE attributes.attname IS NULL
          OR pg_catalog.format_type(attributes.atttypid, attributes.atttypmod)
             IS DISTINCT FROM expected.type_name
          OR attributes.attnotnull IS DISTINCT FROM expected.not_null
          OR pg_catalog.pg_get_expr(defaults.adbin, defaults.adrelid)
             IS DISTINCT FROM expected.default_expr
     )
     OR EXISTS (
       SELECT 1
       FROM (VALUES
         ('attempt_id', 1, 'uuid', true, NULL::text),
         ('daily_id', 2, 'text', true, NULL::text),
         ('snapshot_key', 3, 'text', true, NULL::text),
         ('distinct_snapshot_count', 4, 'integer', true, NULL::text),
         ('hand_status', 5, 'text', true, NULL::text),
         ('scored_at', 6, 'timestamp with time zone', false, NULL::text),
         ('detected_at', 7, 'timestamp with time zone', true, 'now()'::text)
       ) expected(attname, attnum, type_name, not_null, default_expr)
       LEFT JOIN pg_catalog.pg_attribute attributes
         ON attributes.attrelid = conflicts_oid
        AND attributes.attname = expected.attname
        AND attributes.attnum = expected.attnum
        AND NOT attributes.attisdropped
       LEFT JOIN pg_catalog.pg_attrdef defaults
         ON defaults.adrelid = attributes.attrelid
        AND defaults.adnum = attributes.attnum
       WHERE attributes.attname IS NULL
          OR pg_catalog.format_type(attributes.atttypid, attributes.atttypmod)
             IS DISTINCT FROM expected.type_name
          OR attributes.attnotnull IS DISTINCT FROM expected.not_null
          OR pg_catalog.pg_get_expr(defaults.adbin, defaults.adrelid)
             IS DISTINCT FROM expected.default_expr
     )
     OR (SELECT count(*) FROM pg_catalog.pg_constraint
         WHERE conrelid = seals_oid) <> 5
     OR (SELECT count(*) FROM pg_catalog.pg_constraint
         WHERE conrelid = conflicts_oid) <> 7
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = seals_oid
         AND conname = 'training_daily_question_seals_pkey'
         AND contype = 'p' AND conkey = ARRAY[1]::smallint[]
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = seals_oid
         AND conname = 'training_daily_question_seals_snapshot_key_fkey'
         AND contype = 'f'
         AND confrelid = 'public.training_question_snapshots'::pg_catalog.regclass
         AND conkey = ARRAY[2]::smallint[]
         AND confdeltype = 'r'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = seals_oid
         AND conname = 'training_daily_question_seals_daily_id_check'
         AND contype = 'c' AND conkey = ARRAY[1]::smallint[]
         AND pg_catalog.pg_get_constraintdef(oid) LIKE '%daily-[0-9]{4}-[0-9]{2}-[0-9]{2}%'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = seals_oid
         AND conname = 'training_daily_question_seals_source_id_length'
         AND contype = 'c' AND conkey = ARRAY[3]::smallint[]
         AND pg_catalog.pg_get_constraintdef(oid) LIKE '%180%'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = seals_oid
         AND conname = 'training_daily_question_seals_policy_checksum_check'
         AND contype = 'c' AND conkey = ARRAY[4]::smallint[]
         AND pg_catalog.pg_get_constraintdef(oid) LIKE '%[0-9a-f]{64}%'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = conflicts_oid
         AND conname = 'training_daily_question_conflicts_pkey'
         AND contype = 'p' AND conkey = ARRAY[1]::smallint[]
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = conflicts_oid
         AND conname = 'training_daily_question_conflicts_attempt_id_fkey'
         AND contype = 'f'
         AND confrelid = 'public.training_attempts'::pg_catalog.regclass
         AND conkey = ARRAY[1]::smallint[]
         AND confdeltype = 'r'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = conflicts_oid
         AND conname = 'training_daily_question_conflicts_snapshot_key_fkey'
         AND contype = 'f'
         AND confrelid = 'public.training_question_snapshots'::pg_catalog.regclass
         AND conkey = ARRAY[3]::smallint[]
         AND confdeltype = 'r'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = conflicts_oid
         AND conname = 'training_daily_question_conflicts_daily_id_check'
         AND contype = 'c' AND conkey = ARRAY[2]::smallint[]
         AND pg_catalog.pg_get_constraintdef(oid) LIKE '%daily-[0-9]{4}-[0-9]{2}-[0-9]{2}%'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = conflicts_oid
         AND conname = 'training_daily_question_conflicts_count_check'
         AND contype = 'c' AND conkey = ARRAY[4]::smallint[]
         AND pg_catalog.pg_get_constraintdef(oid) LIKE '%> 1%'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = conflicts_oid
         AND conname = 'training_daily_question_conflicts_hand_status_check'
         AND contype = 'c' AND conkey = ARRAY[5]::smallint[]
         AND pg_catalog.pg_get_constraintdef(oid) LIKE '%allocated%'
         AND pg_catalog.pg_get_constraintdef(oid) LIKE '%scored%'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = conflicts_oid
         AND conname = 'training_daily_question_conflicts_scored_check'
         AND contype = 'c' AND conkey = ARRAY[5, 6]::smallint[]
         AND pg_catalog.pg_get_constraintdef(oid) LIKE '%IS NULL%'
         AND pg_catalog.pg_get_constraintdef(oid) LIKE '%IS NOT NULL%'
     ) THEN
    RAISE EXCEPTION 'TRAINING_DAILY_AUTHORITY_TABLE_SHAPE_INVALID';
  END IF;
END;
$daily_table_shape$;

CREATE INDEX IF NOT EXISTS idx_training_daily_question_conflicts_daily
  ON public.training_daily_question_conflicts (daily_id, attempt_id);

CREATE INDEX IF NOT EXISTS idx_training_attempts_daily_recovery_keyset
  ON public.training_attempts (user_id, started_at DESC, id DESC)
  WHERE game_id = 'daily-challenge'
    AND level = 1
    AND session_kind = 'daily'
    AND status = 'open';

COMMENT ON TABLE public.training_daily_question_seals IS
  'One first-writer-wins immutable Training question snapshot per America/Chicago Daily Challenge product date.';

CREATE OR REPLACE FUNCTION public.fn_training_daily_question_seal_validate_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $function$
DECLARE
  snapshot_row public.training_question_snapshots%ROWTYPE;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.training_daily_question_conflicts conflicts
    WHERE conflicts.daily_id = NEW.daily_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'TRAINING_DAILY_QUESTION_SEAL_CONFLICT';
  END IF;

  SELECT * INTO snapshot_row
  FROM public.training_question_snapshots
  WHERE snapshot_key = NEW.snapshot_key;
  IF NOT FOUND
     OR snapshot_row.game_id <> 'daily-challenge'
     OR snapshot_row.level <> 1
     OR snapshot_row.source_question_id <> NEW.source_question_id
     OR snapshot_row.source_question_id IS DISTINCT FROM (snapshot_row.question_data ->> 'id')
     OR lower(snapshot_row.question_data ->> 'policyChecksum')
       IS DISTINCT FROM NEW.source_policy_checksum THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'TRAINING_DAILY_QUESTION_SEAL_CONTRACT_INVALID';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS training_daily_question_seals_validate_v1
  ON public.training_daily_question_seals;
CREATE TRIGGER training_daily_question_seals_validate_v1
  BEFORE INSERT ON public.training_daily_question_seals
  FOR EACH ROW EXECUTE FUNCTION public.fn_training_daily_question_seal_validate_v1();

CREATE OR REPLACE FUNCTION public.fn_training_daily_question_seal_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'TRAINING_DAILY_QUESTION_SEAL_IMMUTABLE';
END;
$function$;

DROP TRIGGER IF EXISTS training_daily_question_seals_immutable_v1
  ON public.training_daily_question_seals;
CREATE TRIGGER training_daily_question_seals_immutable_v1
  BEFORE UPDATE OR DELETE ON public.training_daily_question_seals
  FOR EACH ROW EXECUTE FUNCTION public.fn_training_daily_question_seal_immutable_v1();

DROP TRIGGER IF EXISTS training_daily_question_conflicts_immutable_v1
  ON public.training_daily_question_conflicts;
CREATE TRIGGER training_daily_question_conflicts_immutable_v1
  BEFORE UPDATE OR DELETE ON public.training_daily_question_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.fn_training_daily_question_seal_immutable_v1();

-- Historical dates with more than one served snapshot are evidence conflicts,
-- not an invitation to crown an arbitrary winner. Preserve every immutable
-- attempt/hand as an auditable quarantine row and fail closed for that date.
WITH historical_daily_hands AS (
  SELECT
    attempts.client_nonce AS daily_id,
    attempts.id AS attempt_id,
    hands.snapshot_key,
    hands.status AS hand_status,
    hands.scored_at
  FROM public.training_attempts attempts
  JOIN public.training_attempt_hands hands
    ON hands.attempt_id = attempts.id
   AND hands.hand_ordinal = 1
  WHERE attempts.session_kind = 'daily'
    AND attempts.client_nonce ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND attempts.game_id = 'daily-challenge'
    AND attempts.level = 1
), conflicting_dates AS (
  SELECT daily_id, count(DISTINCT snapshot_key)::integer AS distinct_snapshot_count
  FROM historical_daily_hands
  GROUP BY daily_id
  HAVING count(DISTINCT snapshot_key) > 1
)
INSERT INTO public.training_daily_question_conflicts (
  attempt_id,
  daily_id,
  snapshot_key,
  distinct_snapshot_count,
  hand_status,
  scored_at
)
SELECT
  hands.attempt_id,
  hands.daily_id,
  hands.snapshot_key,
  conflicts.distinct_snapshot_count,
  hands.hand_status,
  hands.scored_at
FROM historical_daily_hands hands
JOIN conflicting_dates conflicts USING (daily_id)
ON CONFLICT (attempt_id) DO NOTHING;

-- Backfill only dates for which every historical attempt agrees on one
-- immutable snapshot. row_number merely selects a representative of that
-- already-unanimous identity.
WITH ranked_daily_snapshots AS (
  SELECT
    attempts.client_nonce AS daily_id,
    hands.snapshot_key,
    snapshots.source_question_id,
    lower(snapshots.question_data ->> 'policyChecksum') AS source_policy_checksum,
    row_number() OVER (
      PARTITION BY attempts.client_nonce
      ORDER BY attempts.started_at ASC, attempts.id ASC
    ) AS source_rank
  FROM public.training_attempts attempts
  JOIN public.training_attempt_hands hands
    ON hands.attempt_id = attempts.id
   AND hands.hand_ordinal = 1
  JOIN public.training_question_snapshots snapshots
    ON snapshots.snapshot_key = hands.snapshot_key
  WHERE attempts.session_kind = 'daily'
    AND attempts.client_nonce ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND attempts.game_id = 'daily-challenge'
    AND attempts.level = 1
    AND snapshots.game_id = 'daily-challenge'
    AND snapshots.level = 1
    AND lower(coalesce(snapshots.question_data ->> 'policyChecksum', ''))
      ~ '^[0-9a-f]{64}$'
    AND NOT EXISTS (
      SELECT 1
      FROM public.training_daily_question_conflicts conflicts
      WHERE conflicts.daily_id = attempts.client_nonce
    )
)
INSERT INTO public.training_daily_question_seals (
  daily_id,
  snapshot_key,
  source_question_id,
  source_policy_checksum
)
SELECT daily_id, snapshot_key, source_question_id, source_policy_checksum
FROM ranked_daily_snapshots
WHERE source_rank = 1
ON CONFLICT (daily_id) DO NOTHING;

-- The database independently seals the first daily hand registered by any
-- application version. This keeps a rolling deployment safe: the old server
-- can create the first seal, while the new server reads the same winner.
CREATE OR REPLACE FUNCTION public.fn_training_daily_attempt_hand_seal_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $function$
DECLARE
  attempt_row public.training_attempts%ROWTYPE;
  snapshot_row public.training_question_snapshots%ROWTYPE;
  seal_row public.training_daily_question_seals%ROWTYPE;
  policy_checksum text;
BEGIN
  SELECT * INTO attempt_row
  FROM public.training_attempts
  WHERE id = NEW.attempt_id;

  IF NOT FOUND OR attempt_row.session_kind <> 'daily' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.training_daily_question_conflicts conflicts
    WHERE conflicts.daily_id = attempt_row.client_nonce
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'TRAINING_DAILY_QUESTION_SEAL_CONFLICT';
  END IF;
  IF attempt_row.client_nonce !~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR attempt_row.game_id <> 'daily-challenge'
     OR attempt_row.level <> 1
     OR NEW.hand_ordinal <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'TRAINING_DAILY_ATTEMPT_CONTRACT_INVALID';
  END IF;

  SELECT * INTO snapshot_row
  FROM public.training_question_snapshots
  WHERE snapshot_key = NEW.snapshot_key;
  policy_checksum := lower(snapshot_row.question_data ->> 'policyChecksum');
  IF NOT FOUND
     OR snapshot_row.game_id <> 'daily-challenge'
     OR snapshot_row.level <> 1
     OR snapshot_row.source_question_id IS DISTINCT FROM (snapshot_row.question_data ->> 'id')
     OR coalesce(policy_checksum, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'TRAINING_DAILY_SNAPSHOT_CONTRACT_INVALID';
  END IF;

  INSERT INTO public.training_daily_question_seals (
    daily_id,
    snapshot_key,
    source_question_id,
    source_policy_checksum
  ) VALUES (
    attempt_row.client_nonce,
    snapshot_row.snapshot_key,
    snapshot_row.source_question_id,
    policy_checksum
  )
  ON CONFLICT (daily_id) DO NOTHING;

  SELECT * INTO seal_row
  FROM public.training_daily_question_seals
  WHERE daily_id = attempt_row.client_nonce;
  IF NOT FOUND
     OR seal_row.snapshot_key <> snapshot_row.snapshot_key
     OR seal_row.source_question_id <> snapshot_row.source_question_id
     OR seal_row.source_policy_checksum <> policy_checksum THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS training_attempt_hands_daily_seal_v1
  ON public.training_attempt_hands;
CREATE TRIGGER training_attempt_hands_daily_seal_v1
  BEFORE INSERT OR UPDATE ON public.training_attempt_hands
  FOR EACH ROW EXECUTE FUNCTION public.fn_training_daily_attempt_hand_seal_v1();

-- Starting a Daily Challenge already proves that its nonce matched the
-- America/Chicago date at issuance. Completion must bind to that immutable
-- issuance date, not whatever date the clock shows after the player answers.
CREATE OR REPLACE FUNCTION public.fn_training_daily_attempt_matches_start_v1(
  p_client_nonce text,
  p_started_at timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO pg_catalog
AS $function$
  SELECT p_client_nonce = (
    'daily-' || timezone('America/Chicago', p_started_at)::date::text
  );
$function$;

-- Patch the currently deployed completion function at narrow, audited markers:
-- admission, product-date attribution, and the daily seal guard. Using
-- pg_get_functiondef avoids copying hundreds of lines of reward/progress
-- authority into a second source that could silently drift. PostgreSQL CREATE
-- OR REPLACE retains the existing owner and ACL; the closing audit proves the
-- protected execution contract and each injected guard survived this patch.
DO $daily_completion_patch$
DECLARE
  definition text;
  updated_definition text;
  declaration_marker constant text :=
    'daily_selected_action text := NULL;';
  completed_marker constant text :=
    'IF attempt_row.status = ''completed'' THEN';
  completed_daily_guard_marker constant text :=
    'IF attempt_row.session_kind = ''daily'' AND attempt_row.status = ''completed'' THEN';
  completed_daily_guard constant text :=
    'IF attempt_row.session_kind = ''daily'' AND attempt_row.status = ''completed'' THEN
    IF NOT public.fn_training_daily_attempt_matches_start_v1(
      attempt_row.client_nonce,
      attempt_row.started_at
    ) THEN
      RETURN jsonb_build_object(''success'', false, ''status'', 409,
        ''code'', ''TRAINING_DAILY_ATTEMPT_EXPIRED'',
        ''error'', ''This Daily Challenge attempt is not bound to its issuance date.'');
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.training_daily_question_conflicts conflicts
      WHERE conflicts.daily_id = attempt_row.client_nonce
    ) THEN
      RETURN jsonb_build_object(''success'', false, ''status'', 409,
        ''code'', ''TRAINING_DAILY_SNAPSHOT_CONFLICT'',
        ''error'', ''This historical Daily Challenge has conflicting sealed evidence.'');
    END IF;

    SELECT seals.snapshot_key INTO daily_seal_snapshot_key
    FROM public.training_daily_question_seals seals
    WHERE seals.daily_id = attempt_row.client_nonce;
    SELECT hands.snapshot_key INTO daily_hand_snapshot_key
    FROM public.training_attempt_hands hands
    WHERE hands.attempt_id = attempt_row.id
      AND hands.hand_ordinal = 1;
    IF daily_seal_snapshot_key IS NULL
       OR daily_hand_snapshot_key IS DISTINCT FROM daily_seal_snapshot_key THEN
      RETURN jsonb_build_object(''success'', false, ''status'', 409,
        ''code'', ''TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH'',
        ''error'', ''This completed Daily Challenge no longer matches its immutable seal.'');
    END IF;
  END IF;

  IF attempt_row.status = ''completed'' THEN';
  guard_marker constant text :=
    'IF attempt_row.session_kind = ''daily'' THEN
    SELECT * INTO daily_row
    FROM public.training_daily_challenge
    WHERE user_id = attempt_row.user_id
      AND daily_id = attempt_row.client_nonce
    FOR UPDATE;';
  guarded_daily_block constant text :=
    'IF attempt_row.session_kind = ''daily'' THEN
    activity_chicago_date := timezone(''America/Chicago'', attempt_row.started_at)::date;
    now_utc := activity_chicago_date::timestamp;

    IF EXISTS (
      SELECT 1 FROM public.training_daily_question_conflicts conflicts
      WHERE conflicts.daily_id = attempt_row.client_nonce
    ) THEN
      RETURN jsonb_build_object(''success'', false, ''status'', 409,
        ''code'', ''TRAINING_DAILY_SNAPSHOT_CONFLICT'',
        ''error'', ''This historical Daily Challenge has conflicting sealed evidence.'');
    END IF;

    SELECT seals.snapshot_key INTO daily_seal_snapshot_key
    FROM public.training_daily_question_seals seals
    WHERE seals.daily_id = attempt_row.client_nonce;
    SELECT hands.snapshot_key INTO daily_hand_snapshot_key
    FROM public.training_attempt_hands hands
    WHERE hands.attempt_id = attempt_row.id
      AND hands.hand_ordinal = 1;
    IF daily_seal_snapshot_key IS NULL
       OR daily_hand_snapshot_key IS DISTINCT FROM daily_seal_snapshot_key THEN
      RETURN jsonb_build_object(''success'', false, ''status'', 409,
        ''code'', ''TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH'',
        ''error'', ''This Daily Challenge attempt does not match its global seal.'');
    END IF;

    SELECT * INTO daily_row
    FROM public.training_daily_challenge
    WHERE user_id = attempt_row.user_id
      AND daily_id = attempt_row.client_nonce
    FOR UPDATE;';
  old_predicate constant text :=
    'attempt_row.client_nonce <> ''daily-'' || today_chicago::text';
  new_predicate constant text :=
    'NOT public.fn_training_daily_attempt_matches_start_v1(attempt_row.client_nonce, attempt_row.started_at)';
BEGIN
  IF to_regprocedure('public.fn_complete_training_attempt_v2(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'TRAINING_COMPLETION_FUNCTION_MISSING';
  END IF;

  SELECT pg_get_functiondef(
    'public.fn_complete_training_attempt_v2(uuid,uuid)'::regprocedure
  ) INTO definition;

  updated_definition := definition;
  IF position(old_predicate IN updated_definition) > 0 THEN
    updated_definition := replace(updated_definition, old_predicate, new_predicate);
  ELSIF position(new_predicate IN updated_definition) = 0 THEN
    RAISE EXCEPTION 'TRAINING_DAILY_COMPLETION_PREDICATE_UNKNOWN';
  END IF;

  -- The original variable represented the completion date. Rename it to the
  -- semantic activity date everywhere; ordinary attempts retain its original
  -- initialization, while the guarded daily block overrides it from started_at.
  updated_definition := replace(
    updated_definition,
    'today_chicago',
    'activity_chicago_date'
  );

  IF position('daily_seal_snapshot_key text;' IN updated_definition) = 0 THEN
    IF position(declaration_marker IN updated_definition) = 0 THEN
      RAISE EXCEPTION 'TRAINING_DAILY_COMPLETION_DECLARATION_UNKNOWN';
    END IF;
    updated_definition := replace(
      updated_definition,
      declaration_marker,
      declaration_marker || E'\n  daily_seal_snapshot_key text;\n  daily_hand_snapshot_key text;'
    );
  END IF;

  -- Completion replays previously returned success before reaching the open
  -- attempt guard below. Put the immutable Daily identity check ahead of that
  -- idempotent return so a later-discovered historical conflict, missing seal,
  -- or mismatched hand can never be laundered by replaying an old completion.
  IF position(completed_daily_guard_marker IN updated_definition) = 0 THEN
    IF position(completed_marker IN updated_definition) = 0 THEN
      RAISE EXCEPTION 'TRAINING_DAILY_COMPLETED_REPLAY_GUARD_UNKNOWN';
    END IF;
    updated_definition := replace(
      updated_definition,
      completed_marker,
      completed_daily_guard
    );
  END IF;

  IF position(
    'activity_chicago_date := timezone(''America/Chicago'', attempt_row.started_at)::date;'
    IN updated_definition
  ) = 0 THEN
    IF position(guard_marker IN updated_definition) = 0 THEN
      RAISE EXCEPTION 'TRAINING_DAILY_COMPLETION_GUARD_UNKNOWN';
    END IF;
    updated_definition := replace(updated_definition, guard_marker, guarded_daily_block);
  END IF;

  IF position(old_predicate IN updated_definition) > 0
     OR position(new_predicate IN updated_definition) = 0
     OR position('today_chicago' IN updated_definition) > 0
     OR position('activity_chicago_date date :=' IN updated_definition) = 0
     OR position('daily_seal_snapshot_key text;' IN updated_definition) = 0
     OR position(completed_daily_guard_marker IN updated_definition) = 0
     OR position('TRAINING_DAILY_SNAPSHOT_CONFLICT' IN updated_definition) = 0
     OR position('now_utc := activity_chicago_date::timestamp;' IN updated_definition) = 0
     OR position(completed_daily_guard_marker IN updated_definition)
          > position(completed_marker IN updated_definition) THEN
    RAISE EXCEPTION 'TRAINING_DAILY_COMPLETION_PATCH_FAILED';
  END IF;

  IF updated_definition <> definition THEN
    EXECUTE updated_definition;
  END IF;
END;
$daily_completion_patch$;

-- Repair only attempts demonstrably stranded by the former date predicate:
-- they are daily, still inside their attempt lifetime, correctly bound to the
-- issuance date, have one durably scored hand, and have never completed.
UPDATE public.training_attempts attempts
SET status = 'open', updated_at = now()
WHERE attempts.session_kind = 'daily'
  AND attempts.status = 'expired'
  AND attempts.completed_at IS NULL
  AND attempts.expires_at > now()
  AND public.fn_training_daily_attempt_matches_start_v1(
    attempts.client_nonce,
    attempts.started_at
  )
  AND EXISTS (
    SELECT 1
    FROM public.training_attempt_hands hands
    WHERE hands.attempt_id = attempts.id
      AND hands.hand_ordinal = 1
      AND hands.status = 'scored'
      AND hands.result_is_correct IS NOT NULL
      AND hands.scored_at IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.training_daily_question_seals seals
        WHERE seals.daily_id = attempts.client_nonce
          AND seals.snapshot_key = hands.snapshot_key
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.training_daily_question_conflicts conflicts
    WHERE conflicts.daily_id = attempts.client_nonce
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.training_daily_challenge completed
    WHERE completed.user_id = attempts.user_id
      AND completed.daily_id = attempts.client_nonce
  );

ALTER TABLE public.training_daily_question_seals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_daily_question_conflicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_daily_question_seals
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.training_daily_question_conflicts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES (
  daily_id, snapshot_key, source_question_id, source_policy_checksum, sealed_at
) ON public.training_daily_question_seals
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES (
  attempt_id, daily_id, snapshot_key, distinct_snapshot_count,
  hand_status, scored_at, detected_at
) ON public.training_daily_question_conflicts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.training_daily_question_seals TO service_role;
GRANT SELECT ON public.training_daily_question_conflicts TO service_role;

REVOKE ALL ON FUNCTION public.fn_training_daily_question_seal_immutable_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_training_daily_question_seal_validate_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_training_daily_attempt_hand_seal_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_training_daily_attempt_matches_start_v1(text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

DO $audit$
BEGIN
  IF to_regclass('public.training_daily_question_seals') IS NULL
     OR to_regclass('public.training_daily_question_conflicts') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class
       WHERE oid = 'public.training_daily_question_seals'::pg_catalog.regclass
         AND relkind = 'r' AND relrowsecurity
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class
       WHERE oid = 'public.training_daily_question_conflicts'::pg_catalog.regclass
         AND relkind = 'r' AND relrowsecurity
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.training_daily_question_seals'::regclass
         AND tgname = 'training_daily_question_seals_immutable_v1'
         AND NOT tgisinternal
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.training_daily_question_conflicts'::regclass
         AND tgname = 'training_daily_question_conflicts_immutable_v1'
         AND NOT tgisinternal
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.training_daily_question_seals'::regclass
         AND tgname = 'training_daily_question_seals_validate_v1'
         AND NOT tgisinternal
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.training_attempt_hands'::regclass
         AND tgname = 'training_attempt_hands_daily_seal_v1'
         AND NOT tgisinternal
     )
     OR has_table_privilege('anon', 'public.training_daily_question_seals', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_daily_question_seals', 'SELECT')
     OR has_table_privilege('anon', 'public.training_daily_question_conflicts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_daily_question_conflicts', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.training_daily_question_seals', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.training_daily_question_seals', 'INSERT')
     OR has_table_privilege('service_role', 'public.training_daily_question_seals', 'UPDATE')
     OR has_table_privilege('service_role', 'public.training_daily_question_seals', 'DELETE')
     OR NOT has_table_privilege('service_role', 'public.training_daily_question_conflicts', 'SELECT')
     OR has_table_privilege('service_role', 'public.training_daily_question_conflicts', 'INSERT')
     OR has_table_privilege('service_role', 'public.training_daily_question_conflicts', 'UPDATE')
     OR has_table_privilege('service_role', 'public.training_daily_question_conflicts', 'DELETE')
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute attributes
       CROSS JOIN LATERAL pg_catalog.aclexplode(attributes.attacl) acl
       WHERE attributes.attrelid IN (
         'public.training_daily_question_seals'::pg_catalog.regclass,
         'public.training_daily_question_conflicts'::pg_catalog.regclass
       )
         AND attributes.attnum > 0
         AND NOT attributes.attisdropped
         AND acl.grantee IN (
           0,
           pg_catalog.to_regrole('anon'),
           pg_catalog.to_regrole('authenticated'),
           pg_catalog.to_regrole('service_role')
         )
     )
     OR (SELECT count(*)
         FROM pg_catalog.pg_proc
         WHERE oid IN (
           'public.fn_training_daily_question_seal_validate_v1()'::pg_catalog.regprocedure,
           'public.fn_training_daily_question_seal_immutable_v1()'::pg_catalog.regprocedure,
           'public.fn_training_daily_attempt_hand_seal_v1()'::pg_catalog.regprocedure
         )
           AND prosecdef
           AND coalesce(proconfig, ARRAY[]::text[])
             @> ARRAY['search_path=pg_catalog']) <> 3
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc
       WHERE oid = 'public.fn_training_daily_attempt_matches_start_v1(text,timestamp with time zone)'::pg_catalog.regprocedure
         AND NOT prosecdef
         AND coalesce(proconfig, ARRAY[]::text[])
           @> ARRAY['search_path=pg_catalog']
     )
     OR EXISTS (
       SELECT 1
       FROM public.training_daily_question_seals seals
       JOIN public.training_daily_question_conflicts conflicts USING (daily_id)
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'training_attempts'
         AND indexname = 'idx_training_attempts_daily_recovery_keyset'
     )
     OR has_function_privilege(
       'anon',
       'public.fn_complete_training_attempt_v2(uuid,uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.fn_complete_training_attempt_v2(uuid,uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.fn_complete_training_attempt_v2(uuid,uuid)',
       'EXECUTE'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_proc
       WHERE oid = 'public.fn_complete_training_attempt_v2(uuid,uuid)'::regprocedure
         AND prosecdef
         AND coalesce(proconfig, ARRAY[]::text[]) @> ARRAY['search_path=public']
         AND position(
           'fn_training_daily_attempt_matches_start_v1' IN pg_get_functiondef(oid)
         ) > 0
         AND position('activity_chicago_date' IN pg_get_functiondef(oid)) > 0
         AND position('TRAINING_DAILY_SNAPSHOT_CONFLICT' IN pg_get_functiondef(oid)) > 0
         AND position(
           'IF attempt_row.session_kind = ''daily'' AND attempt_row.status = ''completed'' THEN'
           IN pg_get_functiondef(oid)
         ) > 0
         AND position(
           'IF attempt_row.session_kind = ''daily'' AND attempt_row.status = ''completed'' THEN'
           IN pg_get_functiondef(oid)
         ) < position(
           'IF attempt_row.status = ''completed'' THEN'
           IN pg_get_functiondef(oid)
         )
     ) THEN
    RAISE EXCEPTION 'TRAINING_DAILY_QUESTION_SEAL_AUDIT_FAILED';
  END IF;
END;
$audit$;

COMMIT;
