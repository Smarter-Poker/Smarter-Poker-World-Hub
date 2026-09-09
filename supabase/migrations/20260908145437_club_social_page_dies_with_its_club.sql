-- =======================================================================
-- 20260908145437_club_social_page_dies_with_its_club.sql
-- =======================================================================
-- TIER:        3  (creates a trigger that deletes rows; also clears a backlog)
-- AUTHOR:      Claude (Cowork)
-- AFFECTS:     triggers: clubs (new AFTER DELETE)
--              functions: trg_fn_delete_club_social_page (new)
--              tables: social_pages, social_pages_orphan_archive
-- IRREVERSIBLE: no  (drop the trigger; archived rows are restorable)
--
-- WHY:
--   A club's social page is created BY THE DATABASE.
--   trg_autocreate_club_social_page is an AFTER INSERT trigger on public.clubs
--   calling fn_ensure_social_page_for_club(NEW.id). Creation is therefore
--   path-independent: it happens however the club row arrives - API,
--   migration, test fixture, psql.
--
--   Deletion was not symmetric. Nothing removed the page when the club went,
--   so every deleted club left its page in social_pages, which IS the public
--   directory /hub/social-pages Discover reads. 26 of 37 rows were orphans
--   when this was found on 2026-09-08.
--
--   pages/api/club-arena/delete-club.js was fixed the same day (#1595) to
--   delete the page before the club row. That fix is real but NOT sufficient,
--   and assuming it was would have been the mistake: it covers one code path
--   while the CREATE side covers all of them. Proof arrived within the hour -
--   two fresh orphans ("Crest Cert 1788877885856-cgggb" and its Preset twin)
--   appeared at 14:31 UTC from a fixture that does not use that route.
--
--   fn_guard_club_lifecycle_write() explains why: club deletion is blocked
--   outright except for a named exemption requiring auth.uid() IS NULL, a
--   'Crest Cert %' / 'Preset Crest Cert %' name, and app.ledger_maintenance +
--   app.game_management_retention to be set. That is a database-side sweep,
--   not an HTTP route, so an API-layer fix cannot cover it.
--
--   The symmetric fix is a trigger, so the page dies with its club however
--   the club dies.
--
-- HOW:
--   - AFTER DELETE ON clubs -> delete social_pages rows linked to OLD.id.
--   - Mirror the create trigger exactly: SECURITY DEFINER, search_path public,
--     warn-and-continue, so this can never block a club deletion. Its
--     create-side twin already made that call and the undo must not be
--     stricter than the do.
--   - Clear the backlog accumulated since the earlier purge, archiving first,
--     with the identical predicate as migration 20260908140215.
--
--   lock_timeout: clubs is a hot table on a live platform and the first
--   attempt at this migration DEADLOCKED against normal traffic while taking
--   AccessExclusiveLock for CREATE TRIGGER. Failing fast and retrying is
--   correct; blocking live club reads behind a DDL queue is not.
--
-- PROVEN in a rolled-back transaction, via the guard's own exemption path:
--   after INSERT  -> create trigger made a page      pages = 1
--   after DELETE  -> new delete trigger removed it   pages = 0
--
-- See .agent/workflows/migration-safety.md.
-- =======================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL deadlock_timeout = '1s';

-- --- 1. PRE-FLIGHT ------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.clubs'::regclass
          AND tgname = 'trg_autocreate_club_social_page'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: trg_autocreate_club_social_page is gone. This migration is the delete half of that pair; if creation is no longer a trigger, re-derive where the cleanup belongs.';
    END IF;

    IF to_regclass('public.social_pages_orphan_archive') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: social_pages_orphan_archive missing - run 20260908140215_delete_orphaned_club_social_pages first';
    END IF;
END $$;

-- --- 2. THE TRIGGER -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_delete_club_social_page()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- linked_entity_id is text, not uuid, so cast rather than compare types.
    DELETE FROM public.social_pages
    WHERE linked_entity_type = 'club'
      AND linked_entity_id = OLD.id::text;

    RETURN OLD;
EXCEPTION WHEN OTHERS THEN
    -- Same posture as the create-side twin: warn, never block.
    RAISE WARNING 'delete club social_page failed for club=%: %', OLD.id, SQLERRM;
    RETURN OLD;
END; $function$;

COMMENT ON FUNCTION public.trg_fn_delete_club_social_page() IS
  'Delete half of the pair with trg_fn_autocreate_club_social_page. A club social page is created by trigger, so it must be removed by trigger too, or every non-API deletion orphans a row into the public directory. Added 2026-09-08 after 26 of 37 social_pages rows were found to be orphans.';

DROP TRIGGER IF EXISTS trg_delete_club_social_page ON public.clubs;
CREATE TRIGGER trg_delete_club_social_page
    AFTER DELETE ON public.clubs
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_fn_delete_club_social_page();

-- --- 3. CLEAR THE BACKLOG SINCE THE LAST PURGE --------------------------
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

-- --- 4. POST-APPLY ASSERTIONS -------------------------------------------
DO $$
DECLARE
    v_left    integer;
    v_trigger integer;
    v_live    integer;
BEGIN
    SELECT count(*) INTO v_left
    FROM social_pages sp
    WHERE sp.linked_entity_type = 'club'
      AND sp.linked_entity_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id::text = sp.linked_entity_id);
    IF v_left <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % orphans remain', v_left;
    END IF;

    SELECT count(*) INTO v_trigger
    FROM pg_trigger
    WHERE tgrelid = 'public.clubs'::regclass AND tgname = 'trg_delete_club_social_page';
    IF v_trigger <> 1 THEN
        RAISE EXCEPTION 'post-apply failed: the delete trigger was not installed';
    END IF;

    SELECT count(*) INTO v_live
    FROM social_pages sp
    WHERE sp.linked_entity_type = 'club'
      AND EXISTS (SELECT 1 FROM clubs c WHERE c.id::text = sp.linked_entity_id);
    IF v_live < 1 THEN
        RAISE EXCEPTION 'post-apply failed: no club page points at a live club';
    END IF;

    IF (SELECT count(*) FROM social_pages WHERE page_type = 'home_game') < 3 THEN
        RAISE EXCEPTION 'post-apply failed: home_game pages were affected';
    END IF;

    RAISE NOTICE 'post-apply ok: trigger installed, 0 orphans, % live club pages', v_live;
END $$;

COMMIT;

-- =======================================================================
-- ROLLBACK
-- =======================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_delete_club_social_page ON public.clubs;
-- DROP FUNCTION IF EXISTS public.trg_fn_delete_club_social_page();
-- -- archived rows restorable from social_pages_orphan_archive (name the
-- -- social_pages columns explicitly; the archive has an extra archived_at)
-- COMMIT;
-- =======================================================================
