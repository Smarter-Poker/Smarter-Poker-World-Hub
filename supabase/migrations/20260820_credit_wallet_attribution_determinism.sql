-- P1-2 (2026-08-20): atomic_credit_wallet_and_log club attribution fixes.
-- 1. The club_members lookup had no ORDER BY (arbitrary club for the 578
--    multi-club users). Now matches the P&L's attribution exactly:
--    DISTINCT-ON-equivalent ORDER BY joined_at ASC NULLS LAST, club_id.
-- 2. The last-resort fallback booked unattributable credits to SHARK CLUB
--    (a real member club). Now books to the Midway Union house container
--    club row instead — the house absorbs what cannot be attributed, not a
--    member club's books. The metadata marker is kept.
-- Note: 0 fallback rows in the last 7 days; the P&L attributes by the
-- user's club membership, not this column, so this affects club-level
-- bookkeeping/analytics only. Applied to production via Supabase MCP
-- apply_migration as 'credit_wallet_attribution_determinism' on 2026-08-20.
CREATE OR REPLACE FUNCTION public.atomic_credit_wallet_and_log(
  p_user_id uuid, p_amount numeric, p_category text DEFAULT 'credit'::text,
  p_description text DEFAULT ''::text, p_table_id uuid DEFAULT NULL::uuid,
  p_hand_id uuid DEFAULT NULL::uuid, p_related_entity_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_club_id uuid;
  v_inserted integer;
  v_fallback boolean := false;
BEGIN
  -- Idempotency gate (only when a key is supplied). First caller for a key wins;
  -- a committed-but-timed-out retry finds ROW_COUNT=0 and no-ops, so the credit
  -- + log below never runs twice. If the credit fails the whole function txn
  -- (incl. this INSERT) rolls back, so a genuine retry is still allowed.
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO wallet_credit_idempotency (key, user_id, amount)
    VALUES (p_idempotency_key, p_user_id, p_amount)
    ON CONFLICT (key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 0 THEN
      RETURN true;  -- already credited under this key: idempotent no-op
    END IF;
  END IF;

  UPDATE wallets SET balance = COALESCE(balance, 0) + p_amount, updated_at = now()
  WHERE user_id = p_user_id AND wallet_type = 'PLAYER';
  IF NOT FOUND THEN
    INSERT INTO wallets (user_id, wallet_type, balance, locked_balance)
    VALUES (p_user_id, 'PLAYER', p_amount, 0)
    ON CONFLICT (user_id, wallet_type) DO UPDATE
      SET balance = wallets.balance + p_amount, updated_at = now();
  END IF;

  IF p_table_id IS NOT NULL THEN
    SELECT club_id INTO v_club_id FROM tables WHERE id = p_table_id;
  END IF;
  IF v_club_id IS NULL THEN
    -- Deterministic: the user's FIRST club, same ordering as the union P&L's
    -- attribution (fn_union_pnl_all_clubs / fn_union_rake_paid_by_club).
    SELECT club_id INTO v_club_id
      FROM club_members
     WHERE user_id = p_user_id
     ORDER BY joined_at ASC NULLS LAST, club_id
     LIMIT 1;
  END IF;
  IF v_club_id IS NULL THEN
    -- Last-resort attribution. Kept because club_id is NOT NULL, but booked
    -- to the Midway Union house container club (not a member club) and
    -- marked so these rows are identifiable.
    v_club_id := 'fade0000-0000-0000-0000-000000000001'::uuid;
    v_fallback := true;
  END IF;

  INSERT INTO chip_transactions (club_id, to_user_id, amount, transaction_type,
                                 notes, table_id, metadata)
  VALUES (v_club_id, p_user_id, p_amount, p_category,
          COALESCE(NULLIF(p_description, ''), 'Wallet credit'),
          p_table_id,
          CASE WHEN v_fallback
               THEN jsonb_build_object('club_attribution', 'fallback_unresolved')
               ELSE '{}'::jsonb END);
  RETURN true;
END; $function$;
