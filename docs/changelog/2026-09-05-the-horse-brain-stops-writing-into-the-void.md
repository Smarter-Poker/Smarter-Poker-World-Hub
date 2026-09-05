# The horse brain stops writing into the void

2026-09-05

`U4.2: No phantom tables` is a **required** status check on `main` and it was
failing on thirteen tables. No pull request in this repository could merge.
That was the visible symptom, and it was the smaller half of the problem.

## What a phantom table actually costs

`scripts/ci/check-phantom-tables.mjs` explains it in its own header, and it was
happening live:

```js
const { error } = await supabase.from('x').insert(rows);
if (error) console.warn('Failed to save:', error);
```

PostgREST returns `42P01` in the `error` channel, the call site logs it, and
the write is discarded forever. **Five of the thirteen are on live paths** —
reached from `pages/api/poker-brain/decide.js` and from `GameController`, whose
`persistSessionStats` is called from six places and which is imported by eight
`/api/poker/engine/*` routes. Every opponent read, every session analytic,
every threat-intel row and every hand the brain believed it was remembering has
been going nowhere.

## Seven of them still existed, with their data, in `zz_archive`

Measured against production before touching anything:

```
zz_archive.horse_opponent_journals          858 rows
zz_archive.horse_sports_source_assignments  200
zz_archive.horse_source_assignments         100
zz_archive.horse_personality                100
zz_archive.horse_memory                     104
zz_archive.horse_topic_cooldowns             37
zz_archive.horse_hand_history                 4
zz_archive.horse_analytics                    1
```

**No migration in this repository performed that archival** — `git grep
zz_archive -- supabase/migrations/*.sql` returns nothing — so it was done out of
band. It happened after 2026-08-15, because
`20260815_check13_sweep3_columns.sql` runs `ALTER TABLE
public.horse_opponent_reads ADD COLUMN ...` and records that it was applied that
day, which is impossible unless the table was in `public` then.

The check reads the PostgREST OpenAPI document, which lists what is *exposed* —
the exact caveat its own header calls out. A table in `zz_archive` is invisible
to it, and to every client.

So those eight are **moved, not recreated**. Recreating them would have stranded
1,404 rows and re-randomised 100 horse personalities.

## Three deliberate deviations from the archived migrations

The six that existed nowhere have `CREATE TABLE` text in
`supabase/migrations/archive/`, a subdirectory the Supabase CLI does not scan,
so none of it had ever run. Reusing it verbatim would have reintroduced three
faults:

1. **`horse_threat_intel.opponent_id` is `text`, not `uuid REFERENCES
   profiles(id)`.** Its only caller is the HUD route, whose opponent ids come
   from OCR-scraped screen state and are not accounts. A foreign key there turns
   every write into a `23503` that `anti-exploit.js`'s catch swallows — the same
   silent discard this whole migration exists to end.
2. **`horse_session_stats.profile_id` is `text` with no foreign key**, for the
   same reason: `brain/core.js` guards its read with
   `if (_horseIds.has(row.profile_id))`, which is only meaningful if unmatched
   rows are expected.
3. **`horse_opponent_reads` gains `slow_play_tendency numeric`**, which the
   archived text predates; `20260815_check13_sweep3_columns.sql` added it to
   production and `brain/plo-core.js:2245` selects it.

## One constraint deliberately dropped

`horse_source_assignments` carried `UNIQUE (source_name, is_primary)` beside its
real key. That caps the entire table at **two rows per source** — one primary,
one not — and it is not the `onConflict` target the initializer names, so a
300-row upsert raises `23505` on the third horse to share a source. The table
holds 100 rows where 300 were intended, which is what that looks like from the
outside.

## A route that has been serving the same fake opponent to everyone

Restoring `horse_personality` exposed that `pages/api/training/horse-opponent.js`
could not have worked either. Its GET branch selects:

- `gto_philosophy` — not a column; the real one is `gto_vs_exploitative`. The
  POST branch of the same file was corrected on 2026-08-15 and this one was
  missed.
- `display_name` — not a column on `content_authors` either; the real ones are
  `name` and `alias`.
- an embedded `horse_personality (...)`, which needs a **relationship**. The
  archived table had no foreign key, so PostgREST answered `PGRST200`.

Three independent failures in one select, each of which alone would have sent
every training opponent to the hardcoded `{aggression: 5, humor: 5, ...}`
fallback. All three are fixed, and the migration adds the foreign key. Verified
against production — the live select now returns real names, avatars and
personalities.

## RLS

Every restored and created table gets `ENABLE ROW LEVEL SECURITY` with **no
policy**, deliberately. RLS with zero policies denies anon and authenticated
outright, and the service role bypasses it — which is exactly the access these
tables need. A policy would be a wider door than the code asks for.

## Verified

```
$ node scripts/ci/check-phantom-tables.mjs
check-phantom-tables: 422 distinct tables referenced, 1093 exposed by the API.
OK — no phantom tables.
```

The migration was probed inside a rolled-back transaction first: all eight
tables landed in `public`, with 858 journals and 100 personalities intact.
