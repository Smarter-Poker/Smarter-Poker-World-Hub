-- ═══════════════════════════════════════════════════════════════════════
-- 20261128080100_duplicate_rooms_retired_into_their_canonical_row.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (r4-venue-slugs-dupes)
-- AFFECTS:     poker_venues rows 2037, 1948, 1892, 3427 (retired:
--              canonical_venue_id, is_active, is_suppressed, retired_*);
--              venue_duplicate_retirement_log (+4 rows);
--              venue_directory_enrichment_log (+4 rows)
-- IRREVERSIBLE: no (rollback at the bottom)
--
-- WHY:
--   Three rooms are each listed twice in the directory. They appear twice
--   in search, twice on the map and twice in the room counts.
--
--   Daytona: 2037 "Daytona Beach Racing and Card Club" and 3402 "Daytona
--     Racing & Card Club", both in Daytona Beach, FL, with coordinates
--     about 60 m apart and the same website domain. 2037's name is exactly
--     the name PokerAtlas gives the page 3402 links to (catalog
--     pa-daytona-beach). Kept: 3402. It has the PokerAtlas page; the
--     tournament daemon writes its live schedules there (24 active rows);
--     the live collector reads its catalog. 2037 has no PokerAtlas URL, its
--     phone is identical to unrelated row 2038 (Caesars Virginia), and all
--     406 of its schedule rows are inactive history.
--   Silks: 1948 "Silks Poker Tampa Bay Downs" and 3454 "Silks Poker Room",
--     both in Tampa, FL. 1948's location belongs to another room: its
--     pokeratlas_url is westgate-las-vegas, whose catalog is "Westgate Las
--     Vegas Resort & Casino"; its coordinates are in Las Vegas; and
--     venue_location_integrity_state already marks it 'conflict'. 3454
--     holds the room's PokerAtlas page (the-silks-poker-room-tampa, catalog
--     "Silks @ Tampa Bay Downs") with a Tampa location. Kept: 3454.
--   Bally's Lincoln: 1892 "Bally's Twin River Lincoln" and 3467 "Bally's
--     Lincoln", same street address (100 Twin River Road, Lincoln, RI) and
--     identical coordinates. 3467 holds the PokerAtlas page lincoln, whose
--     catalog is "Bally's Lincoln", and gets the live schedules (8 active).
--     PokerAtlas now names the room "Bally's Lincoln". Under the tournament
--     daemon's room-identity rule (pokeratlas_room_page_identity: 75% of
--     the name's significant tokens), the name "Bally's Twin River Lincoln"
--     does not match that page. That is consistent with 1892's PokerAtlas
--     schedules stopping on 2026-09-06. Kept: 3467. A third row, 3427 "Bally
--     Twin River" (Lincoln, RI; same old PokerAtlas URL as 1892; no address;
--     already hidden, never retired), is retired into 3467 too, so its id
--     redirects instead of reading as gone.
--   Aggieland (3353 / 3088) is NOT a duplicate: "Aggieland Poker Club" at
--     12815 Wellborn Road and "Jokers of Aggieland Poker Club" at 2553 Texas
--     Avenue South are about 6 km apart. Each has its own PokerAtlas page,
--     and 3088's catalog is saved under its own slug. Nothing changes.
--
--   The kept row is the one whose identity agrees with the source
--   (PokerAtlas page, catalog name, location) and that the collectors
--   already feed. Where both rows were clean, the older row would win. In
--   these three pairs the older row's location or contact data is provably
--   another room's, or its name no longer matches the source.
--
-- HOW (high level):
--   * The same retirement as the nine rows already in
--     venue_duplicate_retirement_log (20260907032000 and the 2026-10-10
--     batch): no delete. Each retired row is kept with canonical_venue_id
--     set, is_active false, is_suppressed true and retired_* filled in;
--     pages/hub/venues/[id].js answers its id with a permanent redirect to
--     the kept row.
--   * Nothing is repointed. Every table that can reference a room was read
--     (all 58 FKs to poker_venues, and every venue_id/poker_venue_id/
--     linked_venue_id/room_id column). The retired rows are referenced only
--     by their own integrity state and log rows (kept per venue) and by
--     venue_daily_tournaments. Those are all inactive history (0 servable
--     rows): 2037 has 406, 1948 has 11, 1892 has 25, 3427 has 0. The
--     schedule upsert key includes venue_name, so moving history onto
--     another room would mix two names' rows. It stays where it was
--     scraped, as in 20260907032000. The pre-flight checks every
--     referencing column dynamically and aborts if anything else appeared.
--   * games_offered is not merged. All three kept rows have an empty list.
--     The retired lists are seed data from rows whose other fields are
--     provably another room's (1948, 2037), or are unverified. The kept
--     rows' own PokerAtlas catalogs fill them through 20261128050500, which
--     only ever fills an empty list. A merge here would also shift that
--     migration's asserted backfill counts.
--   * The kept rows are not modified. 3402's slug is fixed by
--     20261128080000, which this migration requires.
--
-- ORDER: after 20261128080000 (asserted below). Not in the :50-:03 UTC
--   break window (CLAUDE.md section 1.2).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE _venue_dupes (
  retired_id integer PRIMARY KEY,
  canonical_id integer NOT NULL,
  retired_name text NOT NULL,
  canonical_name text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  retired_was_suppressed boolean NOT NULL,
  canonical_pa_slug text NOT NULL,
  canonical_catalog_name text NOT NULL,
  reason text NOT NULL
) ON COMMIT DROP;

