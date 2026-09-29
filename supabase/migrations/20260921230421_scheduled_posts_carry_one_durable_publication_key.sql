-- ═══════════════════════════════════════════════════════════════════════
-- scheduled_posts_carry_one_durable_publication_key
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        1 (additive: two partial unique expression indexes; no data change)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4), Fleet Content Programme Phases 1 and 6
-- AFFECTS:     public.social_posts, public.social_page_posts (new indexes only; no rows change)
-- IRREVERSIBLE: no (rollback block at the end drops both indexes)
--
-- WHY:
--   Scheduled horse content needs duplicate protection that holds across
--   overlapping runs and retries, in the database rather than in a
--   read-then-insert check. Phase 6 tried to use the social_posts
--   publication_key column, but that column belongs to the managed video
--   library: CHECK social_posts_managed_library_integrity_check (installed by
--   20260906235959 video_reels_integrity_foundation) requires it to be NULL
--   on every other origin, and fn_guard_managed_video_lineage raises 23514
--   when it is set on one. Every Phase 6 feed insert would have been refused.
--   Scheduled writers now carry their key in metadata.publication_key
--   (namespaced 'phase6:...' and 'fleet:...'). With these indexes a second
--   insert of the same key fails with 23505, which the workers count as a
--   duplicate instead of posting twice.
--
-- EVIDENCE (production, 2026-09-21):
--   social_posts 3,614 rows, 0 with metadata.publication_key, 0 with the
--   publication_key column set; social_page_posts 0 rows. No writer in the
--   World Hub or the workers reads or writes metadata.publication_key today.
--   The predicate (metadata ->> 'publication_key') IS NOT NULL lets a lookup
--   by key (metadata->>publication_key = value) use the index.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. PRE-FLIGHT: nothing to collide with, and not already installed.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN ('uq_social_posts_metadata_publication_key', 'uq_social_page_posts_metadata_publication_key');
  IF n <> 0 THEN RAISE EXCEPTION 'pre-flight: % of the two indexes already exist', n; END IF;

  SELECT count(*) INTO n FROM (
    SELECT metadata ->> 'publication_key' FROM public.social_posts
     WHERE (metadata ->> 'publication_key') IS NOT NULL
     GROUP BY 1 HAVING count(*) > 1) d;
  IF n <> 0 THEN RAISE EXCEPTION 'pre-flight: % duplicate publication keys in social_posts', n; END IF;

  SELECT count(*) INTO n FROM (
    SELECT metadata ->> 'publication_key' FROM public.social_page_posts
     WHERE (metadata ->> 'publication_key') IS NOT NULL
     GROUP BY 1 HAVING count(*) > 1) d;
  IF n <> 0 THEN RAISE EXCEPTION 'pre-flight: % duplicate publication keys in social_page_posts', n; END IF;
END $$;

-- 2. CHANGES
CREATE UNIQUE INDEX uq_social_posts_metadata_publication_key
  ON public.social_posts ((metadata ->> 'publication_key'))
  WHERE (metadata ->> 'publication_key') IS NOT NULL;

CREATE UNIQUE INDEX uq_social_page_posts_metadata_publication_key
  ON public.social_page_posts ((metadata ->> 'publication_key'))
  WHERE (metadata ->> 'publication_key') IS NOT NULL;

COMMENT ON INDEX public.uq_social_posts_metadata_publication_key IS
  'One feed post per scheduled publication key (metadata.publication_key: phase6:..., fleet:...). The publication_key column stays reserved for the managed video library.';
COMMENT ON INDEX public.uq_social_page_posts_metadata_publication_key IS
  'One page post per scheduled publication key (metadata.publication_key), so a club digest cannot be posted twice.';

-- 3. POST-APPLY: both indexes exist, are unique and valid.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public'
     AND c.relname IN ('uq_social_posts_metadata_publication_key', 'uq_social_page_posts_metadata_publication_key')
     AND i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL;
  IF n <> 2 THEN RAISE EXCEPTION 'post-apply: expected 2 valid unique partial indexes, found %', n; END IF;
END $$;

COMMIT;

-- ROLLBACK (manual, if ever needed):
-- BEGIN;
-- DROP INDEX IF EXISTS public.uq_social_posts_metadata_publication_key;
-- DROP INDEX IF EXISTS public.uq_social_page_posts_metadata_publication_key;
-- COMMIT;
