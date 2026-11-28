-- ═══════════════════════════════════════════════════════════════════════
-- 20261128101052_pnm_missouri_listed_rooms.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (data correction on poker_venues; no DDL)
-- AUTHOR:      Claude (swarm worker VENUES, 2026-11-28)
-- AFFECTS:     poker_venues (one UPDATE, one INSERT), data_audit_log
-- IRREVERSIBLE: no (rollback below)
-- INSTALLED:   2026-11-28 10:10 UTC through the Supabase MCP apply_migration,
--              recorded as schema_migrations version 20261128101052. Dry run in a
--              rolled-back transaction first; readback: 3431 and 3499 listed,
--              Missouri 2 rooms, directory total 475, 2 data_audit_log rows.
--
-- WHY:
--   Missouri had three public tournament series (poker_series 958 MSPT
--   Ameristar Poker Open at Ameristar Casino St. Charles; 1009 and 1013 RGPS
--   at Hollywood Casino St. Louis) and ZERO listed poker rooms, so
--   /hub/poker-near-me/in/mo answered 404 and, since #3277/#3288, the series
--   pages could not link a Missouri directory at all. Read 2026-11-28: it was
--   the only US state with series and no listed room.
--
--   Root cause, two rows:
--   - Hollywood Casino St. Louis IS in the table (id 3431, "Hollywood St
--     Louis", Maryland Heights) but suppressed since
--     20260412104500_delete4eva_duplicate_venues.sql, which called it a
--     "standalone dupe". There is no other Hollywood St. Louis row, before or
--     after that migration: the suppression hid the only record of a working
--     20-table room. This un-suppresses it and fills the verified details.
--   - Ameristar Casino Resort Spa St. Charles has never been in the table.
--
-- EVIDENCE (read 2026-11-28):
--   Hollywood Casino St. Louis
--     operator: https://www.hollywoodcasinostlouis.com/casino/poker
--       (20 tables; NLH 1-2/2-5/5-10, Limit 3-6 to 20-40, O8; Sun-Thu
--        8am-3am, Fri-Sat 24 hours; poker room 314-770-7600)
--     operator (PENN): https://www.pennentertainment.com/hollywood-st-louis/casino/promotions/rungood-poker-tournament
--     address: https://explorestlouis.com/partner/hollywood-casino-st-louis
--       (777 Casino Center Drive, Maryland Heights, MO 63043)
--   Ameristar Casino Resort Spa St. Charles
--     operator (Boyd Gaming): https://www.boydgaming.com/locations/ameristar-stcharles
--       ("one of the last live poker rooms in the market")
--     operator poker page: https://ameristarstcharles.boydgaming.com/play/poker-room
--     independent: https://msptpoker.com/Pages/LiveReport.aspx?eventID=734&dayID=842
--       (Mid-States Poker Tour stop held in the room)
--     address: https://explorestlouis.com/partner/ameristar-casino-resort-spa
--       (One Ameristar Blvd., St. Charles, MO 63301; 636-949-7777) and
--       https://www.kineticist.com/locations/ameristar-casino-resort-spa-st-charles-st-charles-mo.md
--
-- PROVENANCE: both rows are data_quality 'unverified' - checked by hand
--   against the operators' pages, not scraped, so they carry no
--   scrape_html_hash and must not claim 'scraped_verified'
--   (enforce_venue_provenance). 79 listed rooms already carry it. No
--   coordinates are written (none were verified); the directory lists a room
--   without them and the map leaves it unpinned (location_quality missing).
--
-- HOW:
--   1. Pre-flight: 3431 is exactly as read; no Ameristar St. Charles row, and
--      no slug or name/city/state collision.
--   2. UPDATE 3431; INSERT Ameristar St. Charles.
--   3. Audit rows in data_audit_log.
--   4. Post-apply: Missouri has exactly the two listed rooms.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.poker_venues
     WHERE id = 3431 AND name = 'Hollywood St Louis' AND city = 'Maryland Heights'
       AND state = 'MO' AND venue_type = 'casino' AND is_suppressed = true
       AND canonical_venue_id IS NULL
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: poker_venues 3431 is not the suppressed Hollywood St Louis row this migration was written against';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.poker_venues
     WHERE id <> 3431 AND upper(btrim(state)) = 'MO'
       AND (name ILIKE '%hollywood%' OR name ILIKE '%ameristar%')
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: a Missouri Hollywood or Ameristar row already exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.poker_venues
     WHERE slug IN ('hollywood-casino-st-louis', 'ameristar-casino-resort-spa-st-charles')
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: a target slug is already taken';
  END IF;
END
$preflight$;

UPDATE public.poker_venues
   SET name = 'Hollywood Casino St. Louis',
       address = '777 Casino Center Drive',
       zip = '63043',
       phone = '(314) 770-7600',
       website = 'https://www.hollywoodcasinostlouis.com/casino/poker',
       slug = 'hollywood-casino-st-louis',
       country = 'US',
       timezone = 'America/Chicago',
       has_tournaments = true,
       data_quality = 'unverified',
       is_active = true,
       is_suppressed = false
 WHERE id = 3431;

INSERT INTO public.poker_venues (
  name, venue_type, address, city, state, country, zip, phone, website,
  slug, timezone, has_tournaments, data_quality, is_active, is_suppressed
) VALUES (
  'Ameristar Casino Resort Spa St. Charles', 'casino', 'One Ameristar Blvd.',
  'St. Charles', 'MO', 'US', '63301', '(636) 949-7777',
  'https://ameristarstcharles.boydgaming.com/play/poker-room',
  'ameristar-casino-resort-spa-st-charles', 'America/Chicago', true,
  'unverified', true, false
);

INSERT INTO public.data_audit_log (table_name, record_id, action, new_data, scrape_proof, agent_id)
SELECT 'poker_venues', id::text, CASE WHEN id = 3431 THEN 'UPDATE' ELSE 'INSERT' END,
       jsonb_build_object('name', name, 'city', city, 'state', state, 'is_suppressed', is_suppressed,
                          'reason', CASE WHEN id = 3431
                            THEN 'Un-suppressed: the 2026-04-12 duplicate suppression had no original; the only record of a live 20-table room'
                            ELSE 'Missouri room hosting MSPT series; never in the directory' END),
       jsonb_build_object('source', 'operator_website', 'verified_by', 'hand', 'read_at', '2026-11-28',
                          'urls', CASE WHEN id = 3431
                            THEN jsonb_build_array('https://www.hollywoodcasinostlouis.com/casino/poker',
                                                   'https://explorestlouis.com/partner/hollywood-casino-st-louis')
                            ELSE jsonb_build_array('https://www.boydgaming.com/locations/ameristar-stcharles',
                                                   'https://explorestlouis.com/partner/ameristar-casino-resort-spa') END),
       'supabase/migrations/20261128101052_pnm_missouri_listed_rooms.sql'
  FROM public.poker_venues
 WHERE slug IN ('hollywood-casino-st-louis', 'ameristar-casino-resort-spa-st-charles');

DO $postapply$
DECLARE
  v_listed integer;
BEGIN
  SELECT count(*) INTO v_listed
    FROM public.poker_venues
   WHERE upper(btrim(state)) = 'MO'
     AND is_active AND is_suppressed = false AND id <> 3109
     AND canonical_venue_id IS NULL
     AND venue_type NOT IN ('series', 'tour', 'home_game');
  IF v_listed <> 2 THEN
    RAISE EXCEPTION 'post-apply failed: Missouri lists % rooms, expected 2', v_listed;
  END IF;
END
$postapply$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste as a new _revert_ migration)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DELETE FROM public.poker_venues WHERE slug = 'ameristar-casino-resort-spa-st-charles';
-- UPDATE public.poker_venues SET is_suppressed = true, name = 'Hollywood St Louis', slug = NULL
--  WHERE id = 3431;
-- COMMIT;
