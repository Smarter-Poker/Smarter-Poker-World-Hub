-- ═══════════════════════════════════════════════════════════════════════
-- horse_comments_from_the_rejected_era_are_hidden
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (data: soft-delete of horse-authored public.social_comments rows; no schema change)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4), Fleet Content Programme Phase 6 closeout
-- AFFECTS:     public.social_comments rows whose author is a horse profile (profiles.is_horse) and which were
--              written before 2026-09-07 (the last one is 2026-09-06 16:36Z); is_deleted only. The existing
--              trigger trig_update_post_comment_count keeps social_posts.comment_count in step.
-- IRREVERSIBLE: no (soft delete; rollback block restores exactly this set, which held no deleted row before)
--
-- WHY:
--   The horse-authored posts of the rejected Phase 3 era were permanently removed on the owner's
--   instruction (20,524 posts). Their comments from the same era stayed: 26,323 rows, 22,363 of them
--   under posts that no longer exist and 3,960 still visible under posts by the official accounts
--   ("Real talk", "100% agree", "fr" with an emoji, and similar; 366 carry emoji). On 2026-09-29 the
--   owner approved the closeout decisions including this one; the reversible option is taken: the rows
--   are hidden (is_deleted = true), not purged.
--
-- EVIDENCE (production, 2026-09-29 20:46Z): 26,323 horse-authored comments, 0 of them deleted, newest
--   2026-09-06 16:36:27Z; 0 deleted comments in the whole table.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. PRE-FLIGHT: the set is exactly as observed, and nothing in it is already hidden.
DO $$
DECLARE n int; d int; newest timestamptz;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE is_deleted), max(created_at) INTO n, d, newest
    FROM public.social_comments
   WHERE author_id IN (SELECT id FROM public.profiles WHERE is_horse IS TRUE);
  IF n <> 26323 THEN RAISE EXCEPTION 'pre-flight: expected 26323 horse comments, found %', n; END IF;
  IF d <> 0 THEN RAISE EXCEPTION 'pre-flight: expected 0 already-hidden horse comments, found %', d; END IF;
  IF newest >= '2026-09-07 00:00:00+00' THEN RAISE EXCEPTION 'pre-flight: a horse comment newer than the rejected era exists (%)', newest; END IF;
END $$;

-- 2. CHANGE
UPDATE public.social_comments
   SET is_deleted = true
 WHERE author_id IN (SELECT id FROM public.profiles WHERE is_horse IS TRUE)
   AND created_at < '2026-09-07 00:00:00+00'
   AND is_deleted = false;

-- 3. POST-APPLY
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.social_comments
   WHERE author_id IN (SELECT id FROM public.profiles WHERE is_horse IS TRUE) AND is_deleted = false;
  IF n <> 0 THEN RAISE EXCEPTION 'post-apply: % horse comments still visible', n; END IF;
  SELECT count(*) INTO n FROM public.social_comments WHERE is_deleted;
  IF n <> 26323 THEN RAISE EXCEPTION 'post-apply: expected 26323 hidden rows, found %', n; END IF;
END $$;

COMMIT;

-- ROLLBACK (manual, if ever needed; exact because no horse comment was hidden before this change):
-- BEGIN;
-- UPDATE public.social_comments SET is_deleted = false
--  WHERE author_id IN (SELECT id FROM public.profiles WHERE is_horse IS TRUE)
--    AND created_at < '2026-09-07 00:00:00+00' AND is_deleted = true;
-- COMMIT;
