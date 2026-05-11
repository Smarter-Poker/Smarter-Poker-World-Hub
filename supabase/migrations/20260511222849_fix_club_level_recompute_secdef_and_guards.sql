-- Dan-fix/audit-2 (2026-05-11): comprehensive sweep found 4 unsuppressed
-- grant-regression bombs in the club/union level-recompute trigger cascade.
-- Same pattern as fn_emit_home_notification: trigger fn runs as authenticated,
-- PERFORMs inner helper that lacks authenticated EXECUTE -> 42501 -> entire
-- user write fails.
--
-- Confirmed via probe: INSERT INTO club_members as authenticated fails with
--   ERROR: 42501: permission denied for function recompute_club_levels_silent
--   CONTEXT: PERFORM in trg_auto_recompute_club_level()
--
-- Currently masked because all Club Arena writes go through SECDEF RPCs which
-- bypass the EXECUTE check. But the bomb fires for ANY future direct write
-- path (PostgREST, future code paths, migrations run as authenticated).
--
-- Fix:
--   1. Inner recompute helpers SECURITY DEFINER (safe — only computes levels
--      from existing data and writes the level field; no privilege escalation)
--   2. NO grant to authenticated (avoid abuse vector)
--   3. Wrap each outer trigger fn body in EXCEPTION WHEN OTHERS RAISE WARNING
--      so future grant drift or any inner failure logs+continues. Level
--      recompute is a bookkeeping side-effect; never block member operations.

ALTER FUNCTION public.recompute_club_levels_silent(uuid, boolean) SECURITY DEFINER;
ALTER FUNCTION public.recompute_union_levels(uuid, boolean) SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_auto_recompute_club_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_club_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_club_id := OLD.club_id;
  ELSE                     v_club_id := NEW.club_id;
  END IF;
  BEGIN
    PERFORM public.recompute_club_levels_silent(v_club_id, false);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_auto_recompute_club_level failed for club=%: % (%)',
      v_club_id, SQLERRM, SQLSTATE;
  END;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recompute_club_level_on_member_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id  uuid;
  v_union_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_club_id := OLD.club_id;
  ELSE                     v_club_id := NEW.club_id;
  END IF;
  BEGIN
    PERFORM public.recompute_club_levels_silent(v_club_id, false);
    SELECT uc.union_id INTO v_union_id
      FROM union_clubs uc
     WHERE uc.club_id = v_club_id
     LIMIT 1;
    IF v_union_id IS NOT NULL THEN
      PERFORM public.recompute_union_levels(v_union_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_recompute_club_level_on_member_change failed for club=%: % (%)',
      v_club_id, SQLERRM, SQLSTATE;
  END;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recompute_union_level_on_club_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_union_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_union_id := OLD.union_id;
  ELSE                     v_union_id := NEW.union_id;
  END IF;
  BEGIN
    PERFORM public.recompute_union_levels(v_union_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_recompute_union_level_on_club_change failed for union=%: % (%)',
      v_union_id, SQLERRM, SQLSTATE;
  END;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
