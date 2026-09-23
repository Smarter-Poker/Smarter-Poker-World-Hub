-- Source mirror for fn_ca_burn, the chip and diamond retirement function.
--
-- This migration is a no-op against production as it stands today, and it was
-- deliberately not applied. It exists so that a replay of this repository can
-- no longer revert live.
--
-- WHAT WAS MEASURED
--
-- On 2026-09-23 the installed definition was read with pg_get_functiondef on
-- project kuklfnapbkmacvwxktbh. It is 9629 bytes and its md5 is
-- 01892d172b17e45bc8a47f76d3e5a564. The CREATE OR REPLACE FUNCTION below is
-- that definition reproduced byte for byte. The file was assembled from the
-- pg_get_functiondef output itself rather than retyped, and the assembled
-- bytes were hash checked against the live hash before this file was saved.
--
-- THE DIVERGENCE THIS CLOSES
--
-- The only source for fn_ca_burn in this repository is
-- 20260902_the_mint_issuance_and_retirement.sql, and it is stale in exactly
-- the same way as its sibling fn_ca_mint. That file declares six parameters:
--
--   fn_ca_burn(p_asset text, p_source text, p_target_id uuid,
--              p_amount numeric, p_reason text, p_op_id text)
--
-- Production carries seven:
--
--   fn_ca_burn(p_asset text, p_source text, p_target_id uuid,
--              p_amount numeric, p_reason text, p_op_id text,
--              p_class text DEFAULT 'admin'::text)
--
-- Because the argument lists differ, replaying the stale file would not
-- replace the live function. CREATE OR REPLACE FUNCTION with a different
-- argument count creates a second function, so production would end up
-- carrying both a six argument and a seven argument fn_ca_burn: an overload
-- ambiguity on the chip retirement path.
--
-- The stale file would also run
--   GRANT EXECUTE ON FUNCTION
--     public.fn_ca_burn(text, text, uuid, numeric, text, text)
--     TO authenticated, service_role;
-- while the live seven argument function is granted to service_role only. Its
-- measured ACL is postgres=X/postgres and service_role=X/postgres, with no
-- authenticated entry. A replay would therefore also hand every signed-in user
-- a burn entry point.
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
-- drop the six argument definition, because no six argument fn_ca_burn exists
-- in production today, and retiring the stale CREATE inside
-- 20260902_the_mint_issuance_and_retirement.sql is a separate decision that is
-- not made here. It changes no grant, no table, no policy and no row.
--
-- TIER:        3 if ever applied where the function is absent, since it would
--              install a money-path function. No-op against production.
-- AFFECTS:     public.fn_ca_burn(text,text,uuid,numeric,text,text,text) only.
-- IRREVERSIBLE: no
-- APPLIED:     no. Written and hash verified on 2026-09-23, not pushed.