INSERT INTO _venue_dupes VALUES
  (2037, 3402, 'Daytona Beach Racing and Card Club', 'Daytona Racing & Card Club',
   'Daytona Beach', 'FL', false, 'daytona-beach', 'Daytona Beach Racing and Card Club',
   'Retired duplicate of 3402 Daytona Racing & Card Club: same room (PokerAtlas daytona-beach is named "Daytona Beach Racing and Card Club"; coordinates within 100 m). 3402 holds the PokerAtlas page and the live schedules. Migration 20261128080100.'),
  (1948, 3454, 'Silks Poker Tampa Bay Downs', 'Silks Poker Room',
   'Tampa', 'FL', false, 'the-silks-poker-room-tampa', 'Silks @ Tampa Bay Downs',
   'Retired duplicate of 3454 Silks Poker Room (Tampa Bay Downs): this row''s PokerAtlas URL, address and coordinates are Westgate Las Vegas''s. 3454 holds the room''s PokerAtlas page and a Tampa location. Migration 20261128080100.'),
  (1892, 3467, 'Bally''s Twin River Lincoln', 'Bally''s Lincoln',
   'Lincoln', 'RI', false, 'lincoln', 'Bally''s Lincoln',
   'Retired duplicate of 3467 Bally''s Lincoln: same address (100 Twin River Road) and coordinates. 3467 holds PokerAtlas page lincoln ("Bally''s Lincoln") and the live schedules. Migration 20261128080100.'),
  (3427, 3467, 'Bally Twin River', 'Bally''s Lincoln',
   'Lincoln', 'RI', true, 'lincoln', 'Bally''s Lincoln',
   'Retired hidden duplicate of 3467 Bally''s Lincoln: same old PokerAtlas page as 1892 (ballys-twin-river-lincoln), no address, no schedules. Migration 20261128080100.');

-- 1. PRE-FLIGHT ASSERTIONS
DO $$
DECLARE
  v_n integer;
  v_hits bigint;
  r record;
