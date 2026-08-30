-- ─────────────────────────────────────────────────────────────────────────────
-- THE TTLs MUST ALSO REACH A TABLE NOTHING IS HAPPENING AT (Dan 2026-08-30)
--
-- `fn_offer_open_seat` expires lapsed offers and abandoned queue rows, which is
-- the right place for it: that is the only path that turns a queue row into an
-- interrupt, so a row cannot outlive its expiry by the width of a scheduler
-- window. But it only runs WHEN A SEAT OPENS AT THAT TABLE.
--
-- On a table nobody leaves, nothing runs. Two consequences, both visible:
--
--   1. THE LOBBY OVERSTATES THE QUEUE. "Waiting 6" counts `waiting` rows, so a
--      table quiet for a week advertises a line made of people who left. That
--      is a number players use to choose a game.
--   2. AN OFFER LAPSES IN SILENCE, FOREVER. The player whose three minutes ran
--      out is only told when the NEXT seat opens at that table. If none ever
--      does, they are never told at all.
--
-- This is the recurring half, and it is deliberately the SAME two rules rather
-- than a second opinion about them — it calls no new logic, it just reaches the
-- tables the offer path cannot. Per CLAUDE.md section 11 it is scheduled from
-- Open Claw (pages/api/cron/waitlist-sweep.js), never vercel.json.
--
-- WHY THE FUNCTION LIVES HERE rather than beside fn_offer_open_seat in the
-- club-arena repo: the caller is a World Hub cron route, and a migration whose
-- only consumer is in another repo is the shape that goes stale unnoticed. The
-- rules it enforces are documented in both places.
--
-- ROLLBACK: DROP FUNCTION IF EXISTS public.fn_sweep_stale_waitlists(interval, interval);
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_sweep_stale_waitlists(
  p_offer_ttl interval DEFAULT interval '3 minutes',
  p_entry_ttl interval DEFAULT interval '24 hours'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_offers_expired  int := 0;
  v_entries_expired int := 0;
  v_seated_retired  int := 0;
BEGIN
  -- 1. LAPSED OFFERS, and the player is told. Same notification and the same
  --    '_push' bell-only marker as fn_offer_open_seat, so a sweep and an offer
  --    cannot disagree about what an expiry looks like.
  WITH dead AS (
    UPDATE public.table_waitlist w
       SET status = 'expired'
     WHERE w.status = 'notified'
       AND w.notified_at < now() - p_offer_ttl
    RETURNING w.user_id, w.table_id
  )
  INSERT INTO public.notifications (user_id, type, title, message, data)
  SELECT d.user_id,
         'waitlist_offer_expired',
         'Seat Offer Expired',
         'Your Seat At ' || COALESCE(t.name, 'The Table') ||
           ' Went To The Next Player In Line. Join The Waitlist Again To Get Back In.',
         jsonb_build_object('table_id', d.table_id, '_push', 'skip')
    FROM dead d
    LEFT JOIN public.tables t ON t.id = d.table_id;
  GET DIAGNOSTICS v_offers_expired = ROW_COUNT;

  -- 2. ABANDONED PLACES IN LINE.
  UPDATE public.table_waitlist
     SET status = 'expired'
   WHERE status = 'waiting'
     AND created_at < now() - p_entry_ttl;
  GET DIAGNOSTICS v_entries_expired = ROW_COUNT;

  -- 3. QUEUE ROWS HELD BY SOMEBODY ALREADY SITTING AT THAT TABLE. Left behind
  --    by anyone who took a seat by a route other than the offer itself.
  UPDATE public.table_waitlist w
     SET status = 'seated'
   WHERE w.status = 'waiting'
     AND EXISTS (
       SELECT 1 FROM public.table_seats s
        WHERE s.table_id = w.table_id
          AND s.left_at IS NULL
          AND s.user_id = w.user_id
     );
  GET DIAGNOSTICS v_seated_retired = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'offers_expired', v_offers_expired,
    'entries_expired', v_entries_expired,
    'seated_retired', v_seated_retired
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_sweep_stale_waitlists(interval, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_sweep_stale_waitlists(interval, interval) FROM anon;
REVOKE ALL ON FUNCTION public.fn_sweep_stale_waitlists(interval, interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sweep_stale_waitlists(interval, interval) TO service_role;

COMMENT ON FUNCTION public.fn_sweep_stale_waitlists(interval, interval) IS
  'The recurring half of the waitlist TTLs. fn_offer_open_seat applies the same two rules but only when a seat opens at that table, so a quiet table keeps stale rows: the lobby overstates its queue and a lapsed offer is never announced. Called by pages/api/cron/waitlist-sweep.js on Open Claw. Added 2026-08-30.';

-- Post-apply: create, then run it for real. This one IS safe to execute
-- (unlike a money path, per CLAUDE.md 11.5) — it only expires rows the TTLs
-- already condemn, which is exactly what its schedule will do every run.
DO $$
DECLARE v_res jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_sweep_stale_waitlists'
  ) THEN
    RAISE EXCEPTION 'post-apply failed: fn_sweep_stale_waitlists was not created';
  END IF;

  SELECT public.fn_sweep_stale_waitlists() INTO v_res;
  IF COALESCE(v_res ->> 'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'post-apply failed: first sweep answered %', v_res;
  END IF;
  RAISE NOTICE 'first waitlist sweep: %', v_res;
END $$;
