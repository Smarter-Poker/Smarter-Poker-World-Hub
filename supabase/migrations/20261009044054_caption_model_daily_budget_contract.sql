-- ============================================================================
-- 20261009044054_caption_model_daily_budget_contract.sql
-- ============================================================================
-- TIER:        3 (new service-only spend reservation authority)
-- AUTHOR:      Codex
-- AFFECTS:     caption_model_budget_settings, caption_model_budget_ledger,
--              reserve_caption_model_budget, settle_caption_model_budget
-- IRREVERSIBLE: no
--
-- WHY:
--   Fleet Content Programme Phase 2 permits a caption model only behind an
--   explicit, disabled-by-default configuration and a durable daily budget.
--   The worker must reserve the worst possible charge atomically before a
--   provider call, retain unknown outcomes as charged risk, and never retry a
--   duplicate request. The legacy content_settings.ai_model field remains
--   untouched because existing consumers still own it.
--
-- HOW:
--   - Add one fail-closed service-private settings row and a micro-USD ledger.
--   - Serialize reservations on the singleton settings row.
--   - Count unsettled reservations at their worst case and settled rows at the
--     bounded actual charge for the UTC budget date.
--   - Expose only two SECURITY DEFINER RPCs to service_role.
-- ============================================================================

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS
DO $preflight$
BEGIN
  IF to_regclass('public.content_settings') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.content_settings is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'content_settings'
       AND column_name = 'engine_enabled'
       AND data_type = 'boolean'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: content_settings.engine_enabled boolean is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'content_settings'
       AND column_name = 'ai_model'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: legacy content_settings.ai_model is missing';
  END IF;

  IF to_regclass('public.caption_model_budget_settings') IS NOT NULL
     OR to_regclass('public.caption_model_budget_ledger') IS NOT NULL
     OR to_regprocedure('public.reserve_caption_model_budget(text)') IS NOT NULL
     OR to_regprocedure('public.settle_caption_model_budget(uuid,text,bigint)') IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: caption model budget contract already exists';
  END IF;
END
$preflight$;

CREATE TABLE public.caption_model_budget_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT false,
  provider text,
  model text,
  provider_qualified_at timestamptz,
  provider_qualified_model text,
  provider_qualified_reservation_microusd bigint,
  daily_budget_microusd bigint NOT NULL DEFAULT 0,
  request_reservation_microusd bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT caption_model_budget_settings_singleton CHECK (id = 1),
  CONSTRAINT caption_model_budget_settings_provider_nonempty
    CHECK (provider IS NULL OR btrim(provider) <> ''),
  CONSTRAINT caption_model_budget_settings_model_nonempty
    CHECK (model IS NULL OR btrim(model) <> ''),
  CONSTRAINT caption_model_budget_settings_qualified_model_nonempty
    CHECK (provider_qualified_model IS NULL OR btrim(provider_qualified_model) <> ''),
  CONSTRAINT caption_model_budget_settings_qualification_complete
    CHECK (
      (
        provider_qualified_at IS NULL
        AND provider_qualified_model IS NULL
        AND provider_qualified_reservation_microusd IS NULL
      )
      OR
      (
        provider_qualified_at IS NOT NULL
        AND provider_qualified_model IS NOT NULL
        AND provider_qualified_reservation_microusd IS NOT NULL
      )
    ),
  CONSTRAINT caption_model_budget_settings_qualified_reservation_nonnegative
    CHECK (provider_qualified_reservation_microusd IS NULL OR provider_qualified_reservation_microusd >= 0),
  CONSTRAINT caption_model_budget_settings_daily_nonnegative
    CHECK (daily_budget_microusd >= 0),
  CONSTRAINT caption_model_budget_settings_reservation_nonnegative
    CHECK (request_reservation_microusd >= 0)
);

INSERT INTO public.caption_model_budget_settings (id) VALUES (1);

