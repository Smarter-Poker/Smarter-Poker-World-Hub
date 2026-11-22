# ClubArenaStatsIndexLag after every engine cutover: a skipped stats tick

Measured read-only on production 2026-11-22 14:45-15:00 UTC.

## Pattern

`ClubArenaStatsIndexLag` (engine `StatsHealthMonitor`, threshold 30 min) fired
and resolved five minutes later, 37 times between 2026-11-14 06:25 and
2026-11-22 13:10. Under the three-hourly cutover schedule every firing is at
`:10` after a cycle (01:10, 04:10, 07:10, 10:10, 13:10, 22:10 UTC on 11-21/22)
and resolves at `:15`.

## Cause

`/api/cron/club-stats-maintenance` (Open Claw, `minute='*/15'`) is the only
caller of `ca_refresh_hand_player_index`. Since 2026-11-13 it skips all work
while an `engine_maintenance_break` row exists. Scheduled breaks are announced
at `:58:00` and thawed at `:03:41-:03:42` (`engine_maintenance_thaws`, every
scheduled cycle measured), so the `:00` tick is always skipped:

| run (UTC) | status | ceil_at |
|---|---|---|
| 12:30:19 | ok | 12:24:58 |
| 12:45:17 | ok | 12:39:58 |
| 13:00:00 | skipped, maintenance_break | - |
| 13:15:20 | ok | 13:09:53 |

The index ceiling trails each run by about 5m20s. With the `:00` tick lost the
oldest unindexed hand is 15 + 15 + 5 = 35 minutes old at worst; it crossed 30
minutes at 13:10:48 and the `:15` run cleared it. `probe_heartbeats` shows 14
`:00` skips in 10 days, plus `:15/:30/:45` skips at unscheduled owner-window
breaks.

## Fix

Ticks move to `:07/:22/:37/:52`: the same 15-minute cadence, never inside the
`:56-:05` break margin. The worst-case lag becomes 15 min + 5.5 min + 90 s =
22 min. The dispatcher's `--preflight-only` and startup now refuse a
break-clear job scheduled inside the break (`_validate_break_clear_schedules`).

Residual: an unscheduled owner-window break can still land on a tick. Owner
windows are booked at least an hour from a cycle and are rare. The alert stays
armed for that case, and it is real lag.

## Proof

- `python3 scripts/ci/test-openclaw-break-clear-ticks.py`:
  `ticks=[7, 22, 37, 52] worst_lag_s=1320 pre_fix_worst_lag_s=2220`.
- The same test against `origin/main`'s dispatcher fails with
  `AttributeError: ... no attribute 'BREAK_CLEAR_JOBS'`.
- `node --experimental-vm-modules --test __tests__/openclaw*.test.mjs __tests__/club-stats-maintenance*.test.mjs`:
  all pass.
