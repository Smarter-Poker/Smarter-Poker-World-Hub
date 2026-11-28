-- ═══════════════════════════════════════════════════════════════════════
-- 20261128050500_venue_games_from_pokeratlas_catalog.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (r3-data)
-- AFFECTS:     functions fn_pokeratlas_catalog_game_family(text),
--              fn_pokeratlas_catalog_games(text),
--              fn_venue_games_from_pokeratlas_catalog();
--              trigger trg_venue_games_from_pokeratlas_catalog on
--              venue_live_tables
-- IRREVERSIBLE: no (rollback at the bottom)
--
-- WHY:
--   poker_venues.games_offered was only ever written by one-off seed and
--   expansion scripts. pokeratlas-live-daemon.py, the collector that
--   actually reads each room's PokerAtlas page, saves the room's game list
--   to venue_live_tables (observation_kind = 'catalog', source =
--   'pokeratlas', bravo_slug = 'pa-' || pokeratlas_slug) and never touches
--   poker_venues. So every room added after the seed era (ids 3348+) was
--   listed with an empty games_offered even when its own PokerAtlas game
--   list was sitting in venue_live_tables: on 2026-11-28 162 listed rows
--   had no games, and 42 of the 72 that are rooms (not tour/series rows)
--   had a matching catalog.
--
-- HOW (high level):
--   * fn_pokeratlas_catalog_game_family maps one PokerAtlas catalog game
--     name ("2/5 Pot Limit Omaha Hi") to the directory vocabulary already
--     in games_offered (NLH, PLO, Limit HE, Limit Omaha, Big O, 7-Stud,
--     Mixed). Anything else (Short Deck, Pineapple, Badugi, Draw, ...)
--     maps to NULL and is left out, never guessed.
--   * fn_pokeratlas_catalog_games(slug) returns the ordered, de-duplicated
--     families of the room's saved catalog rows.
--   * A statement-level AFTER INSERT trigger on venue_live_tables fills
--     games_offered ONLY where it is NULL or empty, ONLY for the rooms in
--     the inserted batch, and logs every fill to
--     venue_directory_enrichment_log with the PokerAtlas page as the
--     source. It never overwrites an existing list, never writes
--     last_verified_at (a catalog read is not a verification), and a
--     failure inside it is reported as a WARNING so it can never refuse
--     the collector's catalog write.
--   * One-time backfill, in the same transaction as the trigger so no
--     catalog write can land between them: every row whose games_offered
--     is empty and whose PokerAtlas catalog maps to at least one game is
--     filled the same way, with the same provenance row. Proved in a
--     rolled-back transaction on 2026-11-28 04:3x UTC: 58 rows in all, 43
--     of them listed (is_active AND NOT is_suppressed). The block asserts
--     those numbers and aborts if the board moved.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. PRE-FLIGHT
DO $$
BEGIN
  IF to_regclass('public.venue_live_tables') IS NULL
     OR to_regclass('public.poker_venues') IS NULL
     OR to_regclass('public.venue_directory_enrichment_log') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: venue_live_tables, poker_venues or venue_directory_enrichment_log missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'poker_venues'
                    AND column_name = 'games_offered' AND data_type = 'ARRAY') THEN
    RAISE EXCEPTION 'pre-flight failed: poker_venues.games_offered text[] missing';
  END IF;
END $$;

