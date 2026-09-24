# World Hub Scheduled Work Inventory

Every scheduled thing the World Hub owns, classified and measured.
Compiled 2026-09-24 against production project `kuklfnapbkmacvwxktbh`.

This is a CLASSIFICATION AND MEASUREMENT document. Nothing was retired as part
of compiling it. Where a compensation loop is measured as idle, that is recorded
as evidence for a later decision, not acted on here.

## The three classes

| Class | Definition |
| --- | --- |
| **Genuine periodic work** | Work that must happen on a clock because no event can trigger it: a TTL on a row nobody touches, a settlement window, a queue drain, a projection roll forward. Deleting it loses real work. |
| **Observer** | Reads and alerts. Writes nothing but its own telemetry, probe results or heartbeats. Deleting it loses visibility, not state. |
| **Compensation loop** | Repairs a state some writer should have got right. Per the standing doctrine, a compensation loop is a defect wearing a schedule: the fix belongs in the writer, and the loop is deleted as part of that fix, never kept as a net. |

A single route can hold steps of more than one class. Where it does, the steps
are classified separately, because retiring a route and retiring a step are
different decisions.

## Where the schedules live

Three separate mechanisms, and a route is only scheduled if it appears in one:

1. `vercel.json` `crons` (13 entries) fire against the deployed Next.js app.
2. `scripts/openclaw-cron-dispatcher.py` dispatches 17 more World Hub routes.
   It also dispatches 59 routes that do not exist in this repository; those
   belong to other deployment units and are out of scope here.
3. Postgres `pg_cron`, which is Club Arena's to own. Two World Hub routes call
   functions that pg_cron also drives, and those overlaps are called out below.

CLAUDE.md 11.3/11.5 fail CI on net-new `pages/api/cron` files and route new
scheduled work to Open Claw rather than pg_cron, which is why recent additions
land as steps inside `club-stats-maintenance` rather than as new routes.

## vercel.json crons

| Schedule (UTC) | Route | Class | What it does and writes |
| --- | --- | --- | --- |
| `*/15 * * * *` | `marketplace-health` | Observer | Reads storefront health, writes telemetry only. |
| `0 2 * * *` | `signup-probe` | Observer | Synthetic signup; writes its own probe result rows. |
| `*/15 * * * *` | `signup-probe-restricted` | Observer | Restricted-region synthetic signup. Writes nothing. |
| `0 6 * * *` | `trigger-audit` | Observer | `signup_audit_check`. Asserts critical triggers still exist; writes audit rows. |
| `0 7 * * *` | `email-deliverability-check` | Observer | Nightly email health audit; writes audit rows. |
| `0 3 * * *` | `archive-signup-errors` | Genuine | `archive_signup_errors`. Retention: moves old rows to long-term storage. |
| `*/15 * * * *` | `login-probe` | Observer | Synthetic login; writes probe results. |
| `*/15 * * * *` | `recovery-probe` | Observer | Password-reset and magic-link probes; writes probe results. |
| `0 4 * * *` | `auth-integrity-audit` | **Compensation** | `audit_auth_integrity` then `heal_auth_integrity`. Measured below. |
| `5 5 * * *` | `generate-trivia` | Genuine | Generates the day's trivia. Writes questions. |
| `30 13 * * *` | `trivia-pool-guard` | Observer | Question pool depth watchdog. |
| `45 13 * * *` | `trivia-economy-audit` | Observer | `run_trivia_economy_audit_v1`. Reports only. |
| `0 * * * *` | `vip-lapse` | Genuine | `expire_lapsed_vip`. A TTL on a paid entitlement; nothing else expires it. |

## Open Claw dispatched routes

