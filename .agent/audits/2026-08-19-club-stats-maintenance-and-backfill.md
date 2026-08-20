# 2026-08-19 — Club stats: resumable backfill + scheduled maintenance

Closes the last open item from the Club Dashboard rebuild
(`club-arena/.agent/audits/2026-08-19-club-dashboard-correctness-audit.md`):
history was never fully attributed, and nothing kept it that way.

## The blocker

`club_member_daily_stats` is exact for NEW hands — the `hand_history` trigger
owns them. History was not: 7,281 tables across the two largest clubs had never
been rebuilt, and the biggest holds 75,211 hands. The single-statement rebuild
cannot process one of those inside any workable timeout, and because it IS one
statement it rolls back entirely, so such a table could never be backfilled at
all no matter how many times it was retried.

An earlier chunked attempt was withdrawn (see club-arena 20260819g) because it
resumed by `hand_number`, which is not a total order within a table: unique only
above 1,000,000, and legacy tables mix the old per-table 1..N numbering with the
global one. Table `d421a6df` spans hand_number 1..1,223,543 with 62,906 distinct
values across 75,211 rows; the walker stalled after 435 hands.

## The fix

`ca_rebuild_table_chunk` walks `(created_at, id)` — a true total order, and the
physical order hands were dealt. The cursor lives in `club_stats_rebuild_log`,
so a chunk can stop and resume without breaking the delta chain:

* previous stack = in-chunk `lag`, else `club_member_table_state` carried from
  the previous chunk;
* adjacency = the player's previous hand id equals the hand immediately
  preceding this one at the table (in-chunk `lag`, else the stored cursor).

`ca_drain_club_rebuild` is the time-boxed driver; `ca_clubs_with_rebuild_backlog`
and `ca_clubs_missing_hand_daily` are the probes so the scheduled job never
hardcodes a club list and costs one cheap query per club once drained.

**Validated, not assumed.** Driving one table in 90-hand chunks (multiple
resumes) produced results BYTE-IDENTICAL to the verified single-statement
rebuild: 0 rows differing in either direction, identical profit (2250.0000) and
`hands_attributed` (1301).

## Scheduling

`/api/cron/club-stats-maintenance`, registered in the Open Claw dispatcher at
`*/15` per RULE 11 and deployed to Hetzner (91 jobs, 0 errors). `pages/api/cron/`
went 26 -> 27, inside the CI cap of 45.

First fire at 23:45 returned 404 — the handler had not reached Vercel yet. The
00:00 run landed and did real work: `club_stats_rebuild_log` shows tables
rebuilt at 00:00:08, and 502 tables were drained in the following 20 minutes.

The player-stats work has since added a step 0 to this same route (hand->player
index refresh), deliberately sharing it rather than adding a cron file. Its
advisory lock makes a concurrent page-triggered refresh a no-op, so it does not
collide with the drain.

## Result

Attribution coverage, before -> after:

| club          | before | after |
|---------------|-------:|------:|
| Club JAQK     |  55.1% | 91.8% |
| SHARK CLUB    |  39.9% | 92.8% |
| Midway Union  |  89.1% | 94.8% |

779 tables complete, 0 failed, 6,811 still pending and draining automatically.

## RETRACTED — `club_daily_stats` is not broken

An earlier revision of this document claimed `club_daily_stats` was "short
platform-wide", 59-75% below real hand counts, and implied a broken writer in
someone else's pipeline. **That was wrong, and this retracts it.**

`club_daily_stats` is not a table with a writer. It is a VIEW, defined in
`club-arena/supabase/migrations/20260723_sweep3_feature_backends.sql`, that
aggregates `rake_records` (plus pre-overlap `rake_history`):

    SELECT club_id, created_at::date, count(*) AS hands_played, sum(rake_amount)
      FROM public.rake_records GROUP BY 1, 2

So `hands_played` there means **hands that paid rake**, not hands dealt. One
`rake_records` row exists per raked hand; a folded-preflop or no-flop-no-drop
hand never creates one. The "shortfall" I measured was simply the proportion of
hands that pay no rake.

Measured, Midway Union: 24.9%-37.2% of hands dealt produced a rake_records row
across five days, and on one table today 38 of 87 hands (43.7%) carried
rake_amount > 0 — consistent with the view's ratio, not with data loss.

**What this does and does not change.** The dashboard fix stands: the metric
card is labelled "Hands Today" and must mean hands dealt, which this view
cannot supply, so reading `club_hand_daily` was still the right call. What was
wrong was the diagnosis attached to it. No other surface is understating
anything by reading `club_daily_stats`; those surfaces are showing raked hands,
which for a rake/revenue context is very likely what they intend.

Nothing was changed in `club_daily_stats` or its consumers as a result of the
original, mistaken finding.

## Also retracted — the cron's `hand_index: null`

The same revision flagged `ca_refresh_hand_player_index` returning `null` in the
maintenance heartbeat as possibly broken. It is not. That heartbeat was written
by the version of the handler that predates the player-stats step 0, so the
`hand_index` key simply did not exist in its `details` JSON; querying
`details->'hand_index'` on it returns NULL, which I read as a failure. Verified:
`jsonb_object_keys(details)` on that row returns only `errors, rollup, drained`,
and calling the function directly indexes normally (4,287 hands / 9,922 rows).
Its lock-contention path returns a real row `(0,0,NULL,NULL,false)`, not an
empty set, so it could not have produced a null even if contended.
