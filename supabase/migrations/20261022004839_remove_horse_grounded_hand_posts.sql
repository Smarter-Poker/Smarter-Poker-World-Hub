-- Dan, 2026-10-21: horse hand-recap text posts ("I raised preflop, checked the flop...") are removed permanently.
-- Applied to PokerIQ-Production as version 20261022004839.

-- 1. Publisher is retired: always a clean no-write the fleet worker treats as a skip.
CREATE OR REPLACE FUNCTION public.publish_horse_grounded_hand(
  p_author_id uuid, p_review_id bigint, p_content text, p_phrase_norm text,
  p_semantic_key text, p_frame_key text, p_publication_key text, p_brief jsonb)
RETURNS TABLE(social_post_id uuid, created boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
BEGIN
  RETURN QUERY SELECT NULL::uuid, false, 'source_used'::text;
END;
$fn$;

-- 2. Hard block at the table: no hand-recap horse post can ever be inserted again by any path.
CREATE OR REPLACE FUNCTION public.fn_block_horse_hand_recap_posts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.metadata->>'publication_contract' = 'horse_grounded_hand_v1'
     OR (NEW.origin_type = 'horse' AND NEW.metadata->>'grounded_type' = 'hand') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_block_horse_hand_recap_posts ON public.social_posts;
CREATE TRIGGER trg_block_horse_hand_recap_posts
  BEFORE INSERT ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_horse_hand_recap_posts();

-- 3. Mode switch off for good.
UPDATE public.horse_post_modes
SET enabled = false, approved_at = NULL, approved_by = NULL,
    description = 'RETIRED 2026-10-21 by Dan: horse hand-recap text posts are permanently removed. Publisher RPC returns a no-write and a social_posts trigger drops any such insert. Do not re-enable.'
WHERE mode = 'grounded_hand';

-- 4. Purge every existing hand-recap post and everything attached to it.
CREATE TEMP TABLE _hand_recap_ids ON COMMIT DROP AS
  SELECT id FROM public.social_posts
  WHERE metadata->>'publication_contract' = 'horse_grounded_hand_v1'
     OR (origin_type = 'horse' AND metadata->>'grounded_type' = 'hand');

DELETE FROM public.social_comments       WHERE post_id IN (SELECT id FROM _hand_recap_ids);
DELETE FROM public.social_likes          WHERE post_id IN (SELECT id FROM _hand_recap_ids);
DELETE FROM public.social_interactions   WHERE post_id IN (SELECT id FROM _hand_recap_ids);
DELETE FROM public.post_briefs           WHERE post_id IN (SELECT id FROM _hand_recap_ids);
DELETE FROM public.horse_phrase_ledger   WHERE post_id IN (SELECT id FROM _hand_recap_ids);
DELETE FROM public.horse_semantic_ledger WHERE post_id IN (SELECT id FROM _hand_recap_ids);
DELETE FROM public.horse_thread_state    WHERE post_id IN (SELECT id FROM _hand_recap_ids);
DELETE FROM public.horse_memory          WHERE source_post_id IN (SELECT id FROM _hand_recap_ids);
DELETE FROM public.share_events          WHERE post_id IN (SELECT id FROM _hand_recap_ids);
DELETE FROM public.mentions              WHERE post_id IN (SELECT id FROM _hand_recap_ids);
DELETE FROM public.social_posts          WHERE id IN (SELECT id FROM _hand_recap_ids);

DELETE FROM public.post_briefs b
WHERE b.kind = 'hand' AND NOT EXISTS (SELECT 1 FROM public.social_posts p WHERE p.id = b.post_id);
