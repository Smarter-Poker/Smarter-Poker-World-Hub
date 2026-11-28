-- ═══════════════════════════════════════════════════════════════════════
-- 20261128050600_touring_series_rows_are_not_rooms.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (r3-data)
-- AFFECTS:     poker_venues rows 2834, 2835 (venue_type);
--              constraint poker_venues_touring_marker_is_not_a_room
-- IRREVERSIBLE: no (rollback at the bottom)
--
-- WHY:
--   Four listed poker_venues rows carry a non-state marker instead of a
--   state: NAPT Poker Tour (3115) and Rough Riders Poker Tour (3116) with
--   state 'Tour', and Charity Series of Poker (2834) and Poker For Good
--   (2835) with state 'MULTI'. None is a room: each runs events in many
--   places and has no address. The two tours are already venue_type
--   'tour', which every room filter in the app excludes
--   (pages/api/poker/venues.js, platform-counts.js, [pnmTab].js exclude
--   venue_type IN ('tour','series')). The two charity rows were typed
--   'charity', so they were counted, mapped and listed as rooms.
--
-- HOW:
--   * 2834 and 2835 become venue_type 'series', the existing type for
--     multi-venue series (77 rows already). They stay active and listed,
--     so they are not lost: they show where series show, not as rooms.
--     Their name, website, about and games are untouched.
--   * A CHECK constraint keeps the rule at the root: a row whose state is
--     the touring marker 'MULTI' or 'Tour' must be a 'tour' or 'series'.
--   * Proved in a rolled-back transaction first: exactly 2 rows change,
--     and afterwards no row with a touring marker is typed as a room.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. PRE-FLIGHT: the rows are exactly what the probe read
DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.poker_venues
   WHERE id IN (2834, 2835)
     AND state = 'MULTI'
     AND venue_type = 'charity'
     AND address IS NULL;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'pre-flight failed: expected 2 MULTI charity rows (2834, 2835), found %', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM public.poker_venues
   WHERE state IN ('MULTI', 'Tour')
     AND venue_type NOT IN ('tour', 'series');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'pre-flight failed: expected 2 touring-marker rows typed as rooms, found %', v_n;
  END IF;
END $$;

-- 2. THE CHANGES
DO $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.poker_venues
     SET venue_type = 'series'
   WHERE id IN (2834, 2835)
     AND state = 'MULTI'
     AND venue_type = 'charity';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'reclassified % rows, expected 2', v_n;
  END IF;
END $$;

ALTER TABLE public.poker_venues
  DROP CONSTRAINT IF EXISTS poker_venues_touring_marker_is_not_a_room;
ALTER TABLE public.poker_venues
  ADD CONSTRAINT poker_venues_touring_marker_is_not_a_room
  CHECK (state IS NULL OR state NOT IN ('MULTI', 'Tour') OR coalesce(venue_type, '') IN ('tour', 'series'));

COMMENT ON CONSTRAINT poker_venues_touring_marker_is_not_a_room ON public.poker_venues IS
  'A row whose state is the touring marker MULTI or Tour runs events in many places: it is a tour or series, never a room. 20261128050600.';

-- 3. POST-APPLY ASSERTIONS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.poker_venues
              WHERE state IN ('MULTI', 'Tour') AND venue_type NOT IN ('tour', 'series')) THEN
    RAISE EXCEPTION 'post-apply assertion failed: a touring-marker row is still typed as a room';
  END IF;
  IF (SELECT count(*) FROM public.poker_venues
       WHERE id IN (2834, 2835, 3115, 3116)
         AND is_active AND NOT coalesce(is_suppressed, false)
         AND venue_type IN ('tour', 'series')) <> 4 THEN
    RAISE EXCEPTION 'post-apply assertion failed: the four touring rows must stay listed as tour/series';
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- ALTER TABLE public.poker_venues DROP CONSTRAINT IF EXISTS poker_venues_touring_marker_is_not_a_room;
-- UPDATE public.poker_venues SET venue_type = 'charity' WHERE id IN (2834, 2835) AND venue_type = 'series';
-- COMMIT;
