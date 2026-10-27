-- Dan, 2026-10-21: every horse hand/session recap post, from all time and any generator, is removed and blocked.
-- Applied to PokerIQ-Production as version 20261022014053. Follows 20261022004839_remove_horse_grounded_hand_posts.
-- The older generator (Sept 30 to Oct 9) wrote 691 hand recaps and 35 session recaps tagged origin_type
-- 'user_upload', so the block now keys on grounded_type alone, regardless of origin.

CREATE OR REPLACE FUNCTION public.fn_block_horse_hand_recap_posts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.metadata->>'publication_contract' = 'horse_grounded_hand_v1'
     OR NEW.metadata->>'grounded_type' IN ('hand','session') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

UPDATE public.horse_post_modes
SET enabled = false, approved_at = NULL, approved_by = NULL,
    description = 'RETIRED 2026-10-21 by Dan: horse recaps of their own hands or sessions are permanently removed from the feed; a social_posts trigger drops any such insert. Do not re-enable.'
WHERE mode IN ('grounded_session','throwback_hand');

CREATE TEMP TABLE _recap_ids ON COMMIT DROP AS
  SELECT id FROM public.social_posts
  WHERE metadata->>'publication_contract' = 'horse_grounded_hand_v1'
     OR metadata->>'grounded_type' IN ('hand','session');

DELETE FROM public.social_comments       WHERE post_id IN (SELECT id FROM _recap_ids);
DELETE FROM public.social_likes          WHERE post_id IN (SELECT id FROM _recap_ids);
DELETE FROM public.social_interactions   WHERE post_id IN (SELECT id FROM _recap_ids);
DELETE FROM public.post_briefs           WHERE post_id IN (SELECT id FROM _recap_ids);
DELETE FROM public.horse_phrase_ledger   WHERE post_id IN (SELECT id FROM _recap_ids);
DELETE FROM public.horse_semantic_ledger WHERE post_id IN (SELECT id FROM _recap_ids);
DELETE FROM public.horse_thread_state    WHERE post_id IN (SELECT id FROM _recap_ids);
DELETE FROM public.horse_memory          WHERE source_post_id IN (SELECT id FROM _recap_ids);
DELETE FROM public.share_events          WHERE post_id IN (SELECT id FROM _recap_ids);
DELETE FROM public.mentions              WHERE post_id IN (SELECT id FROM _recap_ids);
DELETE FROM public.content_asset_use     WHERE post_id IN (SELECT id FROM _recap_ids);
DELETE FROM public.social_posts          WHERE id IN (SELECT id FROM _recap_ids);

DELETE FROM public.post_briefs b
WHERE b.kind IN ('hand','session')
  AND NOT EXISTS (SELECT 1 FROM public.social_posts p WHERE p.id = b.post_id);
