-- ═══════════════════════════════════════════════════════════════════════════
--  THE VIDEO LIBRARY ADMITS A SECOND VERTICAL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY (2026-09-04)
--
-- Dan asked for slot-streamer content alongside poker, so video_library_scraper
-- gained eleven slot sources writing type = 'slots'. The commit that added them
-- said, in its own comment, "nothing filters on type today, so adding a value is
-- safe".
--
-- That was an ASSUMPTION and it was wrong. video_library_videos_type_check
-- restricted type to ('cash','tournament'), and every slot row was refused with
-- 23514 while the scraper logged a warning per row and carried on reporting
-- success. 160 videos - the whole of Brian Christopher Slots and The Big Jackpot
-- on the first pass - were found, downloaded and dropped on the floor.
--
-- The database was right and the assumption was not. It is the same shape as
-- everything else found on this platform today, something that reads as working
-- while doing nothing, with one difference that matters: the constraint SPOKE UP.
-- That is what a constraint is for, and it is why the mistake cost minutes
-- instead of sitting there as a category nothing renders.
--
-- WHAT THIS DOES
--
-- Widens the check to admit 'slots'. Existing rows are all 'cash' or
-- 'tournament' and stay valid. It stays a CHECK rather than becoming free text
-- deliberately: a typo'd type should keep being refused, loudly, rather than
-- quietly creating a fourth vertical nothing knows how to display.
--
-- ROLLBACK
--   -- retype or delete the 'slots' rows first, or the old constraint will not
--   -- validate:
--   ALTER TABLE public.video_library_videos DROP CONSTRAINT video_library_videos_type_check;
--   ALTER TABLE public.video_library_videos ADD CONSTRAINT video_library_videos_type_check
--     CHECK (type = ANY (ARRAY['cash'::text, 'tournament'::text]));
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.video_library_videos
  DROP CONSTRAINT IF EXISTS video_library_videos_type_check;

ALTER TABLE public.video_library_videos
  ADD CONSTRAINT video_library_videos_type_check
  CHECK (type = ANY (ARRAY['cash'::text, 'tournament'::text, 'slots'::text]));

COMMENT ON COLUMN public.video_library_videos.type IS
  'Content vertical: cash | tournament | slots. Deliberately a CHECK rather than free text - on 2026-09-04 a scraper change started writing an unlisted value and this constraint refused every row, which is how the mistake was found within minutes instead of shipping a category nothing renders.';

DO $$
DECLARE v_ok boolean;
BEGIN
  SELECT pg_get_constraintdef(oid) LIKE '%slots%' INTO v_ok
  FROM pg_constraint
  WHERE conrelid = 'public.video_library_videos'::regclass
    AND conname = 'video_library_videos_type_check';

  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'post-condition failed: the type check does not admit slots';
  END IF;

  RAISE NOTICE 'video_library_videos.type now admits slots.';
END $$;
