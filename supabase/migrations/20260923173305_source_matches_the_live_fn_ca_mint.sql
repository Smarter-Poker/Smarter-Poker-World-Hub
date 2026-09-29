-- Source mirror for fn_ca_mint, the chip and diamond issuance function.
--
-- This migration is a no-op against production as it stands today, and it was
-- deliberately not applied. It exists so that a replay of this repository can
-- no longer revert live.
--
-- WHAT WAS MEASURED
--
-- On 2026-09-23 the installed definition was read with pg_get_functiondef on
-- project kuklfnapbkmacvwxktbh. It is 11391 bytes and its md5 is
-- da9429ce6483c47c7d536582433a1edd. The CREATE OR REPLACE FUNCTION below is
-- that definition reproduced byte for byte. The file was assembled from the
-- pg_get_functiondef output itself rather than retyped, and the assembled
-- bytes were hash checked against the live hash before this file was saved.
--
-- THE DIVERGENCE THIS CLOSES
--
-- The only source for fn_ca_mint in this repository is
-- 20260902_the_mint_issuance_and_retirement.sql, and it is stale. That file
-- declares six parameters:
--
--   fn_ca_mint(p_asset text, p_destination text, p_target_id uuid,
--              p_amount numeric, p_reason text, p_op_id text)
--
-- Production carries seven:
--
--   fn_ca_mint(p_asset text, p_destination text, p_target_id uuid,
--              p_amount numeric, p_reason text, p_op_id text,
--              p_class text DEFAULT 'admin'::text)
--
-- Because the argument lists differ, replaying the stale file would not
-- replace the live function. CREATE OR REPLACE FUNCTION with a different
-- argument count creates a second function, so production would end up
-- carrying both a six argument and a seven argument fn_ca_mint. That is an
-- overload ambiguity sitting directly on the chip issuance path that
-- pages/api/horses/mint.js calls, and RPC overload ambiguity is a failure
-- class the migration safety protocol already calls out by name.
--
-- The stale file would also run
--   GRANT EXECUTE ON FUNCTION
--     public.fn_ca_mint(text, text, uuid, numeric, text, text)
--     TO authenticated, service_role;
-- while the live seven argument function is granted to service_role only. Its
-- measured ACL is postgres=X/postgres and service_role=X/postgres, with no
-- authenticated entry. A replay would therefore also hand every signed-in user
-- a mint entry point.
--
-- WHY THIS FILE IS A NO-OP
--
-- The definition below is the definition production already carries. The
-- preflight reads the installed md5, finds it equal to the expected hash, says
-- so, and returns without replacing anything. Re-running is safe for the same
-- reason. Applying a no-op to a money-path function buys nothing and carries
-- risk, which is why this file was written and hash verified but not pushed.
--
-- The value is in the ordering. This file sorts after
-- 20260902_the_mint_issuance_and_retirement.sql, so a replay of the repository
-- no longer ends with production on the stale definition. It ends here, and
-- this file either installs the live definition when the seven argument
-- function is absent, or refuses outright when some other body is installed.
--
-- WHAT THIS FILE DOES NOT DO
--
-- It mirrors the live seven argument definition and nothing else. It does not
-- drop the six argument definition, because no six argument fn_ca_mint exists
-- in production today, and retiring the stale CREATE inside
-- 20260902_the_mint_issuance_and_retirement.sql is a separate decision that is
-- not made here. It changes no grant, no table, no policy and no row.
--
-- TIER:        3 if ever applied where the function is absent, since it would
--              install a money-path function. No-op against production.
-- AFFECTS:     public.fn_ca_mint(text,text,uuid,numeric,text,text,text) only.
-- IRREVERSIBLE: no
-- APPLIED:     no. Written and hash verified on 2026-09-23, not pushed.

DO $migration$
DECLARE
  v_signature text := 'public.fn_ca_mint(text,text,uuid,numeric,text,text,text)';
  v_expected  text := 'da9429ce6483c47c7d536582433a1edd';
  v_target    regprocedure;
  v_current   text;
