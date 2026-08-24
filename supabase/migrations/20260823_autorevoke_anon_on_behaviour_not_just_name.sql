-- ═══════════════════════════════════════════════════════════════════════
-- 20260823_autorevoke_anon_on_behaviour_not_just_name.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2
-- AUTHOR:       Claude (Cowork)
-- AFFECTS:      fn_autorevoke_privileged_anon (event-trigger function),
--               EXECUTE grants on fn_credit_stalled_seat_first_stacks
-- IRREVERSIBLE: no
--
-- WHY:
--   SIX anon-callable SECURITY DEFINER writers reached production in a single
--   day, each caught only after the fact by CHECK 10:
--
--     fn_bust_player_from_table          fn_repair_seat_first_games
--     fn_clear_table_seats               fn_sync_seat_first_player_count
--     fn_seat_late_registrant            fn_credit_stalled_seat_first_stacks
--
--   trg_autorevoke_privileged_anon exists precisely to stop this. It fired on
--   none of them, because its rule is a NAME PATTERN:
--
--     v_name ~* '(mint_|chip|wallet|promo|...|jackpot|bbj)'
--     OR v_name ~* '^(credit|debit|transfer|...)_'
--
--   A name allowlist can only ever catch functions somebody thought to name.
--   And the prefix arm is anchored with ^, so
--   `fn_credit_stalled_seat_first_stacks` — a function that literally credits
--   stacks — walked straight through on the strength of its `fn_` prefix.
--
--   economy_invariants() already states the real rule behaviourally. The
--   trigger was enforcing a different, weaker one.
--
-- HOW:
--   Add a BEHAVIOURAL arm. If a newly created or replaced public function is
--   SECURITY DEFINER (so RLS does not apply), writes, and never consults
--   auth.uid() (so it cannot tell who is asking), strip PUBLIC and anon —
--   whatever it is called.
--
--   The name arm stays: it also covers non-definer functions, which the
--   behavioural arm deliberately does not. Its prefix check now tolerates an
--   `fn_` prefix.
--
--   The app.allow_privileged_anon_grant escape hatch is untouched, so a
--   deliberate exception is still one SET away. It just has to be deliberate.
--
-- VERIFIED, not assumed:
--   Created `zz_probe_harmless_looking_name()` — SECURITY DEFINER, inserts,
--   no auth.uid(), and matching NONE of the name patterns — then explicitly
--   ran GRANT EXECUTE ... TO anon. Immediately afterwards:
--       has_function_privilege('anon', ...)  = false
--       privileged_function_lock rows        = 1
--   The explicit grant did not survive its own statement. Probe dropped.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. PRE-FLIGHT ASSERTIONS ────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname='trg_autorevoke_privileged_anon') THEN
        RAISE EXCEPTION 'pre-flight failed: trg_autorevoke_privileged_anon not found';
    END IF;
END $$;

-- ── 2. THE ACTUAL CHANGES ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_autorevoke_privileged_anon()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  obj          record;
  lk           record;
  v_name       text;
  v_sig        text;
  v_secdef     boolean;
  v_src        text;
  v_behaves    boolean;
  v_named      boolean;
  v_saw_grant  boolean := false;
