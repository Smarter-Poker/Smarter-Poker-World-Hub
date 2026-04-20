-- =====================================================================
-- Pass 29: commander_club_announcements integrity.
--
-- BUGS (verified):
--   A1 — admin can forge author_id to another user's uuid on INSERT
--   A2 — push_sent=true, push_sent_count=500, sent_at pre-fillable
--        (lies about delivery state)
--   A4 — created_at / scheduled_for backdate-able to any past time
--   A5 — status='sent' pre-fillable, bypassing draft/scheduled state machine
--
-- FIX: BEFORE INSERT + BEFORE UPDATE triggers.
-- =====================================================================

-- INSERT: force author + system fields to trusted defaults
CREATE OR REPLACE FUNCTION public.fn_enforce_home_club_announcement_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;

  -- Bind author to caller (no forgery)
  NEW.author_id := auth.uid();

  -- System fields: reset on user INSERT
  NEW.push_sent       := false;
  NEW.push_sent_count := 0;
  NEW.sent_at         := NULL;

  -- Force status to a safe initial state
  IF NEW.status IS NULL OR NEW.status NOT IN ('draft', 'scheduled') THEN
    NEW.status := 'draft';
  END IF;

  -- Cannot backdate
  NEW.created_at := NOW();

  -- scheduled_for can't be in the past
  IF NEW.scheduled_for IS NOT NULL AND NEW.scheduled_for < NOW() - INTERVAL '1 minute' THEN
    RAISE EXCEPTION 'SCHEDULED_IN_PAST'
          USING HINT = 'scheduled_for cannot be in the past';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_club_announcement_insert
  ON public.commander_club_announcements;
CREATE TRIGGER trg_enforce_home_club_announcement_insert
BEFORE INSERT ON public.commander_club_announcements
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_club_announcement_insert();

-- UPDATE: protect identity + system fields, block timestamp tampering
CREATE OR REPLACE FUNCTION public.fn_enforce_home_club_announcement_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE v_role text := current_user;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELD'
          USING HINT = 'author_id is immutable on announcements';
  END IF;
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELD'
          USING HINT = 'group_id is immutable on announcements';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELD'
          USING HINT = 'created_at is immutable on announcements';
  END IF;
  IF NEW.push_sent IS DISTINCT FROM OLD.push_sent
     OR NEW.push_sent_count IS DISTINCT FROM OLD.push_sent_count
     OR NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
    RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
          USING HINT = 'push_sent, push_sent_count, sent_at are system-managed';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_club_announcement_update
  ON public.commander_club_announcements;
CREATE TRIGGER trg_enforce_home_club_announcement_update
BEFORE UPDATE ON public.commander_club_announcements
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_club_announcement_update();
