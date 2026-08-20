-- 2026-08-20: a rebuy or add-on must land in the SEAT, or not happen at all.
--
-- THE DEFECT. process_tournament_rebuy updates the player's seat behind
-- `IF FOUND`, with no ELSE branch. A player with no live seat at that instant
-- -- which happens constantly during table consolidation, when the old seat is
-- closed before the new one exists -- was charged, had
-- tournament_players.chips incremented, and then had that grant silently
-- ERASED: the elimination sweep syncs chips FROM table_seats and overwrote
-- whatever the RPC had written.
--
-- MEASURED, on the first add-on window ever to run in production (Prime Time
-- Main Event, 2026-08-20 19:14, 103 add-ons in 15 seconds):
--
--   charged            103 add-ons, 2,575.00 chips, 103 distinct players
--   chips owed         103 x 10,000 = 1,030,000
--   chips delivered    ~121,000 (about 12 add-ons' worth)
--   never delivered    908,552  -- roughly 91 players paid and got nothing
--
-- This was invisible until tournament add-ons were wired up for horses today,
-- because add-ons had never once executed in the life of the platform. The
-- defect was always there; nothing had ever exercised it.
--
-- THE FIX. Check for a live seat FIRST, before any money moves, and raise if
-- there is none: the whole transaction then rolls back and no charge is made.
-- A second guard catches the seat vanishing mid-transaction. Re-entry is
-- exempt -- it deliberately re-seats an eliminated player, so it is the one
-- purchase type that legitimately begins without a seat.
--
-- VERIFIED both ways against production, each test rolled back:
--   seatless player -> refused ("No live seat for this addon"), and the
--                      wallet_transactions count for that player is UNCHANGED
--   seated player   -> success, fee 0.00 (add-ons are not raked), charged
--                      25.00 at face value, seat 180,865 -> 190,865 = exactly
--                      +10,000, tournament_players.chips synced to match
--
-- STILL OPEN FOR DAN: the ~91 players charged 25.00 each (about 2,275 chips)
-- who received nothing are owed a refund. Not issued here -- moving player
-- money is a decision, not a side effect of a bug fix.
--
-- NOTE: the fee is booked in this transaction and nowhere else. The Club Arena
-- client used to call recordTournamentFee() after this RPC, inserting a second
-- rake_records row and incrementing total_rake again, so every rebuy/re-entry
-- fee counted twice. That comment lived in the function body in 20260821n and
-- is recorded here instead, so this file reproduces production byte-for-byte.
--
-- Applied to production via Supabase MCP apply_migration as
-- 'rebuy_addon_require_live_seat' on 2026-08-20.

CREATE OR REPLACE FUNCTION public.process_tournament_rebuy(
  p_tournament_id uuid, p_user_id uuid, p_rebuy_type text,
  p_cost numeric, p_chips numeric, p_current_level integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_t record; v_p record; v_balance numeric; v_ratio numeric;
  v_base numeric; v_fee numeric; v_total numeric;
  v_add integer; v_new_chips integer; v_seat record;
  v_key text; v_inserted integer; v_cap integer; v_level integer; v_cat text;
  v_club uuid; v_legacy_ratio numeric; v_legacy_total numeric;
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

  SELECT s.id, s.stack INTO v_seat FROM table_seats s JOIN tables tb ON tb.id=s.table_id
   WHERE s.user_id=p_user_id AND s.left_at IS NULL AND tb.tournament_id=p_tournament_id LIMIT 1;
  IF FOUND THEN
    UPDATE table_seats
       SET stack = CASE WHEN p_rebuy_type='reentry' THEN v_add ELSE COALESCE(stack,0)+v_add END
     WHERE id=v_seat.id;
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
