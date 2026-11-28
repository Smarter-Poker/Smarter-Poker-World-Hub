# Venue Directory Migrations: Install Order (Not Yet Installed)

Written 2026-11-28 02:10 Central. Owner approval: Dan approved the database
tool's confirmation prompt at 02:04 Central; the database then refused the
DDL because 23:45-04:15 Central is the nightly release schema freeze
(`smarter_private.fn_ca_release_freeze_ddl_guard`). Nothing was applied.

Install after 04:15 Central and outside the hourly :50-:03 UTC break window,
through the Supabase MCP `apply_migration`, each file's exact content, in this
order:

1. `supabase/migrations/20261128050500_venue_games_from_pokeratlas_catalog.sql`
   (branch `wip/claude/r3-data`). Asserts 58 rows / 43 listed; if the catalog
   moved, it aborts with the new counts: re-probe with SELECTs, update its two
   constants, run once.
2. `supabase/migrations/20261128050600_touring_series_rows_are_not_rooms.sql`
   (branch `wip/claude/r3-data`). Asserts exactly 2 rows.
3. `supabase/migrations/20261128080000_pokeratlas_slugs_from_the_rooms_own_page.sql`
   (this branch). 6 slugs, 1 retirement (3435 into 3383).
4. `supabase/migrations/20261128080100_duplicate_rooms_retired_into_their_canonical_row.sql`
   (this branch). Retires 2037, 1948, 1892, 3427; refuses to run before 3.

After each: `SELECT version, name FROM supabase_migrations.schema_migrations
ORDER BY version DESC` and rename the file to the installed version if it
differs. Then move all four files onto one non-wip agent branch so they ship
with the snapshot bump: `node scripts/check-venue-count-snapshot.mjs --print`
and update `src/lib/venueCount.mjs` only if live is now below the snapshot
(the CI check fails when the snapshot is above live).

Finding not addressed: 118 listed rows have a `pokeratlas_slug` that differs
from the slug in their own `pokeratlas_url` (97 where only the URL slug has a
saved catalog). A URL alone is not proof (row 1948's URL pointed at another
room), so a blanket fix needs its own probe.
