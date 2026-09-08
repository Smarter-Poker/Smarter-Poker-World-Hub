-- Completion order is not activity order. Persist one authoritative activity
-- day per user, then derive streak islands from that immutable ledger so a
-- late bridge (day 3, day 1, day 2) converges to the same result as chronological
-- settlement. Daily attempts use their issuance day; ordinary attempts keep
-- their completion day.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog;

-- Freeze completion inputs and the materialized streak row while the ledger is
-- backfilled and the completion function is swapped. Runtime completion takes
-- locks in this same attempt -> streak order.
LOCK TABLE
  public.training_attempts,
  public.training_streaks
IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.training_streak_activity_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  first_attempt_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_date)
);

-- Refuse to backfill or trust a partial/pre-created ledger. The immutable
-- authority projection is safe only with this exact four-column, two-key
-- contract.
DO $streak_activity_shape$
DECLARE
  activity_oid pg_catalog.oid := pg_catalog.to_regclass('public.training_streak_activity_days');
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class
       WHERE oid = activity_oid AND relkind = 'r'
     )
     OR (SELECT count(*) FROM pg_catalog.pg_attribute
         WHERE attrelid = activity_oid AND attnum > 0 AND NOT attisdropped) <> 4
     OR EXISTS (
       SELECT 1
       FROM (VALUES
         ('user_id', 1, 'uuid', true, NULL::text),
         ('activity_date', 2, 'date', true, NULL::text),
         ('first_attempt_id', 3, 'uuid', false, NULL::text),
         ('recorded_at', 4, 'timestamp with time zone', true, 'now()'::text)
       ) expected(attname, attnum, type_name, not_null, default_expr)
       LEFT JOIN pg_catalog.pg_attribute attributes
         ON attributes.attrelid = activity_oid
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
         WHERE conrelid = activity_oid) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = activity_oid
         AND conname = 'training_streak_activity_days_pkey'
         AND contype = 'p'
         AND conkey = ARRAY[1, 2]::smallint[]
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = activity_oid
         AND conname = 'training_streak_activity_days_user_id_fkey'
         AND contype = 'f'
         AND confrelid = 'auth.users'::pg_catalog.regclass
         AND conkey = ARRAY[1]::smallint[]
         AND confdeltype = 'c'
     ) THEN
    RAISE EXCEPTION 'TRAINING_STREAK_ACTIVITY_TABLE_SHAPE_INVALID';
  END IF;
END;
$streak_activity_shape$;

COMMENT ON TABLE public.training_streak_activity_days IS
  'Immutable authoritative Training activity days used to derive order-independent streak islands.';

CREATE OR REPLACE FUNCTION public.fn_training_streak_activity_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'TRAINING_STREAK_ACTIVITY_DAY_IMMUTABLE';
END;
$function$;

DROP TRIGGER IF EXISTS training_streak_activity_days_immutable_v1
  ON public.training_streak_activity_days;
CREATE TRIGGER training_streak_activity_days_immutable_v1
  BEFORE UPDATE OR DELETE ON public.training_streak_activity_days
  FOR EACH ROW EXECUTE FUNCTION public.fn_training_streak_activity_immutable_v1();

-- Recover every date that has direct sealed completion evidence. The daily
-- branch deliberately uses started_at and rejects malformed issuance identity;
-- all other real attempts retain their historical completion-day semantics.
WITH completed_attempt_days AS (
  SELECT
    attempts.user_id,
    CASE
      WHEN attempts.session_kind = 'daily'
        THEN timezone('America/Chicago', attempts.started_at)::date
      ELSE timezone('America/Chicago', attempts.completed_at)::date
    END AS activity_date,
    attempts.id AS attempt_id,
    attempts.completed_at
  FROM public.training_attempts attempts
  WHERE attempts.status = 'completed'
    AND NOT attempts.practice_only
    AND (
      attempts.session_kind <> 'daily'
      OR public.fn_training_daily_attempt_matches_start_v1(
        attempts.client_nonce,
        attempts.started_at
      )
    )
), first_attempt_per_day AS (
  SELECT DISTINCT ON (user_id, activity_date)
    user_id, activity_date, attempt_id
  FROM completed_attempt_days
  WHERE activity_date IS NOT NULL
  ORDER BY user_id, activity_date, completed_at ASC, attempt_id ASC
)
INSERT INTO public.training_streak_activity_days (
  user_id, activity_date, first_attempt_id
)
SELECT user_id, activity_date, attempt_id
FROM first_attempt_per_day
ON CONFLICT (user_id, activity_date) DO NOTHING;

