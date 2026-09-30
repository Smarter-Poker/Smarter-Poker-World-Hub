-- ═══════════════════════════════════════════════════════════════════════
-- post_comment_counts_match_their_visible_comments
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (data: denormalized counter public.social_posts.comment_count on 564 rows; no schema change)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4), Fleet Content Programme Phase 6 closeout
-- AFFECTS:     public.social_posts.comment_count only, on posts whose count exceeds their visible comments
-- IRREVERSIBLE: no (rollback block recomputes the prior inflated value from the hidden rows)
--
-- WHY:
--   The old horse social engine counted every horse comment twice: the AFTER INSERT trigger
--   trig_update_post_comment_count added 1 and the engine also called increment_post_count
--   (removed in smarter-poker-workers #143). Hiding the rejected-era horse comments
--   (20260929224446) subtracted 1 per row through the trigger, which leaves exactly the
--   duplicate +1 per hidden horse comment on 562 of 564 over-counted posts (total excess 1,155,
--   never more than 11 on one post; no post is under-counted). This sets the counter to the
--   number of visible comments, which is what the trigger maintains from now on.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. PRE-FLIGHT: only over-counts, exactly as observed.
DO $$
DECLARE over int; under int;
BEGIN
  SELECT count(*) FILTER (WHERE sp.comment_count > v.n), count(*) FILTER (WHERE sp.comment_count < v.n)
    INTO over, under
    FROM public.social_posts sp
    JOIN LATERAL (SELECT count(*) AS n FROM public.social_comments c WHERE c.post_id = sp.id AND NOT c.is_deleted) v ON true;
  IF over <> 564 THEN RAISE EXCEPTION 'pre-flight: expected 564 over-counted posts, found %', over; END IF;
  IF under <> 0 THEN RAISE EXCEPTION 'pre-flight: expected 0 under-counted posts, found %', under; END IF;
END $$;

-- 2. CHANGE
UPDATE public.social_posts sp
   SET comment_count = v.n
  FROM (SELECT p.id, (SELECT count(*) FROM public.social_comments c WHERE c.post_id = p.id AND NOT c.is_deleted) AS n
          FROM public.social_posts p) v
 WHERE v.id = sp.id AND sp.comment_count <> v.n;

-- 3. POST-APPLY
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad
    FROM public.social_posts sp
    JOIN LATERAL (SELECT count(*) AS n FROM public.social_comments c WHERE c.post_id = sp.id AND NOT c.is_deleted) v ON true
   WHERE sp.comment_count <> v.n;
  IF bad <> 0 THEN RAISE EXCEPTION 'post-apply: % posts still mismatched', bad; END IF;
END $$;

COMMIT;

-- ROLLBACK (manual, if ever needed; restores the inflated values for the 562 posts where the excess
-- equalled their hidden horse comments; the other 2 posts held an excess not explained by hidden rows):
-- BEGIN;
-- UPDATE public.social_posts sp SET comment_count = sp.comment_count + h.n
--   FROM (SELECT post_id, count(*) AS n FROM public.social_comments WHERE is_deleted GROUP BY post_id) h
--  WHERE h.post_id = sp.id;
-- COMMIT;
