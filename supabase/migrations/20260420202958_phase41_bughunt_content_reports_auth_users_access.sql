-- Pass 21b: switch the report-integrity trigger to SECURITY DEFINER so
-- it can read auth.users for the member-target existence check. Bypass
-- for service-role paths via auth.role(), not current_user.
CREATE OR REPLACE FUNCTION public.fn_enforce_home_content_report_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  -- Service-role bypass (backend inserts, audit reports, etc.)
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Force moderation-queue state
  NEW.status := 'pending';
  NEW.moderator_note := NULL;
  NEW.reviewed_at := NULL;
  NEW.reviewed_by := NULL;

  -- Block self-report when reporting a member identity
  IF NEW.reported_type = 'member' AND NEW.reported_id = NEW.reporter_id THEN
    RAISE EXCEPTION 'SELF_REPORT' USING HINT = 'cannot report yourself';
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
