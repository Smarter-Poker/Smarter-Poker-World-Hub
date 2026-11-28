-- ═══════════════════════════════════════════════════════════════════════
-- 20261128080000_pokeratlas_slugs_from_the_rooms_own_page.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (r4-venue-slugs-dupes)
-- AFFECTS:     poker_venues.pokeratlas_slug on rows 3352, 3383, 3397, 3398,
--              3413, 3402; poker_venues row 3435 (retired into 3383);
--              venue_duplicate_retirement_log (+1 row);
--              venue_directory_enrichment_log (+7 rows)
-- IRREVERSIBLE: no (rollback at the bottom)
--
-- WHY:
--   Six listed rooms carry a pokeratlas_slug that names no PokerAtlas page.
--   Each was built as "<name>-<city>" (jamul-casino-jamul,
--   texas-card-house-houston-katy, ...). No venue_live_tables row and no
--   PokerAtlas slug-map entry exists for any of them. Everything that joins a
--   room to its PokerAtlas data by slug misses these rooms: the live/catalog
--   join in src/lib/poker-near-me/liveCashGameData.js, the catalog games fill
--   in 20261128050500 ('pa-' || pokeratlas_slug), and the first URL the
--   tournament daemon tries (scripts/tournament-schedule-daemon.py puts the
--   stored slug first).
--
--   For each row the database already holds the right slug twice, from two
--   sources that do not depend on each other:
--     * the row's own pokeratlas_url names the room's page
--       (pnm_pokeratlas_room_slug(pokeratlas_url));
--     * pokeratlas-live-daemon.py saved that page's game catalog to
--       venue_live_tables (source 'pokeratlas', observation_kind 'catalog',
--       bravo_slug 'pa-' || slug) under the room's name. The daemon takes
--       its slugs and names from data/pokeratlas-slug-map.json, not from
--       poker_venues.
--
--     id    room                          wrong slug                                  right slug (catalog name)
--     3352  Jamul Casino                  jamul-casino-jamul                          jamul-casino (Jamul Casino)
--     3383  FireKeepers Casino            firekeepers-casino-battle-creek             firekeepers-battle-creek (FireKeepers Casino)
--     3397  Seminole Hard Rock Hollywood  seminole-hard-rock-hollywood-hollywood      hard-rock-hollywood-ft-lauderdale (Seminole Hard Rock Hollywood)
--     3398  Texas Card House Houston      texas-card-house-houston-katy               texas-card-house-houston (Texas Card House Houston)
--     3413  Hollywood Park Casino         hollywood-park-casino-inglewood             hollywood-park-inglewood (Hollywood Park Casino)
--     3402  Daytona Racing & Card Club    daytona-racing-and-card-club-daytona-beach  daytona-beach (Daytona Beach Racing and Card Club)
--
--   3402 was not on the original list. 20261128080100 keeps it as the
--   canonical Daytona row, so its slug is fixed here too.
--
--   The wrong slugs name no page at all, not another room's page. No other
--   row holds any of them. One right slug is already taken:
--   firekeepers-battle-creek is held by 3435 "FireKeepers" (Battle Creek, MI).
--   That row has the same PokerAtlas URL as 3383, no address, no schedules
--   and no references, and it is already hidden (is_suppressed). It is an
--   unretired duplicate of 3383. While its canonical_venue_id is NULL, the
--   unique index uq_poker_venues_pokeratlas_slug_normalized_canonical refuses
--   3383 its own slug. So 3435 is retired into 3383 here, the same way as the
--   nine earlier retirements in venue_duplicate_retirement_log: it is kept
--   but inactive and hidden, and its id redirects to 3383
--   (pages/hub/venues/[id].js). It keeps its slug, as the earlier retired
--   rows do; the unique index skips retired rows.
--
-- HOW (high level):
--   * Pre-flight: each of the six rows still has exactly the wrong slug read
--     on 2026-11-28 and is still listed. Its own pokeratlas_url names the
--     right slug. A PokerAtlas catalog under the right slug carries the
--     expected room name. Nothing is saved under the wrong slug. The only
--     other holder of any right slug is 3435, and 3435 still matches what
--     the probe read. Any drift aborts the whole transaction.
--   * Retire 3435 into 3383 and log the retirement and the enrichment.
--   * Set the six slugs, each with an enrichment log row giving the
--     PokerAtlas page as the source.
--   * Post-apply: exactly 6 slugs changed, each equals the room's own URL
--     slug, no listed row shares one, 3435 redirects to 3383, and exactly
--     1 + 7 log rows were written.
--   * Nothing else changes: no address, name, games or schedule.
--     games_offered fills itself from the catalog on the collector's next
--     catalog write once 20261128050500 is installed.
--
-- ORDER: install after 20261128050500 (which asserts its own backfill
--   counts). If this migration goes first, the six rows become eligible for
--   that backfill and its 58/43 pre-check aborts until it is re-probed.
--   20261128080100 asserts that this migration has run.
-- Not in the :50-:03 UTC break window (CLAUDE.md section 1.2).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE _pa_slug_fix (
  venue_id integer PRIMARY KEY,
  room_name text NOT NULL,
  old_slug text NOT NULL,
  new_slug text NOT NULL UNIQUE,
  catalog_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO _pa_slug_fix (venue_id, room_name, old_slug, new_slug, catalog_name) VALUES
  (3352, 'Jamul Casino',                 'jamul-casino-jamul',                         'jamul-casino',                      'Jamul Casino'),
  (3383, 'FireKeepers Casino',           'firekeepers-casino-battle-creek',            'firekeepers-battle-creek',          'FireKeepers Casino'),
  (3397, 'Seminole Hard Rock Hollywood', 'seminole-hard-rock-hollywood-hollywood',     'hard-rock-hollywood-ft-lauderdale', 'Seminole Hard Rock Hollywood'),
  (3398, 'Texas Card House Houston',     'texas-card-house-houston-katy',              'texas-card-house-houston',          'Texas Card House Houston'),
  (3413, 'Hollywood Park Casino',        'hollywood-park-casino-inglewood',            'hollywood-park-inglewood',          'Hollywood Park Casino'),
  (3402, 'Daytona Racing & Card Club',   'daytona-racing-and-card-club-daytona-beach', 'daytona-beach',                     'Daytona Beach Racing and Card Club');

-- 1. PRE-FLIGHT ASSERTIONS
DO $$
DECLARE
  v_n integer;
BEGIN
  IF to_regclass('public.poker_venues') IS NULL
     OR to_regclass('public.venue_live_tables') IS NULL
     OR to_regclass('public.venue_directory_enrichment_log') IS NULL
     OR to_regclass('public.venue_duplicate_retirement_log') IS NULL
     OR to_regprocedure('public.pnm_pokeratlas_room_slug(text)') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: a venue table or pnm_pokeratlas_room_slug(text) is missing';
  END IF;

  -- Hold the rows this migration reads and writes.
  PERFORM 1 FROM public.poker_venues
   WHERE id IN (SELECT venue_id FROM _pa_slug_fix) OR id = 3435
   ORDER BY id
     FOR UPDATE;

  -- Each row is still exactly what the probe read, and its own URL names the right slug.
  SELECT count(*) INTO v_n
    FROM _pa_slug_fix f
    JOIN public.poker_venues v ON v.id = f.venue_id
   WHERE v.name = f.room_name
     AND v.pokeratlas_slug = f.old_slug
     AND public.pnm_pokeratlas_room_slug(v.pokeratlas_url) = f.new_slug
     AND v.canonical_venue_id IS NULL
     AND coalesce(v.is_active, true)
     AND NOT coalesce(v.is_suppressed, false);
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'pre-flight failed: expected 6 listed rows with the probed wrong slug and a matching pokeratlas_url, found %', v_n;
  END IF;

  -- The room's PokerAtlas catalog is saved under the right slug, with the room's name.
  SELECT count(*) INTO v_n
    FROM _pa_slug_fix f
   WHERE EXISTS (SELECT 1 FROM public.venue_live_tables t
                  WHERE t.bravo_slug = 'pa-' || f.new_slug
                    AND t.source = 'pokeratlas'
                    AND t.observation_kind = 'catalog'
                    AND t.venue_name = f.catalog_name);
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'pre-flight failed: expected a PokerAtlas catalog under all 6 right slugs, found %', v_n;
  END IF;

  -- Nothing at all is saved under a wrong slug: it names no page.
  SELECT count(*) INTO v_n
    FROM _pa_slug_fix f
   WHERE EXISTS (SELECT 1 FROM public.venue_live_tables t WHERE t.bravo_slug = 'pa-' || f.old_slug);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'pre-flight failed: % wrong slugs now have saved PokerAtlas data; re-probe', v_n;
  END IF;

  -- No other row holds a wrong slug.
  SELECT count(*) INTO v_n
    FROM public.poker_venues v
    JOIN _pa_slug_fix f ON lower(btrim(v.pokeratlas_slug)) = f.old_slug
   WHERE v.id <> f.venue_id;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'pre-flight failed: % other rows hold a wrong slug', v_n;
  END IF;

  -- The only other unretired holder of a right slug is 3435 (firekeepers-battle-creek).
  SELECT count(*) INTO v_n
    FROM public.poker_venues v
    JOIN _pa_slug_fix f ON lower(btrim(v.pokeratlas_slug)) = f.new_slug
   WHERE v.canonical_venue_id IS NULL
     AND v.id <> f.venue_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'pre-flight failed: expected 1 other unretired holder of a right slug (3435), found %', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.poker_venues v
   WHERE v.id = 3435
     AND v.name = 'FireKeepers'
     AND v.city = 'Battle Creek'
     AND v.state = 'MI'
     AND v.address IS NULL
     AND v.pokeratlas_slug = 'firekeepers-battle-creek'
     AND public.pnm_pokeratlas_room_slug(v.pokeratlas_url) = 'firekeepers-battle-creek'
     AND v.is_suppressed IS TRUE
     AND v.canonical_venue_id IS NULL
     AND v.retired_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'pre-flight failed: 3435 is no longer the suppressed FireKeepers duplicate the probe read';
  END IF;

  IF EXISTS (SELECT 1 FROM public.venue_duplicate_retirement_log l
              WHERE 3435 IN (l.retired_venue_id, l.canonical_venue_id)
                 OR 3383 = l.retired_venue_id) THEN
    RAISE EXCEPTION 'pre-flight failed: 3435 or 3383 already has retirement history';
  END IF;

  IF EXISTS (SELECT 1 FROM public.venue_daily_tournaments d WHERE d.venue_id = 3435) THEN
    RAISE EXCEPTION 'pre-flight failed: 3435 now has schedule rows; re-probe';
  END IF;

  IF EXISTS (SELECT 1 FROM public.venue_directory_enrichment_log l
              WHERE l.reason LIKE '%20261128080000%') THEN
    RAISE EXCEPTION 'pre-flight failed: 20261128080000 has already written its log rows';
  END IF;
END $$;

-- 2. THE CHANGES
DO $$
DECLARE
  v_n integer;
  v_reason constant text :=
    'Retired unlisted duplicate of 3383 FireKeepers Casino (same PokerAtlas page firekeepers-battle-creek, no address, no schedules); it held 3383''s slug. Migration 20261128080000.';
BEGIN
  -- 2a. Retire 3435 into 3383 so the slug index stops refusing 3383 its own slug.
  INSERT INTO public.venue_duplicate_retirement_log
    (retired_venue_id, canonical_venue_id, actor_id, reason, before_record)
  SELECT v.id, 3383, NULL, v_reason, to_jsonb(v)
    FROM public.poker_venues v
   WHERE v.id = 3435;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'retirement log wrote % rows, expected 1', v_n;
  END IF;

  INSERT INTO public.venue_directory_enrichment_log
    (venue_id, actor_id, reason, source_url, confidence, before_record, after_record)
  SELECT v.id, NULL, v_reason,
         'https://www.pokeratlas.com/poker-room/firekeepers-battle-creek',
         1,
         jsonb_build_object('canonical_venue_id', v.canonical_venue_id, 'is_active', v.is_active,
                            'is_suppressed', v.is_suppressed),
         jsonb_build_object('canonical_venue_id', 3383, 'is_active', false, 'is_suppressed', true)
    FROM public.poker_venues v
   WHERE v.id = 3435;

  UPDATE public.poker_venues
     SET canonical_venue_id = 3383,
         is_active = false,
         is_suppressed = true,
         retired_at = now(),
         retired_by = NULL,
         retired_reason = v_reason,
         location_integrity_revision = clock_timestamp()
   WHERE id = 3435
     AND canonical_venue_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'retired % rows, expected 1 (3435)', v_n;
  END IF;

  -- 2b. The six slugs, each with its provenance.
  INSERT INTO public.venue_directory_enrichment_log
    (venue_id, actor_id, reason, source_url, confidence, before_record, after_record)
  SELECT f.venue_id, NULL,
         'pokeratlas_slug corrected to the room''s own PokerAtlas page: it is the slug in the row''s pokeratlas_url, and the PokerAtlas catalog saved under it names "'
           || f.catalog_name || '". The old slug named no page. Migration 20261128080000.',
         'https://www.pokeratlas.com/poker-room/' || f.new_slug,
         1,
         jsonb_build_object('pokeratlas_slug', f.old_slug),
         jsonb_build_object('pokeratlas_slug', f.new_slug, 'source', 'pokeratlas_url+pokeratlas_catalog')
    FROM _pa_slug_fix f;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'slug provenance wrote % rows, expected 6', v_n;
  END IF;

  UPDATE public.poker_venues v
     SET pokeratlas_slug = f.new_slug
    FROM _pa_slug_fix f
   WHERE v.id = f.venue_id
     AND v.pokeratlas_slug = f.old_slug;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'corrected % slugs, expected 6', v_n;
  END IF;
END $$;

-- 3. POST-APPLY ASSERTIONS
DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM _pa_slug_fix f
    JOIN public.poker_venues v ON v.id = f.venue_id
   WHERE v.pokeratlas_slug = f.new_slug
     AND public.pnm_pokeratlas_room_slug(v.pokeratlas_url) = v.pokeratlas_slug
     AND v.canonical_venue_id IS NULL
     AND coalesce(v.is_active, true)
     AND NOT coalesce(v.is_suppressed, false);
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'post-apply assertion failed: % of 6 listed rows carry their own page slug', v_n;
  END IF;

  -- One unretired row per right slug: the room itself.
  SELECT count(*) INTO v_n
    FROM public.poker_venues v
    JOIN _pa_slug_fix f ON lower(btrim(v.pokeratlas_slug)) = f.new_slug
   WHERE v.canonical_venue_id IS NULL;
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'post-apply assertion failed: % unretired holders of the 6 right slugs, expected 6', v_n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.poker_venues
                  WHERE id = 3435 AND canonical_venue_id = 3383
                    AND is_active IS FALSE AND is_suppressed IS TRUE
                    AND retired_at IS NOT NULL AND retired_reason LIKE '%20261128080000%') THEN
    RAISE EXCEPTION 'post-apply assertion failed: 3435 is not retired into 3383';
  END IF;

  SELECT count(*) INTO v_n FROM public.venue_duplicate_retirement_log
   WHERE retired_venue_id = 3435 AND canonical_venue_id = 3383;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'post-apply assertion failed: % retirement log rows for 3435, expected 1', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.venue_directory_enrichment_log
   WHERE reason LIKE '%20261128080000%';
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'post-apply assertion failed: % enrichment log rows, expected 7', v_n;
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste into a new _revert_ migration). 20261128080100 depends
-- on these slugs: revert it first.
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- UPDATE public.poker_venues v
--    SET pokeratlas_slug = l.before_record->>'pokeratlas_slug'
--   FROM public.venue_directory_enrichment_log l
--  WHERE l.venue_id = v.id
--    AND l.reason LIKE 'pokeratlas_slug corrected%20261128080000%'
--    AND v.pokeratlas_slug = l.after_record->>'pokeratlas_slug';
-- -- 3383 must give the slug back before 3435 re-enters the unique index.
-- UPDATE public.poker_venues
--    SET canonical_venue_id = NULL, is_active = true, is_suppressed = true,
--        retired_at = NULL, retired_by = NULL, retired_reason = NULL,
--        location_integrity_revision = clock_timestamp()
--  WHERE id = 3435 AND canonical_venue_id = 3383;
-- -- The log rows are audit history; keep them.
-- COMMIT;
