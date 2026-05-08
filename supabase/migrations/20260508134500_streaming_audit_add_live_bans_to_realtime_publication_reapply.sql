-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_audit_add_live_bans_to_realtime_publication_reapply
-- Applied:   2026-05-08 via Supabase MCP apply_migration (round 3 backfill)
-- Audit:     Streaming rigor audit round 3 — pre-audit Rule 2 fix
--
-- Restores the migration audit trail for live_bans publication membership.
-- Original migration (20260508004353_streaming_audit_add_live_bans_to_realtime_publication.sql)
-- shipped with PR #256 (commit ff37e5c10) but the file was inadvertently
-- deleted from the repo by commit 2ac380fe9 ("fix(training): MAX-RIGOR audit").
-- The DB state was correct (publication membership + REPLICA IDENTITY FULL
-- were both applied), but schema_migrations registration was lost.
--
-- This re-application is fully idempotent: ALTER PUBLICATION ADD is guarded
-- by a NOT EXISTS check, ALTER TABLE REPLICA IDENTITY FULL is a no-op when
-- already FULL.
--
-- R12 dependency: live_bans must be in supabase_realtime publication so the
-- LiveStreamViewer.jsx ban subscription receives INSERT events. Without the
-- publication membership the R12 force-leave fix would silently never fire.
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