BEGIN
  IF to_regclass('public.venue_duplicate_retirement_log') IS NULL
     OR to_regclass('public.venue_directory_enrichment_log') IS NULL
     OR to_regclass('public.venue_daily_tournaments') IS NULL
     OR to_regclass('public.venue_live_tables') IS NULL
     OR to_regprocedure('public.pnm_pokeratlas_room_slug(text)') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: a venue table or pnm_pokeratlas_room_slug(text) is missing';
  END IF;

  PERFORM 1 FROM public.poker_venues
   WHERE id IN (SELECT retired_id FROM _venue_dupes UNION SELECT canonical_id FROM _venue_dupes)
   ORDER BY id
     FOR UPDATE;

  -- 20261128080000 has run: 3402 carries its own page slug.
  IF NOT EXISTS (SELECT 1 FROM public.venue_directory_enrichment_log
                  WHERE venue_id = 3402 AND reason LIKE 'pokeratlas_slug corrected%20261128080000%') THEN
    RAISE EXCEPTION 'pre-flight failed: install 20261128080000 first';
  END IF;

  -- The rows to retire are exactly what the probe read and never retired.
  SELECT count(*) INTO v_n
    FROM _venue_dupes d
    JOIN public.poker_venues v ON v.id = d.retired_id
   WHERE v.name = d.retired_name AND v.city = d.city AND v.state = d.state
     AND coalesce(v.is_suppressed, false) = d.retired_was_suppressed
     AND v.canonical_venue_id IS NULL
     AND v.retired_at IS NULL;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'pre-flight failed: expected 4 unretired duplicate rows as probed, found %', v_n;
  END IF;

  -- The rows kept are listed, hold the room's PokerAtlas page, and that page's catalog names the room.
  SELECT count(DISTINCT d.canonical_id) INTO v_n
    FROM _venue_dupes d
    JOIN public.poker_venues v ON v.id = d.canonical_id
   WHERE v.name = d.canonical_name AND v.city = d.city AND v.state = d.state
     AND coalesce(v.is_active, true) AND NOT coalesce(v.is_suppressed, false)
     AND v.canonical_venue_id IS NULL
     AND v.pokeratlas_slug = d.canonical_pa_slug
     AND public.pnm_pokeratlas_room_slug(v.pokeratlas_url) = d.canonical_pa_slug
     AND EXISTS (SELECT 1 FROM public.venue_live_tables t
                  WHERE t.bravo_slug = 'pa-' || d.canonical_pa_slug
                    AND t.source = 'pokeratlas' AND t.observation_kind = 'catalog'
                    AND t.venue_name = d.canonical_catalog_name);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'pre-flight failed: expected 3 listed canonical rows holding their PokerAtlas page, found %', v_n;
  END IF;

  -- Same-room evidence, pair by pair.
  -- Daytona: coordinates within 0.001 degree, same website host, and the
  -- retired name is PokerAtlas's name for the kept row's page.
  IF NOT EXISTS (
    SELECT 1 FROM public.poker_venues a, public.poker_venues b
     WHERE a.id = 2037 AND b.id = 3402
       AND abs(a.latitude - b.latitude) < 0.001 AND abs(a.longitude - b.longitude) < 0.001
       AND a.website LIKE 'https://www.daytonabeachpoker.com%'
       AND b.website LIKE 'https://www.daytonabeachpoker.com%'
       AND a.name = 'Daytona Beach Racing and Card Club') THEN
    RAISE EXCEPTION 'pre-flight failed: 2037/3402 same-room evidence changed';
  END IF;
  -- Silks: the retired row's PokerAtlas page is another room's.
  IF NOT EXISTS (
    SELECT 1 FROM public.poker_venues a
     WHERE a.id = 1948
       AND public.pnm_pokeratlas_room_slug(a.pokeratlas_url) = 'westgate-las-vegas'
       AND a.latitude > 35 AND a.longitude < -110
       AND EXISTS (SELECT 1 FROM public.venue_live_tables t
                    WHERE t.bravo_slug = 'pa-westgate-las-vegas' AND t.source = 'pokeratlas'
                      AND t.observation_kind = 'catalog'
                      AND t.venue_name = 'Westgate Las Vegas Resort & Casino')) THEN
    RAISE EXCEPTION 'pre-flight failed: 1948 no longer carries the Westgate identity the probe read';
  END IF;
  -- Bally's: identical address and coordinates; 3427 shares 1892's old page.
  IF NOT EXISTS (
    SELECT 1 FROM public.poker_venues a, public.poker_venues b, public.poker_venues c
     WHERE a.id = 1892 AND b.id = 3467 AND c.id = 3427
       AND a.address = '100 Twin River Road' AND b.address = a.address
       AND a.latitude = b.latitude AND a.longitude = b.longitude
       AND public.pnm_pokeratlas_room_slug(a.pokeratlas_url) = 'ballys-twin-river-lincoln'
       AND public.pnm_pokeratlas_room_slug(c.pokeratlas_url) = 'ballys-twin-river-lincoln'
       AND c.address IS NULL) THEN
    RAISE EXCEPTION 'pre-flight failed: 1892/3467/3427 same-room evidence changed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.venue_duplicate_retirement_log l
               JOIN _venue_dupes d
                 ON l.retired_venue_id IN (d.retired_id, d.canonical_id)
                 OR l.canonical_venue_id = d.retired_id) THEN
    RAISE EXCEPTION 'pre-flight failed: a row in these pairs already has retirement history';
  END IF;

  -- No servable schedule on a row being retired.
  SELECT count(*) INTO v_n
    FROM public.venue_daily_tournaments t
   WHERE t.venue_id IN (SELECT retired_id FROM _venue_dupes)
     AND t.is_active IS TRUE AND NOT coalesce(t.is_suppressed, false);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'pre-flight failed: % servable schedule rows on a row being retired; re-probe', v_n;
  END IF;
  -- Their history, exactly as probed (left in place).
  SELECT count(*) INTO v_n
    FROM public.venue_daily_tournaments t
   WHERE t.venue_id IN (SELECT retired_id FROM _venue_dupes);
  IF v_n <> 442 THEN
    RAISE EXCEPTION 'pre-flight failed: expected 442 inactive schedule rows (2037:406, 1948:11, 1892:25, 3427:0), found %', v_n;
  END IF;

  -- Nothing else references a row being retired. Every column that can hold a
  -- room id is checked; the per-venue state/log tables and the schedule
  -- history above are the only expected holders.
  FOR r IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb USING (table_schema, table_name)
     WHERE c.table_schema = 'public' AND tb.table_type = 'BASE TABLE'
       AND (c.column_name ~ '(^|_)venue_id$' OR c.column_name IN ('poker_venue_id', 'room_id'))
       AND c.data_type IN ('integer', 'bigint', 'text')
       AND c.table_name NOT IN ('venue_daily_tournaments', 'venue_location_integrity_state',
                                'venue_location_integrity_log', 'venue_directory_enrichment_log',
                                'venue_duplicate_retirement_log', 'poker_venues')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text IN (''2037'', ''1948'', ''1892'', ''3427'')',
                   r.table_name, r.column_name)
       INTO v_hits;
    IF v_hits <> 0 THEN
      RAISE EXCEPTION 'pre-flight failed: %.% references a row being retired (% rows); decide repointing first',
        r.table_name, r.column_name, v_hits;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.poker_venues
              WHERE canonical_venue_id IN (SELECT retired_id FROM _venue_dupes)) THEN
    RAISE EXCEPTION 'pre-flight failed: a retired row already points at a row being retired';
  END IF;

  IF EXISTS (SELECT 1 FROM public.venue_directory_enrichment_log WHERE reason LIKE '%20261128080100%') THEN
    RAISE EXCEPTION 'pre-flight failed: 20261128080100 has already written its log rows';
  END IF;
