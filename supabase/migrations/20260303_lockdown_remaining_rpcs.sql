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
