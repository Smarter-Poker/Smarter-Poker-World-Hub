-- APPLIED TO PRODUCTION 2026-08-16 15:36:13 UTC (version 20260816153613)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- BUG (caught by probe before it could bite): the lock table stored
-- pg_get_function_identity_arguments(), which INCLUDES parameter names --
--   public.add_bbj_contribution(p_club_id uuid, p_table_id uuid, ...)
-- That form is legal in GRANT/REVOKE/ALTER FUNCTION but is NOT accepted by
-- ::regprocedure, which parses types only. The GRANT sweep cast every row to
-- regprocedure, so the FIRST function GRANT after the previous migration
-- would have raised
--   ERROR: invalid type name "p_club_id uuid"
-- and, because an event trigger error aborts the triggering statement, it
-- would have made EVERY function GRANT in the database fail. That is a
-- self-inflicted outage, not a hardening. Fixed here before anything ran.
--
-- Signatures are now stored types-only, and the sweep resolves them with
-- to_regprocedure() (returns NULL instead of raising) so a stale row can
-- never abort a GRANT again.
-- ═══════════════════════════════════════════════════════════════════════════

TRUNCATE public.privileged_function_lock;

INSERT INTO public.privileged_function_lock (function_signature, security_definer, reason)
SELECT
  format('public.%I(%s)', p.proname,
         COALESCE((SELECT string_agg(format_type(t.typ, NULL), ', ' ORDER BY t.ord)
                     FROM unnest(p.proargtypes) WITH ORDINALITY AS t(typ, ord)), '')),
  p.prosecdef,
  CASE WHEN p.prosecdef
       THEN 'SECURITY DEFINER money/privileged function; anon EXECUTE would bypass RLS entirely.'
       ELSE 'Money/privileged function; anon EXECUTE denied for defence in depth.'
  END
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.proname !~ '^st_'
  AND p.proname NOT IN ('fn_audit_privileged_grants', 'fn_autorevoke_privileged_anon')
  AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  AND (
       p.proname ~* '(mint_|_mint|chip|wallet|promo|cashout|diamond|rake|bounty|settle|payout|clawback|purchase|treasury|jackpot|bbj)'
    OR p.proname ~* '^(credit|debit|transfer|distribute|deduct|atomic|admin)_'
    OR p.proname ~* '(promote_member|transfer_club_ownership|remove_player)'
  )
ON CONFLICT (function_signature) DO NOTHING;

-- Fail the migration if any stored signature does not resolve. This is the
-- assertion the previous migration was missing.
DO $assert$
DECLARE bad text;
BEGIN
  SELECT string_agg(function_signature, ' | ')
    INTO bad
    FROM public.privileged_function_lock
   WHERE to_regprocedure(function_signature) IS NULL;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'privileged_function_lock holds unresolvable signatures: %', bad;
  END IF;
END
$assert$;

-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_autorevoke_privileged_anon()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  obj          record;
  lk           record;
  v_name       text;
  v_sig        text;
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
                              FROM unnest(p.proargtypes) WITH ORDINALITY AS t(typ, ord)), ''))
      INTO v_name, v_sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.oid = obj.objid
       AND n.nspname = 'public';

    IF v_name IS NULL
       OR v_name IN ('fn_autorevoke_privileged_anon', 'fn_audit_privileged_grants') THEN
      CONTINUE;
    END IF;

    IF v_name !~ '^st_' AND (
         v_name ~* '(mint_|_mint|chip|wallet|promo|cashout|diamond|rake|bounty|settle|payout|clawback|purchase|treasury|jackpot|bbj)'
      OR v_name ~* '^(credit|debit|transfer|distribute|deduct|atomic|admin)_'
      OR v_name ~* '(promote_member|transfer_club_ownership|remove_player)'
    ) THEN
      BEGIN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', obj.object_identity);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',   obj.object_identity);

        INSERT INTO public.privileged_function_lock (function_signature, security_definer, reason)
        VALUES (v_sig,
                (SELECT prosecdef FROM pg_proc WHERE oid = obj.objid),
                'Auto-locked by trg_autorevoke_privileged_anon on ' || obj.command_tag || '.')
        ON CONFLICT (function_signature) DO NOTHING;

        RAISE NOTICE '[autorevoke] stripped PUBLIC/anon EXECUTE from % (tag %)',
          obj.object_identity, obj.command_tag;
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
$function$;

-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_verify_privileged_lock()
RETURNS TABLE(function_signature text, anon_exec boolean, public_exec boolean, missing boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT l.function_signature,
         CASE WHEN to_regprocedure(l.function_signature) IS NULL THEN NULL
              ELSE has_function_privilege('anon', to_regprocedure(l.function_signature)::oid, 'EXECUTE') END,
         CASE WHEN to_regprocedure(l.function_signature) IS NULL THEN NULL
              ELSE has_function_privilege('public', to_regprocedure(l.function_signature)::oid, 'EXECUTE') END,
         to_regprocedure(l.function_signature) IS NULL
    FROM public.privileged_function_lock l
   WHERE to_regprocedure(l.function_signature) IS NULL
      OR has_function_privilege('anon',   to_regprocedure(l.function_signature)::oid, 'EXECUTE')
      OR has_function_privilege('public', to_regprocedure(l.function_signature)::oid, 'EXECUTE')
   ORDER BY 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_verify_privileged_lock() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.fn_verify_privileged_lock() IS
  'Detective check: returns zero rows when every reviewed privileged function is still anon/PUBLIC denied. Non-zero rows = a grant regression or a dropped/renamed function.';
