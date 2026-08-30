-- Tier 2 / Personal Assistant phase four
-- Preserve EV provenance, enforce one coherent leak lifecycle, serialize
-- detector reconciliation, and expose an uncapped authoritative aggregate.

BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regclass('public.user_leaks') IS NULL
     OR to_regclass('public.user_training_leaks') IS NULL THEN
    RAISE EXCEPTION 'Pre-flight: Personal Assistant leak tables are missing';
  END IF;
  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_leaks'
      AND column_name IN (
        'id', 'user_id', 'status', 'is_active', 'resolved_at', 'updated_at', 'source_system',
        'leak_category', 'leak_name', 'leak_type', 'situation_class', 'explanation',
        'why_leaking_ev', 'notes', 'trend_data', 'avg_ev_loss_bb'
      )
  ) <> 16 THEN
    RAISE EXCEPTION 'Pre-flight: user_leaks core lifecycle columns are incomplete';
  END IF;
  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_training_leaks'
      AND column_name IN ('user_id', 'leak_type', 'leak_name', 'description', 'recommended_drill', 'metadata', 'count', 'fixed_at')
  ) <> 8 THEN
    RAISE EXCEPTION 'Pre-flight: user_training_leaks core columns are incomplete';
  END IF;
END;
$preflight$;

ALTER TABLE public.user_leaks
  ADD COLUMN IF NOT EXISTS remediation_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ev_loss_measured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS detector_managed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_source text;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_leaks'::regclass
      AND conname = 'user_leaks_resolution_source_check'
  ) THEN
    ALTER TABLE public.user_leaks ADD CONSTRAINT user_leaks_resolution_source_check
      CHECK (resolution_source IS NULL OR resolution_source IN ('manual', 'detector'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_leaks'::regclass
      AND conname = 'user_leaks_payload_bounds_check'
  ) THEN
    ALTER TABLE public.user_leaks ADD CONSTRAINT user_leaks_payload_bounds_check CHECK (
      char_length(leak_category) <= 80
      AND char_length(leak_name) <= 240
      AND (leak_type IS NULL OR (char_length(leak_type) <= 180 AND leak_type ~ '^[a-z0-9_]+$'))
      AND (situation_class IS NULL OR char_length(situation_class) <= 240)
      AND (explanation IS NULL OR char_length(explanation) <= 4000)
      AND (why_leaking_ev IS NULL OR char_length(why_leaking_ev) <= 4000)
      AND (notes IS NULL OR char_length(notes) <= 4000)
      AND octet_length(COALESCE(trend_data, '[]'::jsonb)::text) <= 65536
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_training_leaks'::regclass
      AND conname = 'user_training_leaks_payload_bounds_check'
  ) THEN
    ALTER TABLE public.user_training_leaks ADD CONSTRAINT user_training_leaks_payload_bounds_check CHECK (
      char_length(leak_type) <= 180
      AND char_length(leak_name) <= 240
      AND (description IS NULL OR char_length(description) <= 4000)
      AND (recommended_drill IS NULL OR char_length(recommended_drill) <= 240)
      AND octet_length(COALESCE(metadata, '{}'::jsonb)::text) <= 65536
      AND count BETWEEN 0 AND 1000000
    );
  END IF;
END;
$constraints$;

COMMENT ON COLUMN public.user_leaks.ev_loss_measured IS
  'True only when avg_ev_loss_bb is derived from exact per-action solver EV; false for estimates and user reports.';
COMMENT ON COLUMN public.user_leaks.resolution_source IS
  'How a resolved leak closed: manual user action or deterministic detector reconciliation.';
COMMENT ON COLUMN public.user_leaks.detector_managed IS
  'Server attestation set only by the current deterministic detector; historical and direct client rows remain false.';

-- Phase four separates training and Club Arena evidence identities. Retire
-- the former blended solver identities once so the next deterministic run can
-- recreate only the scoped leaks that still exist; otherwise the old active
-- row has no safe source-specific recovery path and remains visible forever.
UPDATE public.user_leaks
SET status = 'resolved',
    is_active = false,
    resolved_at = COALESCE(resolved_at, now()),
    remediation_completed_at = COALESCE(remediation_completed_at, resolved_at, now()),
    resolution_source = 'detector'
WHERE source_system IN ('solver_engine', 'training_solver')
  AND leak_type LIKE 'solver\_%' ESCAPE '\'
  AND leak_type NOT LIKE 'solver\_training\_%' ESCAPE '\'
  AND leak_type NOT LIKE 'solver\_club\_arena\_%' ESCAPE '\'
  AND (status IS DISTINCT FROM 'resolved' OR is_active IS DISTINCT FROM false);

-- Repair lifecycle drift before installing the write guard.
UPDATE public.user_leaks
SET status = 'resolved',
    is_active = false,
    resolved_at = COALESCE(resolved_at, remediation_completed_at, updated_at, now()),
    remediation_completed_at = COALESCE(remediation_completed_at, resolved_at, updated_at, now())
WHERE (status = 'resolved' OR is_active = false)
  AND (
    status IS DISTINCT FROM 'resolved'
    OR is_active IS DISTINCT FROM false
    OR resolved_at IS NULL
    OR remediation_completed_at IS NULL
  );

UPDATE public.user_leaks
SET status = CASE
      WHEN status IN ('emerging', 'persistent', 'improving') THEN status
      ELSE 'emerging'
    END,
    is_active = true,
    resolved_at = NULL,
    remediation_completed_at = NULL,
    resolution_source = NULL
WHERE status IS DISTINCT FROM 'resolved'
  AND (
    status IS NULL
    OR status NOT IN ('emerging', 'persistent', 'improving')
    OR is_active IS DISTINCT FROM true
    OR resolved_at IS NOT NULL
    OR remediation_completed_at IS NOT NULL
    OR resolution_source IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.enforce_user_leak_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_legacy_resolution boolean := false;
  v_request_role text := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), current_user);
