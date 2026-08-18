-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-18 via mcp apply_migration
-- (version 20260818170329, name retire_workers_bbj_parallel_payer)
-- Mirror of the applied migration. Do not re-run against production.
-- Companions: CA 227e1a787 (detector rules), workers 16d7e8c (scan removed).
-- ═══════════════════════════════════════════════════════════════════════════
-- BBJ AUDIT 2026-08-18: retire the workers' parallel BBJ payer - it was a
-- second, WRONG implementation that must never wake up.
--
-- The engine's bbj_atomic_payout_v2 is the sole production payer (39/39
-- live payouts, claim-key idempotent, per-recipient credit re-drive,
-- stakes-tiered percentages, table-stack credits). The workers' path was:
--
-- fn_bbj_check_eligible: matched players.best_hand_label LIKE
--   '%four of a kind%aces%' - a field the engine NEVER writes (so the path
--   was inert), and if it ever matched it would have treated the QUAD-ACES
--   HOLDER as the "loser" WITHOUT checking they lost (it would pay the pot
--   winner as a bad-beat victim), ignored every qualification (no min pot,
--   no min players, no variant rules, no both-cards-play), and could not
--   resolve union pools (JOIN on bp.club_id only).
-- fn_bbj_payout: drained the DEAD legacy column pool_amount (garbage
--   values), had NO idempotency (no (pool,table,hand) claim - a retry
--   double-pays), credited wallets instead of table stacks (Dan's rule:
--   chips are credited AT THE TABLE), and split 50% to the pot WINNER
--   (backwards - the bad-beat holder gets 50%).
--
-- Both now return inert results with a clear reason. Definitions preserved
-- in git history; the workers' bbj-detect cron keeps its promo-sweep duty.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_bbj_check_eligible(p_hand_id uuid)
RETURNS jsonb
LANGUAGE sql
SET search_path TO 'public'
AS $function$
  -- RETIRED 2026-08-18 (BBJ audit §40): the engine's detectBBJHit +
  -- bbj_atomic_payout_v2 are the sole detector/payer. This function was a
  -- wrong parallel rules engine (see migration header). Always NULL.
  SELECT NULL::jsonb;
$function$;

CREATE OR REPLACE FUNCTION public.fn_bbj_payout(
  p_pool_id uuid, p_hand_id uuid, p_table_id uuid,
  p_winner_user_id uuid, p_loser_user_id uuid, p_table_player_ids uuid[])
RETURNS jsonb
LANGUAGE sql
SET search_path TO 'public'
AS $function$
  -- RETIRED 2026-08-18 (BBJ audit §40): bbj_atomic_payout_v2 is the sole
  -- payer. This one drained the dead pool_amount column, had no idempotency,
  -- credited wallets instead of table stacks, and split 50% to the wrong
  -- player. Refuses permanently.
  SELECT jsonb_build_object('success', false, 'error', 'retired_path_use_bbj_atomic_payout_v2');
$function$;

REVOKE ALL ON FUNCTION public.fn_bbj_check_eligible(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_bbj_check_eligible(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_bbj_payout(uuid,uuid,uuid,uuid,uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_bbj_payout(uuid,uuid,uuid,uuid,uuid,uuid[]) TO service_role;

-- ── Probes ─────────────────────────────────────────────────────────────────
DO $probe$
DECLARE
  v_pool uuid;
  v_before numeric;
  v_after numeric;
  v_res jsonb;
BEGIN
  SELECT id, main_balance INTO v_pool, v_before FROM bbj_pools LIMIT 1;
  IF v_pool IS NULL THEN RAISE NOTICE 'no pools; skipping'; RETURN; END IF;

  IF fn_bbj_check_eligible(gen_random_uuid()) IS NOT NULL THEN
    RAISE EXCEPTION 'retired check_eligible must return NULL';
  END IF;

  v_res := fn_bbj_payout(v_pool, gen_random_uuid(), gen_random_uuid(),
                         gen_random_uuid(), gen_random_uuid(), ARRAY[]::uuid[]);
  IF COALESCE((v_res->>'success')::boolean, true) THEN
    RAISE EXCEPTION 'retired payout must refuse, got %', v_res;
  END IF;

  SELECT main_balance INTO v_after FROM bbj_pools WHERE id = v_pool;
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'retired payout moved money: % -> %', v_before, v_after;
  END IF;

  RAISE NOTICE 'workers BBJ path retired: eligible=NULL, payout refuses, no money moved';
END
$probe$;
