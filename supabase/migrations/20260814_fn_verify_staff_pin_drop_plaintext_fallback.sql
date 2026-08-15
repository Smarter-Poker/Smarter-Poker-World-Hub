-- ═══════════════════════════════════════════════════════════════════════════
-- fn_verify_staff_pin: remove the plaintext pin_code fallback branch
--
-- WHY: the fallback ((pin_hash IS NULL AND pin_code = p_pin)) existed so no
-- staff member was locked out mid-migration to bcrypt hashes. Migration is
-- complete: 24/24 commander_staff rows have pin_hash set and 0 rows carry a
-- plaintext pin_code (the BEFORE trigger hashes and NULLs it on every write).
-- The branch is dead code — and the last plaintext PIN comparison in the DB.
--
-- Applied to production 2026-08-14 via Supabase MCP apply_migration as
-- 20260814_fn_verify_staff_pin_drop_plaintext_fallback. This file is the
-- auditable mirror.
--
-- TIER: 2 (CREATE OR REPLACE, same signature, same grants). Rollback pasted.
-- ═══════════════════════════════════════════════════════════════════════════

-- Pre-flight: abort if any active staff row still depends on the fallback.
DO $$
DECLARE v_unhashed integer;
BEGIN
  SELECT count(*) INTO v_unhashed
    FROM public.commander_staff
   WHERE is_active AND pin_hash IS NULL;
  IF v_unhashed > 0 THEN
    RAISE EXCEPTION 'ABORT: % active staff row(s) have no pin_hash — plaintext fallback still load-bearing', v_unhashed;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_verify_staff_pin(p_venue_id text, p_pin text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT s.id
    FROM public.commander_staff s
   WHERE s.venue_id::text = p_venue_id
     AND s.is_active
     AND p_pin IS NOT NULL
     AND s.pin_hash IS NOT NULL
     AND s.pin_hash = extensions.crypt(p_pin, s.pin_hash)
   LIMIT 1;
$function$;

-- Post-apply assertion: the function body must no longer reference pin_code.
DO $$
BEGIN
  IF pg_get_functiondef('public.fn_verify_staff_pin(text,text)'::regprocedure) LIKE '%pin_code%' THEN
    RAISE EXCEPTION 'ABORT: fn_verify_staff_pin still references pin_code after replace';
  END IF;
END $$;

-- ROLLBACK (paste-ready):
-- CREATE OR REPLACE FUNCTION public.fn_verify_staff_pin(p_venue_id text, p_pin text)
--  RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
--  SET search_path TO 'public', 'extensions', 'pg_temp'
-- AS $rollback$
--   SELECT s.id FROM public.commander_staff s
--    WHERE s.venue_id::text = p_venue_id AND s.is_active AND p_pin IS NOT NULL
--      AND ( (s.pin_hash IS NOT NULL AND s.pin_hash = extensions.crypt(p_pin, s.pin_hash))
--         OR (s.pin_hash IS NULL     AND s.pin_code = p_pin) )
--    LIMIT 1;
-- $rollback$;
