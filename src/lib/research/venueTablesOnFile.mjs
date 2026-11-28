/**
 * Poker table counts the directory holds, for the venues the market, state,
 * corridor and game guides name.
 *
 * The guides used to type table counts by hand ("Bellagio (37 Tables)",
 * "Borgata 52+ Tables", "Over 250 Active Poker Tables") and market totals
 * ("280+ Active Tables", "550+ Active Tables Across 6 Mega-Cardrooms"). None
 * of them was ever read from anywhere. A guide may now state a table count
 * only for a venue in this map, and only through tablesLabel(); a combined or
 * market-wide table count is not stated at all, because poker_tables is
 * filled for only 120 of the 473 listed rooms and no total can be summed.
 *
 * Read-only, Supabase project kuklfnapbkmacvwxktbh, 2026-11-28 UTC:
 *
 *   SELECT name, city, state, poker_tables FROM poker_venues
 *   WHERE <applyListedRoomFilter: is_active, not is_suppressed, id <> 3109,
 *          canonical_venue_id IS NULL, venue_type not series/tour/home_game>
 *     AND poker_tables IS NOT NULL;
 *
 * Re-read 2026-11-28 05:20 UTC after #3243 changed the listed filter: all 24
 * venues below are still listed with the same counts.
 *
 * Keys are the directory's own venue names. Where the guide text used to
 * disagree with the row, the row wins: Borgata 85 (was 52), Bellagio 40 (was
 * 37), MGM National Harbor 32 (was 46), Talking Stick 25 (was 47), WinStar 46
 * (was 55+), The Bicycle Casino 185 (was 120+), Gardens Casino 40 (was 100+),
 * Foxwoods 100 (was 50+). __tests__/the-research-figures-are-real.law.test.mjs
 * pins the map and fails on any hand-typed table count in the guides.
 */
export const VENUE_TABLES_ON_FILE = Object.freeze({
  'Bellagio Poker Room': 40,
  'Borgata Hotel Casino': 85,
  'Choctaw Casino Resort': 30,
  'Daytona Beach Racing and Card Club': 55,
  'Derby Lane Poker Room': 51,
  'Foxwoods Resort Casino': 100,
  'Gardens Casino': 40,
  'Graton Resort & Casino': 20,
  'Hard Rock Cincinnati': 30,
  'Horseshoe Hammond': 26,
  'Live! Casino Maryland': 52,
  'Live! Casino Philadelphia': 34,
  'MGM National Harbor': 32,
  'MGM Springfield': 16,
  'Orange City Racing & Card Club': 58,
  'Parx Casino': 48,
  'Seminole Hard Rock Tampa': 46,
  'Talking Stick Resort': 25,
  'Texas Card House Spring': 32,
  'The Bicycle Casino': 185,
  'The Brook Poker Room': 10,
  'Thunder Valley Casino': 25,
  'WinStar World Casino': 46,
  'bestbet Jacksonville': 70,
});

/** "40 Tables" for a venue the directory has a count for; throws otherwise. */
export function tablesLabel(directoryName) {
  const n = VENUE_TABLES_ON_FILE[directoryName];
  if (!Number.isInteger(n)) throw new Error(`No poker_tables on file for ${directoryName}`);
  return `${n} ${n === 1 ? 'Table' : 'Tables'}`;
}