-- 2. THE CHANGES
CREATE OR REPLACE FUNCTION public.fn_pokeratlas_catalog_game_family(p_game_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
DECLARE
  -- Drop the leading stakes ("1/2 ", "$5 ", "1/2/5 ") so the "/" test below
  -- only ever sees the game itself.
  g text := lower(trim(regexp_replace(coalesce(p_game_name, ''), '^[0-9$/,. kK-]+\s*', '')));
  -- "/" inside a single game ("Omaha 8/b", "Big O Hi/Lo") is not a mix.
  g_no_split text;
BEGIN
  IF g = '' THEN
    RETURN NULL;
  END IF;
  g_no_split := replace(replace(replace(g, '8/b', ''), 'hi/lo', ''), 'hi-lo', '');

  IF g ~ 'mix' OR g ~ 'dealer' OR g_no_split ~ '/' THEN
    RETURN 'Mixed';
  END IF;
  -- Variants the directory has no word for are left out, not guessed.
  IF g ~ '(short deck|pineapple|chinese|badugi|draw|2-7|a-5|mexican)' THEN
    RETURN NULL;
  END IF;
  IF g ~ 'big o' THEN
    RETURN 'Big O';
  END IF;
  IF g ~ '(stud|razz)' THEN
    RETURN '7-Stud';
  END IF;
  IF g ~ '(hold''?em|holdem|nlhe|\mnlh\M)' THEN
    IF g ~ '(no limit|\mnlhe?\M)' THEN RETURN 'NLH'; END IF;
    IF g ~ 'pot limit' THEN RETURN NULL; END IF;
    IF g ~ 'limit' THEN RETURN 'Limit HE'; END IF;
    RETURN NULL;
  END IF;
  IF g ~ '(omaha|\mplo\M)' THEN
    IF g ~ '(pot limit|\mplo\M)' THEN RETURN 'PLO'; END IF;
    IF g ~ 'no limit' THEN RETURN NULL; END IF;
    IF g ~ 'limit' THEN RETURN 'Limit Omaha'; END IF;
    RETURN NULL;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_pokeratlas_catalog_game_family(text) IS
  'Maps one PokerAtlas catalog game name to the poker_venues.games_offered vocabulary (NLH, PLO, Limit HE, Limit Omaha, Big O, 7-Stud, Mixed); NULL for anything else. 20261128050500.';

CREATE OR REPLACE FUNCTION public.fn_pokeratlas_catalog_games(p_bravo_slug text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT coalesce(array_agg(f ORDER BY array_position(
           ARRAY['NLH','PLO','Limit HE','Limit Omaha','Big O','7-Stud','Mixed'], f)), ARRAY[]::text[])
    FROM (
      SELECT DISTINCT public.fn_pokeratlas_catalog_game_family(t.game_name) AS f
        FROM public.venue_live_tables t
       WHERE t.bravo_slug = p_bravo_slug
         AND t.source = 'pokeratlas'
         AND t.observation_kind = 'catalog'
    ) fam
   WHERE f IS NOT NULL;
$$;

COMMENT ON FUNCTION public.fn_pokeratlas_catalog_games(text) IS
  'Ordered games_offered families of one room''s saved PokerAtlas catalog (venue_live_tables, observation_kind=catalog). 20261128050500.';

CREATE OR REPLACE FUNCTION public.fn_venue_games_from_pokeratlas_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  BEGIN
    WITH slugs AS (
      SELECT DISTINCT n.bravo_slug
        FROM new_rows n
       WHERE n.source = 'pokeratlas'
         AND n.observation_kind = 'catalog'
         AND n.bravo_slug LIKE 'pa-%'
    ),
    targets AS (
      SELECT v.id, v.pokeratlas_slug, v.games_offered AS before_games,
             public.fn_pokeratlas_catalog_games(s.bravo_slug) AS games
        FROM slugs s
        JOIN public.poker_venues v ON 'pa-' || v.pokeratlas_slug = s.bravo_slug
       WHERE coalesce(cardinality(v.games_offered), 0) = 0
    ),
    filled AS (
      UPDATE public.poker_venues v
         SET games_offered = t.games
        FROM targets t
       WHERE v.id = t.id
         AND cardinality(t.games) > 0
         AND coalesce(cardinality(v.games_offered), 0) = 0
      RETURNING v.id, t.pokeratlas_slug, t.before_games, t.games
    )
    INSERT INTO public.venue_directory_enrichment_log
      (venue_id, actor_id, reason, source_url, confidence, before_record, after_record)
    SELECT f.id, NULL,
           'games_offered filled from the room''s saved PokerAtlas game catalog (venue_live_tables, observation_kind=catalog)',
           'https://www.pokeratlas.com/poker-room/' || f.pokeratlas_slug,
           0.9,
           jsonb_build_object('games_offered', f.before_games),
           jsonb_build_object('games_offered', f.games, 'source', 'pokeratlas_catalog')
      FROM filled f;
  EXCEPTION WHEN OTHERS THEN
    -- The catalog write is the collector's job; enrichment must never refuse it.
    RAISE WARNING 'venue games enrichment from PokerAtlas catalog skipped: % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_venue_games_from_pokeratlas_catalog() IS
  'Statement trigger on venue_live_tables: fills EMPTY poker_venues.games_offered from the room''s PokerAtlas catalog and logs provenance. Never overwrites, never sets last_verified_at. 20261128050500.';

REVOKE ALL ON FUNCTION public.fn_venue_games_from_pokeratlas_catalog() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_venue_games_from_pokeratlas_catalog ON public.venue_live_tables;
CREATE TRIGGER trg_venue_games_from_pokeratlas_catalog
  AFTER INSERT ON public.venue_live_tables
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_venue_games_from_pokeratlas_catalog();

-- 3. BACKFILL (existing rows; same rule as the trigger)
DO $$
DECLARE
  v_expected_all constant integer := 58;
  v_expected_listed constant integer := 43;
  v_all integer;
  v_listed integer;
  v_logged integer;
BEGIN
  CREATE TEMP TABLE _games_backfill ON COMMIT DROP AS
  SELECT v.id, v.pokeratlas_slug, v.games_offered AS before_games,
         coalesce(v.is_active, false) AND NOT coalesce(v.is_suppressed, false) AS listed,
         public.fn_pokeratlas_catalog_games('pa-' || v.pokeratlas_slug) AS games
    FROM public.poker_venues v
   WHERE v.pokeratlas_slug IS NOT NULL
     AND coalesce(cardinality(v.games_offered), 0) = 0;
  DELETE FROM _games_backfill WHERE cardinality(games) = 0;

  SELECT count(*), count(*) FILTER (WHERE listed) INTO v_all, v_listed FROM _games_backfill;
  IF v_all <> v_expected_all OR v_listed <> v_expected_listed THEN
    RAISE EXCEPTION 'backfill pre-check failed: % rows (% listed), probe proved % (% listed)',
      v_all, v_listed, v_expected_all, v_expected_listed;
  END IF;

  UPDATE public.poker_venues v
     SET games_offered = b.games
    FROM _games_backfill b
   WHERE v.id = b.id
     AND coalesce(cardinality(v.games_offered), 0) = 0;
  GET DIAGNOSTICS v_all = ROW_COUNT;
  IF v_all <> v_expected_all THEN
    RAISE EXCEPTION 'backfill updated % rows, expected %', v_all, v_expected_all;
  END IF;

  INSERT INTO public.venue_directory_enrichment_log
    (venue_id, actor_id, reason, source_url, confidence, before_record, after_record)
  SELECT b.id, NULL,
         'games_offered backfilled from the room''s saved PokerAtlas game catalog (venue_live_tables, observation_kind=catalog), migration 20261128050500',
         'https://www.pokeratlas.com/poker-room/' || b.pokeratlas_slug,
         0.9,
         jsonb_build_object('games_offered', b.before_games),
         jsonb_build_object('games_offered', b.games, 'source', 'pokeratlas_catalog')
    FROM _games_backfill b;
  GET DIAGNOSTICS v_logged = ROW_COUNT;
  IF v_logged <> v_expected_all THEN
    RAISE EXCEPTION 'backfill logged % provenance rows, expected %', v_logged, v_expected_all;
  END IF;

  IF EXISTS (SELECT 1 FROM public.poker_venues v
              WHERE v.pokeratlas_slug IS NOT NULL
                AND coalesce(cardinality(v.games_offered), 0) = 0
                AND cardinality(public.fn_pokeratlas_catalog_games('pa-' || v.pokeratlas_slug)) > 0) THEN
    RAISE EXCEPTION 'backfill left a row empty that its catalog could fill';
  END IF;
  IF EXISTS (SELECT 1 FROM _games_backfill b JOIN public.poker_venues v ON v.id = b.id
              WHERE v.games_offered IS DISTINCT FROM b.games) THEN
    RAISE EXCEPTION 'backfill readback differs from the catalog mapping';
  END IF;
END $$;

-- 4. POST-APPLY ASSERTIONS: the mapping, on real PokerAtlas catalog names
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('1/2 No Limit Holdem', 'NLH'),
    ('2/3/5 No Limit Holdem', 'NLH'),
    ('NLHE', 'NLH'),
    ('1/3 No Limit On the Button Hold''em', 'NLH'),
    ('4/8 Limit Holdem', 'Limit HE'),
    ('2/10 Spread Limit Holdem', 'Limit HE'),
    ('5/5 Pot Limit Omaha Hi', 'PLO'),
    ('1/2 Pot Limit Omaha 8/b', 'PLO'),
    ('1/2 Pot Limit 5-Card Omaha Hi Only', 'PLO'),
    ('5/5 Pot Limit Double Board Bomb Pot Omaha', 'PLO'),
    ('PLO', 'PLO'),
    ('4/8 Limit Omaha 8/b', 'Limit Omaha'),
    ('4/8 Limit Omaha Hi', 'Limit Omaha'),
    ('5/5 Pot Limit Big O Hi/Lo', 'Big O'),
    ('10/20 Limit Big O Hi/Lo', 'Big O'),
    ('4/8 Stud 8/b', '7-Stud'),
    ('2/4 Razz', '7-Stud'),
    ('20/40 Limit Mixed', 'Mixed'),
    ('1/2 Mixed Limit Hold''em/Omaha Mix', 'Mixed'),
    ('4/8 Omaha8/Stud8', 'Mixed'),
    ('3/6 Limit Hold''em/O8/Stud 8', 'Mixed'),
    ('2/4 Limit Dealer''s Choice', 'Mixed'),
    ('1/2 Pot Limit 5-Card Omaha Hi/Big O Hi-Lo', 'Mixed'),
    ('1/2 No Limit Short Deck (6+)', NULL),
    ('1/2 No Limit Crazy Pineapple', NULL),
    ('2/4 Limit Badugi', NULL),
    ('2/4 Triple Draw', NULL),
    ('1/2 No Limit Omaha 8/b', NULL),
    ('Omaha Hi/Lo', NULL),
    ('', NULL)
  ) AS c(name, expected) LOOP
    IF public.fn_pokeratlas_catalog_game_family(r.name) IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'post-apply assertion failed: % mapped to %, expected %',
        r.name, public.fn_pokeratlas_catalog_game_family(r.name), r.expected;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'trg_venue_games_from_pokeratlas_catalog'
                    AND tgrelid = 'public.venue_live_tables'::regclass) THEN
    RAISE EXCEPTION 'post-apply assertion failed: catalog games trigger missing';
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- -- Filled rows are recorded in venue_directory_enrichment_log
-- -- (reason LIKE 'games_offered % PokerAtlas game catalog%'); restore with
-- -- UPDATE poker_venues v SET games_offered = NULL FROM venue_directory_enrichment_log l
-- --  WHERE l.venue_id = v.id AND l.reason LIKE 'games_offered % PokerAtlas game catalog%'
-- --    AND v.games_offered = ARRAY(SELECT jsonb_array_elements_text(l.after_record->'games_offered'));
-- DROP TRIGGER IF EXISTS trg_venue_games_from_pokeratlas_catalog ON public.venue_live_tables;
-- DROP FUNCTION IF EXISTS public.fn_venue_games_from_pokeratlas_catalog();
-- DROP FUNCTION IF EXISTS public.fn_pokeratlas_catalog_games(text);
-- DROP FUNCTION IF EXISTS public.fn_pokeratlas_catalog_game_family(text);
-- COMMIT;
