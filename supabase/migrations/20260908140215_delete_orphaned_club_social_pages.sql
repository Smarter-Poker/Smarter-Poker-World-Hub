-- =======================================================================
-- 20260908140215_delete_orphaned_club_social_pages.sql
-- =======================================================================
-- TIER:        3                              (destructive: deletes rows)
-- AUTHOR:      Claude (Cowork)
-- AFFECTS:     tables: social_pages, social_pages_orphan_archive (new)
-- IRREVERSIBLE: no  (every deleted row is copied to an archive table first)
--
-- WHY:
--   pages/api/club-arena/delete-club.js cascades its deletes on `club_id`,
--   but social_pages links a club through linked_entity_type +
--   linked_entity_id, so it was never matched. Every club ever deleted left
--   its social page behind. social_pages IS the public directory that
--   /hub/social-pages Discover reads, so each orphan keeps advertising a club
--   that no longer exists, to every user, forever.
--
--   Found 2026-09-08 while auditing /hub/my-clubs. 26 of the 37 rows in
--   social_pages were orphans - 70% of the directory. Every one was named by
--   the test fixture that created it ("Crest Cert <epoch>-<rand>",
--   "Preset Crest Cert <epoch>", "probe-own"), and the newest had been created
--   the same day, so this was an actively leaking path, not a historical mess.
--
--   The code fix ships alongside this migration; without it the orphans come
--   straight back. Audit: .agent/audits/2026-09-08-my-clubs-page-audit.md
--
-- HOW:
--   - Define orphan STRUCTURALLY (a club page whose club row is gone), not by
--     name pattern. Verified 2026-09-08 that the two definitions select the
--     identical 26 rows - 26 structural, 26 by name, 26 in both, 0 in either
--     alone - so the general predicate is safe and also catches future
--     orphans that no test fixture named.
--   - Copy every row about to be deleted into social_pages_orphan_archive.
--   - Delete. All children are ON DELETE CASCADE (social_page_followers,
--     _posts, _reports, _reviews) or SET NULL
--     (commander_home_games.social_page_id, slug_history.page_id).
--   - Assert afterwards that zero orphans remain and nothing real was touched.
--
-- Proven in a rolled-back transaction first: 37 pages -> 11, survivors were
-- Club JAQK, Deep Stack Society, Diamond Arena, Midway Union, SHARK CLUB,
-- High Rollers Home Game, Saturday Night Poker Club, The Midway Club,
-- Aria Casino, Bill's Game, Orleans Casino.
--
-- Applied to production 2026-09-08 as version 20260908140215.
-- Result: 37 pages -> 11, 26 archived, 0 orphans left.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- =======================================================================

BEGIN;

-- --- 1. PRE-FLIGHT ASSERTIONS ------------------------------------------
DO $$
DECLARE
    v_orphans      integer;
    v_with_follows integer;
    v_with_posts   integer;
    v_live_club    integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'social_pages'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.social_pages not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'social_pages'
          AND column_name = 'linked_entity_id' AND data_type = 'text'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: social_pages.linked_entity_id is not text - the club id comparison below assumes text and would silently match nothing';
    END IF;

    SELECT count(*) INTO v_orphans
    FROM social_pages sp
    WHERE sp.linked_entity_type = 'club'
      AND sp.linked_entity_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id::text = sp.linked_entity_id);

    -- Nothing to do is a valid outcome (re-run, or another agent got here
    -- first). Only an unexpectedly LARGE set is a reason to stop.
    IF v_orphans > 60 THEN
        RAISE EXCEPTION 'pre-flight failed: % orphaned club pages found, expected at most 60. Something else is deleting clubs in bulk - investigate before purging.', v_orphans;
    END IF;

    -- An orphan with real engagement is not test residue. If one exists, a
    -- human decided to keep a page alive past its club and this is the wrong tool.
    SELECT count(*) INTO v_with_follows
    FROM social_pages sp
    WHERE sp.linked_entity_type = 'club'
      AND sp.linked_entity_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id::text = sp.linked_entity_id)
      AND (COALESCE(sp.follower_count, 0) > 0
           OR EXISTS (SELECT 1 FROM social_page_followers f WHERE f.page_id = sp.id));

    SELECT count(*) INTO v_with_posts
    FROM social_pages sp
    WHERE sp.linked_entity_type = 'club'
      AND sp.linked_entity_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id::text = sp.linked_entity_id)
      AND EXISTS (SELECT 1 FROM social_page_posts p WHERE p.page_id = sp.id);

    IF v_with_follows > 0 OR v_with_posts > 0 THEN
        RAISE EXCEPTION 'pre-flight failed: % orphaned pages have followers and % have posts. These are not test residue. Nothing was deleted.', v_with_follows, v_with_posts;
    END IF;

    -- Sanity: real clubs must still exist, or the orphan predicate is
    -- misfiring and would take live pages with it.
    SELECT count(*) INTO v_live_club FROM clubs;
    IF v_live_club < 1 THEN
        RAISE EXCEPTION 'pre-flight failed: the clubs table is empty, so EVERY club page looks orphaned. Refusing to run.';
    END IF;

    RAISE NOTICE 'pre-flight ok: % orphaned club pages, % live clubs', v_orphans, v_live_club;
