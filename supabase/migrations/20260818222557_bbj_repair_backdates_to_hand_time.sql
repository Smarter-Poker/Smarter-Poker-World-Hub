-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-18 via mcp apply_migration
-- (version 20260818222557, name bbj_repair_backdates_to_hand_time)
-- Supersedes 20260818222058_bbj_self_heal_unbanked_fees (same function, this
-- is the authoritative body). Mirror only. Do not re-run.
-- ═══════════════════════════════════════════════════════════════════════════
-- Refinement of fn_bbj_repair_unbanked (same day): stamp the recovered
-- contribution with the ORIGINAL hand's rake timestamp, not the repair time.
--
-- Probed on the live backlog: repairing with created_at = now() banked the
-- money correctly but left the windowed drift audit still reading 2.00,
-- because the recovered row fell outside the audit's closed window while the
-- rake row stayed inside it. The alarm would have kept firing on
-- already-fixed hands until the window rolled past them — an audit that cries
-- wolf about money you already recovered is worse than no audit.
--
-- Backdating is also the honest ledger entry: the fee was collected when the
-- hand was played, and every downstream report (daily contribution totals,
-- fn_bbj_analytics funding rate) buckets by created_at.

CREATE OR REPLACE FUNCTION public.fn_bbj_repair_unbanked(
  p_since_hours integer DEFAULT 48,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  hand_id uuid,
  table_id uuid,
  club_id uuid,
  pool_id uuid,
  amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_pool_id uuid;
  v_main numeric;
  v_backup numeric;
  v_promo numeric;
  v_ratio_main numeric;
  v_ratio_backup numeric;
  v_current_main numeric;
  v_inserted uuid;
BEGIN
  FOR r IN
    SELECT rr.hand_id AS h_id, rr.table_id AS t_id, rr.club_id AS c_id,
           SUM(rr.bbj_contribution) AS amt,
           MAX(COALESCE((rr.metadata->>'big_blind')::numeric, 0)) AS bb,
           MIN(rr.created_at) AS hand_at
    FROM public.rake_records rr
    WHERE rr.hand_id IS NOT NULL
      AND COALESCE(rr.bbj_contribution, 0) > 0
      AND rr.created_at > now() - make_interval(hours => p_since_hours)
      AND rr.created_at < now() - interval '5 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM public.bbj_contributions bc WHERE bc.hand_id = rr.hand_id
      )
    GROUP BY rr.hand_id, rr.table_id, rr.club_id
    ORDER BY MIN(rr.created_at)
    LIMIT p_limit
  LOOP
    SELECT bp.id, bp.main_balance INTO v_pool_id, v_current_main
    FROM public.bbj_pools bp
    WHERE bp.status = 'active'
      AND (
        bp.union_id = (SELECT c.union_id FROM public.clubs c WHERE c.id = r.c_id)
        OR (bp.club_id = r.c_id
            AND (SELECT c.union_id FROM public.clubs c WHERE c.id = r.c_id) IS NULL)
      )
    ORDER BY (bp.union_id IS NOT NULL) DESC
    LIMIT 1;

    CONTINUE WHEN v_pool_id IS NULL;

    IF COALESCE(v_current_main, 0) >= 100000 THEN
      v_ratio_main := 0.30; v_ratio_backup := 0.40;
    ELSE
      v_ratio_main := 0.50; v_ratio_backup := 0.25;
    END IF;

    v_main   := ROUND(r.amt * v_ratio_main, 2);
    v_backup := ROUND(r.amt * v_ratio_backup, 2);
    v_promo  := ROUND(r.amt, 2) - v_main - v_backup;

    WITH ins AS (
      INSERT INTO public.bbj_contributions (
        pool_id, hand_id, table_id, club_id, amount,
        main_portion, backup_portion, promo_portion, big_blind, hand_number,
        created_at
      )
      SELECT v_pool_id, r.h_id, r.t_id, r.c_id, r.amt,
             v_main, v_backup, v_promo, NULLIF(r.bb, 0), NULL,
             r.hand_at   -- backdated to the hand, see header
      WHERE NOT EXISTS (
        SELECT 1 FROM public.bbj_contributions bc WHERE bc.hand_id = r.h_id
      )
      RETURNING id
    ),
    upd AS (
      UPDATE public.bbj_pools bp
      SET main_balance      = bp.main_balance + v_main,
          backup_balance    = bp.backup_balance + v_backup,
          promo_balance     = bp.promo_balance + v_promo,
          total_contributed = COALESCE(bp.total_contributed, 0) + r.amt,
          hands_contributed = COALESCE(bp.hands_contributed, 0) + 1,
          updated_at        = now()
      FROM ins
      WHERE bp.id = v_pool_id
      RETURNING bp.id
    )
    SELECT ins.id INTO v_inserted FROM ins;

    IF v_inserted IS NOT NULL THEN
      hand_id := r.h_id; table_id := r.t_id; club_id := r.c_id;
      pool_id := v_pool_id; amount := r.amt;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_bbj_repair_unbanked(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_bbj_repair_unbanked(integer, integer) TO service_role;