DO $migration$
DECLARE
  v_signature text := 'public.fn_ca_burn(text,text,uuid,numeric,text,text,text)';
  v_expected  text := '01892d172b17e45bc8a47f76d3e5a564';
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
CREATE OR REPLACE FUNCTION public.fn_ca_burn(p_asset text, p_source text, p_target_id uuid, p_amount numeric, p_reason text, p_op_id text, p_class text DEFAULT 'admin'::text)
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
  v_src   text := lower(btrim(COALESCE(p_source, '')));
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_class text := lower(btrim(COALESCE(p_class, 'admin')));
  v_holder uuid;
  v_prior jsonb; v_before numeric; v_after numeric; v_label text;
  v_supply numeric; v_chip_id uuid; v_dia_id uuid; v_actorlb text; v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.id = v_actor AND p.role IN ('admin', 'god')) INTO v_admin;
    IF NOT v_admin THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'the_mint_is_admin_only');
    END IF;
  END IF;

  IF v_asset NOT IN ('chips', 'diamonds') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'asset_must_be_chips_or_diamonds');
  END IF;
  IF v_asset = 'chips' AND v_src NOT IN ('club', 'union') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'chips_are_retired_from_a_club_or_union_wallet_only');
  END IF;
  IF v_asset = 'diamonds' AND v_src NOT IN ('player', 'house') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'diamonds_are_retired_from_a_player_or_from_the_house_only');
  END IF;
  IF v_class NOT IN ('purchased', 'promotional', 'earned', 'transferred', 'seeded',
                     'refund', 'spend', 'bridge', 'deletion', 'admin', 'arena',
                     'house', 'unknown') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_issuance_class', 'class', v_class);
  END IF;
  IF v_asset = 'diamonds' AND v_src = 'house' THEN
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
  IF length(v_reason) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'retirement_needs_a_real_reason');
  END IF;
  IF COALESCE(btrim(p_op_id), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_required');
  END IF;

  SELECT result INTO v_prior FROM public.ca_op_claims
   WHERE op_id = p_op_id AND fn_name = 'fn_ca_burn';
  IF FOUND AND v_prior IS NOT NULL THEN
    RETURN v_prior || jsonb_build_object('replayed', true);
  ELSIF FOUND THEN
    DELETE FROM public.ca_op_claims WHERE op_id = p_op_id AND fn_name = 'fn_ca_burn';
  END IF;
  INSERT INTO public.ca_op_claims (op_id, fn_name, claimed_by)
  VALUES (p_op_id, 'fn_ca_burn', v_actor);

  PERFORM pg_advisory_xact_lock(hashtext('ca_mint_ledger:' || v_asset));

  IF v_asset = 'diamonds' THEN
    IF v_src = 'house' THEN
      INSERT INTO public.ca_diamond_house (id, balance)
      VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
      SELECT COALESCE(balance, 0) INTO v_before
        FROM public.ca_diamond_house WHERE id = 1 FOR UPDATE;
      IF v_before < p_amount THEN
        RETURN public.fn_ca_release_claim('fn_ca_burn', p_op_id,
                 jsonb_build_object('ok', false, 'reason', 'that_would_take_the_house_below_zero',
                                  'balance', v_before, 'requested', p_amount));
      END IF;
      UPDATE public.ca_diamond_house
         SET balance = COALESCE(balance, 0) - p_amount, updated_at = now()
       WHERE id = 1 RETURNING balance INTO v_after;
      v_label  := 'the house';
      v_holder := c_house;
    ELSE
      SELECT COALESCE(diamonds, 0), COALESCE(NULLIF(btrim(username), ''), full_name, id::text)
        INTO v_before, v_label FROM public.profiles WHERE id = p_target_id FOR UPDATE;
      IF NOT FOUND THEN
        RETURN public.fn_ca_release_claim('fn_ca_burn', p_op_id,
                 jsonb_build_object('ok', false, 'reason', 'player_not_found'));
      END IF;
      IF v_before < p_amount THEN
        RETURN public.fn_ca_release_claim('fn_ca_burn', p_op_id,
                 jsonb_build_object('ok', false, 'reason', 'that_would_take_the_balance_below_zero',
                                  'balance', v_before, 'requested', p_amount));
      END IF;
      UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) - p_amount
       WHERE id = p_target_id RETURNING diamonds INTO v_after;
      -- The op id is the journal reference (DR4), the same way fn_ca_mint records it.
      INSERT INTO public.diamond_transactions
        (user_id, type, transaction_type, amount, balance_after, description, source,
         metadata, counterparty, issuance_class, reference_id)
      VALUES (p_target_id, 'spend', 'burn', -p_amount, v_after,
              'The Mint (retired): ' || v_reason, 'the_mint',
              jsonb_build_object('burned_by', v_actor, 'op_id', p_op_id),
              'retired', v_class, p_op_id)
      RETURNING id INTO v_dia_id;
      v_holder := p_target_id;
    END IF;
  ELSE
    -- The leg is declared WITH A KEY and found by that key: never by shape.
    PERFORM public.fn_ca_declare_ledger('burn', 'chip_retirement', NULL, NULL, 'burn:' || p_op_id, NULL);
    IF v_src = 'club' THEN
      SELECT COALESCE(chip_treasury, 0), name INTO v_before, v_label
        FROM public.clubs WHERE id = p_target_id FOR UPDATE;
      IF NOT FOUND THEN
        RETURN public.fn_ca_release_claim('fn_ca_burn', p_op_id,
                 jsonb_build_object('ok', false, 'reason', 'club_not_found'));
      END IF;
      IF v_before < p_amount THEN
        RETURN public.fn_ca_release_claim('fn_ca_burn', p_op_id,
                 jsonb_build_object('ok', false, 'reason', 'that_would_take_the_treasury_below_zero',
                                  'balance', v_before, 'requested', p_amount));
      END IF;
      UPDATE public.clubs SET chip_treasury = COALESCE(chip_treasury, 0) - p_amount
       WHERE id = p_target_id RETURNING chip_treasury INTO v_after;
      INSERT INTO public.chip_transactions
        (club_id, from_user_id, to_user_id, amount, transaction_type, notes, balance_after)
      VALUES (p_target_id, v_actor, NULL, p_amount, 'treasury_burn',
              'The Mint (retired): ' || v_reason, v_after);
    ELSE
      SELECT COALESCE(w.chip_balance, 0), u.name INTO v_before, v_label
        FROM public.union_wallets w JOIN public.unions u ON u.id = w.union_id
       WHERE w.union_id = p_target_id FOR UPDATE OF w;
      IF NOT FOUND THEN
        RETURN public.fn_ca_release_claim('fn_ca_burn', p_op_id,
                 jsonb_build_object('ok', false, 'reason', 'union_wallet_not_found'));
      END IF;
      IF v_before < p_amount THEN
        RETURN public.fn_ca_release_claim('fn_ca_burn', p_op_id,
                 jsonb_build_object('ok', false, 'reason', 'that_would_take_the_union_bank_below_zero',
                                  'balance', v_before, 'requested', p_amount));
      END IF;
      UPDATE public.union_wallets
         SET chip_balance = COALESCE(chip_balance, 0) - p_amount, updated_at = now()
       WHERE union_id = p_target_id RETURNING chip_balance INTO v_after;
    END IF;
    SELECT id INTO v_chip_id FROM public.chip_ledger WHERE idempotency_key = 'burn:' || p_op_id;
    PERFORM set_config('app.ledger_category', '', true);
    PERFORM set_config('app.ledger_counterparty', '', true);
    PERFORM set_config('app.ledger_counterparty_entity', '', true);
    PERFORM set_config('app.ledger_idempotency_key', '', true);
    IF v_chip_id IS NULL THEN
      RAISE EXCEPTION 'fn_ca_burn: the balance moved but no journal leg was written for key burn:% - refusing to register a retirement the journal does not carry', p_op_id;
    END IF;
    v_holder := p_target_id;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN action = 'mint' THEN amount ELSE -amount END), 0) - p_amount
    INTO v_supply FROM public.ca_mint_ledger WHERE asset = v_asset;
  SELECT COALESCE(NULLIF(btrim(username), ''), full_name, id::text)
    INTO v_actorlb FROM public.profiles WHERE id = v_actor;

  INSERT INTO public.ca_mint_ledger
    (op_id, action, asset, holder_type, holder_id, holder_label, amount,
     balance_before, balance_after, supply_after, reason,
     performed_by, performed_by_label, chip_ledger_id, diamond_tx_id)
  VALUES
    (p_op_id, 'burn', v_asset, v_src, v_holder, v_label, p_amount,
     v_before, v_after, v_supply, v_reason, v_actor, v_actorlb, v_chip_id, v_dia_id);

  v_result := jsonb_build_object(
    'ok', true, 'replayed', false, 'action', 'burn',
    'asset', v_asset, 'source', v_src, 'issuance_class', v_class,
    'target_id', v_holder, 'target_label', v_label, 'amount', p_amount,
    'balance_before', v_before, 'balance_after', v_after, 'supply_after', v_supply,
    'ledger_id', v_chip_id,
    'burned_by', v_actor, 'reason', v_reason, 'op_id', p_op_id);

  UPDATE public.ca_op_claims SET result = v_result, finalized_at = now()
   WHERE op_id = p_op_id AND fn_name = 'fn_ca_burn';

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
