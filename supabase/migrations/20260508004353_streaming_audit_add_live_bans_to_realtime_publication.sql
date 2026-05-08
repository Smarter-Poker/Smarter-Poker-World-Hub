-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_audit_add_live_bans_to_realtime_publication
-- Version:   20260508004353
-- Applied:   2026-05-07 via Supabase MCP apply_migration
-- Audit:     Streaming 4-pass rigor audit (R12 dependency)
--
-- R12 (medium): banned viewer not booted from LiveKit room — the data-layer
--               ban took effect (RLS rejected new comments) but the viewer's
--               LiveKit connection continued and they kept seeing the
--               broadcaster's video, with every interaction silently
--               403'ing.
--
--               Fix lives in src/components/social/LiveStreamViewer.jsx:
--               the viewer subscribes to live_bans INSERTs filtered to its
--               own user_id, surfaces a banner, and force-closes after
--               3 seconds.
--
--               That subscription requires live_bans to be in the
--               supabase_realtime publication. Without this migration, the
--               R12 subscription would silently never fire — the exact bug
--               R12 is meant to fix.
--
-- Also enabling REPLICA IDENTITY FULL so any future UPDATE/DELETE events
-- carry the banned_user_id column in payload.old. INSERT (the only event
-- the R12 fix listens to today) always has full payload.new.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'live_bans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_bans;
  END IF;
END $$;

ALTER TABLE public.live_bans REPLICA IDENTITY FULL;
