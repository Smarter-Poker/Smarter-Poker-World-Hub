-- Source mirror for fn_ca_mint_overview, the function behind the Mint tab's
-- conservation card.
--
-- This migration is a no-op against production as it stands today, and it was
-- deliberately not applied. It exists so that a replay of this repository can
-- no longer revert live.
--
-- WHAT WAS MEASURED
--
-- On 2026-09-23 the installed definition was read with pg_get_functiondef on
-- project kuklfnapbkmacvwxktbh. It is 6716 bytes and its md5 is
-- 45d5d16b6ca76f4c55a74bf859f693a2. The CREATE OR REPLACE FUNCTION below is
-- that definition reproduced byte for byte. The file was assembled from the
-- pg_get_functiondef output itself rather than retyped, and the assembled
-- bytes were hash checked against the live hash before this file was saved.
--
-- THE DIVERGENCE THIS CLOSES
--
-- The only source for fn_ca_mint_overview in this repository is
-- 20260902_the_mint_issuance_and_retirement.sql, and it is stale. Unlike its
-- siblings fn_ca_mint and fn_ca_burn, the signature has not changed: both the
-- stale file and production declare fn_ca_mint_overview() with no arguments.
-- That makes this the more dangerous of the two shapes of drift, because a
-- replay of the stale file would genuinely replace the live function rather
-- than sit beside it. Production would silently lose work.
--
-- The stale definition returns ten keys: ok, chips_issued, diamonds_issued,
-- mint_operations, club_treasuries, union_banks, member_wallets,
-- chips_on_the_felt, diamonds_held and diamond_holders. The live definition
-- returns those and five more: reconciliation, issuance, diamonds, policy and
-- by_origin. To build them it reads fn_ca_diamond_register_vs_supply(),
-- fn_ca_mint_register_vs_supply(), ca_mint_policy and the baseline rows of
-- ca_mint_ledger.
--
-- So replaying the stale file would strip the conservation card back to bare
-- totals. The register against meter reconciliation would go, along with its
-- difference, unexplained_since_baseline and balanced fields; the issuance
-- window would go; the whole diamonds register block would go, including its
-- own baseline, its 24 hour headroom against the policy ceiling and its
-- by_origin breakdown; the policy caps and chip headroom would go; and the
-- ledger-wide by_origin summary would go. The card would still render, which
-- is the point: nothing would error, the operator would simply stop being
-- shown whether the mint balances.
--
-- The grant posture is not part of this drift. The live ACL is
-- postgres=X/postgres, authenticated=X/postgres and service_role=X/postgres,
-- which is what the stale file already grants. Only the body diverges.
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
-- this file either installs the live definition when the function is absent,
-- or refuses outright when some other body is installed.
--
-- TIER:        3 if ever applied where the function is absent. No-op against
--              production.
-- AFFECTS:     public.fn_ca_mint_overview() only. No grant, table, policy or
--              row is changed.
-- IRREVERSIBLE: no
-- APPLIED:     no. Written and hash verified on 2026-09-23, not pushed.