BEGIN
  IF COALESCE(current_setting('app.allow_privileged_anon_grant', true), 'off') = 'on' THEN
    RETURN;
  END IF;

  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP

    -- GRANT rows carry no objid/object_identity at all (probe-verified):
    --   [tag=GRANT | object_type=FUNCTION | objid=NULL | ident=NULL]
    -- so the granted function cannot be identified here. Flag a lock sweep.
    IF obj.command_tag = 'GRANT' THEN
      IF upper(COALESCE(obj.object_type, '')) = 'FUNCTION' THEN
        v_saw_grant := true;
      END IF;
      CONTINUE;
    END IF;

    IF lower(COALESCE(obj.object_type, '')) <> 'function' THEN
      CONTINUE;
    END IF;

    SELECT p.proname,
           format('public.%I(%s)', p.proname,
                  COALESCE((SELECT string_agg(format_type(t.typ, NULL), ', ' ORDER BY t.ord)
                              FROM unnest(p.proargtypes) WITH ORDINALITY AS t(typ, ord)), '')),
           p.prosecdef,
           p.prosrc
      INTO v_name, v_sig, v_secdef, v_src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.oid = obj.objid
       AND n.nspname = 'public';

    IF v_name IS NULL
       OR v_name IN ('fn_autorevoke_privileged_anon', 'fn_audit_privileged_grants') THEN
      CONTINUE;
    END IF;

    -- ARM 1 — NAME. Unchanged except the prefix arm now tolerates an `fn_`
    -- prefix: `fn_credit_stalled_seat_first_stacks` defeated the anchored
    -- version on 2026-08-23 despite crediting stacks.
    v_named := v_name !~ '^st_' AND (
         v_name ~* '(mint_|_mint|chip|wallet|promo|cashout|diamond|rake|bounty|settle|payout|clawback|purchase|treasury|jackpot|bbj)'
      OR v_name ~* '^(fn_)?(credit|debit|transfer|distribute|deduct|atomic|admin)_'
      OR v_name ~* '(promote_member|transfer_club_ownership|remove_player)'
    );

    -- ARM 2 — BEHAVIOUR. The rule economy_invariants() actually asserts:
    -- SECURITY DEFINER (so RLS does not apply) + writes + never consults
    -- auth.uid() (so it cannot tell who is asking). Such a function must not
    -- be reachable without a session, whatever it is called. This is the arm
    -- that would have caught all six of today's.
    v_behaves := COALESCE(v_secdef, false)
             AND v_src ~* '\m(insert|update|delete)\M'
             AND v_src !~* 'auth\.uid\(\)';

    IF v_named OR v_behaves THEN
      BEGIN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', obj.object_identity);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',   obj.object_identity);

        INSERT INTO public.privileged_function_lock (function_signature, security_definer, reason)
        VALUES (v_sig,
                COALESCE(v_secdef, false),
                'Auto-locked by trg_autorevoke_privileged_anon on ' || obj.command_tag
                 || CASE WHEN v_behaves AND NOT v_named
                         THEN ' (behavioural: definer + writes + no auth.uid())'
                         WHEN v_behaves THEN ' (name + behavioural)'
                         ELSE ' (name)' END || '.')
        ON CONFLICT (function_signature) DO NOTHING;

        RAISE NOTICE '[autorevoke] stripped PUBLIC/anon EXECUTE from % (tag %, named=%, behaviour=%)',
          obj.object_identity, obj.command_tag, v_named, v_behaves;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[autorevoke] could not revoke on %: %', obj.object_identity, SQLERRM;
      END;
    END IF;
  END LOOP;

  IF v_saw_grant THEN
    FOR lk IN
      SELECT l.function_signature, to_regprocedure(l.function_signature) AS rp
        FROM public.privileged_function_lock l
       WHERE to_regprocedure(l.function_signature) IS NOT NULL
         AND ( has_function_privilege('anon',   to_regprocedure(l.function_signature)::oid, 'EXECUTE')
            OR has_function_privilege('public', to_regprocedure(l.function_signature)::oid, 'EXECUTE') )
    LOOP
      BEGIN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', lk.function_signature);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',   lk.function_signature);
        RAISE NOTICE '[autorevoke] GRANT sweep re-revoked anon/PUBLIC on %', lk.function_signature;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[autorevoke] GRANT sweep could not revoke on %: %', lk.function_signature, SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$fn$
SET search_path = public, pg_catalog;

-- Close the instance that was open when this was written. It credits stacks,
-- and anyone holding the publishable key could call it.
REVOKE EXECUTE ON FUNCTION public.fn_credit_stalled_seat_first_stacks() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_credit_stalled_seat_first_stacks() TO service_role;

-- ── 3. POST-APPLY ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE v_exposed integer; v_inv boolean;
BEGIN
    SELECT count(*) INTO v_exposed
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND p.prosrc ~* '\m(insert|update|delete)\M'
       AND p.prosrc !~* 'auth\.uid\(\)';
    IF v_exposed > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % anon-callable mutating definer fn(s) remain', v_exposed;
    END IF;

    SELECT ok INTO v_inv FROM public.economy_invariants()
     WHERE check_name = 'anon_mutating_definer_functions_check_auth_uid';
    IF NOT COALESCE(v_inv, false) THEN
        RAISE EXCEPTION 'post-apply failed: economy_invariants still red';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='fn_autorevoke_privileged_anon'
           AND p.prosrc LIKE '%behavioural%'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: behavioural arm not present in the trigger function';
    END IF;

    RAISE NOTICE 'post-apply OK: behavioural arm live, 0 anon-exposed mutating definers';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK — restores the name-only rule. Only do this if the behavioural
-- arm is provably blocking a legitimate anonymous entry point, and add that
-- entry point to a documented exception in the same change.
-- ═══════════════════════════════════════════════════════════════════════
-- Re-apply the body from 20260816153228_autorevoke_privileged_anon_also_on_grant.sql.
