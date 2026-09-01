# The 25-hour cron outage: what the money jobs actually lost

2026-09-01. Scope: the eleven financial / financial-integrity jobs that missed
fires between **2026-08-31 08:59:01 UTC** and **2026-09-01 17:21:17 UTC**, when
Open Claw's bearer `CRON_SECRET` matched Vercel but not the private workers VM
and every workers-routed job 401'd. The cause is fixed (PR #1214, per-hop
secret); this document is about the hole it left.

Every number below has a query behind it, run against production.

## Verdict per job

| Job | Missed | Moves money? | Idempotent by | Window or instant | Self-healed? | Actual damage | Action |
|---|---|---|---|---|---|---|---|
| `hard-stop` | 1942 | comp balances | `last_hard_stop_date` | instant (one-minute trigger window) | n/a | **none — 0 players affected** | none; see standing bug below |
| `bbj-detect` | 389 | yes (promo sweep) | cumulative sweep | window | **yes** | none | none |
| `tournament-bounty-detect` | 195 | yes | `UNIQUE(tournament_id, eliminated_id)` | window | n/a — inert | **none** | none; see standing bug below |
| `chip-supply-snapshot` | 33 | no | append-only | instant | no | 33 hourly observations lost forever | took one now; series computable again |
| `freeroll-qualification-sync` | 5 | no | upsert | window | yes | none | none |
| `ledger-reconcile` | 1 | no (diagnostic) | deterministic | window | no | no reading since 2026-08-28 | **ran it**; fixed its standing failure |
| `auto-settlement` | 1 | yes | period status | state-based | will, next Monday | none new | **do not fire** — frozen |
| `auto-settlement-distribute` | 1 | yes | dist. status | state-based | n/a | none | **do not fire** — would break an emergency freeze |
| `rakeback-period-settle` | 1 | yes | `UNIQUE(rakeback_period_id,user_id)` | instant | no | 402 periods unsettled, ~30 chips fundable | **do not fire** — Dan's call |
| `vip-diamond-stipend` | 1 | yes (diamonds) | `reference_id` per user-month | instant | no | September stipend unpaid | **do not fire** — Dan's call |
| `purge-idempotency-keys` | 1 | no | DELETE by cutoff | window | yes | none (table has 0 rows) | none |

## What the diagnostics said

`reconcile_ledger_nightly()` — run 2026-09-01 17:41 UTC, first successful run
since 2026-08-28: **20 entities checked, 19 ok, 0 warn, 1 critical.** The
critical is `club_treasury` for Deep Stack Society: ledger basis
-7,501,086.84 against a stored 2,478,126.60, from `debited_since`
7,501,335.38 vs `credited_since` 248.54 on an `opening_balance` of 0 since the
2026-08-31 10:45 cutover. Three `club_treasury -> settlement_suspense` ledger
rows inside the outage window account for it: 3,750,000.00 twice at 14:02 on
09-01 and 228.38 at 17:06, all `db_role=postgres` via PostgREST / mgmt-api.
Those are administrative moves, not cron output — none of the eleven jobs ran.

`fn_unaccounted_seat_exits()` — **0 rows, ever.** No chips left the felt
unaccounted during the window or outside it.

`fn_club_chip_circulation()` — 173.8M chips across four live clubs:
Club JAQK 83,440,958.14 · SHARK CLUB 61,724,385.32 · Midway Union
24,511,134.81 · Deep Stack Society 4,160,852.15. Thirteen Crest Cert clubs at
zero.

`fn_snapshot_chip_supply()` — the series stops at 2026-08-31 07:00 and resumes
with the one taken at 2026-09-01 17:46. Across that 34.8-hour gap holdings grew
16,386,960.18 while the transaction log explains 12,235,713.21, leaving an
**unexplained delta of 4,151,246.97**. The schema is identical on both rows, so
the comparison is sound. For scale, the eight preceding hourly readings ranged
-101,319 to +20,606 with most under 10,000. This is not attributable to the
missed jobs — none of them ran — and it wants its own investigation.

## Why four jobs were deliberately not fired

**`vip-diamond-stipend`.** It pays 500 diamonds to `profiles.is_vip=true` with
a future `vip_expires_at`, capped `.limit(100)`. That population is now **704**.
It has ever paid **12 stipends total** (June/July/August, 4 per month), so the
population exploded after those months — with trial and phone-verification
grants, not purchases. `vip_subscriptions` holds **0 rows**: there is not one
real Stripe subscriber on the platform. Firing the missed run would credit
50,000 diamonds (~$500) to 100 arbitrary non-paying accounts, which is exactly
the farm that World Hub's own `pages/api/cron/vip-stipend.js` was written to
prevent — that handler requires a non-null `stripe_subscription_id` and is not
scheduled. **Owed under the documented control: zero. Dan decides whether the
monthly job should keep pointing at the unguarded implementation.**