CREATE TABLE public.caption_model_budget_ledger (
  reservation_id uuid PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  budget_date date NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  reserved_microusd bigint NOT NULL,
  charged_microusd bigint,
  status text NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  settled_at timestamptz,
  CONSTRAINT caption_model_budget_ledger_idempotency_nonempty
    CHECK (btrim(idempotency_key) <> '' AND char_length(idempotency_key) <= 200),
  CONSTRAINT caption_model_budget_ledger_provider_nonempty CHECK (btrim(provider) <> ''),
  CONSTRAINT caption_model_budget_ledger_model_nonempty CHECK (btrim(model) <> ''),
  CONSTRAINT caption_model_budget_ledger_reservation_positive CHECK (reserved_microusd > 0),
  CONSTRAINT caption_model_budget_ledger_charge_bounded
    CHECK (charged_microusd IS NULL OR (charged_microusd >= 0 AND charged_microusd <= reserved_microusd)),
  CONSTRAINT caption_model_budget_ledger_status
    CHECK (status IN ('reserved', 'settled')),
  CONSTRAINT caption_model_budget_ledger_state_complete
    CHECK (
      (status = 'reserved' AND charged_microusd IS NULL AND settled_at IS NULL)
      OR
      (status = 'settled' AND charged_microusd IS NOT NULL AND settled_at IS NOT NULL)
    )
);

CREATE INDEX caption_model_budget_ledger_budget_date_idx
  ON public.caption_model_budget_ledger (budget_date);

ALTER TABLE public.caption_model_budget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caption_model_budget_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.caption_model_budget_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caption_model_budget_ledger FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.caption_model_budget_settings FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.caption_model_budget_ledger FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.caption_model_budget_settings TO service_role;

