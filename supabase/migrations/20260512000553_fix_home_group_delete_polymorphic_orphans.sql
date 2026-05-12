-- Dan-fix/audit-6 (2026-05-11): when a commander_home_group is DELETEd, two
-- categories of "polymorphic refs" are NOT cleaned up because they're linked
-- via plain columns (not FK), so PG can't auto-cascade:
--
-- 1) social_pages WHERE linked_entity_type='home_group' AND linked_entity_id=group.id::text
--    (polymorphic via text column -- same row format hosts club/venue pages)
-- 2) conversations.id = group.messenger_conversation_id
--    (group references conversation, not the other way around)
--
-- Audit found 58 orphan social_pages + 59 orphan conversations, all from
-- Phase 40 testing in April. They're invisible to the home-games discovery
-- RPCs (which join through commander_home_groups), but they ARE visible to:
--   - social_pages-facing discovery routes (anything that lists social_pages
--     directly without joining home_groups would surface these)
--   - direct /social/<slug> page loads (would 404 cleanly when the page
--     tries to load underlying home_group data, but the URL works)
--
-- Fix:
--   a) AFTER-DELETE trigger on commander_home_groups that DELETEs the linked
--      social_page (which cascades to social_page_posts/followers/reports/
--      reviews via FK) and the linked conversation (cascades to
--      messenger_participants via FK).
--   b) Backfill: clean up the existing 117 orphans.
--
-- Trigger is SECURITY DEFINER so it can DELETE from social_pages /
-- conversations regardless of caller's RLS posture; the parent DELETE on
-- commander_home_groups already enforces owner-only via RLS, so by the time
-- this trigger fires, we've already verified the caller has authority over
-- this group.
--
-- Cleanup operations are wrapped in EXCEPTION WHEN OTHERS RAISE WARNING so
-- if one side-effect fails, the parent DELETE still completes. Better to
-- have a slightly orphaned record than to block a legitimate delete.

CREATE OR REPLACE FUNCTION public.fn_cleanup_home_group_polymorphic_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 1) Clean up the linked social_page
  BEGIN
    DELETE FROM public.social_pages
    WHERE linked_entity_type = 'home_group'
      AND linked_entity_id = OLD.id::text;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_cleanup_home_group_polymorphic_refs: social_pages cleanup failed for group=%: % (%)',
      OLD.id, SQLERRM, SQLSTATE;
  END;

  -- 2) Clean up the linked conversation
  BEGIN
    IF OLD.messenger_conversation_id IS NOT NULL THEN
      DELETE FROM public.conversations
      WHERE id = OLD.messenger_conversation_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_cleanup_home_group_polymorphic_refs: conversations cleanup failed for group=%: % (%)',
      OLD.id, SQLERRM, SQLSTATE;
  END;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cleanup_home_group_polymorphic_refs ON public.commander_home_groups;
CREATE TRIGGER trg_cleanup_home_group_polymorphic_refs
  AFTER DELETE ON public.commander_home_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cleanup_home_group_polymorphic_refs();

-- -------- Backfill: clean up existing orphans

DELETE FROM public.social_pages sp
WHERE sp.linked_entity_type = 'home_group'
  AND NOT EXISTS(SELECT 1 FROM public.commander_home_groups g WHERE g.id::text = sp.linked_entity_id);

DELETE FROM public.conversations c
WHERE c.category = 'home_group'
  AND NOT EXISTS(SELECT 1 FROM public.commander_home_groups g WHERE g.messenger_conversation_id = c.id);
