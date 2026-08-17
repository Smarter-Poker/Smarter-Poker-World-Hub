-- APPLIED TO PRODUCTION 2026-08-17 05:57:44 UTC (version 20260817055744)
--
-- Drain batch 1 of the anon-executable money backlog: 15 MUTATING MEDIUM
-- functions and all 8 LOW trigger functions.
--
-- Evidence gathered before touching anything:
--
-- 1. Every one of the 15 mutating functions already grants EXECUTE to BOTH
--    authenticated and service_role (verified). Revoking anon therefore cannot
--    break a logged-in browser caller (TablePage.tsx, WalletService.ts,
--    CashierPage.tsx, BBJService.ts, hooks/index.ts), the Hetzner engine
--    (service_role), or the WH API routes (pages/api/club-arena/union-wallet.js,
--    which builds its client from SUPABASE_SERVICE_ROLE_KEY).
--    The ONLY caller a revoke can break is a logged-out one -- and a logged-out
--    caller of atomic_table_rebuy or bbj_atomic_payout is definitionally wrong.
--
-- 2. Trigger functions: revoking EXECUTE does NOT stop the trigger firing.
--    Proved by rollback probe rather than assumed --
--      anon_exec_before = t
--      anon_exec_after  = f
--      INSERT ... AS anon -> error = [none]
--      rows carrying the trigger's effect = 1
--    Postgres checks EXECUTE at CREATE TRIGGER time, not per-statement.
--
-- The 12 read-only getters were deliberately held back for batch 2 so each
-- could get its own caller trace first.

DO $drain$
DECLARE
  r            record;
  n_revoked    int := 0;
  n_expected   int;
  mutating     text[] := ARRAY[
    'add_bbj_contribution','atomic_table_addon','atomic_table_rebuy','atomic_table_withdraw',
    'bbj_atomic_payout','bbj_atomic_payout_v2','bbj_credit_one_recipient','deduct_table_chip_lock',
    'expire_settlement_locks','fn_idempotent_deduct_wallet','fn_idempotent_wallet_transfer',
    'fn_union_bbj_pool_payout','fn_union_fund_bbj_pool','fn_union_move_rake_to_chips_atomic',
    'promo_apply_playthrough'
  ];
  triggers_    text[] := ARRAY[
    'enforce_chip_ledger_performed_by','fn_auto_promote_waitlist','guard_wallet_balance_write',
    'sync_agent_wallet_columns','touch_chip_escrow_holds','touch_club_wallets',
    'trg_auto_cashout_on_table_close','update_promotion_totals'
  ];
BEGIN
  SELECT count(*) INTO n_expected
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname = ANY(mutating) OR p.proname = ANY(triggers_))
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  FOR r IN
    SELECT p.oid, p.proname,
           format('public.%I(%s)', p.proname,
                  COALESCE((SELECT string_agg(format_type(t.typ, NULL), ', ' ORDER BY t.ord)
                              FROM unnest(p.proargtypes) WITH ORDINALITY AS t(typ, ord)), '')) AS sig,
           p.prosecdef,
           (p.proname = ANY(triggers_)) AS is_trigger
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname = ANY(mutating) OR p.proname = ANY(triggers_))
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    IF NOT r.is_trigger
       AND NOT has_function_privilege('authenticated', r.oid, 'EXECUTE')
       AND NOT has_function_privilege('service_role',  r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'refusing to revoke anon on % - it would leave the function with no caller role', r.sig;
    END IF;

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',   r.sig);

    INSERT INTO public.privileged_function_lock (function_signature, security_definer, reason)
    VALUES (r.sig, r.prosecdef,
            CASE WHEN r.is_trigger
                 THEN 'Trigger function. Revoking EXECUTE is proven not to stop the trigger firing (rollback probe 2026-08-16); grant hygiene only.'
                 ELSE 'Mutating money function. authenticated + service_role retain EXECUTE; only a logged-out caller is denied, and that caller is always wrong.'
            END)
    ON CONFLICT (function_signature) DO NOTHING;

    n_revoked := n_revoked + 1;
  END LOOP;

  IF n_revoked <> n_expected THEN
    RAISE EXCEPTION 'revoked % but expected % - aborting', n_revoked, n_expected;
  END IF;
  RAISE NOTICE 'drain batch 1: revoked anon/PUBLIC on % functions', n_revoked;
END
$drain$;

DO $assert$
DECLARE n_crit int; n_bad int; n_viol int;
BEGIN
  SELECT count(*) INTO n_crit FROM public.fn_audit_privileged_grants() WHERE severity = 'CRITICAL';
  IF n_crit <> 0 THEN RAISE EXCEPTION 'CRITICAL is %, expected 0', n_crit; END IF;
  SELECT count(*) INTO n_viol FROM public.fn_verify_privileged_lock();
  IF n_viol <> 0 THEN RAISE EXCEPTION 'privileged lock has % violations', n_viol; END IF;
  SELECT count(*) INTO n_bad FROM public.fn_grant_guard_health() WHERE status <> 'OK';
  IF n_bad <> 0 THEN RAISE EXCEPTION 'grant guard health is not all-OK (% failing checks)', n_bad; END IF;
END
$assert$;
