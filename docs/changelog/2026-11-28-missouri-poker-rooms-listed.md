# Missouri Poker Rooms Are Listed (2026-11-28)

Missouri was the one US state with public tournament series and no listed poker room, so `/hub/poker-near-me/in/mo` answered 404 and the series pages there could not link a state directory (#3277, #3288 hid the dead link).

## Root cause

- **Hollywood Casino St. Louis** was in `poker_venues` (id 3431) but suppressed by `20260412104500_delete4eva_duplicate_venues.sql` as a "standalone dupe". No original ever existed, so that suppression hid the only record of a working 20-table room.
- **Ameristar Casino Resort Spa St. Charles**, which hosts the MSPT Ameristar Poker Open, was never in the table.

## Fix

`supabase/migrations/20261128101052_pnm_missouri_listed_rooms.sql` un-suppresses 3431 with its verified address, poker room phone and website, and adds Ameristar St. Charles (id 3499). Both were checked by hand against the operators' own pages and an independent source (URLs in the migration header and in `data_audit_log`), so both are `data_quality = 'unverified'`, the honest label for a row that was not scraped. No coordinates were written: the directory lists both, the map leaves them unpinned until a verified location exists.

The live directory now lists 475 rooms. The checked-in snapshot (`src/lib/venueCount.mjs`) stays at 471, which is allowed (below live only warns).