DO $migration$
DECLARE
  v_signature text := 'public.fn_ca_mint_overview()';
  v_expected  text := '45d5d16b6ca76f4c55a74bf859f693a2';
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
CREATE OR REPLACE FUNCTION public.fn_ca_mint_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_rec record; v_pol public.ca_mint_policy%ROWTYPE; v_base timestamptz;
  v_issued_24h numeric; v_retired_24h numeric; v_issued_base numeric; v_retired_base numeric;
  v_drec record; v_dbase timestamptz;
  v_dissued_24h numeric; v_dretired_24h numeric; v_dissued_base numeric; v_dretired_base numeric;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.id = v_actor AND p.role IN ('admin', 'god')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'the_mint_is_admin_only');
  END IF;
  SELECT * INTO v_rec FROM public.fn_ca_mint_register_vs_supply();
  SELECT * INTO v_pol FROM public.ca_mint_policy WHERE id = 1;
  SELECT min(created_at) INTO v_base FROM public.ca_mint_ledger WHERE op_id LIKE 'register-opening-baseline:%';
  SELECT COALESCE(sum(amount) FILTER (WHERE action = 'mint' AND created_at > now() - interval '24 hours'), 0),
         COALESCE(sum(amount) FILTER (WHERE action = 'burn' AND created_at > now() - interval '24 hours'), 0),
         COALESCE(sum(amount) FILTER (WHERE action = 'mint' AND created_at > v_base), 0),
         COALESCE(sum(amount) FILTER (WHERE action = 'burn' AND created_at > v_base), 0)
    INTO v_issued_24h, v_retired_24h, v_issued_base, v_retired_base
    FROM public.ca_mint_ledger WHERE asset = 'chips' AND origin <> 'baseline';

  -- Diamonds: the register against the live meter (player balances + house).
  SELECT * INTO v_drec FROM public.fn_ca_diamond_register_vs_supply();
  SELECT min(created_at) INTO v_dbase FROM public.ca_mint_ledger WHERE asset = 'diamonds' AND origin = 'baseline';
  SELECT COALESCE(sum(amount) FILTER (WHERE action = 'mint' AND created_at > now() - interval '24 hours'), 0),
         COALESCE(sum(amount) FILTER (WHERE action = 'burn' AND created_at > now() - interval '24 hours'), 0),
         COALESCE(sum(amount) FILTER (WHERE action = 'mint' AND created_at > v_dbase), 0),
         COALESCE(sum(amount) FILTER (WHERE action = 'burn' AND created_at > v_dbase), 0)
    INTO v_dissued_24h, v_dretired_24h, v_dissued_base, v_dretired_base
    FROM public.ca_mint_ledger WHERE asset = 'diamonds' AND origin <> 'baseline';

  RETURN jsonb_build_object(
    'ok', true,
    'chips_issued',      public.fn_ca_mint_supply('chips'),
    'diamonds_issued',   public.fn_ca_mint_supply('diamonds'),
    'mint_operations',   (SELECT count(*) FROM public.ca_mint_ledger),
    'club_treasuries',   (SELECT COALESCE(SUM(COALESCE(chip_treasury, 0)), 0) FROM public.clubs),
    'union_banks',       (SELECT COALESCE(SUM(COALESCE(chip_balance, 0)), 0) FROM public.union_wallets),
    'member_wallets',    (SELECT COALESCE(SUM(COALESCE(chip_balance, 0)), 0) FROM public.club_members),
    'chips_on_the_felt', (SELECT COALESCE(SUM(COALESCE(stack, 0)), 0) FROM public.table_seats WHERE left_at IS NULL),
    'diamonds_held',     (SELECT COALESCE(SUM(COALESCE(diamonds, 0)), 0) FROM public.profiles),
    'diamond_holders',   (SELECT count(*) FROM public.profiles WHERE COALESCE(diamonds, 0) > 0),
    'reconciliation', jsonb_build_object(
      'register_net',               v_rec.register_net,
      'register_net_at_meter',      v_rec.register_net_at_meter,
      'meter_total',                v_rec.meter_total,
      'meter_taken_at',             v_rec.meter_taken_at,
      'meter_age_seconds',          extract(epoch FROM (now() - v_rec.meter_taken_at))::int,
      'difference',                 v_rec.difference,
      'unexplained_since_baseline', v_rec.unexplained_since_baseline,
      'baseline_at',                v_base,
      'balanced',                   (v_rec.difference = v_rec.unexplained_since_baseline)),
    'issuance', jsonb_build_object(
      'issued_since_baseline',  v_issued_base,
      'retired_since_baseline', v_retired_base,
      'issued_24h',             v_issued_24h,
      'retired_24h',            v_retired_24h),
    'diamonds', jsonb_build_object(
      'register_net',     v_drec.register_net,
      'meter_total',      v_drec.meter_total,
      'player_diamonds',  v_drec.player_diamonds,
      'house_diamonds',   v_drec.house_diamonds,
      'difference',       v_drec.difference,
      'balanced',         (v_drec.difference = 0),
      'baseline_at',      v_dbase,
      'issued_24h',       v_dissued_24h,
      'retired_24h',      v_dretired_24h,
      'issued_since_baseline',  v_dissued_base,
      'retired_since_baseline', v_dretired_base,
      'headroom_24h',     v_pol.rolling_24h_cap_diamonds - public.fn_ca_mint_issued_24h('diamonds'),
      'by_origin_24h', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                          'origin', o.origin, 'action', o.action, 'operations', o.n, 'amount', o.total)
                          ORDER BY o.action, o.total DESC), '[]'::jsonb)
                         FROM (SELECT origin, action, count(*) n, sum(amount) total
                                 FROM public.ca_mint_ledger
                                WHERE asset = 'diamonds' AND created_at > now() - interval '24 hours'
                                GROUP BY 1, 2) o),
      'by_origin', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'origin', o.origin, 'action', o.action, 'operations', o.n, 'amount', o.total)
                      ORDER BY o.action, o.total DESC), '[]'::jsonb)
                     FROM (SELECT origin, action, count(*) n, sum(amount) total
                             FROM public.ca_mint_ledger
                            WHERE asset = 'diamonds' AND origin <> 'baseline'
                            GROUP BY 1, 2) o)),
    'policy', jsonb_build_object(
      'per_operation_cap_chips',    v_pol.per_operation_cap_chips,
      'rolling_24h_cap_chips',      v_pol.rolling_24h_cap_chips,
      'per_operation_cap_diamonds', v_pol.per_operation_cap_diamonds,
      'rolling_24h_cap_diamonds',   v_pol.rolling_24h_cap_diamonds,
      'headroom_24h_chips',         v_pol.rolling_24h_cap_chips - v_issued_24h,
      'note',                       v_pol.note,
      'updated_at',                 v_pol.updated_at),
    'by_origin', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                     'origin', o.origin, 'asset', o.asset, 'action', o.action,
                     'operations', o.n, 'amount', o.total) ORDER BY o.asset, o.origin, o.action), '[]'::jsonb)
                    FROM (SELECT origin, asset, action, count(*) n, sum(amount) total
                            FROM public.ca_mint_ledger GROUP BY 1, 2, 3) o)
  );
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
