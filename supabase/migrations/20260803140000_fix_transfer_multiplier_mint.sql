-- ═══════════════════════════════════════════════════════════════════════════
-- 20260803140000 — Stop peer transfers MINTING diamonds
-- ═══════════════════════════════════════════════════════════════════════════
--
-- THE BUG
--
-- add_diamonds_to_balance multiplies any positive credit by
-- profiles.diamond_multiplier unless p_type is on an exemption list
-- (20260501120000_multiplier_aware_diamond_awards.sql:63). That list covers
-- 'purchase', 'deduction', 'adjustment', 'refund' and 'transfer' — but the
-- peer transfer route does NOT use any of those types.
--
--   pages/api/store/diamond-transfer.js:632  credits p_type 'diamond_gift_received'
--   pages/api/store/diamond-transfer.js:620  refunds p_type 'diamond_gift_refund'
--   pages/api/live/gift.js                   credits the live-gift equivalent
--
-- Meanwhile deduct_diamonds debits EXACTLY the amount, unmultiplied
-- (20260505210000_strict_serialized_cooldown_deduct_diamonds.sql:97-107).
--
-- So for a recipient carrying a share-streak multiplier (1.20 / 1.50 / 1.75 /
-- 2.00 — 20260506112000_fix_share_streak_cst_anchor.sql:68-72):
--
--     sender debited  100
--     recipient credited 200      ← 100 diamonds = $1.00 created from nothing
--
-- At the 2,000-per-60s burst ceiling that is $20 of fabricated liability per
-- minute, per pair. The refund path is worse: a sender with a 2.00 multiplier
-- whose transfer FAILS is refunded 200 for a 100 debit, netting +100 on a
-- transaction that moved no money at all — repeatable at will.
--
-- THE FIX
--
-- A multiplier is an EARNINGS boost. It must never apply to money that already
-- exists and is merely changing hands. This adds every transfer-shaped type to
-- the exemption list. Earning types (daily_login, social_post, referral_*, …)
-- are untouched and still receive the streak boost as designed.
--
-- Idempotent: CREATE OR REPLACE of the same function signature.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

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
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_old_balance   integer;
    v_new_balance   integer;
    v_txn_id        uuid;
    v_multiplier    numeric(4,2) := 1.00;
    v_raw_amount    integer := p_amount;
    v_actual_amount integer;
BEGIN
    IF p_reference_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM diamond_transactions WHERE reference_id = p_reference_id) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Duplicate reference_id: ' || p_reference_id,
                'duplicate', true
            );
        END IF;
    END IF;

    SELECT COALESCE(diamonds, 0), COALESCE(diamond_multiplier, 1.00)
      INTO v_old_balance, v_multiplier
      FROM profiles
     WHERE id = p_user_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    -- Multiplier applies ONLY to genuine earnings.
    -- Money that already exists and is changing hands (transfers, gifts and
    -- their refunds) must move 1:1 or the platform mints currency.
    IF v_raw_amount > 0
       AND p_type NOT IN (
             'purchase', 'deduction', 'adjustment', 'refund', 'transfer',
             -- added 20260803140000 — see header
             'diamond_gift_received', 'diamond_gift_sent', 'diamond_gift_refund',
             'diamond_received', 'live_gift_received', 'live_gift_sent',
             'vip_daily', 'vip_stipend'
           )
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

    UPDATE profiles
       SET diamonds        = v_new_balance,
           diamond_balance = v_new_balance,
           updated_at      = now()
     WHERE id = p_user_id;

    INSERT INTO diamond_transactions (
        user_id, amount, transaction_type, type, description,
        balance_after, reference_id, metadata
    ) VALUES (
        p_user_id, v_actual_amount, p_type, p_type,
        CASE WHEN v_actual_amount <> v_raw_amount
             THEN COALESCE(p_description, '') || format(' [%sx boost]', v_multiplier)
             ELSE p_description END,
        v_new_balance, p_reference_id,
        jsonb_build_object(
            'reference_id', p_reference_id,
            'raw_amount',   v_raw_amount,
            'multiplier',   v_multiplier
        )
    ) RETURNING id INTO v_txn_id;

    RETURN jsonb_build_object(
        'success',        true,
        'old_balance',    v_old_balance,
        'new_balance',    v_new_balance,
        'amount',         v_actual_amount,
        'multiplier',     v_multiplier,
        'transaction_id', v_txn_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.add_diamonds_to_balance(uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_diamonds_to_balance(uuid, integer, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
