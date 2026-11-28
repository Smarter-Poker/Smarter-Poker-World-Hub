-- ═══════════════════════════════════════════════════════════════════════
-- 20261128030000_video_chapters_placeholder_cleared.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (data only: no DDL, no function, no policy change)
-- AUTHOR:      Claude agent (video library creator chapters, 2026-11-27)
-- AFFECTS:     public.video_enrichment_records.chapters
-- IRREVERSIBLE: no (the removed value is one fixed placeholder, reproduced
--               exactly in the rollback below)
--
-- WHY:
--   scripts/video_enrichment_worker.py answered every 'chapters' job with
--   [{"title":"Video Start","start_seconds":0}]. Nobody published that
--   chapter: it was written for 22,131 of 22,485 enrichment records (read
--   2026-11-28 02:05 UTC) and looks like data to anything that reads the
--   column. From this release the column holds only a creator's own chapter
--   list, read from the YouTube description by
--   scripts/video_source_registry_ingest.py, each entry marked
--   source = 'creator_description'. The worker no longer writes the column.
--
-- HOW:
--   1. Pre-flight: the column exists and is jsonb.
--   2. Set chapters to [] only where it is EXACTLY that single placeholder.
--      A creator's list (marked) and any other value are left untouched.
--   3. Post-apply: no exact placeholder remains, and the number of rows
--      carrying creator chapters is the same before and after.
--
-- PROOF: the same UPDATE ran inside BEGIN ... ROLLBACK on 2026-11-28 at
--   02:06 UTC through execute_sql: it cleared 22,131 rows, left 0 non-empty,
--   and a read afterwards showed all 22,131 placeholders still present.
--   Each update fires trg_sync_video_learning_search_document, which only
--   re-indexes the video's search document; chapters_text was already ''
--   for every row, so the search index does not change.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'video_enrichment_records'
      AND column_name = 'chapters' AND data_type = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: video_enrichment_records.chapters (jsonb) not found';
  END IF;
END $$;

DO $$
DECLARE
  v_creator_before bigint;
  v_cleared bigint;
  v_placeholder bigint;
  v_creator bigint;
BEGIN
  SELECT count(*) FILTER (WHERE chapters @> '[{"source":"creator_description"}]'::jsonb)
    INTO v_creator_before FROM public.video_enrichment_records;

  UPDATE public.video_enrichment_records
  SET chapters = '[]'::jsonb, updated_at = now()
  WHERE chapters = '[{"title":"Video Start","start_seconds":0}]'::jsonb;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  SELECT count(*) FILTER (WHERE chapters = '[{"title":"Video Start","start_seconds":0}]'::jsonb),
         count(*) FILTER (WHERE chapters @> '[{"source":"creator_description"}]'::jsonb)
    INTO v_placeholder, v_creator
  FROM public.video_enrichment_records;
  IF v_placeholder <> 0 THEN
    RAISE EXCEPTION 'post-apply assertion failed: % placeholder chapter rows remain', v_placeholder;
  END IF;
  IF v_creator <> v_creator_before THEN
    RAISE EXCEPTION 'post-apply assertion failed: creator chapter rows changed from % to %', v_creator_before, v_creator;
  END IF;
  RAISE NOTICE 'cleared % placeholder chapter rows; % rows keep creator chapters', v_cleared, v_creator;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (not recommended: it restores an invented chapter)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- UPDATE public.video_enrichment_records
-- SET chapters = '[{"title":"Video Start","start_seconds":0}]'::jsonb
-- WHERE chapters = '[]'::jsonb
--   AND video_id IN (SELECT video_id FROM public.video_enrichment_jobs
--                    WHERE job_type = 'chapters' AND status = 'succeeded'
--                      AND output = '{"chapters":[{"title":"Video Start","start_seconds":0}]}'::jsonb);
-- COMMIT;
