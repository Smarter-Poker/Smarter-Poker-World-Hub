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

## Still open — NOT this page

`club_daily_stats` is short platform-wide, not merely late: measured 59-75%
below the real hand counts on every club, every day (SHARK CLUB 2026-08-19:
120,240 real vs 43,490 recorded). The Club Dashboard was routed onto
`club_hand_daily` and is now exact, but any other surface still reading
`club_daily_stats` understates activity by roughly two thirds.

This was deliberately NOT "fixed" by overwriting `club_daily_stats` from the new
rollup: that would mask a broken writer in someone else's pipeline rather than
repair it, and would drift again on the next run. It needs whoever owns that
pipeline to find why the writer under-counts. Evidence table above is
reproducible with:

    SELECT c.name, d.stat_date, d.hands AS real_hands, ds.hands_played AS recorded
    FROM club_hand_daily d
    JOIN clubs c ON c.id = d.club_id
    LEFT JOIN club_daily_stats ds
           ON ds.club_id = d.club_id AND ds.stat_date = d.stat_date
    ORDER BY d.stat_date DESC, d.hands DESC;
