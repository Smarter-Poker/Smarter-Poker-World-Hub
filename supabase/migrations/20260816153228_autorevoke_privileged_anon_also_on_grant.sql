-- APPLIED TO PRODUCTION 2026-08-16 15:32:28 UTC (version 20260816153228)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Attempt to close the GRANT hole in trg_autorevoke_privileged_anon.
--
-- Verified by rollback probe before this migration:
--   CREATE FUNCTION fn_probe_chip_..()  -> anon EXECUTE = false  (trigger fired)
--   CREATE FUNCTION fn_probe_plain_..() -> anon EXECUTE = true   (scope is narrow)
--   GRANT EXECUTE .. TO anon            -> anon EXECUTE = TRUE   <-- HOLE
--   ALTER FUNCTION .. SET search_path   -> anon EXECUTE = false  (re-fired)
--
-- The hole matters because the most likely way anon gets EXECUTE back on a
-- money function is not a CREATE, it is a blanket
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
-- which Supabase tooling and hand-written "fix permissions" migrations do.
--
-- NOTE: adding the GRANT tag here turned out to be NECESSARY BUT NOT
-- SUFFICIENT -- see 20260816153443 and 20260816153613. A GRANT event supplies
-- object_type='FUNCTION' with objid=NULL and object_identity=NULL, so the
-- granted function cannot be identified from inside the trigger. This
-- migration is kept for replay fidelity; the working implementation is in
-- 20260816153613.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_autorevoke_privileged_anon()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  obj    record;
  v_name text;
BEGIN
  -- Deliberate, reviewed exception for one transaction.
  IF COALESCE(current_setting('app.allow_privileged_anon_grant', true), 'off') = 'on' THEN
    RETURN;
  END IF;

  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF obj.object_type <> 'function' THEN
      CONTINUE;
    END IF;

    SELECT p.proname INTO v_name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.oid = obj.objid
       AND n.nspname = 'public';

    IF v_name IS NULL THEN
      CONTINUE;
    END IF;

    IF v_name IN ('fn_autorevoke_privileged_anon', 'fn_audit_privileged_grants') THEN
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
        RAISE NOTICE '[autorevoke] stripped PUBLIC/anon EXECUTE from privileged function % (tag %)',
          obj.object_identity, obj.command_tag;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[autorevoke] could not revoke on %: %', obj.object_identity, SQLERRM;
      END;
    END IF;
  END LOOP;
END;
$function$;

-- REVOKE is deliberately NOT watched, so the REVOKEs issued above cannot recurse.
DROP EVENT TRIGGER IF EXISTS trg_autorevoke_privileged_anon;
CREATE EVENT TRIGGER trg_autorevoke_privileged_anon
  ON ddl_command_end
  WHEN TAG IN ('CREATE FUNCTION', 'ALTER FUNCTION', 'GRANT')
  EXECUTE FUNCTION public.fn_autorevoke_privileged_anon();

COMMENT ON FUNCTION public.fn_autorevoke_privileged_anon() IS
  'Event-trigger body: strips PUBLIC/anon EXECUTE from money/privileged functions on CREATE, ALTER and GRANT. Bypass for one transaction with SET app.allow_privileged_anon_grant=''on''. Verified by probe 2026-08-16.';
