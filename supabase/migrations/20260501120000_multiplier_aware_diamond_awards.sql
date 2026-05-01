-- ═══════════════════════════════════════════════════════════════════════════
-- Multiplier-Aware add_diamonds_to_balance
-- Migration: 20260501120000_multiplier_aware_diamond_awards.sql
--
-- Upgrades add_diamonds_to_balance to READ profiles.diamond_multiplier and
-- apply it to every positive award. Negative amounts (deductions, purchases)
-- are never multiplied — only earnings.
--
-- Multiplier is applied at the DB layer so ALL callers (training, checkins,
-- achievements, challenges, daily-bonus, ai-hand-reader) get the boost
-- automatically with zero frontend changes.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.add_diamonds_to_balance(
    p_user_id      uuid,
    p_amount       integer,
    p_type         text DEFAULT 'bonus'::text,
    p_description  text DEFAULT NULL::text,
    p_reference_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_old_balance    integer;
    v_new_balance    integer;
    v_txn_id         uuid;
    v_multiplier     numeric(4,2) := 1.00;
    v_raw_amount     integer      := p_amount;
    v_actual_amount  integer;
BEGIN
    -- ── Idempotency guard ─────────────────────────────────────────────────
    IF p_reference_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM diamond_transactions
            WHERE reference_id = p_reference_id
        ) THEN
            RETURN jsonb_build_object(
                'success',   false,
                'error',     'Duplicate reference_id: ' || p_reference_id,
                'duplicate', true
            );
        END IF;
    END IF;

    -- ── Lock + read balance and multiplier together ───────────────────────
    SELECT COALESCE(diamonds, 0),
           COALESCE(diamond_multiplier, 1.00)
    INTO v_old_balance, v_multiplier
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    -- ── Apply multiplier ONLY to positive earnings (never to deductions) ──
    -- Excluded types: purchase, deduction, adjustment, refund, transfer
    IF v_raw_amount > 0
       AND p_type NOT IN ('purchase', 'deduction', 'adjustment', 'refund', 'transfer')
       AND v_multiplier > 1.00
    THEN
        v_actual_amount := ROUND(v_raw_amount * v_multiplier);
    ELSE
        v_actual_amount := v_raw_amount;
    END IF;

    v_new_balance := v_old_balance + v_actual_amount;

    IF v_new_balance < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
    END IF;

    -- ── Write balance ──────────────────────────────────────────────────────
    UPDATE profiles
    SET diamonds        = v_new_balance,
        diamond_balance = v_new_balance,
        updated_at      = now()
    WHERE id = p_user_id;

    -- ── Log transaction — include multiplier metadata when applied ─────────
    INSERT INTO diamond_transactions (
        user_id, amount, transaction_type, type, description,
        balance_after, reference_id, metadata
    ) VALUES (
        p_user_id, v_actual_amount, p_type, p_type,
        CASE
            WHEN v_actual_amount <> v_raw_amount
            THEN COALESCE(p_description, '') || format(' [%s× boost]', v_multiplier)
            ELSE p_description
        END,
        v_new_balance,
        p_reference_id,
        CASE
            WHEN v_actual_amount <> v_raw_amount
            THEN jsonb_build_object(
                    'reference_id',   p_reference_id,
                    'raw_amount',     v_raw_amount,
                    'multiplier',     v_multiplier,
                    'boosted_amount', v_actual_amount
                 )
            WHEN p_reference_id IS NOT NULL
            THEN jsonb_build_object('reference_id', p_reference_id)
            ELSE '{}'::jsonb
        END
    ) RETURNING id INTO v_txn_id;

    NOTIFY pgrst, 'reload schema';

    RETURN jsonb_build_object(
        'success',        true,
        'old_balance',    v_old_balance,
        'new_balance',    v_new_balance,
        'raw_amount',     v_raw_amount,
        'actual_amount',  v_actual_amount,
        'multiplier',     v_multiplier,
        'transaction_id', v_txn_id
    );
END;
$function$;

-- Re-grant (function replace resets grants)
GRANT EXECUTE ON FUNCTION public.add_diamonds_to_balance(uuid, integer, text, text, text)
    TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'Multiplier-aware add_diamonds_to_balance installed.'; END $$;
