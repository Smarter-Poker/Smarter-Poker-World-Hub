-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_deep_audit_round2_guest_code_lockdown_v2
-- Version:   20260510235100
-- Applied:   2026-05-10 via Supabase MCP apply_migration
--
-- Follow-up to 20260510235000: the column-only REVOKE didn't take effect
-- because authenticated/anon already had table-level GRANT SELECT. Column-
-- level REVOKE only narrows a column-level GRANT — it can't punch a hole
-- through a wider table-level grant.
--
-- Empirical confirmation: after v1 applied, SET ROLE authenticated could
-- still `SELECT guest_invite_code FROM live_streams` and return 15 codes.
--
-- Correct pattern (v2):
--   1. REVOKE table-level SELECT from end-user roles.
--   2. GRANT column-level SELECT on the SAFE columns only (everything
--      except guest_invite_code).
--   3. fn_get_my_guest_invite_code() RPC remains the broadcaster's path
--      to read their own code (already created in v1).
--
-- We have to enumerate the safe-column list explicitly. Every future
-- column added to live_streams will inherit no access for end-user roles
-- until added here — that's the desired behavior (deny-by-default for
-- newly-added columns that might be sensitive).
--
-- Verified after apply: authenticated AND anon both raise
--   `permission denied for table live_streams`
-- when attempting `SELECT guest_invite_code FROM live_streams`. Safe-column
-- reads (id, broadcaster_id, status, title, ...) continue to succeed.
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: revoke table-level SELECT from end-user roles
REVOKE SELECT ON public.live_streams FROM authenticated;
REVOKE SELECT ON public.live_streams FROM anon;

-- Step 2: grant column-level SELECT on safe columns only
-- (everything EXCEPT guest_invite_code)
GRANT SELECT (
  id,
  broadcaster_id,
  title,
  description,
  thumbnail_url,
  status,
  viewer_count,
  started_at,
  ended_at,
  created_at,
  video_url,
  is_posted,
  is_draft,
  mime_type,
  livekit_room,
  slow_mode,
  peak_viewers,
  reaction_count,
  category,
  feed_post_id,
  preview_clip_url,
  preview_updated_at
) ON public.live_streams TO authenticated;

GRANT SELECT (
  id,
  broadcaster_id,
  title,
  description,
  thumbnail_url,
  status,
  viewer_count,
  started_at,
  ended_at,
  created_at,
  video_url,
  is_posted,
  is_draft,
  mime_type,
  livekit_room,
  slow_mode,
  peak_viewers,
  reaction_count,
  category,
  feed_post_id,
  preview_clip_url,
  preview_updated_at
) ON public.live_streams TO anon;

-- Step 3: clarify in the column comment that v1's REVOKE was the no-op
-- and v2 supersedes it.
COMMENT ON COLUMN public.live_streams.guest_invite_code IS
  'Server-managed invite code (uuid). Not granted to authenticated or anon — those roles have only column-level SELECT on the SAFE column list. Broadcasters retrieve their own code via fn_get_my_guest_invite_code(uuid). service_role bypasses all GRANTs and is used by /api/live/token to verify the code.';
