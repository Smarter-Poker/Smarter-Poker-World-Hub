-- ============================================================================
-- Migration: Lock down remaining financial RPCs missed by initial lockdown
-- Date: 2026-03-03
--
-- BUG #160 (HIGH): record_insurance_transaction, add_bbj_contribution, and
--   close_table_session were added AFTER the lockdown migration and are
--   callable by any authenticated user via PostgREST.
-- ============================================================================

-- record_insurance_transaction — can fake insurance premiums/payouts
DO $$ BEGIN
  REVOKE ALL ON FUNCTION record_insurance_transaction(UUID, TEXT, UUID, NUMERIC, TEXT, JSONB)
    FROM PUBLIC;
  REVOKE ALL ON FUNCTION record_insurance_transaction(UUID, TEXT, UUID, NUMERIC, TEXT, JSONB)
    FROM anon;
  REVOKE ALL ON FUNCTION record_insurance_transaction(UUID, TEXT, UUID, NUMERIC, TEXT, JSONB)
    FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- add_bbj_contribution — can inflate BBJ pools
DO $$ BEGIN
  REVOKE ALL ON FUNCTION add_bbj_contribution(UUID, UUID, BIGINT, NUMERIC, NUMERIC, TEXT)
    FROM PUBLIC;
  REVOKE ALL ON FUNCTION add_bbj_contribution(UUID, UUID, BIGINT, NUMERIC, NUMERIC, TEXT)
    FROM anon;
  REVOKE ALL ON FUNCTION add_bbj_contribution(UUID, UUID, BIGINT, NUMERIC, NUMERIC, TEXT)
    FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- award_bbj — can trigger false BBJ payouts
DO $$ BEGIN
  REVOKE ALL ON FUNCTION award_bbj(UUID, UUID, BIGINT, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC)
    FROM PUBLIC;
  REVOKE ALL ON FUNCTION award_bbj(UUID, UUID, BIGINT, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC)
    FROM anon;
  REVOKE ALL ON FUNCTION award_bbj(UUID, UUID, BIGINT, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC)
    FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- close_table_session — can manipulate session records
DO $$ BEGIN
  REVOKE ALL ON FUNCTION close_table_session FROM PUBLIC;
  REVOKE ALL ON FUNCTION close_table_session FROM anon;
  REVOKE ALL ON FUNCTION close_table_session FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ============================================================================
-- BUG #162 (CRITICAL): fn_credit_diamonds not locked down
-- Any authenticated user can mint unlimited diamonds via PostgREST
-- ============================================================================
DO $$ BEGIN
  REVOKE ALL ON FUNCTION fn_credit_diamonds(UUID, NUMERIC) FROM PUBLIC;
  REVOKE ALL ON FUNCTION fn_credit_diamonds(UUID, NUMERIC) FROM anon;
  REVOKE ALL ON FUNCTION fn_credit_diamonds(UUID, NUMERIC) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Also check fn_credit_chips if not already locked
