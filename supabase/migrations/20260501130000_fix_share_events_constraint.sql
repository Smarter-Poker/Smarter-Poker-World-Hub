-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: share_events destination CHECK constraint missing 'messenger_group'
-- Migration: 20260501130000_fix_share_events_constraint.sql
--
-- PROBLEM: GroupsTab sends destination='messenger_group' to the share-count
-- API, but the original CHECK constraint only allowed:
--   ('feed', 'messenger', 'copy', 'twitter', 'whatsapp', 'external')
-- This caused silent INSERT failures — group shares never logged share_events,
-- so streak rewards never fired for group shares.
--
-- FIX: Drop the old CHECK constraint and add the expanded version.
-- STATUS: Already applied directly to production (2026-05-01). 
--         This file exists for git history completeness.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the existing destination constraint (uses catalog lookup for portability)
DO $drop_constraint$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'share_events'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%destination%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.share_events DROP CONSTRAINT %I', v_constraint);
    RAISE NOTICE 'Dropped constraint: %', v_constraint;
  ELSE
    RAISE NOTICE 'No destination CHECK constraint found — skipping drop';
  END IF;
END $drop_constraint$;

-- Add the expanded constraint with messenger_group included
ALTER TABLE public.share_events
  ADD CONSTRAINT share_events_destination_check
  CHECK (destination IN (
    'feed',
    'messenger',
    'messenger_group',
    'copy',
    'twitter',
    'whatsapp',
    'external'
  ));

DO $$ BEGIN RAISE NOTICE 'share_events.destination constraint updated — messenger_group now allowed.'; END $$;