-- Preserve an existing authoritative interval even when it predates attempt
-- evidence retained by this release. NULL first_attempt_id explicitly marks an
-- inferred day from the immutable authority snapshot rather than invented
-- attempt evidence.
INSERT INTO public.training_streak_activity_days (
  user_id, activity_date, first_attempt_id
)
SELECT
  streaks.user_id,
  inferred.activity_date::date,
  NULL
FROM public.training_streaks streaks
CROSS JOIN LATERAL generate_series(
  coalesce(
    streaks.authority_streak_start_date,
    streaks.authority_last_training_date
      - greatest(streaks.authority_current_streak - 1, 0)
  )::timestamp,
  streaks.authority_last_training_date::timestamp,
  interval '1 day'
) AS inferred(activity_date)
WHERE streaks.authority_current_streak > 0
  AND streaks.authority_last_training_date IS NOT NULL
  AND coalesce(
    streaks.authority_streak_start_date,
    streaks.authority_last_training_date
      - greatest(streaks.authority_current_streak - 1, 0)
  ) <= streaks.authority_last_training_date
ON CONFLICT (user_id, activity_date) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_training_streak_summary_v1(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog
AS $function$
  WITH ordered_days AS (
    SELECT
      activity_date,
      activity_date
        - row_number() OVER (ORDER BY activity_date)::integer AS island_key
    FROM public.training_streak_activity_days
    WHERE user_id = p_user_id
  ), islands AS (
    SELECT
      min(activity_date) AS start_date,
      max(activity_date) AS last_date,
      count(*)::integer AS day_count
    FROM ordered_days
    GROUP BY island_key
  ), ranked AS (
    SELECT
      islands.*,
      max(day_count) OVER () AS longest_count,
      row_number() OVER (ORDER BY last_date DESC) AS recency_rank
    FROM islands
  )
  SELECT jsonb_build_object(
    'current', day_count,
    'longest', longest_count,
    'startDate', start_date,
    'lastDate', last_date
  )
  FROM ranked
  WHERE recency_rank = 1;
$function$;

-- Bring the materialized projection into agreement immediately; do not wait
-- for a player's next completion to repair already out-of-order history.
WITH summaries AS MATERIALIZED (
  SELECT
    streaks.user_id,
    public.fn_training_streak_summary_v1(streaks.user_id) AS value
  FROM public.training_streaks streaks
)
UPDATE public.training_streaks AS streaks
SET
  authority_current_streak = (summaries.value ->> 'current')::integer,
  authority_longest_streak = greatest(
    streaks.authority_longest_streak,
    (summaries.value ->> 'longest')::integer
  ),
  authority_last_training_date = (summaries.value ->> 'lastDate')::date,
  authority_streak_start_date = (summaries.value ->> 'startDate')::date,
  current_streak = (summaries.value ->> 'current')::integer,
  longest_streak = greatest(
    streaks.authority_longest_streak,
    (summaries.value ->> 'longest')::integer
  ),
  last_training_date = (summaries.value ->> 'lastDate')::date,
  streak_start_date = (summaries.value ->> 'startDate')::date,
  milestones_claimed = streaks.authority_milestones_claimed,
  updated_at = now()
FROM summaries
WHERE summaries.user_id = streaks.user_id
  AND summaries.value IS NOT NULL;

DO $streak_completion_patch$
DECLARE
  definition text;
  updated_definition text;
  start_marker constant text := 'INSERT INTO public.training_streaks AS streaks (';
  end_marker constant text := 'RETURNING * INTO streak_row;';
  applied_marker constant text := 'INSERT INTO public.training_streak_activity_days (';
  replacement text;
  start_at integer;
  end_relative integer;
  replace_length integer;
BEGIN
  IF to_regprocedure('public.fn_complete_training_attempt_v2(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'TRAINING_COMPLETION_FUNCTION_MISSING';
  END IF;
  SELECT pg_get_functiondef(
    'public.fn_complete_training_attempt_v2(uuid,uuid)'::regprocedure
  ) INTO definition;

  IF position(applied_marker IN definition) > 0 THEN
    RETURN;
  END IF;
  start_at := position(start_marker IN definition);
  end_relative := position(end_marker IN substring(definition FROM start_at));
  IF start_at = 0 OR end_relative = 0 THEN
    RAISE EXCEPTION 'TRAINING_STREAK_UPSERT_BOUNDARY_UNKNOWN';
  END IF;
  replace_length := end_relative - 1 + length(end_marker);

  replacement := $sql$
INSERT INTO public.training_streaks AS streaks (
    user_id, current_streak, longest_streak, last_training_date,
    streak_start_date, milestones_claimed,
    authority_current_streak, authority_longest_streak,
    authority_last_training_date, authority_streak_start_date,
    authority_milestones_claimed, created_at, updated_at
  ) VALUES (
    attempt_row.user_id, 1, 1, activity_chicago_date,
    activity_chicago_date, '[]'::jsonb,
    1, 1, activity_chicago_date, activity_chicago_date, '[]'::jsonb, now(), now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Serialize all days for one player before adding evidence and recomputing
  -- islands. The ledger PK makes same-day concurrent completions idempotent.
  SELECT * INTO streak_row
  FROM public.training_streaks
  WHERE user_id = attempt_row.user_id
  FOR UPDATE;

  INSERT INTO public.training_streak_activity_days (
    user_id, activity_date, first_attempt_id
  ) VALUES (
    attempt_row.user_id, activity_chicago_date, attempt_row.id
  )
  ON CONFLICT (user_id, activity_date) DO NOTHING;

  WITH summary AS MATERIALIZED (
    SELECT public.fn_training_streak_summary_v1(attempt_row.user_id) AS value
  )
  UPDATE public.training_streaks AS streaks
  SET
    authority_current_streak = (summary.value ->> 'current')::integer,
    authority_longest_streak = greatest(
      streaks.authority_longest_streak,
      (summary.value ->> 'longest')::integer
    ),
    authority_last_training_date = (summary.value ->> 'lastDate')::date,
    authority_streak_start_date = (summary.value ->> 'startDate')::date,
    current_streak = (summary.value ->> 'current')::integer,
    longest_streak = greatest(
      streaks.authority_longest_streak,
      (summary.value ->> 'longest')::integer
    ),
    last_training_date = (summary.value ->> 'lastDate')::date,
    streak_start_date = (summary.value ->> 'startDate')::date,
    milestones_claimed = streaks.authority_milestones_claimed,
    updated_at = now()
  FROM summary
  WHERE streaks.user_id = attempt_row.user_id
  RETURNING streaks.* INTO streak_row;
$sql$;

  updated_definition := overlay(
    definition PLACING replacement FROM start_at FOR replace_length
  );
  IF position(applied_marker IN updated_definition) = 0
     OR position('fn_training_streak_summary_v1' IN updated_definition) = 0
     OR position('FOR UPDATE;' IN updated_definition) = 0
     OR position('RETURNING streaks.* INTO streak_row;' IN updated_definition) = 0 THEN
    RAISE EXCEPTION 'TRAINING_STREAK_OUT_OF_ORDER_PATCH_FAILED';
  END IF;
  EXECUTE updated_definition;
END;
$streak_completion_patch$;

ALTER TABLE public.training_streak_activity_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_streak_activity_days
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES (user_id, activity_date, first_attempt_id, recorded_at)
  ON public.training_streak_activity_days
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_training_streak_activity_immutable_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_training_streak_summary_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

DO $audit$
DECLARE
  completion_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.fn_complete_training_attempt_v2(uuid,uuid)'::regprocedure
  ) INTO completion_definition;
  IF to_regclass('public.training_streak_activity_days') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class
       WHERE oid = 'public.training_streak_activity_days'::pg_catalog.regclass
         AND relkind = 'r' AND relrowsecurity
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.training_streak_activity_days'::regclass
         AND tgname = 'training_streak_activity_days_immutable_v1'
         AND NOT tgisinternal
     )
     OR has_table_privilege('anon', 'public.training_streak_activity_days', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_streak_activity_days', 'SELECT')
     OR has_table_privilege('service_role', 'public.training_streak_activity_days', 'SELECT')
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute attributes
       CROSS JOIN LATERAL pg_catalog.aclexplode(attributes.attacl) acl
       WHERE attributes.attrelid = 'public.training_streak_activity_days'::pg_catalog.regclass
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
           'public.fn_training_streak_activity_immutable_v1()'::pg_catalog.regprocedure,
           'public.fn_training_streak_summary_v1(uuid)'::pg_catalog.regprocedure
         )
           AND prosecdef
           AND coalesce(proconfig, ARRAY[]::text[])
             @> ARRAY['search_path=pg_catalog']) <> 2
     OR has_function_privilege(
       'anon', 'public.fn_training_streak_summary_v1(uuid)', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'public.fn_training_streak_summary_v1(uuid)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'public.fn_training_streak_summary_v1(uuid)', 'EXECUTE'
     )
     OR position('INSERT INTO public.training_streak_activity_days (' IN completion_definition) = 0
     OR position('fn_training_streak_summary_v1' IN completion_definition) = 0
     OR position('FOR UPDATE;' IN completion_definition) = 0 THEN
    RAISE EXCEPTION 'TRAINING_STREAK_OUT_OF_ORDER_CONTRACT_INCOMPLETE';
  END IF;
END;
$audit$;

COMMIT;
