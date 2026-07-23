-- The Club Arena ReportReviewPage lets a club owner/admin triage player reports.
-- user_reports is platform-wide (no club_id) and its RLS only lets the reporter
-- and the reported user read a row, with NO client UPDATE path -- so from the
-- browser a club admin could neither see others' reports nor action them.
-- These two SECURITY DEFINER RPCs give club admins a scoped, authorized path:
-- they may review reports whose REPORTED player is a member of a club they
-- own/co-own/admin. admin_notes persists the reviewer's decision note.
-- Applied to prod via Supabase MCP 2026-07-23.

ALTER TABLE public.user_reports ADD COLUMN IF NOT EXISTS admin_notes text;

CREATE OR REPLACE FUNCTION public.fn_caller_can_moderate_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM club_members target_cm
    JOIN clubs c ON c.id = target_cm.club_id
    WHERE target_cm.user_id = p_user_id
      AND (
        c.owner_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM club_members admin_cm
          WHERE admin_cm.club_id = c.id
            AND admin_cm.user_id = (SELECT auth.uid())
            AND admin_cm.role = ANY (ARRAY['owner','co_owner','admin'])
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_list_player_reports(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  reporter_id uuid,
  reported_user_id uuid,
  reason text,
  details text,
  status text,
  admin_notes text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  reporter_username text,
  reported_username text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT ur.id, ur.reporter_id, ur.reported_user_id, ur.reason, ur.details,
           ur.status, ur.admin_notes, ur.created_at, ur.reviewed_at, ur.reviewed_by,
           rep.username AS reporter_username,
           tgt.username AS reported_username
    FROM user_reports ur
    LEFT JOIN profiles rep ON rep.id = ur.reporter_id
    LEFT JOIN profiles tgt ON tgt.id = ur.reported_user_id
    WHERE public.fn_caller_can_moderate_user(ur.reported_user_id)
      AND (p_status IS NULL OR p_status = 'all'
           OR (p_status = 'pending' AND ur.status = 'pending')
           OR (p_status = 'reviewed' AND ur.status <> 'pending'))
    ORDER BY ur.created_at DESC
    LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_action_player_report(
  p_report_id uuid,
  p_status text,
  p_admin_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reported uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'authentication required'); END IF;
  IF p_status NOT IN ('actioned','dismissed','reviewed','pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid status'); END IF;

  SELECT reported_user_id INTO v_reported FROM user_reports WHERE id = p_report_id;
  IF v_reported IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'report not found'); END IF;

  IF NOT public.fn_caller_can_moderate_user(v_reported) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized to review this report'); END IF;

  UPDATE user_reports SET
    status = p_status,
    admin_notes = p_admin_notes,
    reviewed_by = (SELECT auth.uid()),
    reviewed_at = now()
  WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_caller_can_moderate_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_list_player_reports(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_action_player_report(uuid, text, text) TO authenticated;