-- (it was in the original lockdown but let's be safe with the new 3-arg signature)
DO $$ BEGIN
  REVOKE ALL ON FUNCTION fn_credit_chips(UUID, UUID, NUMERIC) FROM PUBLIC;
  REVOKE ALL ON FUNCTION fn_credit_chips(UUID, UUID, NUMERIC) FROM anon;
  REVOKE ALL ON FUNCTION fn_credit_chips(UUID, UUID, NUMERIC) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- fn_credit_treasury and fn_debit_treasury
DO $$ BEGIN
  REVOKE ALL ON FUNCTION fn_credit_treasury(UUID, NUMERIC) FROM PUBLIC;
  REVOKE ALL ON FUNCTION fn_credit_treasury(UUID, NUMERIC) FROM anon;
  REVOKE ALL ON FUNCTION fn_credit_treasury(UUID, NUMERIC) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION fn_debit_treasury(UUID, NUMERIC) FROM PUBLIC;
  REVOKE ALL ON FUNCTION fn_debit_treasury(UUID, NUMERIC) FROM anon;
  REVOKE ALL ON FUNCTION fn_debit_treasury(UUID, NUMERIC) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ============================================================================
-- Additional RPCs that should only be called via API routes with settlement
-- lock checks. Direct PostgREST calls bypass settlement locks.
-- ============================================================================

-- fn_atomic_buyin: bypasses settlement lock if called directly
DO $$ BEGIN
  REVOKE ALL ON FUNCTION fn_atomic_buyin(UUID, UUID, NUMERIC, NUMERIC) FROM PUBLIC;
  REVOKE ALL ON FUNCTION fn_atomic_buyin(UUID, UUID, NUMERIC, NUMERIC) FROM anon;
  REVOKE ALL ON FUNCTION fn_atomic_buyin(UUID, UUID, NUMERIC, NUMERIC) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- fn_get_or_create_conversation: messaging system
DO $$ BEGIN
  REVOKE ALL ON FUNCTION fn_get_or_create_conversation(UUID, UUID) FROM PUBLIC;
  REVOKE ALL ON FUNCTION fn_get_or_create_conversation(UUID, UUID) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- fn_send_message: messaging system
DO $$ BEGIN
  REVOKE ALL ON FUNCTION fn_send_message(UUID, UUID, TEXT) FROM PUBLIC;
  REVOKE ALL ON FUNCTION fn_send_message(UUID, UUID, TEXT) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ============================================================================
-- Final sweep: 4 remaining unlocked RPCs
-- ============================================================================

-- fn_release_tournament_holds: already locked in its own migration file
-- (double-check — it has REVOKE at bottom of 20260303_fn_release_tournament_holds.sql)

-- get_promo_status: read-only but leaks promo balance data cross-club
DO $$ BEGIN
  REVOKE ALL ON FUNCTION get_promo_status(UUID, UUID) FROM PUBLIC;
  REVOKE ALL ON FUNCTION get_promo_status(UUID, UUID) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- mint_club_promo: creates promo chips from nothing
DO $$ BEGIN
  REVOKE ALL ON FUNCTION mint_club_promo(UUID, NUMERIC, UUID) FROM PUBLIC;
  REVOKE ALL ON FUNCTION mint_club_promo(UUID, NUMERIC, UUID) FROM anon;
  REVOKE ALL ON FUNCTION mint_club_promo(UUID, NUMERIC, UUID) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- record_promo_wagering: modifies promo chip tracking
DO $$ BEGIN
  REVOKE ALL ON FUNCTION record_promo_wagering(UUID, UUID, UUID, NUMERIC) FROM PUBLIC;
  REVOKE ALL ON FUNCTION record_promo_wagering(UUID, UUID, UUID, NUMERIC) FROM anon;
  REVOKE ALL ON FUNCTION record_promo_wagering(UUID, UUID, UUID, NUMERIC) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ============================================================================
-- Final sweep: remaining unlocked RPCs
-- ============================================================================

-- fn_release_tournament_holds: already locked in its own migration file
-- (REVOKE is at the bottom of 20260303_fn_release_tournament_holds.sql)

-- get_promo_status: READ-ONLY, safe for authenticated users to call
-- (returns promo balance and wagering progress for the calling user)

-- mint_club_promo: Creates promo chips - MUST be locked
DO $$ BEGIN
  REVOKE ALL ON FUNCTION mint_club_promo(UUID, NUMERIC, UUID) FROM PUBLIC;
  REVOKE ALL ON FUNCTION mint_club_promo(UUID, NUMERIC, UUID) FROM anon;
  REVOKE ALL ON FUNCTION mint_club_promo(UUID, NUMERIC, UUID) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- record_promo_wagering: Manipulates promo wagering state
DO $$ BEGIN
  REVOKE ALL ON FUNCTION record_promo_wagering(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
  REVOKE ALL ON FUNCTION record_promo_wagering(UUID, UUID, NUMERIC, TEXT) FROM anon;
  REVOKE ALL ON FUNCTION record_promo_wagering(UUID, UUID, NUMERIC, TEXT) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
