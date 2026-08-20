-- 2026-08-20: an add-on must ALWAYS award exactly the configured number of
-- chips to the stack. Dan, binding: "it must always award the specific amount
-- of chips added to the stack count when purchased."
--
-- Migration 20260821s made the purchase ATOMIC -- it refuses to charge a
-- player who has no live seat, because a grant to a seatless player is erased
-- by the elimination sweep's chip sync. That closed the money hole measured on
-- the first add-on window ever run (Prime Time Main Event, 2026-08-20 19:14:
-- 103 add-ons charged, 908,552 chips of grants never reaching a seat).
--
-- Atomicity is not the whole promise. It guarantees the charge and the grant
-- travel together; it says nothing about the AMOUNT. This migration adds the
-- amount guarantee, and fixes a second way the grant could land in the wrong
-- place.
--
-- CHANGE 1 -- deterministic seat.
--   The seat lookup was a bare LIMIT 1 with no ORDER BY. Five players in
--   production were holding TWO live seats in the same tournament, so the
--   planner was free to hand back the STALE row and the chips would land on a
--   seat nobody is playing. Not a rounding matter: in Union Grand Championship
--   the stale seat held 15,000 against a real stack of 2,728,737.
--
--   Now: newest live seat on a table that is still open. The duplicates
--   themselves are cleaned in 20260821v and fixed at source in Club Arena
--   b75aecc6b (the table-move rollback re-activated the source seat even when
--   the destination write had actually committed).
--
-- CHANGE 2 -- assert the grant landed, in the same transaction as the charge.
--   After updating the seat, the new stack must equal the old stack plus the
--   configured chips exactly (or equal them exactly, for a re-entry). If it
--   does not, the function raises and the ENTIRE purchase rolls back --
--   money included. A short, doubled, or silently dropped grant can no longer
--   be billed for.
--
-- VERIFIED in production, both directions, in rolled-back transactions:
--   * seated add-on, Prime Time Main Event: stack 10,000.00 -> 20,000.00,
--     delta exactly 10,000 against a configured addon_chips of 10,000, one
--     wallet row written.
--   * mutation test -- the real function body with the grant shorted by a
--     single chip raises 'Chip grant did not land: addon expected stack
--     20000.00 (10000.00 + 10000), seat ... holds 19999.00' and the wallet
--     row count is UNCHANGED (1 -> 1). The assertion is load-bearing, not
--     decorative.
--
-- Applied to production via Supabase MCP apply_migration as
-- 'rebuy_addon_exact_grant_assertion' on 2026-08-20.
-- Production pg_proc.prosrc md5: a718522dbecd364fce7cb55c9135c213