| Schedule (UTC) | Route | Class | What it does and writes |
| --- | --- | --- | --- |
| `17 */6` | `cleanup-expired-stories` | Genuine | `fn_cleanup_expired_stories`. TTL garbage collection. |
| `03:30` | `cleanup-orphan-uploads` | Genuine | Deletes storage objects no row references. |
| `*/5` | `cleanup-stale-streams` | Genuine | `fn_auto_end_stale_streams`, `fn_cleanup_stale_viewers`, `fn_mark_feed_post_ended`. Ends streams whose broadcaster vanished; no disconnect event exists to do it. |
| `*/15` | `club-stats-maintenance` | Genuine | Player-to-hand index, `ca_roll_hand_stats_forward`, `ca_refresh_stat_distribution`. See the section below. |
| `*/5` | `live-cleanup` | Genuine | `cleanup_zombie_streams`. |
| `*/5` | `live-reminders` | Genuine | Sends reminders that have come due; `fn_cleanup_stale_scheduled_lives`. |
| `* * * * *` | `push-dispatch` | Genuine + **Compensation** | `claim_push_outbox_batch` is an outbox drain and is genuine. `requeue_stuck_push_outbox` is compensation; measured below. |
| `13:00` | `push-health` | Observer | Push delivery health snapshot. |
| `Mon 10:30` | `rakeback-period-settle` | Genuine | `settle_club_rakeback`. Pays money on a weekly window. |
| `:20 hourly` | `restriction-maintenance` | Genuine (prune) + cosmetic (expire) | `fn_ca_restriction_observation_prune` delivers a promised retention policy and is genuine. `fn_ca_restriction_expire_sweep` changes no behaviour by its own documentation: `fn_ca_player_restricted` already treats a run-out row as not binding. It buys an honest console list, not enforcement. |
| `*/3 days 09:30` | `social-page-completion-nudge` | Genuine | Sends nudges; writes notifications. |
| `7,22,37,52` | `spin-sweep` | **Compensation** + Genuine + Observer | Three separate things. See the section below. |
| every 5 min at `:3..:58` | `table-socket-probe` | Observer | `fn_probe_table_candidate`, `fn_platform_frozen`. Asks whether a player can hold a table; writes probe results. |
| `*/1` | `transcode-videos` | Genuine | Drains the transcode queue. |
| `09:00` | `vip-stipend` | Genuine | `award_diamonds_v2`. Pays a daily entitlement. |
| `* * * * *` | `waitlist-sweep` | Genuine | `fn_sweep_stale_waitlists`. `fn_offer_open_seat` applies the same two TTLs, but only when a seat opens AT THAT TABLE. On a table nobody leaves, nothing runs. This reaches those tables, so it is not compensating for a writer: it is the only thing that can do this work. |
| `*/15` | `yt-pipeline-recovery` | **Compensation** | Re-queues failed `video_transcode_jobs`. Measured below. |

## Route files with no schedule at all

Three files under `pages/api/cron/` are not scheduled anywhere. None is an
oversight; each is deliberate and recorded:

- **`player-stats-refresh`** is DEAD as a scheduled route. The dispatcher entry
  was removed on 2026-09-03 with the reason inline: the handler asked
  `fn_refresh_player_stats` for a 26 hour window, roughly 130s of `hand_history`
  jsonb work, against PostgREST's 8s `service_role` statement timeout, so it was
  24 fires and 24 timeouts a day. The work now lives in `club-stats-maintenance`
  step 0 as `fn_snapshot_player_stats_if_missing`. The file remains callable by
  hand.
- **`pvp-settle`** is manual-only by design. `docs/trivia/PHASE-1-SURFACE-INVENTORY.md`
  records it as "retained as manual-only, database-atomic recovery; not
  scheduled", and `__tests__/trivia-pvp-containment.test.mjs` asserts it is
  absent from the Vercel crons, so scheduling it would fail the build.
- **`trivia-tournament-tick`** is future lifecycle with its public gate off, and
  is likewise pinned as unscheduled by `__tests__/trivia-tournament-containment.test.mjs`.

## club-stats-maintenance, and the profit reconciler

