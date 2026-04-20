-- =====================================================================
-- Pass 19: commander_home_post_comments integrity guards.
--
-- BUGS (verified via authenticated-role attack):
--   C1 — created_at backdate succeeded. User can shift thread ordering,
--        forge "historical" comments, bypass recent-comment filters.
--   C2 — content edit with is_edited still false. The edit marker is
--        the visible "(edited)" label in the UI — silent edits are a
--        moderation / trust hazard.
--   C3 — updated_at backdate succeeded.
--   C6 — is_edited true→false reset succeeded. User can legit-edit
--        once (which correctly flips marker), then directly reset
--        is_edited=false to hide the edit.
--
--   (C4 post_id, C5 author_id already locked by fn_home_protect_identity_fields.)
--
-- FIX:
--   New BEFORE UPDATE trigger, SECURITY INVOKER so postgres/service_role
--   paths bypass (same pattern as pass 7 / 18):
--     - created_at: immutable for authenticated
--     - updated_at: system-managed (SYSTEM_ONLY_FIELD on user UPDATE)
--     - content change: auto-flips is_edited=true before the update
--     - is_edited: sticky; cannot go true→false via user UPDATE
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_post_comments_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_user;
BEGIN
  -- Service-role / postgres / RPC bypass. Direct PostgREST writes run as
  -- 'authenticated' or 'anon' and are gated.
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  -- created_at: immutable (identity-adjacent, breaks thread ordering if mutable)
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
          USING HINT = 'created_at is immutable on comments; '
                    || 'changing it breaks thread ordering and audit trails';
  END IF;

  -- updated_at: system-managed by trg_touch_updated_at (runs at depth>1).
  -- Reject any user-originated updated_at in the payload.
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
          USING HINT = 'updated_at is managed by trg_touch_updated_at; '
                    || 'do not include it in UPDATE payloads';
  END IF;

  -- Content edit → auto-flip is_edited to true BEFORE the update commits.
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.is_edited := true;
  END IF;

  -- is_edited is sticky: cannot go true→false via user UPDATE.
  -- (A user explicitly setting is_edited=true is fine.)
  IF OLD.is_edited = true AND NEW.is_edited = false THEN
    RAISE EXCEPTION 'IS_EDITED_STICKY'
          USING HINT = 'is_edited cannot be reset to false once an edit has been recorded';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_post_comments_integrity
  ON public.commander_home_post_comments;

CREATE TRIGGER trg_enforce_home_post_comments_integrity
BEFORE UPDATE ON public.commander_home_post_comments
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_post_comments_integrity();