CREATE OR REPLACE FUNCTION public.process_tournament_rebuy(
  p_tournament_id uuid, p_user_id uuid, p_rebuy_type text, p_cost numeric,
  p_chips numeric, p_current_level integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_t record; v_p record; v_balance numeric; v_ratio numeric;
  v_base numeric; v_fee numeric; v_total numeric;
  v_add integer; v_new_chips integer; v_seat record;
  v_key text; v_inserted integer; v_cap integer; v_level integer; v_cat text;
  v_club uuid; v_legacy_ratio numeric; v_legacy_total numeric;
  v_stack_after numeric; v_expected numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'process_tournament_rebuy: caller may only transact for themselves'
      USING ERRCODE = '42501';
  END IF;
  IF p_rebuy_type NOT IN ('rebuy','reentry','addon') THEN
    RAISE EXCEPTION 'Invalid rebuy type: %', p_rebuy_type;
  END IF;

  SELECT id, name, club_id, status, buy_in_amount, buy_in_fee, starting_chips,
         is_rebuy, is_reentry, add_on_available, addon_period_triggered,
         rebuy_cost, rebuy_chips, rebuy_levels, late_reg_levels, max_rebuys,
         max_reentries, addon_cost, addon_chips, addon_levels, current_level, prize_pool
    INTO v_t FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_t.status NOT IN ('RUNNING','REGISTERING','ANNOUNCED') THEN
    RAISE EXCEPTION 'Tournament is not accepting chip purchases (status %)', v_t.status;
  END IF;

  SELECT id, chips, status, rebuys, add_on, table_id, club_id INTO v_p
    FROM tournament_players
   WHERE tournament_id = p_tournament_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not registered in this tournament'; END IF;
  v_club := COALESCE(v_p.club_id, public.fn_player_home_club(p_user_id, NULL));
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'No club wallet resolves for this tournament purchase';
  END IF;

  v_level := COALESCE(v_t.current_level, COALESCE(p_current_level, 0));
  v_cat   := CASE WHEN p_rebuy_type = 'addon' THEN 'addon' ELSE 'rebuy' END;

  -- ATOMICITY 2026-08-20: a rebuy or add-on must land in the SEAT, or not
  -- happen at all.
  --
  -- The seat update below sits behind `IF FOUND`, with no ELSE. A player with
  -- no live seat at that instant -- which happens constantly during table
  -- consolidation, when the old seat is closed before the new one exists --
  -- was charged, had tournament_players.chips incremented, and then had that
  -- grant silently ERASED, because the elimination sweep syncs chips FROM
  -- table_seats and overwrites whatever the RPC had written.
  --
  -- Measured on the first add-on window ever to run (Prime Time Main Event,
  -- 2026-08-20 19:14): 103 add-ons charged 2,575.00 chips, and only about 12
  -- of them delivered chips. 908,552 chips of grants -- roughly 91 players'
  -- worth -- never reached a seat. Those players paid and received nothing.
  --
  -- Checking the seat FIRST, before any money moves, makes the whole thing
  -- atomic: either the player is charged AND seated with the chips, or the
  -- transaction raises and neither happens.
  --
  -- Re-entry is exempt: it deliberately re-seats an eliminated player, so it
  -- is the one purchase type that legitimately begins without a live seat.
  IF p_rebuy_type <> 'reentry' THEN
    PERFORM 1 FROM table_seats s
      JOIN tables tb ON tb.id = s.table_id
     WHERE s.user_id = p_user_id AND s.left_at IS NULL
       AND tb.tournament_id = p_tournament_id
     LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No live seat for this % — refusing to charge for chips that would be overwritten by the seat sync', p_rebuy_type;
    END IF;
  END IF;

  IF p_rebuy_type = 'addon' THEN
    v_key := 'tourney:' || p_tournament_id || ':addon:' || p_user_id;
    INSERT INTO wallet_credit_idempotency (key, user_id, amount)
    VALUES (v_key, p_user_id, COALESCE(p_cost, 0)) ON CONFLICT (key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 0 THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true,
                                'new_stack', v_p.chips, 'rebuy_type', p_rebuy_type);
    END IF;
  ELSIF EXISTS (
      SELECT 1 FROM wallet_transactions w
       WHERE w.user_id = p_user_id AND w.related_entity_id = p_tournament_id
         AND w.category = v_cat AND w.created_at > now() - interval '30 seconds') THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true,
                              'new_stack', v_p.chips, 'rebuy_type', p_rebuy_type);
  END IF;

  IF p_rebuy_type = 'addon' THEN
    IF NOT COALESCE(v_t.add_on_available,false) THEN
      RAISE EXCEPTION 'Add-ons are not offered in this tournament'; END IF;
    IF COALESCE(v_p.add_on,false) THEN RAISE EXCEPTION 'Add-on already taken'; END IF;
    v_cap := COALESCE(NULLIF(v_t.late_reg_levels,0), NULLIF(v_t.rebuy_levels,0), 0)
             + COALESCE(v_t.addon_levels,1);
    IF v_cap > 0 AND v_level > v_cap THEN
      RAISE EXCEPTION 'Add-on period has closed (level % > %)', v_level, v_cap; END IF;
    v_base := COALESCE(NULLIF(v_t.addon_cost,0), v_t.buy_in_amount, 0);
    v_add  := COALESCE(NULLIF(v_t.addon_chips,0), v_t.starting_chips, 0)::integer;
  ELSE
    IF p_rebuy_type='rebuy' AND NOT COALESCE(v_t.is_rebuy,false) THEN
      RAISE EXCEPTION 'Rebuys are not offered in this tournament'; END IF;
    IF p_rebuy_type='reentry' AND NOT COALESCE(v_t.is_reentry,false) THEN
      RAISE EXCEPTION 'Re-entries are not offered in this tournament'; END IF;
    v_cap := COALESCE(NULLIF(v_t.rebuy_levels,0), NULLIF(v_t.late_reg_levels,0), 0);
    IF v_cap > 0 AND v_level > v_cap THEN
      RAISE EXCEPTION 'Rebuy period has closed (level % > %)', v_level, v_cap; END IF;
    IF p_rebuy_type='rebuy' AND v_t.max_rebuys IS NOT NULL
       AND COALESCE(v_p.rebuys,0) >= v_t.max_rebuys THEN
      RAISE EXCEPTION 'Rebuy limit reached (% of %)', v_p.rebuys, v_t.max_rebuys; END IF;
    IF p_rebuy_type='reentry' AND v_t.max_reentries IS NOT NULL
       AND COALESCE(v_p.rebuys,0) >= v_t.max_reentries THEN
      RAISE EXCEPTION 'Re-entry limit reached (% of %)', v_p.rebuys, v_t.max_reentries; END IF;
    IF p_rebuy_type='rebuy' AND COALESCE(v_p.chips,0) > COALESCE(v_t.starting_chips,0) THEN
      RAISE EXCEPTION 'Stack too high for a rebuy'; END IF;
    v_base := COALESCE(NULLIF(v_t.rebuy_cost,0), v_t.buy_in_amount, 0);
    v_add  := COALESCE(NULLIF(v_t.rebuy_chips,0), v_t.starting_chips, 0)::integer;
  END IF;

  -- Dan 2026-08-20 (binding): add-ons are NOT raked; only rebuys (and
  -- re-entries, which are a fresh entry) carry the buy-in's fee ratio.
  v_legacy_ratio := CASE WHEN COALESCE(v_t.buy_in_amount,0) > 0 AND COALESCE(v_t.buy_in_fee,0) > 0
                         THEN v_t.buy_in_fee / v_t.buy_in_amount ELSE 0.1 END;
  v_ratio := CASE WHEN p_rebuy_type = 'addon' THEN 0 ELSE v_legacy_ratio END;

  v_base := round(v_base::numeric,2); v_fee := round(v_base*v_ratio,2); v_total := v_base+v_fee;

  IF p_cost IS NOT NULL AND abs(p_cost - v_total) > 0.01 THEN
    -- Transitional: an older client still quotes add-ons fee-inclusive.
    -- Accept that quote, but charge the fee-free total computed above.
    v_legacy_total := v_base + round(v_base * v_legacy_ratio, 2);
    IF NOT (p_rebuy_type = 'addon' AND abs(p_cost - v_legacy_total) <= 0.01) THEN
      RAISE EXCEPTION 'Price mismatch: client quoted %, server computed % (base % + fee %)',
        p_cost, v_total, v_base, v_fee;
    END IF;
  END IF;

  PERFORM public.fn_ensure_club_wallet(p_user_id, v_club);
  SELECT chip_balance INTO v_balance FROM club_members
   WHERE user_id = p_user_id AND club_id = v_club FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_total THEN
    RAISE EXCEPTION 'Insufficient club chips: need % (incl. % fee), have %',
      v_total, v_fee, COALESCE(v_balance,0);
  END IF;
  UPDATE club_members SET chip_balance = chip_balance - v_total, updated_at = now()
   WHERE user_id = p_user_id AND club_id = v_club;

  IF p_rebuy_type='reentry' THEN
    UPDATE tournament_players SET chips=v_add, status='playing', eliminated_at=NULL,
           position=NULL, rebuys=COALESCE(rebuys,0)+1
     WHERE tournament_id=p_tournament_id AND user_id=p_user_id RETURNING chips INTO v_new_chips;
  ELSIF p_rebuy_type='addon' THEN
    UPDATE tournament_players SET chips=COALESCE(chips,0)+v_add, add_on=true
     WHERE tournament_id=p_tournament_id AND user_id=p_user_id RETURNING chips INTO v_new_chips;
  ELSE
    UPDATE tournament_players SET chips=COALESCE(chips,0)+v_add, status='playing',
           rebuys=COALESCE(rebuys,0)+1
     WHERE tournament_id=p_tournament_id AND user_id=p_user_id RETURNING chips INTO v_new_chips;
  END IF;

  -- DETERMINISTIC SEAT 2026-08-20: pick the player's CURRENT seat, not an
  -- arbitrary one.
  --
  -- This select used to be a bare LIMIT 1 with no ORDER BY, and five players
  -- in production are holding TWO live seats in the same tournament at once.
  -- They come from the table-move rollback: the destination seat write times
  -- out client-side but commits server-side, so the move restores the source
  -- seat on top of a destination seat that already exists. The giveaway is
  -- identical stacks on both rows (Late Night Grind: 1113/1113, 796/796,
  -- 1950/1950).
  --
  -- With no ORDER BY, Postgres was free to hand back the STALE row, and the
  -- grant would land on a seat nobody is playing -- the same money hole the
  -- atomicity guard above closes, reopened through a different door. In
  -- Union Grand Championship the stale seat held 15,000 against a real stack
  -- of 2,728,737, so the wrong pick is not a rounding matter.
  --
  -- Newest live seat on a table that is still open wins: that is the seat the
  -- player is actually sitting at.
  SELECT s.id, s.stack INTO v_seat
    FROM table_seats s JOIN tables tb ON tb.id=s.table_id
   WHERE s.user_id=p_user_id AND s.left_at IS NULL AND tb.tournament_id=p_tournament_id
   ORDER BY (tb.status IS DISTINCT FROM 'closed') DESC, s.joined_at DESC NULLS LAST, s.id DESC
   LIMIT 1;
  IF FOUND THEN
    UPDATE table_seats
       SET stack = CASE WHEN p_rebuy_type='reentry' THEN v_add ELSE COALESCE(stack,0)+v_add END
     WHERE id=v_seat.id
    RETURNING stack INTO v_stack_after;

    -- EXACT GRANT 2026-08-20 (Dan, binding): "it must ALWAYS award the
    -- specific amount of chips added to the stack count when purchased."
    --
    -- Atomicity alone only guarantees the charge and the grant travel
    -- together. It does not guarantee the AMOUNT. This asserts the amount, in
    -- the same transaction as the charge, so a grant that is short, doubled,
    -- or silently dropped by a concurrent write can never be billed for: the
    -- assertion raises and the whole purchase -- money included -- rolls back.
    v_expected := CASE WHEN p_rebuy_type='reentry' THEN v_add
                       ELSE COALESCE(v_seat.stack,0) + v_add END;
    IF v_stack_after IS NULL OR v_stack_after <> v_expected THEN
      RAISE EXCEPTION
        'Chip grant did not land: % expected stack % (% + %), seat % holds % — aborting so no charge is made',
        p_rebuy_type, v_expected, COALESCE(v_seat.stack,0), v_add, v_seat.id, v_stack_after;
    END IF;

    UPDATE tournament_players
       SET chips=(SELECT stack FROM table_seats WHERE id=v_seat.id)::integer
     WHERE tournament_id=p_tournament_id AND user_id=p_user_id RETURNING chips INTO v_new_chips;
  ELSIF p_rebuy_type <> 'reentry' THEN
    -- The seat existed at the guard above and has vanished mid-transaction.
    -- Abort rather than leave a charge whose chips the sync will erase.
    RAISE EXCEPTION 'Seat disappeared during % — aborting so no charge is made', p_rebuy_type;
  END IF;

  UPDATE tournaments SET prize_pool=COALESCE(prize_pool,0)+v_base WHERE id=p_tournament_id;

  IF v_fee > 0 AND v_t.club_id IS NOT NULL THEN
    INSERT INTO rake_records (hand_id, table_id, club_id, rake_amount, pot_size, num_players,
      bbj_contribution, is_tournament, tournament_id, source, metadata)
    VALUES (NULL,NULL,v_t.club_id,v_fee,v_fee,1,0,true,p_tournament_id,'process_tournament_rebuy',
      jsonb_build_object('kind','tournament_'||p_rebuy_type||'_fee','user_id',p_user_id,
                         'entry_club_id', v_club));
    UPDATE tournaments SET total_rake=COALESCE(total_rake,0)+v_fee WHERE id=p_tournament_id;
  END IF;

  INSERT INTO wallet_transactions (user_id, wallet_type, type, amount, category, description,
    related_entity_id, balance_after)
  VALUES (p_user_id,'PLAYER','debit',v_total,v_cat,
    'Tournament '||p_rebuy_type||': '||COALESCE(v_t.name,'tournament')
      ||' ('||v_base||' + '||v_fee||' fee) [club wallet]',
    p_tournament_id, v_balance-v_total);

  RETURN jsonb_build_object('success', true, 'new_stack', v_new_chips,
    'rebuy_type', p_rebuy_type, 'chips_added', v_add, 'cost', v_total, 'fee', v_fee);
END;
$function$;