The Club Arena profit reconciler is **no longer in this route**. It was removed
on 2026-09-22, before this inventory was compiled, and the route's own header
records why. Three steps went in that change, all of them compensation loops:

1. **The profit reconcile**, `fn_reconcile_club_member_daily_profit(yesterday)`.
   pg_cron job `reconcile-club-member-daily-profit` runs the same function for
   the same date at 00:35 UTC with a 300s statement timeout, while this route
   ran it 96 times a day under the 8s `service_role` timeout. After the
   2026-09-19 no-rewrite fix only the first successful call of a day corrected
   anything, and 147 calls in 7 days were cancelled by the timeout.
2. **The rebuild drain**, `ca_clubs_with_rebuild_backlog` + `ca_drain_club_rebuild`.
   Its backlog was history and none was left. Worse than idle: a table rebuilt
   while still being dealt came out with more `hands_played` than `hand_history`
   holds, 219 of 2,154 member-table-days in one six hour sample.
3. **The `club_hand_daily` roll forward**. The shard trigger owns every day the
   rollup has existed; 3,097 runs found nothing and the timeout cancelled 854.

The database functions were kept for manual use. The law
`__tests__/club-stats-maintenance-does-no-repair-work.law.test.mjs` keeps them
out of the schedule.

What remains in the route is genuine: the player-to-hand index, the
`ca_hand_player_stat` forward roll and the percentile distribution refresh. Each
has a reader that computes live whatever has not been rolled yet, so the gap
since the last success is a term in a page's response time rather than a
correctness risk.

## spin-sweep, and the last caller of fn_spin_sweep_unbooked

`/api/cron/spin-sweep` fires at `:07, :22, :37, :52`, deliberately off the
quarter hour (at `:00/:15/:30/:45` its double-deal check shared the database
with every other quarter-hour job and hit the 8s statement timeout). It does
three distinct things:

**1. `fn_spin_sweep_unbooked` - compensation, candidate set empty, and this
route is now its LAST CALLER.**

The function settles a Spin that ran without booking its rake and reserve
movements: a failure that throws nothing and logs nothing, so it is invisible
until somebody queries for the gap. Its candidate set is every `spin` tournament
in `RUNNING`/`COMPLETED` with a multiplier, a club, at least one
`tournament_players` row, and no `spin_reserve_ledger` row.

Measured 2026-09-24 against production:

| Measurement | Result |
| --- | --- |
| Candidates in the route's own 30 minute lookback | **0** |
| Candidates in the last 7 days | **0** |
| Candidates all time | **0** |
| Spins started in the last 7 days | 24,483 |
| `spin_reserve_ledger` rows written in the last 7 days | 48,091 |

So the live writer booked every one of 24,483 spins and the sweep had nothing to
settle at any horizon. It is not broken; it books nothing because there is
nothing to book.

Its pg_cron schedule was retired on 2026-09-24. Verified the same day by reading
`cron.job` directly: no active job invokes `fn_spin_sweep_unbooked`. The four
surviving spin jobs are `diamond-spin-daily-settlement`,
`spin_chip_conservation_hourly`, `spin_fairness_check_hourly` and
`spin_unpaid_check`, none of which calls it. **This route is therefore the only
remaining caller of that function**, which is the fact a later retirement
decision needs: dropping the function now would break this route, and retiring
this step now would leave the function with no caller at all.

**2. `fn_spin_expire_unfilled` - genuine periodic work, and its candidate set is
NOT empty.**

This expires a Spin that never filled and refunds its entrants. It is a TTL, not
a repair: no writer is supposed to have done it. `spin_fill_policy.unfilled_timeout_minutes`
is 30.

Measured 2026-09-24: **128** `spin` tournaments sit in `REGISTERING`/`ANNOUNCED`
past that 30 minute timeout, the oldest from 2026-09-08 and **115 of them from
the last 7 days**.

