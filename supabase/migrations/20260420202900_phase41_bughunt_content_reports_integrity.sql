-- =====================================================================
-- Pass 21: commander_home_content_reports integrity.
--
-- BUGS (verified):
--   R1 — reporter can set status='actioned'/'dismissed' on INSERT,
--        bypassing moderation queue
--   R2 — reporter can set moderator_note, reviewed_at, reviewed_by on
--        INSERT, forging a fake moderation decision
--   R3 — no dedupe: reporter can spam the same (type,id) 20+ times
--   R4 — reporter can self-report (nuisance)
--   R5 — reported_id doesn't need to exist in target table
--
-- FIX:
--   BEFORE INSERT trigger (SECURITY INVOKER so current_user = caller):
--     - Force status='pending' on all user INSERTs
--     - Force moderator fields to NULL on INSERT
--     - Block self-report when reported_type='member'
--     - Validate reported_id exists in the corresponding target table
--     - Dedupe: block INSERT if reporter already has a pending report
--       for the same (reported_type, reported_id)
--
--   Partial unique index supports the dedupe at storage level.
-- =====================================================================

-- Dedupe index (partial: only enforce on pending reports; resolved
-- reports can be re-filed if new abuse occurs)
CREATE UNIQUE INDEX IF NOT EXISTS uq_home_reports_pending_per_target
  ON public.commander_home_content_reports (reporter_id, reported_type, reported_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.fn_enforce_home_content_report_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_user;
  v_exists boolean;
BEGIN
  -- Service-role / postgres / RPC bypass (admin may need to insert audit reports)
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  -- Force moderation-queue state
  NEW.status := 'pending';
  NEW.moderator_note := NULL;
  NEW.reviewed_at := NULL;
  NEW.reviewed_by := NULL;

  -- Block self-report when reporting a member identity
  IF NEW.reported_type = 'member' AND NEW.reported_id = NEW.reporter_id THEN
    RAISE EXCEPTION 'SELF_REPORT'
          USING HINT = 'cannot report yourself';
  END IF;

  -- Validate target exists
  v_exists := CASE NEW.reported_type
    WHEN 'post'    THEN EXISTS (SELECT 1 FROM commander_home_posts         WHERE id = NEW.reported_id)
    WHEN 'comment' THEN EXISTS (SELECT 1 FROM commander_home_post_comments WHERE id = NEW.reported_id)
    WHEN 'group'   THEN EXISTS (SELECT 1 FROM commander_home_groups        WHERE id = NEW.reported_id)
    WHEN 'member'  THEN EXISTS (SELECT 1 FROM auth.users                   WHERE id = NEW.reported_id)
    WHEN 'game'    THEN EXISTS (SELECT 1 FROM commander_home_games         WHERE id = NEW.reported_id)
    WHEN 'review'  THEN EXISTS (SELECT 1 FROM commander_home_game_reviews  WHERE id = NEW.reported_id)
    ELSE false
  END;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND'
          USING HINT = 'reported_id does not exist in the ' || NEW.reported_type || ' table';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_content_report_insert
  ON public.commander_home_content_reports;
CREATE TRIGGER trg_enforce_home_content_report_insert
BEFORE INSERT ON public.commander_home_content_reports
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_content_report_insert();