BEGIN
  -- Serialize quota decisions for every writer, including service-role API
  -- upserts. The existence recheck lets an upsert update an established
  -- identity at the cap while rejecting a genuinely new leak type.
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('user_leaks:' || NEW.user_id::text, 0));
    IF NOT EXISTS (
      SELECT 1 FROM public.user_leaks
      WHERE user_id = NEW.user_id
        AND leak_type IS NOT DISTINCT FROM NEW.leak_type
    ) AND (SELECT count(*) FROM public.user_leaks WHERE user_id = NEW.user_id) >= 500 THEN
      RAISE EXCEPTION 'Per-account leak record limit reached' USING ERRCODE = '54000';
    END IF;
  END IF;

  -- The Training Accountant historically writes its own repetition counters
  -- through authenticated RLS. Preserve that workflow while making solver EV,
  -- status, and resolution provenance service-only fields.
  IF v_request_role IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.source_system := 'training_accountant';
      NEW.status := 'emerging';
      NEW.is_active := true;
      NEW.avg_ev_loss_bb := NULL;
      NEW.ev_loss_measured := false;
      NEW.detector_managed := false;
      NEW.resolved_at := NULL;
      NEW.remediation_completed_at := NULL;
      NEW.resolution_source := NULL;
    ELSE
      IF NOT (
        OLD.source_system = 'training_accountant'
        OR OLD.leak_type LIKE 'training_%'
        OR OLD.leak_type IS NULL
      ) THEN
        RAISE EXCEPTION 'Server-owned leak evidence cannot be changed directly'
          USING ERRCODE = '42501';
      END IF;
      NEW.user_id := OLD.user_id;
      NEW.leak_type := OLD.leak_type;
      NEW.source_system := OLD.source_system;
      NEW.status := OLD.status;
      NEW.is_active := OLD.is_active;
      NEW.avg_ev_loss_bb := OLD.avg_ev_loss_bb;
      NEW.ev_loss_measured := OLD.ev_loss_measured;
      NEW.detector_managed := OLD.detector_managed;
      NEW.resolved_at := OLD.resolved_at;
      NEW.remediation_completed_at := OLD.remediation_completed_at;
      NEW.resolution_source := OLD.resolution_source;
    END IF;
  END IF;

  -- Modern writers change status and the compatibility flag together. Older
  -- training clients may change only is_active, so honor that transition when
  -- status itself was not changed in the same UPDATE.
  IF TG_OP = 'INSERT' THEN
    v_legacy_resolution := NEW.is_active = false;
  ELSE
    v_legacy_resolution := NEW.is_active = false
      AND NEW.status IS NOT DISTINCT FROM OLD.status;
  END IF;

  IF NEW.status = 'resolved' OR v_legacy_resolution THEN
    NEW.status := 'resolved';
    NEW.is_active := false;
    NEW.resolved_at := COALESCE(NEW.resolved_at, NEW.remediation_completed_at, now());
    NEW.remediation_completed_at := COALESCE(NEW.remediation_completed_at, NEW.resolved_at, now());
    NEW.resolution_source := CASE
      WHEN NEW.resolution_source IN ('manual', 'detector') THEN NEW.resolution_source
      ELSE NULL
    END;
  ELSIF NEW.status IS NULL OR NEW.status IN ('emerging', 'persistent', 'improving') THEN
    NEW.status := COALESCE(NEW.status, 'emerging');
    NEW.is_active := true;
    NEW.resolved_at := NULL;
    NEW.remediation_completed_at := NULL;
    NEW.resolution_source := NULL;
  ELSE
    RAISE EXCEPTION 'Unsupported user_leaks status: %', NEW.status
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

