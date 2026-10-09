-- 20261009005831_remove_repeated_grounded_horse_posts.sql
-- Reserved against origin/main and every remote branch.
--
-- Owner direction: remove the poor horse posts, for every horse that posted
-- them. The first ten production days after grounded_hand and
-- grounded_session were approved exposed 381 exact repeated captions across
-- 1,116 live posts (735 excess copies). The repeated frames were generic even
-- when their hidden grounding rows differed. Both grounded modes were turned
-- off before this migration was prepared. The workers repair must deploy
-- before these modes are re-enabled.
--
-- This is deliberately narrower than the September rejected-era cleanup:
-- only horse-authored, fleet-scheduled, grounded posts at or after the exact
-- approval timestamp are candidates, and only when the same caption appears
-- more than once in that bounded set. Human and official posts, unique
-- grounded posts, every other horse mode, and the durable phrase ledger are
-- preserved. Engagement rows tied only to a removed post are removed with it;
-- phrase-ledger rows keep preventing the rejected wording from returning and
-- merely lose the now-absent post pointer.

SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

CREATE TEMP TABLE cleanup_repeated_grounded_posts (
  id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO cleanup_repeated_grounded_posts (id)
SELECT p.id
  FROM public.social_posts p
  JOIN public.profiles author ON author.id = p.author_id
  JOIN (
    SELECT p2.content
      FROM public.social_posts p2
      JOIN public.profiles author2 ON author2.id = p2.author_id
     WHERE p2.created_at >= timestamptz '2026-09-29 22:44:13.376794+00'
       AND author2.is_horse
       AND p2.metadata @> '{"grounded":true}'::jsonb
       AND p2.metadata ->> 'scheduler' = 'fleet'
       AND NOT COALESCE(p2.is_deleted, false)
     GROUP BY p2.content
    HAVING count(*) > 1
  ) repeated ON repeated.content = p.content
 WHERE p.created_at >= timestamptz '2026-09-29 22:44:13.376794+00'
   AND author.is_horse
   AND p.metadata @> '{"grounded":true}'::jsonb
   AND p.metadata ->> 'scheduler' = 'fleet'
   AND NOT COALESCE(p.is_deleted, false);

DO $preflight$
DECLARE
  v_targets integer;
  v_mode_rows integer;
BEGIN
  SELECT count(*) INTO v_targets FROM cleanup_repeated_grounded_posts;
  IF v_targets < 1116 THEN
    RAISE EXCEPTION 'pre-flight: expected at least the 1,116 audited repeated grounded posts, found %', v_targets;
  END IF;

  SELECT count(*) INTO v_mode_rows
    FROM public.horse_post_modes
   WHERE mode IN ('grounded_hand', 'grounded_session')
     AND enabled = false;
  IF v_mode_rows <> 2 THEN
    RAISE EXCEPTION 'pre-flight: grounded modes must both be disabled before cleanup; found % disabled rows', v_mode_rows;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM cleanup_repeated_grounded_posts t
      JOIN public.social_posts p ON p.id = t.id
      JOIN public.profiles a ON a.id = p.author_id
     WHERE NOT a.is_horse
        OR NOT (p.metadata @> '{"grounded":true}'::jsonb)
        OR p.metadata ->> 'scheduler' IS DISTINCT FROM 'fleet'
        OR p.created_at < timestamptz '2026-09-29 22:44:13.376794+00'
  ) THEN
    RAISE EXCEPTION 'pre-flight: target escaped the authorized grounded fleet boundary';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clip_usage_log x JOIN cleanup_repeated_grounded_posts t ON t.id = x.post_id
    UNION ALL
    SELECT 1 FROM public.posted_clips x JOIN cleanup_repeated_grounded_posts t ON t.id = x.post_id
    UNION ALL
    SELECT 1 FROM public.posted_sports_clips x JOIN cleanup_repeated_grounded_posts t ON t.id = x.post_id
  ) THEN
    RAISE EXCEPTION 'pre-flight: a text-only cleanup target unexpectedly owns a managed clip reference';
  END IF;
END
$preflight$;

-- Preserve the semantic refusal history while removing pointers to rows that
-- are about to disappear. The prior rejected-era cleanup established the same
-- contract for this nullable pointer.
UPDATE public.horse_phrase_ledger ledger
   SET post_id = NULL
  FROM cleanup_repeated_grounded_posts target
 WHERE ledger.post_id = target.id;

DELETE FROM public.post_briefs brief
 USING cleanup_repeated_grounded_posts target
 WHERE brief.post_id = target.id;

DELETE FROM public.social_comments comment
 USING cleanup_repeated_grounded_posts target
 WHERE comment.post_id = target.id;

DELETE FROM public.social_likes like_row
 USING cleanup_repeated_grounded_posts target
 WHERE like_row.post_id = target.id;

DELETE FROM public.social_interactions interaction
 USING cleanup_repeated_grounded_posts target
 WHERE interaction.post_id = target.id;

DELETE FROM public.social_posts post
 USING cleanup_repeated_grounded_posts target
 WHERE post.id = target.id;

DO $postflight$
DECLARE
  v_left integer;
BEGIN
  SELECT count(*) INTO v_left
    FROM cleanup_repeated_grounded_posts target
    JOIN public.social_posts post ON post.id = target.id;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'post-flight: % authorized repeated grounded posts remain', v_left;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.horse_phrase_ledger ledger
      JOIN cleanup_repeated_grounded_posts target ON target.id = ledger.post_id
  ) THEN
    RAISE EXCEPTION 'post-flight: phrase ledger still points at a removed post';
  END IF;
END
$postflight$;

COMMIT;

-- Irreversible by design: this removes rejected public content and its direct
-- engagement, under the owner's explicit cleanup direction. The phrase and
-- meaning ledgers remain so the same copy cannot be regenerated.
