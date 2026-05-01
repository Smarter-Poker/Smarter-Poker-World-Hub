-- ═══════════════════════════════════════════════════════════════════════════
-- 20260430 — Consolidate add_diamonds_to_balance overloads
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ROOT CAUSE for intermittent /api/rewards/daily-login 500s
-- (and likely other diamond-credit handlers):
--
-- The function add_diamonds_to_balance has THREE overloads:
--
--   1) (uuid, integer, text DEFAULT 'bonus', text DEFAULT NULL,
--       text DEFAULT NULL)               → jsonb   (idempotent, the canonical one)
--   2) (uuid, integer, text DEFAULT 'reward', text DEFAULT '',
--       uuid DEFAULT NULL)               → integer (legacy, no idempotency)
--   3) (uuid, integer)                   → void    (legacy, no logging)
--
-- Every API handler in pages/api/rewards/* calls with named args
-- { p_user_id, p_amount, p_type, p_description, p_reference_id }.
-- When p_reference_id is a stringified id like
-- "daily_login_<uuid>_2026-04-30", PostgREST has to choose between
-- overloads 1 and 2 — and on ambiguous resolution returns
-- "could not choose a candidate function (HINT: ...)".
--
-- This causes /api/rewards/daily-login to 500 every 30–90 minutes
-- in production logs. The handler's rollback path then deletes the
-- claim row so the next click works — but the user sees an error
-- toast instead of getting their diamonds.
--
-- We also have 20 profiles where `diamonds` and `diamond_balance`
-- have drifted apart by varying amounts (sum diff ≈ 508k):
--   sum(diamonds)         = 2,055,700
--   sum(diamond_balance)  = 1,547,071
-- Caused by overloads 1 (updates `diamonds` only) and 3 (updates
-- both columns) writing to different sources of truth depending
-- on which overload PostgREST happens to pick.
--
-- THIS MIGRATION:
--   • Drops overloads 2 and 3 so resolution is unambiguous
--   • Updates overload 1 to write BOTH `diamonds` and
--     `diamond_balance` in the same UPDATE so they stay in sync
--   • Reconciles the 20 desynced profiles to the higher value
--     (giving users the benefit of any drift)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Step 1: Reconcile diamonds/diamond_balance ────────────────────────
-- Some profiles got credits through overload 1 only (`diamonds`),
-- others through overload 3 (both). Take the larger of the two so
-- nobody loses credit they earned.
UPDATE profiles
SET
    diamonds         = GREATEST(COALESCE(diamonds, 0), COALESCE(diamond_balance, 0)),
    diamond_balance  = GREATEST(COALESCE(diamonds, 0), COALESCE(diamond_balance, 0)),
    updated_at       = now()
WHERE COALESCE(diamonds, 0) <> COALESCE(diamond_balance, 0);

-- ─── Step 2: Drop ambiguous overloads ──────────────────────────────────
-- These exist for legacy reasons; modern callers all use the 5-arg
-- text/text/text variant in overload 1.
DROP FUNCTION IF EXISTS public.add_diamonds_to_balance(uuid, integer);
DROP FUNCTION IF EXISTS public.add_diamonds_to_balance(uuid, integer, text, text, uuid);

-- ─── Step 3: Recreate the canonical overload — same signature, but
-- now also updates `diamond_balance` so the two columns stay in sync.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_diamonds_to_balance(
    p_user_id      uuid,
    p_amount       integer,
    p_type         text DEFAULT 'bonus'::text,
    p_description  text DEFAULT NULL::text,
    p_reference_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_old_balance integer;
    v_new_balance integer;
    v_txn_id      uuid;
BEGIN
    -- Idempotency check: if a transaction with this reference_id already
    -- exists, return success-with-duplicate so retries don't double-credit.
    IF p_reference_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM diamond_transactions
            WHERE reference_id = p_reference_id
        ) THEN
            RETURN jsonb_build_object(
                'success',  false,
                'error',    'Duplicate reference_id: ' || p_reference_id,
                'duplicate', true
            );
        END IF;
    END IF;

    -- Lock the profile row, read current balance.
    SELECT COALESCE(diamonds, 0) INTO v_old_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    v_new_balance := v_old_balance + p_amount;

    IF v_new_balance < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
    END IF;

    -- Update BOTH `diamonds` and `diamond_balance` so they stay in sync.
    -- The previous version only updated `diamonds`, which let the two
    -- columns drift when the legacy 2-arg overload also fired.
    UPDATE profiles
    SET diamonds        = v_new_balance,
        diamond_balance = v_new_balance,
        updated_at      = now()
    WHERE id = p_user_id;

    INSERT INTO diamond_transactions (
        user_id, amount, transaction_type, type, description,
        balance_after, reference_id, metadata
    ) VALUES (
        p_user_id, p_amount, p_type, p_type, p_description,
        v_new_balance, p_reference_id,
        CASE WHEN p_reference_id IS NOT NULL
            THEN jsonb_build_object('reference_id', p_reference_id)
            ELSE '{}'::jsonb
        END
    ) RETURNING id INTO v_txn_id;

    RETURN jsonb_build_object(
        'success',        true,
        'old_balance',    v_old_balance,
        'new_balance',    v_new_balance,
        'transaction_id', v_txn_id
    );
END;
$function$;

-- ─── Step 4: Make the schema cache reload — PostgREST caches function
-- resolutions, so without a NOTIFY new requests would still try the old
-- ambiguous set. ──────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
