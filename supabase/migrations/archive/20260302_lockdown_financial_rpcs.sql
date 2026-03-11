-- ============================================================================
-- Migration: Lock down ALL financial RPCs to service_role only
-- Date: 2026-03-02
--
-- BUG #125 CRITICAL: All Club Arena financial RPCs are callable directly by
--   any authenticated Supabase user via PostgREST (/rest/v1/rpc/<name>).
--   No REVOKE/GRANT restrictions existed.
--
-- IMPACT: An authenticated user could call fn_credit_chips, distribute_chips,
--   unlock_chips_from_table, etc. to credit themselves unlimited chips,
--   drain club treasuries, or disrupt settlement.
--
-- FIX: REVOKE EXECUTE from public/anon/authenticated on all financial RPCs.
--   Only service_role (used by API routes with SUPABASE_SERVICE_ROLE_KEY)
--   can invoke these functions.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════
-- CHIP OPERATIONS — Most critical, direct balance manipulation
-- ═══════════════════════════════════════════════════════════════════

-- fn_credit_chips(club_id, user_id, amount) — NO internal auth
REVOKE ALL ON FUNCTION fn_credit_chips(UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_credit_chips(UUID, UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION fn_credit_chips(UUID, UUID, NUMERIC) FROM authenticated;

-- fn_debit_chips(club_id, user_id, amount) — has balance check but no caller auth
REVOKE ALL ON FUNCTION fn_debit_chips(UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_debit_chips(UUID, UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION fn_debit_chips(UUID, UUID, NUMERIC) FROM authenticated;

-- distribute_chips(club_id, to_user_id, amount, distributed_by) — NO caller check
REVOKE ALL ON FUNCTION distribute_chips(UUID, UUID, NUMERIC, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION distribute_chips(UUID, UUID, NUMERIC, UUID) FROM anon;
REVOKE ALL ON FUNCTION distribute_chips(UUID, UUID, NUMERIC, UUID) FROM authenticated;

-- mint_club_chips(club_id, amount, minted_by) — has owner check but lock down anyway
REVOKE ALL ON FUNCTION mint_club_chips(UUID, NUMERIC, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION mint_club_chips(UUID, NUMERIC, UUID) FROM anon;
REVOKE ALL ON FUNCTION mint_club_chips(UUID, NUMERIC, UUID) FROM authenticated;

-- lock_chips_for_table(user_id, club_id, table_id, amount)
REVOKE ALL ON FUNCTION lock_chips_for_table(UUID, UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION lock_chips_for_table(UUID, UUID, UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION lock_chips_for_table(UUID, UUID, UUID, NUMERIC) FROM authenticated;

-- unlock_chips_from_table(user_id, club_id, table_id, amount) — NO caller check
REVOKE ALL ON FUNCTION unlock_chips_from_table(UUID, UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION unlock_chips_from_table(UUID, UUID, UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION unlock_chips_from_table(UUID, UUID, UUID, NUMERIC) FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- AGENT/TRANSFER OPERATIONS
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION transfer_chips_agent_to_player(UUID, UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION transfer_chips_agent_to_player(UUID, UUID, UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION transfer_chips_agent_to_player(UUID, UUID, UUID, NUMERIC) FROM authenticated;

-- Promo transfers
DO $$ BEGIN
  REVOKE ALL ON FUNCTION transfer_promo_agent_to_player(UUID, UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
  REVOKE ALL ON FUNCTION transfer_promo_agent_to_player(UUID, UUID, UUID, NUMERIC, TEXT) FROM anon;
  REVOKE ALL ON FUNCTION transfer_promo_agent_to_player(UUID, UUID, UUID, NUMERIC, TEXT) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION transfer_promo_club_to_agent(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
  REVOKE ALL ON FUNCTION transfer_promo_club_to_agent(UUID, UUID, NUMERIC, TEXT) FROM anon;
  REVOKE ALL ON FUNCTION transfer_promo_club_to_agent(UUID, UUID, NUMERIC, TEXT) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION transfer_promo_union_to_club(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
  REVOKE ALL ON FUNCTION transfer_promo_union_to_club(UUID, UUID, NUMERIC, TEXT) FROM anon;
  REVOKE ALL ON FUNCTION transfer_promo_union_to_club(UUID, UUID, NUMERIC, TEXT) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION transfer_promo_union_to_agent(UUID, UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
  REVOKE ALL ON FUNCTION transfer_promo_union_to_agent(UUID, UUID, UUID, NUMERIC, TEXT) FROM anon;
  REVOKE ALL ON FUNCTION transfer_promo_union_to_agent(UUID, UUID, UUID, NUMERIC, TEXT) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- CASHOUT OPERATIONS
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  REVOKE ALL ON FUNCTION fn_request_cashout FROM PUBLIC;
  REVOKE ALL ON FUNCTION fn_request_cashout FROM anon;
  REVOKE ALL ON FUNCTION fn_request_cashout FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION fn_agent_approve_cashout FROM PUBLIC;
  REVOKE ALL ON FUNCTION fn_agent_approve_cashout FROM anon;
  REVOKE ALL ON FUNCTION fn_agent_approve_cashout FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION fn_cancel_cashout FROM PUBLIC;
  REVOKE ALL ON FUNCTION fn_cancel_cashout FROM anon;
  REVOKE ALL ON FUNCTION fn_cancel_cashout FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION fn_complete_cashout FROM PUBLIC;
  REVOKE ALL ON FUNCTION fn_complete_cashout FROM anon;
  REVOKE ALL ON FUNCTION fn_complete_cashout FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- RAKE / SETTLEMENT / BBJ
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION record_rake(TEXT, UUID, UUID, NUMERIC, NUMERIC, INTEGER, NUMERIC, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_rake(TEXT, UUID, UUID, NUMERIC, NUMERIC, INTEGER, NUMERIC, UUID[]) FROM anon;
REVOKE ALL ON FUNCTION record_rake(TEXT, UUID, UUID, NUMERIC, NUMERIC, INTEGER, NUMERIC, UUID[]) FROM authenticated;

REVOKE ALL ON FUNCTION calculate_cascading_commission(TEXT, UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION calculate_cascading_commission(TEXT, UUID, UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION calculate_cascading_commission(TEXT, UUID, UUID, NUMERIC) FROM authenticated;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION award_bbj FROM PUBLIC;
  REVOKE ALL ON FUNCTION award_bbj FROM anon;
  REVOKE ALL ON FUNCTION award_bbj FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION generate_period_settlement FROM PUBLIC;
  REVOKE ALL ON FUNCTION generate_period_settlement FROM anon;
  REVOKE ALL ON FUNCTION generate_period_settlement FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- DIAMOND OPERATIONS
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  REVOKE ALL ON FUNCTION add_diamonds_to_balance FROM PUBLIC;
  REVOKE ALL ON FUNCTION add_diamonds_to_balance FROM anon;
  REVOKE ALL ON FUNCTION add_diamonds_to_balance FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION redeem_promo_to_chips FROM PUBLIC;
  REVOKE ALL ON FUNCTION redeem_promo_to_chips FROM anon;
  REVOKE ALL ON FUNCTION redeem_promo_to_chips FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- HELPER/STATS (less critical but still lock down)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  REVOKE ALL ON FUNCTION update_table_stats(UUID, NUMERIC) FROM PUBLIC;
  REVOKE ALL ON FUNCTION update_table_stats(UUID, NUMERIC) FROM anon;
  REVOKE ALL ON FUNCTION update_table_stats(UUID, NUMERIC) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION decrement_club_table_count FROM PUBLIC;
  REVOKE ALL ON FUNCTION decrement_club_table_count FROM anon;
  REVOKE ALL ON FUNCTION decrement_club_table_count FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFY: service_role always has access (Supabase grants by default)
-- These are explicit just for documentation/safety
-- ═══════════════════════════════════════════════════════════════════
-- service_role inherits from postgres and has superuser-like access,
-- so no explicit GRANT is needed. The REVOKEs above only affect
-- anon/authenticated roles used by client-side PostgREST calls.
