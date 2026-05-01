-- ═══════════════════════════════════════════════════════════════════════
-- 20260501_drop_legacy_overloads_phase29_sweep.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3 (DROP FUNCTION × 3, money-moving surface)
-- AUTHOR:      Cowork agent
-- AFFECTS:     rpcs: add_to_player_wallet (uuid, numeric) variant
--                    deduct_agent_balance (uuid, numeric) variant
--                    log_wallet_transaction 6-arg uuid-returning variant
-- IRREVERSIBLE: yes (rollback section below w/ original SQL captured before drop)
--
-- WHY:
--   Sweep pass after the 20260501_drop_legacy_get_or_create_conversation
--   migration, which closed one Phase 29-class overload-ambiguity bomb.
--   An advisor query found 8 more public functions with multiple overloads
--   that return DIFFERENT TYPES — exactly the pattern that caused
--   /api/rewards/daily-login intermittent 500s before. Three of them are
--   money-moving (wallet/agent balance) and have either zero callers or
--   only callers passing the canonical signature. Drop their legacy
--   overloads to make PostgREST resolution unambiguous.
--
-- HOW (high level):
--   - DROP FUNCTION public.add_to_player_wallet(uuid, numeric)         (returns void)
--     Canonical kept: (uuid, uuid, numeric, text DEFAULT 'Credit')     → jsonb
--   - DROP FUNCTION public.deduct_agent_balance(uuid, numeric)         (returns void)
--     Canonical kept: (uuid, numeric, text DEFAULT 'Transfer')         → boolean
--   - DROP FUNCTION public.log_wallet_transaction(uuid, text, numeric, text, text, text)
--                                                                      (returns uuid)
--     Canonical kept: 9-arg variant with table_id/hand_id/related_entity_id → void
--
--   Verified beforehand:
--     - add_to_player_wallet legacy: 0 callers in any local source repo,
--       0 SQL-side callers (pg_proc body scan).
--     - deduct_agent_balance legacy: 0 callers in any local source repo,
--       0 SQL-side callers.
--     - log_wallet_transaction legacy 6-arg: 0 callers in code, and the
--       3 SQL-side callers (atomic_cancel_tournament, atomic_chip_transfer,
--       atomic_tournament_unregister) all pass 9 args to hit the canonical
--       overload — confirmed by snapshotting their bodies.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    v_legacy_atpw integer;
    v_canonical_atpw integer;
    v_legacy_dab integer;
    v_canonical_dab integer;
    v_legacy_lwt integer;
    v_canonical_lwt integer;
BEGIN
    SELECT COUNT(*) INTO v_legacy_atpw
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'add_to_player_wallet'
      AND pg_get_function_arguments(p.oid) = 'p_user_id uuid, p_amount numeric';
    SELECT COUNT(*) INTO v_canonical_atpw
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'add_to_player_wallet'
      AND pg_get_function_result(p.oid) = 'jsonb';

    SELECT COUNT(*) INTO v_legacy_dab
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'deduct_agent_balance'
      AND pg_get_function_arguments(p.oid) = 'p_agent_id uuid, p_amount numeric';
    SELECT COUNT(*) INTO v_canonical_dab
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'deduct_agent_balance'
      AND pg_get_function_result(p.oid) = 'boolean';

    SELECT COUNT(*) INTO v_legacy_lwt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'log_wallet_transaction'
      AND pg_get_function_result(p.oid) = 'uuid';
    SELECT COUNT(*) INTO v_canonical_lwt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'log_wallet_transaction'
      AND pg_get_function_result(p.oid) = 'void';

    IF v_legacy_atpw = 0 OR v_canonical_atpw = 0 THEN
        RAISE EXCEPTION 'add_to_player_wallet: pre-flight failed (legacy=% canonical=%)', v_legacy_atpw, v_canonical_atpw;
    END IF;
    IF v_legacy_dab = 0 OR v_canonical_dab = 0 THEN
        RAISE EXCEPTION 'deduct_agent_balance: pre-flight failed (legacy=% canonical=%)', v_legacy_dab, v_canonical_dab;
    END IF;
    IF v_legacy_lwt = 0 OR v_canonical_lwt = 0 THEN
        RAISE EXCEPTION 'log_wallet_transaction: pre-flight failed (legacy_uuid=% canonical_void=%)', v_legacy_lwt, v_canonical_lwt;
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.add_to_player_wallet(uuid, numeric);
DROP FUNCTION IF EXISTS public.deduct_agent_balance(uuid, numeric);
DROP FUNCTION IF EXISTS public.log_wallet_transaction(uuid, text, numeric, text, text, text);

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE v_atpw integer; v_dab integer; v_lwt integer;
BEGIN
    SELECT COUNT(*) INTO v_atpw FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'add_to_player_wallet';
    SELECT COUNT(*) INTO v_dab  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'deduct_agent_balance';
    SELECT COUNT(*) INTO v_lwt  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'log_wallet_transaction';
    IF v_atpw <> 1 THEN RAISE EXCEPTION 'add_to_player_wallet: expected 1 overload, got %', v_atpw; END IF;
    IF v_dab  <> 1 THEN RAISE EXCEPTION 'deduct_agent_balance: expected 1 overload, got %', v_dab;  END IF;
    IF v_lwt  <> 1 THEN RAISE EXCEPTION 'log_wallet_transaction: expected 1 overload, got %', v_lwt; END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste each into a NEW migration if needed; original bodies
-- captured from pg_get_functiondef BEFORE drop)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.add_to_player_wallet(p_user_id uuid, p_amount numeric)
--   RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
-- AS $$
-- BEGIN
--   UPDATE player_wallets SET balance = balance + p_amount, updated_at = NOW()
--     WHERE user_id = p_user_id AND wallet_type = 'PLAYER';
--   IF NOT FOUND THEN
--     INSERT INTO player_wallets (user_id, wallet_type, balance) VALUES (p_user_id, 'PLAYER', p_amount);
--   END IF;
-- END;
-- $$;
-- CREATE OR REPLACE FUNCTION public.deduct_agent_balance(p_agent_id uuid, p_amount numeric)
--   RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
-- AS $$
-- BEGIN
--   UPDATE agents SET business_balance = business_balance - p_amount, updated_at = NOW()
--     WHERE id = p_agent_id AND business_balance >= p_amount;
--   IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient agent balance or agent not found'; END IF;
-- END;
-- $$;
-- CREATE OR REPLACE FUNCTION public.log_wallet_transaction(
--   p_user_id uuid, p_wallet_type text, p_amount numeric, p_type text, p_category text,
--   p_description text DEFAULT NULL::text)
--   RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
-- AS $$
-- DECLARE v_id UUID; v_bal NUMERIC;
-- BEGIN
--   SELECT balance INTO v_bal FROM wallets WHERE user_id = p_user_id AND wallet_type = p_wallet_type;
--   INSERT INTO wallet_transactions (user_id, wallet_type, amount, type, category, description, balance_after)
--   VALUES (p_user_id, p_wallet_type, p_amount, p_type, p_category, p_description, COALESCE(v_bal, 0))
--   RETURNING id INTO v_id;
--   RETURN v_id;
-- END;
-- $$;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
