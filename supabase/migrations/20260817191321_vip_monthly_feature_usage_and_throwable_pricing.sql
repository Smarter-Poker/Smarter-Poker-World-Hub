-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-17 via mcp apply_migration
-- (version 20260817191321, name vip_monthly_feature_usage_and_throwable_pricing)
-- This file is a mirror of the applied migration, extracted verbatim from
-- supabase_migrations.schema_migrations. Do not re-run against production.
-- ═══════════════════════════════════════════════════════════════════════════
-- VIP PERKS: the monthly quota model existed only as commentary.
--
-- checkVIPQuota() gates VIP freebies (e.g. 120 free time-bank seconds/month)
-- on getMonthlyUsage() — which by its own comment reads NOTHING (limit(0))
-- because vip_monthly_usage has no per-feature columns. So VIP usage never
-- depletes a quota, and the diamond top-up path can never trigger. Meanwhile
-- fn_increment_vip_usage (filled 2026-08-17) records into vip_feature_usage,
-- which has lifetime + daily counters but nothing month-scoped.
--
-- This adds the month-scoped ledger and makes fn_increment_vip_usage write
-- it in the same statement, so the client's quota read has a real source.
--
-- Also seeds feature_pricing with 'throwable' (1 diamond, per_use):
-- VIPCardsModal lists throwables as a VIP perk and the client pricing map
-- carries it, but fn_purchase_feature('throwable') answered
-- "unknown feature" because the server price row was missing.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vip_feature_usage_monthly (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature     text NOT NULL,
  month       text NOT NULL,               -- 'YYYY-MM' UTC
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature, month)
);
ALTER TABLE public.vip_feature_usage_monthly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vip_feature_usage_monthly_read_own ON public.vip_feature_usage_monthly;
CREATE POLICY vip_feature_usage_monthly_read_own ON public.vip_feature_usage_monthly
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
-- writes only through fn_increment_vip_usage

CREATE OR REPLACE FUNCTION public.fn_increment_vip_usage(p_user_id uuid, p_feature text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Cannot record VIP usage for another user';
  END IF;

  INSERT INTO public.vip_feature_usage (user_id, feature, usage_count, daily_usage, last_used_at, last_reset_at)
  VALUES (p_user_id, p_feature, 1, 1, now(), (now() AT TIME ZONE 'UTC')::date)
  ON CONFLICT (user_id, feature) DO UPDATE
     SET usage_count  = vip_feature_usage.usage_count + 1,
         daily_usage  = CASE WHEN vip_feature_usage.last_reset_at < (now() AT TIME ZONE 'UTC')::date
                             THEN 1 ELSE vip_feature_usage.daily_usage + 1 END,
         last_reset_at = GREATEST(vip_feature_usage.last_reset_at, (now() AT TIME ZONE 'UTC')::date),
         last_used_at  = now();

  INSERT INTO public.vip_feature_usage_monthly (user_id, feature, month, usage_count, updated_at)
  VALUES (p_user_id, p_feature, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'), 1, now())
  ON CONFLICT (user_id, feature, month) DO UPDATE
     SET usage_count = vip_feature_usage_monthly.usage_count + 1,
         updated_at  = now();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_increment_vip_usage(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_increment_vip_usage(uuid, text) TO authenticated, service_role;

INSERT INTO public.feature_pricing (feature, diamond_cost, usage_type)
VALUES ('throwable', 1, 'per_use')
ON CONFLICT (feature) DO NOTHING;

-- ── Probes ────────────────────────────────────────────────────────────────
DO $probe$
DECLARE v_user uuid; n int; m int;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at DESC LIMIT 1;
  IF v_user IS NULL THEN RAISE NOTICE 'no users; skipping'; RETURN; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  PERFORM public.fn_increment_vip_usage(v_user, ':vip_probe:');
  PERFORM public.fn_increment_vip_usage(v_user, ':vip_probe:');

  SELECT usage_count INTO n FROM public.vip_feature_usage
   WHERE user_id = v_user AND feature = ':vip_probe:';
  SELECT usage_count INTO m FROM public.vip_feature_usage_monthly
   WHERE user_id = v_user AND feature = ':vip_probe:'
     AND month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');

  IF n <> 2 THEN RAISE EXCEPTION 'lifetime counter % expected 2', n; END IF;
  IF m <> 2 THEN RAISE EXCEPTION 'monthly counter % expected 2', m; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.feature_pricing WHERE feature='throwable' AND diamond_cost=1) THEN
    RAISE EXCEPTION 'throwable pricing row missing';
  END IF;

  DELETE FROM public.vip_feature_usage WHERE user_id = v_user AND feature = ':vip_probe:';
  DELETE FROM public.vip_feature_usage_monthly WHERE user_id = v_user AND feature = ':vip_probe:';
  RAISE NOTICE 'VIP monthly usage probes passed: both counters at 2, throwable priced';
END
$probe$;
