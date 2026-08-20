-- P1-1 (2026-08-20): unify the two cash-out write paths.
--
-- Before: the engine's seat-leave path (services/supabase/seats.ts ->
-- atomic_credit_wallet_and_log, ~1,176/day) logged cash-outs to
-- chip_transactions ONLY, while the JWT/client path (atomic_table_cashout,
-- ~522/day) logged to wallet_transactions ONLY (populations verified
-- disjoint: 0 twins in 24h). Buy-ins live in wallet_transactions, so the
-- union P&L had to FULL OUTER JOIN two ledgers — the asymmetry behind two
-- prior bugs.
--
-- After: wallet_transactions is the canonical player-money ledger for
-- cash-outs. atomic_credit_wallet_and_log now ALSO writes the
-- wallet_transactions row (same shape as atomic_table_cashout, with
-- balance_after) when p_category = 'cashout', and marks its
-- chip_transactions row metadata.mirrored_to_wallet = true.
-- fn_union_pnl_all_clubs.chip_flows excludes mirrored rows, so the chip
-- leg is now historical-only by data, not by a magic cutover timestamp.
-- Only 'cashout' is mirrored: prize/bounty/tournament categories never
-- pass through this function (verified against 48h of chip_transactions
-- types), so no other P&L category can double-count. No engine code
-- change: both write paths converge on wallet_transactions via their
-- existing RPCs.
--
-- Applied to production via Supabase MCP apply_migration as
-- 'unify_cashout_ledger' on 2026-08-20. Verified:
--   * rollback probe: one call wrote wallets (+12.34), one
--     wallet_transactions row AND one mirrored chip_transactions row;
--   * live: 5/5 engine cash-outs in the first 3 minutes mirrored, 0
--     unmirrored chip rows since deploy;
--   * no double count: settle dry-run residual stayed flat (-1,993.69 ->
--     -2,001.18, in-flight pot noise) while 5,489.44 chips of mirrored
--     cash-outs accumulated — double counting would have moved it +5,489.

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
  v_new_balance numeric;
BEGIN
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
  WHERE user_id = p_user_id AND wallet_type = 'PLAYER'
  RETURNING balance INTO v_new_balance;
  IF NOT FOUND THEN
    INSERT INTO wallets (user_id, wallet_type, balance, locked_balance)
    VALUES (p_user_id, 'PLAYER', p_amount, 0)
    ON CONFLICT (user_id, wallet_type) DO UPDATE
      SET balance = wallets.balance + p_amount, updated_at = now()
    RETURNING balance INTO v_new_balance;
  END IF;

  IF p_table_id IS NOT NULL THEN
    SELECT club_id INTO v_club_id FROM tables WHERE id = p_table_id;
  END IF;
  IF v_club_id IS NULL THEN
    SELECT club_id INTO v_club_id
      FROM club_members
     WHERE user_id = p_user_id
     ORDER BY joined_at ASC NULLS LAST, club_id
     LIMIT 1;
  END IF;
  IF v_club_id IS NULL THEN
    v_club_id := 'fade0000-0000-0000-0000-000000000001'::uuid;
    v_fallback := true;
  END IF;

  -- Canonical player-money ledger row for cash-outs (P1-1). Same shape as
  -- atomic_table_cashout writes, so wallet_transactions now carries EVERY
  -- table cash-out regardless of which path performed it.
  IF p_category = 'cashout' THEN
    INSERT INTO wallet_transactions (user_id, wallet_type, type, amount, category,
                                     description, table_id, balance_after)
    VALUES (p_user_id, 'PLAYER', 'credit', p_amount, 'cashout',
            COALESCE(NULLIF(p_description, ''), 'Cash-out from table'),
            p_table_id, v_new_balance);
  END IF;

  INSERT INTO chip_transactions (club_id, to_user_id, amount, transaction_type,
                                 notes, table_id, metadata)
  VALUES (v_club_id, p_user_id, p_amount, p_category,
          COALESCE(NULLIF(p_description, ''), 'Wallet credit'),
          p_table_id,
          (CASE WHEN v_fallback
               THEN jsonb_build_object('club_attribution', 'fallback_unresolved')
               ELSE '{}'::jsonb END)
          || (CASE WHEN p_category = 'cashout'
               THEN jsonb_build_object('mirrored_to_wallet', true)
               ELSE '{}'::jsonb END));
  RETURN true;
END; $function$;

-- P&L: the chip_transactions leg is now historical-only. Mirrored rows are
-- counted from wallet_transactions instead.
CREATE OR REPLACE FUNCTION public.fn_union_pnl_all_clubs(
  p_union_id uuid, p_start timestamptz, p_end timestamptz,
  p_include_horses boolean DEFAULT true)