DO $trigger_install$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'user_leaks_lifecycle_guard'
      AND tgrelid = 'public.user_leaks'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER user_leaks_lifecycle_guard
    BEFORE INSERT OR UPDATE ON public.user_leaks
    FOR EACH ROW EXECUTE FUNCTION public.enforce_user_leak_lifecycle();
  END IF;
END;
$trigger_install$;

CREATE OR REPLACE FUNCTION public.enforce_user_training_leak_quota()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- LeakService updates an existing row when possible, so every INSERT here
  -- is a new stored record and must participate in the account quota. The
  -- advisory lock prevents parallel clients from overshooting the limit.
  PERFORM pg_advisory_xact_lock(hashtextextended('user_training_leaks:' || NEW.user_id::text, 0));
  IF (SELECT count(*) FROM public.user_training_leaks WHERE user_id = NEW.user_id) >= 500 THEN
    RAISE EXCEPTION 'Per-account training leak record limit reached' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END;
$function$;

DO $training_trigger_install$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'user_training_leaks_quota_guard'
      AND tgrelid = 'public.user_training_leaks'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER user_training_leaks_quota_guard
    BEFORE INSERT ON public.user_training_leaks
    FOR EACH ROW EXECUTE FUNCTION public.enforce_user_training_leak_quota();
  END IF;
END;
$training_trigger_install$;