BEGIN
  v_target := to_regprocedure(v_signature);

  IF v_target IS NOT NULL THEN
    v_current := md5(pg_get_functiondef(v_target::oid));
  END IF;

  IF v_current = v_expected THEN
    RAISE NOTICE 'Nothing to do: % already carries the mirrored definition (md5 %).',
      v_signature, v_current;
    RETURN;
  END IF;

  IF v_current IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing to apply: % has md5 %, expected %. This file mirrors the definition production carried when it was written, so a different hash means the function changed after that. Read the current definition, compare it with the CREATE OR REPLACE below, and decide deliberately before replacing a money-path function.',
      v_signature, v_current, v_expected;
  END IF;

  EXECUTE $create$
CREATE OR REPLACE FUNCTION public.fn_ca_mint(p_asset text, p_destination text, p_target_id uuid, p_amount numeric, p_reason text, p_op_id text, p_class text DEFAULT 'admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_house constant uuid := '00000000-0000-0000-0000-00000000d1a0';
  v_actor uuid := auth.uid();
  v_admin boolean := false;
  v_asset text := lower(btrim(COALESCE(p_asset, '')));
  v_dest  text := lower(btrim(COALESCE(p_destination, '')));
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_class text := lower(btrim(COALESCE(p_class, 'admin')));
  v_holder uuid;
  v_prior jsonb; v_before numeric; v_after numeric; v_label text;
  v_supply numeric; v_chip_id uuid; v_dia_id uuid; v_actorlb text; v_result jsonb;
  v_pol public.ca_mint_policy%ROWTYPE;
  v_cap numeric; v_roll numeric; v_24h numeric;
BEGIN
  -- The trigger door (2026-09-08, DIAMOND-RULINGS 17 / roadmap 1.3): handle_new_user and the
  -- other seeders fire inside a trigger owned by the database itself, where auth.role() is
  -- NULL. The database's own code may mint; a browser never reaches this branch because a
  -- SECURITY DEFINER trigger runs as the owner and a client session is never at depth > 0.
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT (pg_trigger_depth() > 0
              AND current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin')) THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.id = v_actor AND p.role IN ('admin', 'god')) INTO v_admin;
    IF NOT v_admin THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'the_mint_is_admin_only');
    END IF;
  END IF;

  IF v_asset NOT IN ('chips', 'diamonds') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'asset_must_be_chips_or_diamonds');
  END IF;
  IF v_asset = 'chips' AND v_dest NOT IN ('club', 'union') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'chips_are_issued_to_a_club_or_union_wallet_only');
  END IF;
  IF v_asset = 'diamonds' AND v_dest NOT IN ('player', 'house') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'diamonds_are_issued_to_a_player_or_to_the_house_only');
  END IF;
  -- The foundation's issuance_class list (diamond_transactions_issuance_class_chk).
  -- Recorded on the diamond journal row; carried but unused for chips, which have
  -- their own ledger.
  IF v_class NOT IN ('purchased', 'promotional', 'earned', 'transferred', 'seeded',
                     'refund', 'spend', 'bridge', 'deletion', 'admin', 'arena',
                     'house', 'unknown') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_issuance_class', 'class', v_class);
  END IF;
  IF v_asset = 'diamonds' AND v_dest = 'house' THEN
    IF p_target_id IS NOT NULL AND p_target_id <> c_house THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'the_house_target_is_the_house_sentinel_or_null');
    END IF;
  ELSIF p_target_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'target_required');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_must_be_positive_to_two_decimals');
  END IF;
  IF v_asset = 'diamonds' AND p_amount <> round(p_amount, 0) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'diamonds_are_whole_numbers');
  END IF;
  -- Kill switch (standard 3.4 layer 6, review D11): a human-opened diamond_issuance freeze
  -- refuses diamond minting until it is cleared. Burns and chips are untouched.
  IF v_asset = 'diamonds' AND EXISTS (SELECT 1 FROM public.ca_payout_freeze f
                                        WHERE f.scope = 'diamond_issuance' AND f.cleared_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'diamond_issuance_frozen');
  END IF;
  -- THE POLICY (ca_mint_policy): a per-operation cap and a rolling 24-hour
  -- ceiling, both refused here with a reason the operator can read, and
  -- refused again at commit by the constraint trigger for chips whatever the
  -- door. 24h issuance is read from the register with the advisory lock held
  -- below, so two operators cannot both fit under the ceiling at once.
  SELECT * INTO v_pol FROM public.ca_mint_policy WHERE id = 1;
  v_cap  := CASE WHEN v_asset = 'chips' THEN v_pol.per_operation_cap_chips ELSE v_pol.per_operation_cap_diamonds END;
  v_roll := CASE WHEN v_asset = 'chips' THEN v_pol.rolling_24h_cap_chips ELSE v_pol.rolling_24h_cap_diamonds END;
  IF p_amount > v_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_over_the_single_mint_cap',
                              'cap', v_cap, 'requested', p_amount);
  END IF;
  IF length(v_reason) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'issuance_needs_a_real_reason');
  END IF;
  IF COALESCE(btrim(p_op_id), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_required');
  END IF;

  SELECT result INTO v_prior FROM public.ca_op_claims
   WHERE op_id = p_op_id AND fn_name = 'fn_ca_mint';
  IF FOUND AND v_prior IS NOT NULL THEN
    RETURN v_prior || jsonb_build_object('replayed', true);
  ELSIF FOUND THEN
    DELETE FROM public.ca_op_claims WHERE op_id = p_op_id AND fn_name = 'fn_ca_mint';
  END IF;
  INSERT INTO public.ca_op_claims (op_id, fn_name, claimed_by)
  VALUES (p_op_id, 'fn_ca_mint', v_actor);

  PERFORM pg_advisory_xact_lock(hashtext('ca_mint_ledger:' || v_asset));

  v_24h := public.fn_ca_mint_issued_24h(v_asset) + p_amount;
  IF v_24h > v_roll THEN
    RETURN public.fn_ca_release_claim('fn_ca_mint', p_op_id,
             jsonb_build_object('ok', false, 'reason', 'over_the_rolling_24h_issuance_ceiling',
                              'ceiling', v_roll, 'issued_24h', v_24h - p_amount, 'requested', p_amount));
  END IF;

  IF v_asset = 'diamonds' THEN
    IF v_dest = 'house' THEN
      INSERT INTO public.ca_diamond_house (id, balance)
      VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
      SELECT COALESCE(balance, 0) INTO v_before
        FROM public.ca_diamond_house WHERE id = 1 FOR UPDATE;
      UPDATE public.ca_diamond_house
         SET balance = COALESCE(balance, 0) + p_amount, updated_at = now()
       WHERE id = 1 RETURNING balance INTO v_after;
      v_label  := 'the house';
      v_holder := c_house;
      -- No diamond_transactions row: that journal is keyed by a user (two FKs to
      -- auth.users and profiles) and the house is not one. ca_mint_ledger is the
      -- record of a house-side issuance.
    ELSE
      SELECT COALESCE(diamonds, 0), COALESCE(NULLIF(btrim(username), ''), full_name, id::text)
        INTO v_before, v_label FROM public.profiles WHERE id = p_target_id FOR UPDATE;
      IF NOT FOUND THEN
        RETURN public.fn_ca_release_claim('fn_ca_mint', p_op_id,
                 jsonb_build_object('ok', false, 'reason', 'player_not_found'));
      END IF;
      UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + p_amount
       WHERE id = p_target_id RETURNING diamonds INTO v_after;
      -- The op id is the journal reference (DR4: a credit carries its reference), so the earn
      -- ledger files a promotional mint under its engine by prefix (signup: -> signup).
      INSERT INTO public.diamond_transactions
        (user_id, type, transaction_type, amount, balance_after, description, source,
         metadata, counterparty, issuance_class, reference_id)
      VALUES (p_target_id, 'earn', 'mint', p_amount, v_after,
              'The Mint: ' || v_reason, 'the_mint',
              jsonb_build_object('minted_by', v_actor, 'op_id', p_op_id),
              'issuance', v_class, p_op_id)
      RETURNING id INTO v_dia_id;
      v_holder := p_target_id;
    END IF;
  ELSE
    -- The leg is declared WITH A KEY and found by that key: never by shape.
    PERFORM public.fn_ca_declare_ledger('mint', 'issuance_reserve', NULL, NULL, 'mint:' || p_op_id, NULL);
    IF v_dest = 'club' THEN
      SELECT COALESCE(chip_treasury, 0), name INTO v_before, v_label
        FROM public.clubs WHERE id = p_target_id FOR UPDATE;
      IF NOT FOUND THEN
        RETURN public.fn_ca_release_claim('fn_ca_mint', p_op_id,
                 jsonb_build_object('ok', false, 'reason', 'club_not_found'));
      END IF;
      UPDATE public.clubs SET chip_treasury = COALESCE(chip_treasury, 0) + p_amount
       WHERE id = p_target_id RETURNING chip_treasury INTO v_after;
      INSERT INTO public.chip_transactions
        (club_id, from_user_id, to_user_id, amount, transaction_type, notes, balance_after)
      VALUES (p_target_id, v_actor, NULL, p_amount, 'treasury_mint',
              'The Mint: ' || v_reason, v_after);
    ELSE
      SELECT name INTO v_label FROM public.unions WHERE id = p_target_id;
      IF v_label IS NULL THEN
        RETURN public.fn_ca_release_claim('fn_ca_mint', p_op_id,
                 jsonb_build_object('ok', false, 'reason', 'union_not_found'));
      END IF;
      INSERT INTO public.union_wallets (union_id, created_at, updated_at)
      VALUES (p_target_id, now(), now()) ON CONFLICT (union_id) DO NOTHING;
      SELECT COALESCE(chip_balance, 0) INTO v_before
        FROM public.union_wallets WHERE union_id = p_target_id FOR UPDATE;
      UPDATE public.union_wallets
         SET chip_balance = COALESCE(chip_balance, 0) + p_amount, updated_at = now()
       WHERE union_id = p_target_id RETURNING chip_balance INTO v_after;
    END IF;
    SELECT id INTO v_chip_id FROM public.chip_ledger WHERE idempotency_key = 'mint:' || p_op_id;
    PERFORM set_config('app.ledger_category', '', true);
    PERFORM set_config('app.ledger_counterparty', '', true);
    PERFORM set_config('app.ledger_counterparty_entity', '', true);
    PERFORM set_config('app.ledger_idempotency_key', '', true);
    IF v_chip_id IS NULL THEN
      RAISE EXCEPTION 'fn_ca_mint: the balance moved but no journal leg was written for key mint:% - refusing to register an issuance the journal does not carry', p_op_id;
    END IF;
    v_holder := p_target_id;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN action = 'mint' THEN amount ELSE -amount END), 0) + p_amount
    INTO v_supply FROM public.ca_mint_ledger WHERE asset = v_asset;
  SELECT COALESCE(NULLIF(btrim(username), ''), full_name, id::text)
    INTO v_actorlb FROM public.profiles WHERE id = v_actor;

  INSERT INTO public.ca_mint_ledger
    (op_id, action, asset, holder_type, holder_id, holder_label, amount,
     balance_before, balance_after, supply_after, reason,
     performed_by, performed_by_label, chip_ledger_id, diamond_tx_id)
  VALUES
    (p_op_id, 'mint', v_asset, v_dest, v_holder, v_label, p_amount,
     v_before, v_after, v_supply, v_reason, v_actor, v_actorlb, v_chip_id, v_dia_id);

  v_result := jsonb_build_object(
    'ok', true, 'replayed', false, 'action', 'mint',
    'asset', v_asset, 'destination', v_dest, 'issuance_class', v_class,
    'target_id', v_holder, 'target_label', v_label, 'amount', p_amount,
    'balance_before', v_before, 'balance_after', v_after, 'supply_after', v_supply,
    'ledger_id', v_chip_id, 'issued_24h_after', v_24h, 'rolling_24h_cap', v_roll,
    'minted_by', v_actor, 'reason', v_reason, 'op_id', p_op_id);

  UPDATE public.ca_op_claims SET result = v_result, finalized_at = now()
   WHERE op_id = p_op_id AND fn_name = 'fn_ca_mint';

  RETURN v_result;
END;
$function$
  $create$;

  v_target := to_regprocedure(v_signature);
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Post-apply verification failed: % does not exist after the replacement ran.', v_signature;
  END IF;

  v_current := md5(pg_get_functiondef(v_target::oid));
  IF v_current IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Post-apply verification failed: % has md5 %, expected %. The replacement did not reproduce the mirrored definition.',
      v_signature, v_current, v_expected;
  END IF;

  RAISE NOTICE '% installed from source. Post-migration md5 %.', v_signature, v_current;
END
$migration$;
