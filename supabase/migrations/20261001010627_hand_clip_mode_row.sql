-- ═══════════════════════════════════════════════════════════════════════
-- 20261001010200_hand_clip_mode_row.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        1 (one row in the approval table public.horse_post_modes,
--              inserted DISABLED; no table, index, function or policy)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4, agent p9-hub),
--              Fleet Content Programme Phase 9.1 "The hand replay renderer"
-- AFFECTS:     public.horse_post_modes: the row mode = 'hand_clip', enabled
--              false. ON CONFLICT (mode) DO NOTHING: an existing row, and any
--              approval it carries, is never touched. content_settings is
--              not read or written.
-- IRREVERSIBLE: no (the ROLLBACK block at the end deletes the row this file
--              inserts, and only while it is still unapproved)
--
-- WHY:
--   fn_p9_publish_hand_clip (20261001010100_hand_clip_jobs.sql) publishes a
--   rendered horse clip only when content_settings.engine_enabled is true AND
--   the horse_post_modes row 'hand_clip' is enabled; a missing row reads as
--   off. This file installs the row, off, so the owner's per-mode approval
--   is one UPDATE after the sample clip has been seen (design section 8,
--   decision 5). Until then every fleet clip job renders and stays ready and
--   unpublished.
--
-- HOW:
--   One INSERT ... ON CONFLICT (mode) DO NOTHING, the Phase 6 and Phase 7
--   pattern (20260907002000, 20260930052057). No UPDATE: the migration never
--   flips an existing approval.
--
-- EVIDENCE (production kuklfnapbkmacvwxktbh, 2026-09-30, SELECT only):
--   information_schema.columns: horse_post_modes has mode text NOT NULL (the
--   primary key), enabled boolean NOT NULL DEFAULT false, description text
--   NOT NULL, approved_by text, approved_at timestamptz, created_at
--   timestamptz NOT NULL DEFAULT now(). No row with mode = 'hand_clip'.
--   Design: agent-evidence/fleet-p6-closeout-20260920/agents/p9-research/
--   design.md section 7.2 (contract C5, migration B).
-- ═══════════════════════════════════════════════════════════════════════

-- A bounded lock wait turns a busy moment into a clean, retryable failure.
SET lock_timeout = '10s';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PRE-FLIGHT: the approval table has the three columns this row needs
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(required.column_name, ', ' ORDER BY 1)
    INTO v_missing
    FROM (VALUES ('mode'), ('enabled'), ('description')) AS required(column_name)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'horse_post_modes'
        AND c.column_name = required.column_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: horse_post_modes columns missing: %', v_missing;
  END IF;
END $preflight$;

-- ---------------------------------------------------------------------------
-- 2. THE MODE ROW: off until the owner approves it
-- ---------------------------------------------------------------------------
INSERT INTO public.horse_post_modes (mode, enabled, description)
VALUES ('hand_clip', false, 'Phase 9: a rendered replay clip of one of the horse''s own hands, posted as a native video')
ON CONFLICT (mode) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $postapply$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.horse_post_modes WHERE mode = 'hand_clip';
  IF n <> 1 THEN
    RAISE EXCEPTION 'post-apply: expected one hand_clip mode row, found %', n;
  END IF;
END $postapply$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual, if ever needed: removes the row while it is unapproved)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DELETE FROM public.horse_post_modes WHERE mode = 'hand_clip' AND approved_at IS NULL;
-- COMMIT;