CREATE OR REPLACE FUNCTION public.resolve_user_leaks_if_unchanged(
  p_user_id uuid,
  p_candidates jsonb,
  p_resolved_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_requested integer := 0;
  v_resolved integer := 0;
BEGIN
  IF p_user_id IS NULL
     OR jsonb_typeof(COALESCE(p_candidates, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_candidates, '[]'::jsonb)) > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('leak_detection:' || p_user_id::text, 0));
  v_requested := jsonb_array_length(COALESCE(p_candidates, '[]'::jsonb));

  WITH candidates AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_candidates, '[]'::jsonb)) AS x(
      id uuid,
      expected_updated_at timestamptz
    )
  ), resolved AS (
    UPDATE public.user_leaks AS leak
    SET status = 'resolved',
        resolved_at = COALESCE(p_resolved_at, now()),
        remediation_completed_at = COALESCE(p_resolved_at, now()),
        resolution_source = 'detector',
        is_active = false,
        updated_at = COALESCE(p_resolved_at, now())
    FROM candidates AS candidate
    WHERE leak.id = candidate.id
      AND leak.user_id = p_user_id
      AND leak.source_system IN ('live_play', 'solver_engine', 'training_solver')
      AND leak.detector_managed = true
      AND leak.status IS DISTINCT FROM 'resolved'
      AND leak.updated_at IS NOT DISTINCT FROM candidate.expected_updated_at
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_resolved FROM resolved;

  RETURN jsonb_build_object(
    'success', true,
    'requested', v_requested,
    'resolved', v_resolved,
    'conflicts', v_requested - v_resolved
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_user_leaks_if_unchanged(uuid, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_user_leaks_if_unchanged(uuid, jsonb, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_personal_assistant_leak_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_active bigint := 0;
  v_resolved bigint := 0;
  v_training_active bigint := 0;
  v_training_resolved bigint := 0;
  v_avg_ev numeric := 0;
  v_measured bigint := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_id_required');
  END IF;

  SELECT
    count(*) FILTER (
      WHERE status IS DISTINCT FROM 'resolved'
        AND source_system IS DISTINCT FROM 'user_reported'
    ),
    count(*) FILTER (
      WHERE status = 'resolved'
        AND source_system IS DISTINCT FROM 'user_reported'
    ),
    COALESCE(avg(abs(avg_ev_loss_bb)) FILTER (
      WHERE status IS DISTINCT FROM 'resolved'
        AND ev_loss_measured = true
        AND avg_ev_loss_bb IS NOT NULL
        AND avg_ev_loss_bb <> 0
    ), 0),
    count(*) FILTER (
      WHERE status IS DISTINCT FROM 'resolved'
        AND ev_loss_measured = true
        AND avg_ev_loss_bb IS NOT NULL
        AND avg_ev_loss_bb <> 0
    )
  INTO v_active, v_resolved, v_avg_ev, v_measured
  FROM public.user_leaks
  WHERE user_id = p_user_id;

  SELECT
    count(*) FILTER (WHERE fixed_at IS NULL),
    count(*) FILTER (WHERE fixed_at IS NOT NULL)
  INTO v_training_active, v_training_resolved
  FROM public.user_training_leaks
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'active_leaks', v_active + v_training_active,
    'resolved_leaks', v_resolved + v_training_resolved,
    'avg_ev_loss', round(v_avg_ev, 2),
    'measured_leak_count', v_measured
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_personal_assistant_leak_stats(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_personal_assistant_leak_stats(uuid)
  TO service_role;

DO $postapply$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_leaks'
      AND column_name IN ('remediation_completed_at', 'ev_loss_measured', 'detector_managed', 'resolution_source')
    GROUP BY table_schema, table_name
    HAVING count(*) = 4
  ) THEN
    RAISE EXCEPTION 'Post-apply: Personal Assistant integrity columns are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'user_leaks_lifecycle_guard'
      AND tgrelid = 'public.user_leaks'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Post-apply: Personal Assistant lifecycle trigger is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'user_training_leaks_quota_guard'
      AND tgrelid = 'public.user_training_leaks'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Post-apply: Training leak quota trigger is missing';
  END IF;
  IF to_regprocedure('public.get_personal_assistant_leak_stats(uuid)') IS NULL
     OR to_regprocedure('public.resolve_user_leaks_if_unchanged(uuid,jsonb,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'Post-apply: Personal Assistant integrity RPCs are missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_leaks
    WHERE (status = 'resolved' AND (is_active IS DISTINCT FROM false OR resolved_at IS NULL OR remediation_completed_at IS NULL))
       OR (status IS DISTINCT FROM 'resolved' AND (is_active IS DISTINCT FROM true OR resolved_at IS NOT NULL OR remediation_completed_at IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'Post-apply: user_leaks lifecycle drift remains';
  END IF;
  IF has_function_privilege('authenticated', 'public.get_personal_assistant_leak_stats(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.resolve_user_leaks_if_unchanged(uuid,jsonb,timestamp with time zone)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-apply: authenticated retains access to service-only leak RPCs';
  END IF;
END;
$postapply$;

NOTIFY pgrst, 'reload schema';

COMMIT;
