-- ═══════════════════════════════════════════════════════════════════════
-- 20260930170200_social_post_topics_backfill.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (one batched UPDATE of two columns on the live social_posts
--              table, one GIN index, one column DEFAULT; no schema shape change)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4, agent p8-data),
--              Fleet Content Programme Phase 8 "Discovery and the feed"
-- AFFECTS:     rows: public.social_posts.topics and .topic on every row whose
--                topics IS NULL or whose topics[1] disagrees with topic
--                (3,941 of 6,200 rows on 2026-09-30; the 2,259 video RPC rows
--                already agree and are skipped by the WHERE clause)
--              new index: idx_social_posts_topics_gin ON public.social_posts USING gin (topics)
--              column default: public.social_posts.topics DEFAULT ARRAY[unknown]
--              untouched: every other column, every unique index, the CHECK
--                social_posts_topic_check, content_settings, horse_post_modes;
--                NO SET NOT NULL (that is a later migration after one week of
--                writes shows no NULL)
-- IRREVERSIBLE: no for the schema (the ROLLBACK block drops the index and the
--              default); the row values are derived and re-derivable: the
--              trigger from 20260930170100 recomputes them on any later write,
--              and topics was NULL before on every row this file touches
--
-- WHY:
--   20260930170100 derives topics for every new write, but the Hands tab and
--   the topic filter read every row, and 3,941 existing rows carry topics NULL
--   (fleet hand and session posts, Phase 6 posts, fleet news links, the news
--   scraper links, legacy strategy content, club page mirrors). This file runs
--   the same function once over those rows so the feed sees one rule, and
--   creates the GIN index the Hands tab predicate (topics @> ARRAY[hand]) and
--   the topic filter (topics @> ARRAY[<facet>]) are served by.
--
-- HOW:
--   - A DO loop UPDATEs at most 1000 ids per statement (ORDER BY id), setting
--     topics := fn_social_post_topics(topic, topics, content_type, content,
--     metadata); the BEFORE UPDATE OF topics trigger then sets topic :=
--     topics[1], so a touched row never disagrees again and the loop ends at
--     0 rows. Rows that already carry an agreeing topics array (the video
--     RPC rows) are never selected, so trg_social_posts_video_contract_defaults
--     re-runs only for the one legacy video row without topics.
--   - CREATE INDEX IF NOT EXISTS idx_social_posts_topics_gin (the index the
--     20260501 compose migration declared but production lacks).
--   - ALTER COLUMN topics SET DEFAULT ARRAY[unknown]: a writer that sends no
--     topics gets a non-NULL array the trigger then derives from.
--   - Post-apply refuses to commit if any row has topics NULL or topics[1]
--     different from topic.
--   - Horses are players: the rule reads what each post carries, never who
--     wrote it; nothing here reads is_horse, origin_type or metadata.scheduler.
--
-- EVIDENCE (production kuklfnapbkmacvwxktbh, 2026-09-30, SELECT only):
--   6,200 social_posts rows, none is_deleted. topics NULL on 3,941 (679 in the
--   last 30 days); every non-NULL topics row was written by a video RPC and
--   its topics[1] equals its topic. Rule table (design 1.7): grounded hand 111,
--   grounded session 33, seasonal_local 18, news scraper links 3,510 plus fleet
--   news links 10 plus one content_type news row, social_page_post mirrors 5,
--   legacy strategy content types 46, everything else 207 -> {unknown}.
--   Expected afterwards: topics @> ARRAY[hand] = 111 plus fleet hand posts
--   written since. pg_indexes shows no index on topics. The BEFORE UPDATE
--   triggers whose column lists include topic or topics are
--   trg_social_posts_video_contract_defaults and (after 20260930170100)
--   trg_social_posts_zz_derive_topics; the lineage, provenance, visibility and
--   transition guards do not list them. No AFTER UPDATE trigger exists.
--   Realtime: the UPDATE emits change events to open social pages, whose
--   handler patches non-video rows in place; run outside the busiest hour.
--   Design: agent-evidence/fleet-p6-closeout-20260920/agents/p8-research/design.md
--   sections 1.7, 7.4 and 9.
-- ═══════════════════════════════════════════════════════════════════════

