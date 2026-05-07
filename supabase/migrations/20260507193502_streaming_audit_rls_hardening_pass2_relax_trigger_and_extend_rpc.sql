-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_audit_rls_hardening_pass2_relax_trigger_and_extend_rpc
-- Version:   20260507193502
-- Applied:   2026-05-07 via Supabase MCP apply_migration
-- Audit:     Streaming audit pass 2 — corrects pass 1 over-strictness
--
-- Why pass 2 was needed
--   Pass 1's guard trigger blocked too much. LiveStreamService.js (client-side,
--   runs as `authenticated`) writes status, ended_at, livekit_room directly
--   during the normal start/end broadcast flow — those are legitimate
--   broadcaster actions, not clout fraud. Pass 1 would have broken the
--   start/end flow on the next deploy.
--
-- What pass 2 does
--   1. Loosens fn_live_streams_guard_update: only blocks the metric-fraud
--      columns (viewer_count, peak_viewers, reaction_count) from end-user
--      direct writes. Allows status/ended_at/started_at/livekit_room to
--      flow through normally — they are still gated by the existing RLS
--      UPDATE policy (auth.uid() = broadcaster_id).
--
--   2. Adds update_live_metrics(p_stream_id, p_viewer_count) RPC:
--      SECURITY DEFINER (bypasses the trigger), broadcaster-only,
--      atomically updates viewer_count + peak_viewers in one statement.
--      Replaces the dual-write pattern in
--      LiveStreamService._updateViewerCount.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_live_streams_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  is_end_user boolean := current_user = 'authenticated';
BEGIN
  -- broadcaster_id immutable for ALL callers
  IF NEW.broadcaster_id IS DISTINCT FROM OLD.broadcaster_id THEN
    RAISE EXCEPTION 'broadcaster_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  -- Metric columns are SERVER-managed only. RPC path with SECURITY DEFINER
  -- runs as the function owner (not 'authenticated'), so RPC writes pass.
  -- Direct end-user UPDATEs cannot touch these — clout-fraud guard.
  IF is_end_user THEN
    IF NEW.viewer_count    IS DISTINCT FROM OLD.viewer_count    THEN
      RAISE EXCEPTION 'viewer_count is server-managed (use update_live_metrics RPC)'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.peak_viewers    IS DISTINCT FROM OLD.peak_viewers    THEN
      RAISE EXCEPTION 'peak_viewers is server-managed (use update_live_metrics RPC)'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.reaction_count  IS DISTINCT FROM OLD.reaction_count  THEN
      RAISE EXCEPTION 'reaction_count is server-managed'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- status, ended_at, started_at, livekit_room: ALLOWED from broadcaster.
  -- Already constrained to broadcaster_id = auth.uid() by the RLS UPDATE
  -- policy.
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_live_streams_guard_update IS
  'Guards live_streams UPDATEs. broadcaster_id immutable for all callers. End-user authenticated role cannot mutate metric columns (viewer_count, peak_viewers, reaction_count) — those go through update_live_metrics RPC. status/ended_at/started_at/livekit_room remain broadcaster-writable for normal start/end flow.';


-- Single RPC for viewer_count + peak_viewers atomic update.
CREATE OR REPLACE FUNCTION public.update_live_metrics(
  p_stream_id uuid,
  p_viewer_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_broadcaster uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_viewer_count IS NULL OR p_viewer_count < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid viewer_count');
  END IF;

  SELECT broadcaster_id INTO v_broadcaster 
  FROM live_streams WHERE id = p_stream_id;

  IF v_broadcaster IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stream not found');
  END IF;
  IF v_broadcaster <> v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not the broadcaster');
  END IF;

  UPDATE live_streams
     SET viewer_count = p_viewer_count,
         peak_viewers = GREATEST(COALESCE(peak_viewers, 0), p_viewer_count)
   WHERE id = p_stream_id;

  RETURN jsonb_build_object('success', true, 'viewer_count', p_viewer_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.update_live_metrics(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_live_metrics(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.update_live_metrics IS
  'Atomic viewer_count + peak_viewers update for the broadcaster. SECURITY DEFINER bypasses the live_streams metric-column guard trigger. Replaces two separate UPDATEs in LiveStreamService._updateViewerCount.';