**`rakeback-period-settle`.** 402 `rakeback_periods` rows exist for
`period_start = 2026-08-31`, all `pending`: 314 Midway Union, 88 Deep Stack
Society. A rolled-back probe of `fn_close_settlement_period` on one of them
(CLAUDE.md 11.5 pattern — `RAISE EXCEPTION` after the call, so nothing
committed) returned:

```
{"error":"insufficient_club_treasury","payout":39.3990,"success":false,
 "debit_result":{"error":"insufficient treasury","balance":0.00}}
```

wallet before 25000.00, wallet after 25000.00, 402 still pending. Midway Union's
`clubs.chip_treasury` is 0.00, so its 314 periods cannot be funded at all. Deep
Stack Society's 88 periods are fundable and total **30.47 chips** on a 609.38
rake basis. Firing it would pay that 30.47 and mark the whole 2026-08-31 to
2026-09-06 week `paid` one day into it, forfeiting the remaining five days for
those 88 player/club pairs, while writing 314 `financial_alerts` warnings for
the rest. **Not fired. 30.47 chips of rakeback and an unfunded Midway Union
treasury are Dan's call.**

**`auto-settlement-distribute`.** `rakeback_distributions` is empty, so its
distribution phase is a no-op. Its second phase deactivates every active
`settlement_locks` row — and the three active ones are
`GLOBAL_SETTLEMENT_FREEZE`, `unlock_at 2099-01-01`, reason
**"EMERGENCY: PROFIT DRIFT INVESTIGATION"**, placed by hand on 2026-08-26 for
Club JAQK, SHARK CLUB and Midway Union. Running the missed job would have
silently lifted a deliberate emergency freeze. **Not fired.**

**`auto-settlement`.** State-based: it acts on whatever `settlement_periods`
row is `open`, and that row (period starting 2026-08-16) is still open. Next
Monday's run picks it up. It is also gated behind the same emergency freeze.
**Not fired.**

## Three standing bugs found while measuring the damage

1. **`hard-stop` has never fired.** It compares `cst.timeStr` (`"02:00"`) to
   `commander_venue_settings.hard_stop_time`, which Postgres returns as
   `"02:00:00"`. There is exactly one opted-in venue (id 1996) and its
   `last_hard_stop_date` is `NULL`. All 1942 missed fires were no-ops because
   every fire is a no-op. Not fixed here — it is a Commander bug, not a gap.

2. **`tournament-bounty-detect` is inert.** It filters
   `status IN ('running','paused')`; `tournaments.status` is uppercase
   (`RUNNING`, `COMPLETED`, `CANCELLED`, `REGISTERING`). Bounties are in fact
   written by the engine at elimination time — `tournament_bounties` gained
   rows in **every single hour** of the outage window, 11,134 rows total. Zero
   damage, and a second inert detector beside the retired BBJ one.

3. **`ledger-reconcile` had been failing since 2026-08-28** — 4 of its last 8
   scheduled runs returned HTTP 500 after 8.6s / 11.5s / 8.9s / 13.4s, i.e. the
   `service_role` statement timeout. Reproduced: `57014 canceling statement due
   to statement timeout, CONTEXT: fn_bomb_pot_ledger_gaps ...
   reconcile_ledger_nightly() line 203`. **Fixed** by migration
   `20260901_reconcile_ledger_nightly_own_timeout`, which raises the timeout on
   that one SECURITY DEFINER function to 300s. The `service_role` 8s pin that
   CLAUDE.md section 2 requires is untouched.

## What now catches this class

Neither existing guard could see the outage. `check-cron-liveness.mjs` counts
runs that failed, and a 401 is rejected by `requireCronSecret` before the
`cron_execution_log` middleware writes anything — the log did not go red, it
went silent, its newest row timestamped 08:59:00 exactly.
`check-cron-fleet-alive.mjs` asks whether *any* job succeeded recently, so it
cannot see one job dying inside a healthy fleet, which is the failure that
hides for months (see standing bugs 1 and 2 above).

Added, per-job:

- migration `20260901_openclaw_job_staleness_view` — view
  `public.v_openclaw_job_staleness`, each job's own p90 success-to-success gap
  over 30 days, `is_stale` when silence exceeds twice that, floored at 45
  minutes and capped at 10 days. The baseline is observed, so it cannot drift
  away from the dispatcher.
- workers route `/cron/cron-staleness-watchdog`, appending one `engine_alerts`
  row per state change, deduped by fingerprint and resolving on recovery.
- this PR: the Open Claw schedule, every 15 minutes. No `vercel.json` cron and
  no GitHub Actions `schedule:` — CLAUDE.md 11.3.

Fleet-dead stays with `check-cron-fleet-alive.mjs`, GitHub-side, because a
monitor must not share a failure domain with what it monitors. This route
answers only the single-job question, which is by definition asked from a live
fleet.

Known limit: a job firing less often than roughly weekly never reaches the
view's `successes_30d >= 5` minimum and has no baseline. `vip-diamond-stipend`
is monthly and is therefore **not** covered by this watchdog; it stays covered
by `check-cron-liveness.mjs`.