-- CREATE INDEX and SET DEFAULT lock social_posts briefly; a bounded wait turns a
-- busy moment into a clean, retryable failure instead of a queue.
SET lock_timeout = '10s';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PRE-FLIGHT: the rule from 20260930170100 is installed, the index is not.
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  n int;
BEGIN
  IF to_regprocedure('public.fn_social_post_topics(text, text[], text, text, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.fn_social_post_topics is missing (20260930170100)';
  END IF;

  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.social_posts'::regclass
     AND tgname = 'trg_social_posts_zz_derive_topics'
     AND NOT tgisinternal;
  IF n <> 1 THEN
    RAISE EXCEPTION 'pre-flight failed: trg_social_posts_zz_derive_topics is missing (20260930170100)';
  END IF;

  SELECT count(*) INTO n FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'social_posts'
     AND c.column_name = 'topics' AND c.data_type = 'ARRAY';
  IF n <> 1 THEN
    RAISE EXCEPTION 'pre-flight failed: social_posts.topics text[] is missing (20260501_compose_v2_columns)';
  END IF;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'social_posts'
     AND indexname = 'idx_social_posts_topics_gin';
  IF n <> 0 THEN
    RAISE EXCEPTION 'pre-flight failed: idx_social_posts_topics_gin already exists';
  END IF;
END $preflight$;

-- ---------------------------------------------------------------------------
-- 2. BACKFILL: the same rule, at most 1000 ids per UPDATE, until 0 rows
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE
  n int;
  v_total int := 0;
  v_batches int := 0;
BEGIN
  LOOP
    UPDATE public.social_posts
       SET topics = public.fn_social_post_topics(topic, topics, content_type, content, metadata)
     WHERE id IN (
       SELECT id
         FROM public.social_posts
        WHERE topics IS NULL OR topics[1] IS DISTINCT FROM topic
        ORDER BY id
        LIMIT 1000);
    GET DIAGNOSTICS n = ROW_COUNT;
    v_total := v_total + n;
    v_batches := v_batches + 1;
    EXIT WHEN n = 0;
    IF v_batches > 100000 THEN
      RAISE EXCEPTION 'backfill did not converge after % batches (% rows); the trigger is not setting topic', v_batches, v_total;
    END IF;
  END LOOP;
  RAISE NOTICE 'social_posts topics backfill: % rows in % batches', v_total, v_batches - 1;
END $backfill$;

-- ---------------------------------------------------------------------------
-- 3. THE INDEX the Hands tab and the topic filter are served by
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_social_posts_topics_gin
  ON public.social_posts USING gin (topics);

-- ---------------------------------------------------------------------------
-- 4. THE DEFAULT: a writer that sends no topics gets an array the trigger derives from
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_posts
  ALTER COLUMN topics SET DEFAULT ARRAY['unknown']::text[];

-- ---------------------------------------------------------------------------
-- 5. POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $postapply$
DECLARE
  n int;
  v_default text;
BEGIN
  SELECT count(*) INTO n FROM public.social_posts WHERE topics IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'post-apply: % social_posts rows still have topics NULL', n; END IF;

  SELECT count(*) INTO n FROM public.social_posts WHERE topics[1] IS DISTINCT FROM topic;
  IF n <> 0 THEN RAISE EXCEPTION 'post-apply: % social_posts rows have topics[1] different from topic', n; END IF;

  SELECT count(*) INTO n FROM public.social_posts WHERE cardinality(topics) < 1 OR cardinality(topics) > 4;
  IF n <> 0 THEN RAISE EXCEPTION 'post-apply: % social_posts rows have an empty or oversized topics array', n; END IF;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'social_posts'
     AND indexname = 'idx_social_posts_topics_gin' AND indexdef ILIKE '%USING gin (topics)%';
  IF n <> 1 THEN RAISE EXCEPTION 'post-apply: idx_social_posts_topics_gin (gin on topics) not found'; END IF;

  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_default
    FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE d.adrelid = 'public.social_posts'::regclass AND a.attname = 'topics';
  IF v_default IS NULL OR position('unknown' IN v_default) = 0 THEN
    RAISE EXCEPTION 'post-apply: social_posts.topics default is %, expected ARRAY[unknown]', COALESCE(v_default, '<none>');
  END IF;

  SELECT count(*) INTO n FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'social_posts'
     AND c.column_name = 'topics' AND c.is_nullable = 'YES';
  IF n <> 1 THEN RAISE EXCEPTION 'post-apply: social_posts.topics must stay nullable in this migration'; END IF;
END $postapply$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual, if ever needed: drops exactly what this file created; the
-- derived row values stay, they are what the trigger writes on any later write)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- ALTER TABLE public.social_posts ALTER COLUMN topics DROP DEFAULT;
-- DROP INDEX IF EXISTS public.idx_social_posts_topics_gin;
-- COMMIT;
