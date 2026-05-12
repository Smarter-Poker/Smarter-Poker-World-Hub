-- Dan-fix/audit-6 (2026-05-11): when commander_home_groups is DELETEd, two
-- categories of "polymorphic refs" are NOT cleaned up because they're linked
-- via plain columns (not FK), so PG can't auto-cascade:
--
-- 1) social_pages WHERE linked_entity_type='home_group' AND linked_entity_id=group.id::text
--    (polymorphic via text column — same table hosts club/venue/group pages)
-- 2) conversations.id = group.messenger_conversation_id
--    (group references conversation, not the other way around)
--
-- Audit found 58 orphan social_pages + 59 orphan conversations from Phase 40
-- testing in April. They're invisible to home-games discovery RPCs but ARE
-- visible to any social_pages-direct discovery surface.
--
-- Fix:
--   a) AFTER-DELETE trigger on commander_home_groups that DELETEs the linked
--      social_page (cascades via FK to social_page_posts/followers/reports/
--      reviews) and the linked conversation (cascades to messenger_participants).
--   b) Backfill: clean up the existing 117 orphans.

CREATE OR REPLACE FUNCTION public.fn_cleanup_home_group_polymorphic_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    DELETE FROM public.social_pages
    WHERE linked_entity_type = 'home_group'
      AND linked_entity_id = OLD.id::text;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_cleanup_home_group_polymorphic_refs: social_pages cleanup failed for group=%: % (%)',
      OLD.id, SQLERRM, SQLSTATE;
  END;

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

-- Backfill: clean up existing orphans
DELETE FROM public.social_pages sp
WHERE sp.linked_entity_type = 'home_group'
  AND NOT EXISTS(SELECT 1 FROM public.commander_home_groups g WHERE g.id::text = sp.linked_entity_id);

DELETE FROM public.conversations c
WHERE c.category = 'home_group'
  AND NOT EXISTS(SELECT 1 FROM public.commander_home_groups g WHERE g.messenger_conversation_id = c.id);