END $$;

-- --- 2. THE ACTUAL CHANGES ---------------------------------------------

-- Archive first, so this migration is reversible.
CREATE TABLE IF NOT EXISTS social_pages_orphan_archive (
    LIKE social_pages INCLUDING DEFAULTS
);

COMMENT ON TABLE social_pages_orphan_archive IS
  'Rows removed by 20260908140215_delete_orphaned_club_social_pages: social pages whose linked club no longer existed, orphaned by the delete-club cascade gap fixed in the same change. Restore with INSERT INTO social_pages SELECT (columns) FROM social_pages_orphan_archive WHERE id = ...';

ALTER TABLE social_pages_orphan_archive
    ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();

-- The archive holds deleted rows only; nothing reads it through PostgREST.
ALTER TABLE social_pages_orphan_archive ENABLE ROW LEVEL SECURITY;

-- Do not double-archive on a re-run.
INSERT INTO social_pages_orphan_archive
SELECT sp.*, now()
FROM social_pages sp
WHERE sp.linked_entity_type = 'club'
  AND sp.linked_entity_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id::text = sp.linked_entity_id)
  AND NOT EXISTS (SELECT 1 FROM social_pages_orphan_archive a WHERE a.id = sp.id);

DELETE FROM social_pages sp
WHERE sp.linked_entity_type = 'club'
  AND sp.linked_entity_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id::text = sp.linked_entity_id);

-- --- 3. POST-APPLY ASSERTIONS ------------------------------------------
DO $$
DECLARE
    v_left      integer;
    v_archived  integer;
    v_remaining integer;
    v_live      integer;
BEGIN
    SELECT count(*) INTO v_left
    FROM social_pages sp
    WHERE sp.linked_entity_type = 'club'
      AND sp.linked_entity_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id::text = sp.linked_entity_id);

    IF v_left <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % orphaned club pages still present', v_left;
    END IF;

    SELECT count(*) INTO v_archived FROM social_pages_orphan_archive;
    SELECT count(*) INTO v_remaining FROM social_pages;

    SELECT count(*) INTO v_live
    FROM social_pages sp
    WHERE sp.linked_entity_type = 'club'
      AND EXISTS (SELECT 1 FROM clubs c WHERE c.id::text = sp.linked_entity_id);

    IF v_live < 1 THEN
        RAISE EXCEPTION 'post-apply failed: no club page points at a live club any more - the delete was too broad';
    END IF;

    -- Home game pages are a different linked_entity_type and must be untouched.
    IF (SELECT count(*) FROM social_pages WHERE page_type = 'home_game') < 3 THEN
        RAISE EXCEPTION 'post-apply failed: home_game pages were affected; expected all 3 to survive';
    END IF;

    RAISE NOTICE 'post-apply ok: 0 orphans left, % archived, % pages remain, % still linked to live clubs', v_archived, v_remaining, v_live;
END $$;

COMMIT;

-- =======================================================================
-- ROLLBACK (Tier 3 - paste into a NEW _revert_ migration if ever needed)
-- =======================================================================
-- Every deleted row is in social_pages_orphan_archive, so the restore is
-- exact. The archive carries one extra column (archived_at), so name the
-- social_pages columns explicitly rather than using SELECT *.
--
-- BEGIN;
-- INSERT INTO social_pages (<columns of social_pages>)
-- SELECT <same columns> FROM social_pages_orphan_archive a
-- WHERE NOT EXISTS (SELECT 1 FROM social_pages sp WHERE sp.id = a.id);
-- COMMIT;
--
-- The children (followers, posts, reports, reviews) were removed by
-- ON DELETE CASCADE and are NOT archived. Every archived row had zero of
-- each - asserted in the pre-flight above - so there is nothing missing.
-- =======================================================================