RETURNS TABLE(club_id uuid, buyins numeric, cashouts numeric, realized_net numeric,
              winnings numeric, losses numeric, players integer, seated_stack numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH attributed AS (
    SELECT DISTINCT ON (cm.user_id) cm.user_id, cm.club_id
      FROM club_members cm
      JOIN union_clubs uc ON uc.club_id = cm.club_id AND uc.union_id = p_union_id
      JOIN profiles p ON p.id = cm.user_id
     WHERE p_include_horses OR COALESCE(p.is_horse, false) = false
     ORDER BY cm.user_id, cm.joined_at ASC NULLS LAST, cm.club_id
  ),
  union_tables AS (
    SELECT id FROM tables WHERE union_id = p_union_id AND tournament_id IS NULL
  ),
  union_tourneys AS (SELECT id FROM tournaments WHERE union_id = p_union_id),
  live_tourneys AS (
    SELECT id FROM tournaments
     WHERE union_id = p_union_id AND status IN ('REGISTERING','RUNNING')
  ),
  wallet_flows AS (
    SELECT a.club_id, wt.user_id,
           SUM(CASE WHEN wt.type = 'debit'  THEN wt.amount ELSE 0 END) AS buyins,
           SUM(CASE WHEN wt.type = 'credit' THEN wt.amount ELSE 0 END) AS cashouts
      FROM wallet_transactions wt
      JOIN attributed a ON a.user_id = wt.user_id
     WHERE wt.created_at >= p_start AND wt.created_at < p_end
       AND (
         (wt.category IN ('buyin','cashout')
            AND wt.table_id IN (SELECT id FROM union_tables))
         OR
         (wt.category IN ('tournament_buyin','prize','bounty')
            AND wt.related_entity_id IN (SELECT id FROM union_tourneys))
       )
     GROUP BY a.club_id, wt.user_id
  ),
  chip_flows AS (
    -- Historical leg: cash-outs written to chip_transactions ONLY, before
    -- the 2026-08-20 P1-1 unification. Post-unification rows carry
    -- metadata.mirrored_to_wallet and are counted in wallet_flows instead.
    SELECT a.club_id, ct.to_user_id AS user_id, SUM(ct.amount) AS cashouts
      FROM chip_transactions ct
      JOIN union_tables ut ON ut.id = ct.table_id
      JOIN attributed a ON a.user_id = ct.to_user_id
     WHERE ct.transaction_type = 'cashout'
       AND ct.created_at >= p_start AND ct.created_at < p_end
       AND NOT COALESCE((ct.metadata->>'mirrored_to_wallet')::boolean, false)
     GROUP BY a.club_id, ct.to_user_id
  ),
  flows AS (
    SELECT COALESCE(w.club_id, c.club_id) AS club_id,
           COALESCE(w.user_id, c.user_id) AS user_id,
           COALESCE(w.buyins, 0) AS buyins,
           COALESCE(w.cashouts, 0) + COALESCE(c.cashouts, 0) AS cashouts
      FROM wallet_flows w
      FULL OUTER JOIN chip_flows c ON c.user_id = w.user_id AND c.club_id = w.club_id
  ),
  per_club AS (
    SELECT f.club_id, SUM(f.buyins) AS buyins, SUM(f.cashouts) AS cashouts,
           SUM(GREATEST(f.cashouts - f.buyins, 0)) AS winnings,
           SUM(GREATEST(f.buyins - f.cashouts, 0)) AS losses,
           COUNT(*)::int AS players
      FROM flows f GROUP BY f.club_id
  ),
  seated AS (
    SELECT a.club_id, SUM(ts.stack) AS seated_stack
      FROM table_seats ts
      JOIN union_tables ut ON ut.id = ts.table_id
      JOIN attributed a ON a.user_id = ts.user_id
     WHERE ts.left_at IS NULL
     GROUP BY a.club_id
  ),
  tourney_equity AS (
    SELECT a.club_id,
           SUM(CASE WHEN wt.category = 'tournament_buyin' THEN wt.amount
                    ELSE -wt.amount END) AS equity
      FROM wallet_transactions wt
      JOIN attributed a ON a.user_id = wt.user_id
     WHERE wt.category IN ('tournament_buyin','prize','bounty')
       AND wt.related_entity_id IN (SELECT id FROM live_tourneys)
     GROUP BY a.club_id
  )
  SELECT uc.club_id,
         COALESCE(pc.buyins, 0), COALESCE(pc.cashouts, 0),
         COALESCE(pc.cashouts, 0) - COALESCE(pc.buyins, 0),
         COALESCE(pc.winnings, 0), COALESCE(pc.losses, 0),
         COALESCE(pc.players, 0),
         COALESCE(s.seated_stack, 0) + COALESCE(te.equity, 0)
    FROM union_clubs uc
    LEFT JOIN per_club pc ON pc.club_id = uc.club_id
    LEFT JOIN seated s ON s.club_id = uc.club_id
    LEFT JOIN tourney_equity te ON te.club_id = uc.club_id
   WHERE uc.union_id = p_union_id;
$function$;
