-- Anti-DUMPING support for /api/live/gift.
--
-- Applied to production first via Supabase MCP apply_migration
-- (name: live_gift_pair_concentration_support), mirrored here verbatim.
--
-- The gifting entrance was redesigned away from a flat per-sender cap (too
-- tight for honest earners, useless against farms) toward controls that
-- target the actual behaviour. This is the sender->recipient CONCENTRATION
-- lookup: a real supporter spreads gifts across streams, a dump points
-- everything at one account.
--
-- Done as an indexed SQL aggregate rather than fetching rows into the API,
-- so the check stays exact and O(index) instead of silently under-counting
-- behind a row limit (an under-count here would fail OPEN on the exact
-- funnel it exists to catch).
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.sum_live_gift_pair(uuid, uuid, timestamptz);
--   DROP INDEX IF EXISTS public.idx_live_gifts_sender_receiver_created;
-- (and remove the pair_concentration_cap guard from pages/api/live/gift.js,
--  which is the only caller)

CREATE INDEX IF NOT EXISTS idx_live_gifts_sender_receiver_created
  ON public.live_gifts (sender_id, receiver_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.sum_live_gift_pair(
    p_sender uuid,
    p_receiver uuid,
    p_start timestamptz
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(amount), 0)::bigint
    FROM public.live_gifts
   WHERE sender_id = p_sender
     AND receiver_id = p_receiver
     AND created_at >= p_start;
$$;

-- Least privilege: server-side anti-abuse accounting only. Never callable
-- from a browser — it would let any client enumerate gifting relationships.
REVOKE ALL ON FUNCTION public.sum_live_gift_pair(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sum_live_gift_pair(uuid, uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.sum_live_gift_pair(uuid, uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sum_live_gift_pair(uuid, uuid, timestamptz) TO service_role;

DO $$
DECLARE
    v_sum bigint;
    v_failed int;
BEGIN
    SELECT public.sum_live_gift_pair(
        '00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000002'::uuid,
        now() - interval '30 days') INTO v_sum;
    IF v_sum IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'sum_live_gift_pair smoke test returned %, expected 0', v_sum;
    END IF;

    IF has_function_privilege('anon', 'public.sum_live_gift_pair(uuid,uuid,timestamptz)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.sum_live_gift_pair(uuid,uuid,timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'sum_live_gift_pair must not be client-callable';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname='public' AND tablename='live_gifts'
                      AND indexname='idx_live_gifts_sender_receiver_created') THEN
        RAISE EXCEPTION 'pair index missing';
    END IF;

    SELECT COUNT(*) FILTER (WHERE NOT ok) INTO v_failed FROM public.economy_invariants();
    IF v_failed > 0 THEN
        RAISE EXCEPTION 'economy_invariants regressed: % failing', v_failed;
    END IF;
END $$;