END $$;

-- 2. THE CHANGES
DO $$
DECLARE
  v_n integer;
BEGIN
  INSERT INTO public.venue_duplicate_retirement_log
    (retired_venue_id, canonical_venue_id, actor_id, reason, before_record)
  SELECT d.retired_id, d.canonical_id, NULL, d.reason, to_jsonb(v)
    FROM _venue_dupes d
    JOIN public.poker_venues v ON v.id = d.retired_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'retirement log wrote % rows, expected 4', v_n;
  END IF;

  INSERT INTO public.venue_directory_enrichment_log
    (venue_id, actor_id, reason, source_url, confidence, before_record, after_record)
  SELECT d.retired_id, NULL, d.reason,
         'https://www.pokeratlas.com/poker-room/' || d.canonical_pa_slug,
         1,
         jsonb_build_object('canonical_venue_id', v.canonical_venue_id, 'is_active', v.is_active,
                            'is_suppressed', v.is_suppressed, 'games_offered', v.games_offered),
         jsonb_build_object('canonical_venue_id', d.canonical_id, 'is_active', false, 'is_suppressed', true)
    FROM _venue_dupes d
    JOIN public.poker_venues v ON v.id = d.retired_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'enrichment log wrote % rows, expected 4', v_n;
  END IF;

  UPDATE public.poker_venues v
     SET canonical_venue_id = d.canonical_id,
         is_active = false,
         is_suppressed = true,
         retired_at = now(),
         retired_by = NULL,
         retired_reason = d.reason,
         location_integrity_revision = clock_timestamp()
    FROM _venue_dupes d
   WHERE v.id = d.retired_id
     AND v.canonical_venue_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'retired % rows, expected 4', v_n;
  END IF;
