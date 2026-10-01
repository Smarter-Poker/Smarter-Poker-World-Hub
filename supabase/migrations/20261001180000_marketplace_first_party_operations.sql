-- First-party Marketplace funnel receipts and operator summary.
-- TIER: 3 (commerce operations evidence)
-- No advertising identifier, IP address, browser fingerprint, or free-form
-- customer content is stored. The public write surface is a bounded API route;
-- database access remains service-role only.

BEGIN;

CREATE TABLE public.marketplace_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  session_id uuid NOT NULL,
  event_name text NOT NULL CHECK (event_name ~ '^store_[a-z0-9_]{1,64}$'),
  route text NOT NULL CHECK (
    route IN ('diamonds', 'vip', 'merch', 'rewards', 'club-shop', 'fulfillment', 'unknown')
  ),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(properties) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketplace_funnel_events_created_idx
  ON public.marketplace_funnel_events(created_at DESC);
CREATE INDEX marketplace_funnel_events_name_created_idx
  ON public.marketplace_funnel_events(event_name, created_at DESC);

ALTER TABLE public.marketplace_funnel_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_funnel_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.marketplace_funnel_events TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_operations_summary(
  p_since timestamptz DEFAULT (now() - interval '30 days')
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_funnel jsonb := '{}'::jsonb;
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'service_role_required');
  END IF;
  IF p_since IS NULL OR p_since < now() - interval '366 days' OR p_since > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_since');
  END IF;

  SELECT COALESCE(jsonb_object_agg(event_name, event_count), '{}'::jsonb)
    INTO v_funnel
    FROM (
      SELECT event_name, count(*)::integer AS event_count
        FROM public.marketplace_funnel_events
       WHERE created_at >= p_since
       GROUP BY event_name
       ORDER BY event_name
    ) counts;

  SELECT jsonb_build_object(
    'success', true,
    'since', p_since,
    'generatedAt', now(),
    'orders', jsonb_build_object(
      'created', count(*) FILTER (WHERE created_at >= p_since),
      'awaitingAttention', count(*) FILTER (
        WHERE status IN ('paid', 'processing', 'shipped')
          AND (
            COALESCE(metadata ->> 'fulfillment_mode', '') = 'manual'
            OR COALESCE(metadata ->> 'needs_review', 'false') = 'true'
          )
      ),
      'providerReview', count(*) FILTER (
        WHERE COALESCE(metadata ->> 'needs_review', 'false') = 'true'
      ),
      'delivered', count(*) FILTER (WHERE status = 'delivered' AND created_at >= p_since),
      'card', count(*) FILTER (
        WHERE payment_method IN ('stripe', 'card') AND created_at >= p_since
      ),
      'diamonds', count(*) FILTER (
        WHERE payment_method = 'diamonds' AND created_at >= p_since
      )
    ),
    'lifetimeVip', jsonb_build_object(
      'completedCardPurchases', (
        SELECT count(*) FROM public.vip_lifetime_purchases
         WHERE status = 'completed' AND completed_at >= p_since
      ),
      'monthlyLotsIssued', (
        SELECT count(*) FROM public.lifetime_vip_diamond_lots
         WHERE issued_at >= p_since
      ),
      'monthlyDiamondsIssued', (
        SELECT COALESCE(sum(granted_amount), 0) FROM public.lifetime_vip_diamond_lots
         WHERE issued_at >= p_since
      ),
      'monthlyDiamondsRemaining', (
        SELECT COALESCE(sum(remaining_amount), 0) FROM public.lifetime_vip_diamond_lots
         WHERE status = 'active'
      ),
      'expiringWithin30Days', (
        SELECT COALESCE(sum(remaining_amount), 0) FROM public.lifetime_vip_diamond_lots
         WHERE status = 'active'
           AND expires_at > now()
           AND expires_at <= now() + interval '30 days'
      )
    ),
    'funnel', v_funnel
  )
    INTO v_result
    FROM public.merchandise_orders;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_operations_summary(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_operations_summary(timestamptz)
  TO service_role;

DO $postcheck$
BEGIN
  IF to_regclass('public.marketplace_funnel_events') IS NULL
     OR to_regprocedure('public.marketplace_operations_summary(timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'post-apply failed: Marketplace operations authority is incomplete';
  END IF;
  IF has_table_privilege('authenticated', 'public.marketplace_funnel_events', 'SELECT') THEN
    RAISE EXCEPTION 'post-apply failed: raw Marketplace events are client-readable';
  END IF;
END
$postcheck$;

COMMENT ON TABLE public.marketplace_funnel_events IS
  'Privacy-minimized first-party Marketplace funnel receipts. No IP, fingerprint, or free-form customer content.';

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.marketplace_operations_summary(timestamptz);
-- DROP TABLE IF EXISTS public.marketplace_funnel_events;
-- COMMIT;
