-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: live_streams_add_preview_clip_columns
-- Version:   20260507125212
-- Applied:   2026-05-07 via Supabase MCP apply_migration
-- Audit:     PR #240 — fix(streaming): full sweep — 10 bugs (Bug 5)
--
-- Purpose
--   Adds substrate columns for the rolling preview clip system that replaces
--   per-card LiveKit WHEP connections in the social feed. While a broadcaster
--   is live, src/lib/streamPreviewCapture.js uploads a fresh ~12s clip every
--   ~25s to live-recordings/{user_id}/previews/{stream_id}.{ext} and writes
--   the public URL + timestamp to the columns added here.
--
--   src/components/social/LiveStreamCard.jsx reads preview_clip_url and
--   plays it as <video autoplay muted loop>. preview_updated_at is appended
--   as ?t= to the URL so the browser fetches the fresh window when it rolls.
--
-- Companion column update for this feature:
--   See 20260507165758_live_streams_replica_identity_full.sql — turns on
--   FULL replica identity so the realtime subscription's UPDATE payload
--   contains old.status for the in-place row patch logic.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS preview_clip_url   text,
  ADD COLUMN IF NOT EXISTS preview_updated_at timestamptz;

COMMENT ON COLUMN public.live_streams.preview_clip_url IS
  'URL of rolling preview clip (~10-15s MP4/WebM) for feed cards. Distinct from video_url (saved recording) and thumbnail_url (static poster).';
COMMENT ON COLUMN public.live_streams.preview_updated_at IS
  'When the rolling preview clip was last updated.';

-- Partial index supporting the feed query (status='live' + recent preview)
CREATE INDEX IF NOT EXISTS idx_live_streams_status_preview
  ON public.live_streams (status, preview_updated_at DESC)
  WHERE status = 'live';