END $$;

-- 3. POST-APPLY ASSERTIONS
DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM _venue_dupes d
    JOIN public.poker_venues v ON v.id = d.retired_id
   WHERE v.canonical_venue_id = d.canonical_id
     AND v.is_active IS FALSE AND v.is_suppressed IS TRUE
     AND v.retired_at IS NOT NULL AND v.retired_reason = d.reason;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'post-apply assertion failed: % of 4 rows retired into their canonical row', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.poker_venues v
   WHERE v.id IN (3402, 3454, 3467)
     AND coalesce(v.is_active, true) AND NOT coalesce(v.is_suppressed, false)
     AND v.canonical_venue_id IS NULL;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'post-apply assertion failed: % of 3 canonical rows still listed', v_n;
  END IF;

  -- Each room is now listed once.
  IF EXISTS (SELECT 1 FROM public.poker_venues v
              WHERE v.id IN (SELECT retired_id FROM _venue_dupes)
                AND (coalesce(v.is_active, true) AND NOT coalesce(v.is_suppressed, false))) THEN
    RAISE EXCEPTION 'post-apply assertion failed: a retired row is still listed';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.venue_duplicate_retirement_log l
    JOIN _venue_dupes d ON d.retired_id = l.retired_venue_id AND d.canonical_id = l.canonical_venue_id;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'post-apply assertion failed: % retirement log rows, expected 4', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.venue_directory_enrichment_log WHERE reason LIKE '%20261128080100%';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'post-apply assertion failed: % enrichment log rows, expected 4', v_n;
  END IF;

  -- History untouched.
  SELECT count(*) INTO v_n FROM public.venue_daily_tournaments
   WHERE venue_id IN (SELECT retired_id FROM _venue_dupes);
  IF v_n <> 442 THEN
    RAISE EXCEPTION 'post-apply assertion failed: schedule history moved (% rows, expected 442)', v_n;
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste into a new _revert_ migration)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- UPDATE public.poker_venues v
--    SET canonical_venue_id = NULL,
--        is_active = (l.before_record->>'is_active')::boolean,
--        is_suppressed = (l.before_record->>'is_suppressed')::boolean,
--        retired_at = NULL, retired_by = NULL, retired_reason = NULL,
--        location_integrity_revision = clock_timestamp()
--   FROM public.venue_duplicate_retirement_log l
--  WHERE l.retired_venue_id = v.id
--    AND l.reason LIKE '%20261128080100%'
--    AND v.canonical_venue_id = l.canonical_venue_id;
-- -- The log rows are audit history; keep them.
-- COMMIT;