CREATE FUNCTION public.reserve_caption_model_budget(p_idempotency_key text)
RETURNS TABLE (
  decision text,
  reservation_id uuid,
  provider text,
  model text,
  reserved_microusd bigint,
  daily_budget_microusd bigint,
  committed_microusd bigint,
  budget_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE
  v_key text := btrim(p_idempotency_key);
  v_settings public.caption_model_budget_settings%ROWTYPE;
  v_existing public.caption_model_budget_ledger%ROWTYPE;
  v_master_enabled boolean := false;
  v_budget_date date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  v_committed bigint := 0;
BEGIN
  IF COALESCE(auth.role()::text, '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  IF v_key IS NULL OR v_key = '' OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotency key must contain 1 to 200 characters'
      USING ERRCODE = '22023';
  END IF;

  -- One row is the daily budget mutex. Every reserve decision observes a
  -- stable settings snapshot and the commitment left by the prior caller.
  SELECT s.*
    INTO v_settings
    FROM public.caption_model_budget_settings AS s
   WHERE s.id = 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'caption model budget settings row is missing'
      USING ERRCODE = '55000';
  END IF;

  SELECT l.*
    INTO v_existing
    FROM public.caption_model_budget_ledger AS l
   WHERE l.idempotency_key = v_key;

  IF FOUND THEN
    SELECT COALESCE(sum(
      CASE WHEN l.status = 'settled' THEN l.charged_microusd ELSE l.reserved_microusd END
    ), 0)::bigint
      INTO v_committed
      FROM public.caption_model_budget_ledger AS l
     WHERE l.budget_date = v_existing.budget_date;

    decision := 'duplicate';
    reservation_id := v_existing.reservation_id;
    provider := v_existing.provider;
    model := v_existing.model;
    reserved_microusd := v_existing.reserved_microusd;
    daily_budget_microusd := v_settings.daily_budget_microusd;
    committed_microusd := v_committed;
    budget_date := v_existing.budget_date;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT count(*) = 1 AND COALESCE(bool_and(s.engine_enabled IS TRUE), false)
    INTO v_master_enabled
    FROM public.content_settings AS s;

  SELECT COALESCE(sum(
    CASE WHEN l.status = 'settled' THEN l.charged_microusd ELSE l.reserved_microusd END
  ), 0)::bigint
    INTO v_committed
    FROM public.caption_model_budget_ledger AS l
   WHERE l.budget_date = v_budget_date;

  reservation_id := NULL;
  provider := NULL;
  model := NULL;
  reserved_microusd := 0;
  daily_budget_microusd := v_settings.daily_budget_microusd;
  committed_microusd := v_committed;
  budget_date := v_budget_date;

  IF NOT v_master_enabled OR NOT v_settings.enabled THEN
    decision := 'disabled';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_settings.provider IS NULL OR btrim(v_settings.provider) = ''
     OR v_settings.model IS NULL OR btrim(v_settings.model) = ''
     OR v_settings.provider_qualified_at IS NULL
     OR v_settings.provider_qualified_model IS NULL
     OR v_settings.provider_qualified_reservation_microusd IS NULL
     OR btrim(v_settings.provider_qualified_model) <> btrim(v_settings.model)
     OR v_settings.provider_qualified_reservation_microusd
        <> v_settings.request_reservation_microusd
     OR v_settings.provider_qualified_at > clock_timestamp()
     OR v_settings.provider_qualified_at < clock_timestamp() - interval '24 hours' THEN
    decision := 'unconfigured';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_settings.daily_budget_microusd <= 0
     OR v_settings.request_reservation_microusd <= 0 THEN
    decision := 'disabled';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_settings.request_reservation_microusd > v_settings.daily_budget_microusd
     OR v_committed > v_settings.daily_budget_microusd - v_settings.request_reservation_microusd THEN
    decision := 'budget_exhausted';
    provider := btrim(v_settings.provider);
    model := btrim(v_settings.model);
    reserved_microusd := v_settings.request_reservation_microusd;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.caption_model_budget_ledger (
    reservation_id,
    idempotency_key,
    budget_date,
    provider,
    model,
    reserved_microusd
  ) VALUES (
    gen_random_uuid(),
    v_key,
    v_budget_date,
    btrim(v_settings.provider),
    btrim(v_settings.model),
    v_settings.request_reservation_microusd
  )
  RETURNING
    caption_model_budget_ledger.reservation_id,
    caption_model_budget_ledger.provider,
    caption_model_budget_ledger.model,
    caption_model_budget_ledger.reserved_microusd
  INTO reservation_id, provider, model, reserved_microusd;

  decision := 'reserved';
  committed_microusd := v_committed + reserved_microusd;
  RETURN NEXT;
END
$function$;

CREATE FUNCTION public.settle_caption_model_budget(
  p_reservation_id uuid,
  p_idempotency_key text,
  p_charged_microusd bigint
)
RETURNS TABLE (
  settled boolean,
  charged_microusd bigint,
  committed_microusd bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE
  v_key text := btrim(p_idempotency_key);
  v_reservation public.caption_model_budget_ledger%ROWTYPE;
  v_committed bigint := 0;
BEGIN
  IF COALESCE(auth.role()::text, '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  IF p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'reservation id is required' USING ERRCODE = '22023';
  END IF;
  IF v_key IS NULL OR v_key = '' OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotency key must contain 1 to 200 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_charged_microusd IS NULL OR p_charged_microusd < 0 THEN
    RAISE EXCEPTION 'charged micro-USD must be nonnegative'
      USING ERRCODE = '22023';
  END IF;

  SELECT l.*
    INTO v_reservation
    FROM public.caption_model_budget_ledger AS l
   WHERE l.reservation_id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'caption model reservation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_reservation.idempotency_key <> v_key THEN
    RAISE EXCEPTION 'idempotency key does not own this reservation'
      USING ERRCODE = '22023';
  END IF;
  IF p_charged_microusd > v_reservation.reserved_microusd THEN
    RAISE EXCEPTION 'charged micro-USD exceeds reserved micro-USD'
      USING ERRCODE = '22023';
  END IF;

  IF v_reservation.status = 'settled' THEN
    IF v_reservation.charged_microusd <> p_charged_microusd THEN
      RAISE EXCEPTION 'settlement replay disagrees with the committed charge'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    UPDATE public.caption_model_budget_ledger AS l
       SET status = 'settled',
           charged_microusd = p_charged_microusd,
           settled_at = clock_timestamp()
     WHERE l.reservation_id = p_reservation_id;
  END IF;

  SELECT COALESCE(sum(
    CASE WHEN l.status = 'settled' THEN l.charged_microusd ELSE l.reserved_microusd END
  ), 0)::bigint
    INTO v_committed
    FROM public.caption_model_budget_ledger AS l
   WHERE l.budget_date = v_reservation.budget_date;

  settled := true;
  charged_microusd := p_charged_microusd;
  committed_microusd := v_committed;
  RETURN NEXT;
END
$function$;

COMMENT ON TABLE public.caption_model_budget_settings IS
  'Fleet Phase 2 caption model gate and UTC daily micro-USD cap. The seeded row is disabled, unconfigured and zero-budget.';
COMMENT ON TABLE public.caption_model_budget_ledger IS
  'Append-only reservation identities for caption provider spend. Reserved rows remain worst-case committed until an explicit bounded settlement.';
COMMENT ON FUNCTION public.reserve_caption_model_budget(text) IS
  'Service-only atomic caption spend reservation. Duplicate means the provider must not be called again.';
COMMENT ON FUNCTION public.settle_caption_model_budget(uuid, text, bigint) IS
  'Service-only idempotent bounded settlement. Unknown provider outcomes intentionally remain reserved.';

REVOKE ALL ON FUNCTION public.reserve_caption_model_budget(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_caption_model_budget(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_caption_model_budget(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_caption_model_budget(uuid, text, bigint) TO service_role;

-- 3. POST-APPLY ASSERTIONS
DO $postapply$
DECLARE
  v_count integer;
  v_enabled boolean;
  v_daily bigint;
  v_request bigint;
  v_provider text;
  v_model text;
  v_qualified_at timestamptz;
  v_qualified_model text;
  v_qualified_reservation bigint;
BEGIN
  SELECT count(*), bool_or(enabled), max(daily_budget_microusd),
         max(request_reservation_microusd), max(provider), max(model),
         max(provider_qualified_at), max(provider_qualified_model),
         max(provider_qualified_reservation_microusd)
    INTO v_count, v_enabled, v_daily, v_request, v_provider, v_model,
         v_qualified_at, v_qualified_model, v_qualified_reservation
    FROM public.caption_model_budget_settings;

  IF v_count <> 1 OR COALESCE(v_enabled, true) OR v_daily <> 0 OR v_request <> 0
     OR v_provider IS NOT NULL OR v_model IS NOT NULL
     OR v_qualified_at IS NOT NULL OR v_qualified_model IS NOT NULL
     OR v_qualified_reservation IS NOT NULL THEN
    RAISE EXCEPTION 'post-apply failed: caption model settings are not fail-closed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'caption_model_budget_settings'
       AND c.relrowsecurity AND c.relforcerowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'caption_model_budget_ledger'
       AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'post-apply failed: caption budget tables must force RLS';
  END IF;

  IF has_table_privilege('anon', 'public.caption_model_budget_settings', 'SELECT')
     OR has_table_privilege('authenticated', 'public.caption_model_budget_settings', 'SELECT')
     OR has_table_privilege('anon', 'public.caption_model_budget_ledger', 'SELECT')
     OR has_table_privilege('authenticated', 'public.caption_model_budget_ledger', 'SELECT') THEN
    RAISE EXCEPTION 'post-apply failed: browser roles can read caption budget state';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.caption_model_budget_settings', 'SELECT')
     OR has_table_privilege('service_role', 'public.caption_model_budget_settings', 'UPDATE')
     OR has_table_privilege('service_role', 'public.caption_model_budget_ledger', 'SELECT')
     OR has_table_privilege('service_role', 'public.caption_model_budget_ledger', 'INSERT')
     OR has_table_privilege('service_role', 'public.caption_model_budget_ledger', 'UPDATE')
     OR has_table_privilege('service_role', 'public.caption_model_budget_ledger', 'DELETE') THEN
    RAISE EXCEPTION 'post-apply failed: service role table access exceeds settings read-only';
  END IF;

  IF has_function_privilege('anon', 'public.reserve_caption_model_budget(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reserve_caption_model_budget(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.settle_caption_model_budget(uuid,text,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.settle_caption_model_budget(uuid,text,bigint)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.reserve_caption_model_budget(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.settle_caption_model_budget(uuid,text,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply failed: caption budget RPC grants are not service-only';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('reserve_caption_model_budget', 'settle_caption_model_budget')
       AND (NOT p.prosecdef OR NOT (p.proconfig @> ARRAY['search_path=pg_catalog, public, extensions']))
  ) THEN
    RAISE EXCEPTION 'post-apply failed: caption budget RPC security is not pinned';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'content_settings' AND column_name = 'ai_model'
  ) THEN
    RAISE EXCEPTION 'post-apply failed: legacy content_settings.ai_model changed';
  END IF;
END
$postapply$;

COMMIT;

-- ============================================================================
-- ROLLBACK (Tier 3; apply only as a NEW forward migration before any worker
-- consumes a reservation. Never edit this migration after installation.)
-- ============================================================================
-- BEGIN;
-- DROP FUNCTION public.settle_caption_model_budget(uuid, text, bigint);
-- DROP FUNCTION public.reserve_caption_model_budget(text);
-- DROP TABLE public.caption_model_budget_ledger;
-- DROP TABLE public.caption_model_budget_settings;
-- COMMIT;