Recorded with a caveat, because honesty matters more than a tidy number: that
128 is the coarse predicate only. The function additionally counts live seats per
game and consults `spin_fill_policy`, and I did not evaluate that inner condition
row by row. So this measurement establishes that the candidate set is large and
growing, NOT that 128 games are being wrongly left unexpired. It deserves its own
investigation and did not get one here.

**3. Double-deal detection and the reserve pool report - observer.**
`fn_detect_double_dealing` and the thin-or-short reserve pool report read and
alert. A draining pool does not error, its ladder just collapses toward 2x/3x.

## The other compensation loops, measured

### auth-integrity-audit, `heal_auth_integrity`, daily at 04:00

Back-fills `profiles`, wallet and diamond rows for `auth.users` that have none.

| Measurement | Result |
| --- | --- |
| `auth.users` with no `profiles` row | **3** |
| Of those, created in the last 7 days | **0** |
| Oldest / newest such user | 2026-05-11 / 2026-05-12 |
| Users created in the last 7 days | 2 |

The candidate set has been effectively empty since 2026-05-12: not one user
created in the four months since has been missing a profile, so the signup
writer that this loop was built to cover is doing its job. The three that remain
are more interesting than they look. This job has run four times a day for over
four months and has not healed them, which means they fall outside its "real
users only" filter and it is never going to. They are a fixed residue, not a
backlog. **Evidence points at retirement, but the three rows should be explained
before anyone acts**, because a loop that cannot heal its only candidates is
telling you something about those rows.

### push-dispatch, `requeue_stuck_push_outbox`, every minute

Flips `push_outbox` rows stuck in `processing` for more than 15 minutes back to
`pending`.

| Measurement | Result |
| --- | --- |
| Rows currently stuck over 15 minutes | **0** |
| `push_outbox` rows created in the last 7 days | 170 |

Empty candidate set. Note this is one STEP of an otherwise genuine route: the
`claim_push_outbox_batch` drain beside it is an outbox drainer, which is the
second half of a deliberate two-phase write and must not be touched. A backlog
of zero is what a healthy queue drainer looks like. Only the requeue step is
compensation, and only that step is a retirement candidate.

### yt-pipeline-recovery, every 15 minutes

Re-queues `video_transcode_jobs` that failed on cookie-auth or transient
patterns, capped at 200 per fire, skipping jobs with 5 or more attempts.

| Measurement | Result |
| --- | --- |
| Jobs with status `failed` | 195 |
| Newest `failed` job | **2026-08-15** |
| Jobs of any status created in the last 7 days | **0** |
| Jobs with status `queued` | 0 |

The whole table has been dormant for 40 days: not one job of any status since
2026-08-15. The 195 failures are a frozen backlog the loop has already declined
to retry, since none has been flipped to `queued`. It has done no work in the
last 7 days because there has been no work of any kind to do. It fires 96 times
a day against a dormant table.

## Summary

| Class | Count |
| --- | --- |
| Genuine periodic work | 18 steps across 17 routes |
| Observer | 11 routes |
| Compensation loop | 4 steps across 4 routes |
| Deliberately unscheduled route files | 3 |

The four compensation steps, with candidate sets as measured on 2026-09-24:

| Step | Route | Candidate set | Work in last 7 days |
| --- | --- | --- | --- |
| `fn_spin_sweep_unbooked` | `spin-sweep` | 0 at every horizon | None. Also now its last caller. |
| `heal_auth_integrity` | `auth-integrity-audit` | 3, all from 2026-05, none healable | None |
| `requeue_stuck_push_outbox` | `push-dispatch` | 0 | None |
| yt re-queue | `yt-pipeline-recovery` | 195 frozen, none retried | None. Table dormant since 2026-08-15. |

All four are idle. None was retired here, by design: this task classified and
measured only. Retiring any of them is a separate change that must, per the
standing doctrine, delete the loop as part of fixing or confirming the writer,
and must not leave a function with no caller or a caller with no function.
