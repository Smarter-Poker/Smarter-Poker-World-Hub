# Union Settlement — P0 + P1 continuation (2026-08-20, ~04:00–05:15 UTC)

Continuation of `.agent/handoffs/2026-08-20-union-settlement-continuation.md`.
All items verified against production. Governance + conservation CLEAN at
session end; engine throughput healthy throughout (110–323 hands/min except
two transient DB blips, see Incidents).

## P0-1 — fn_union_rake_paid_by_club survives a full week (DONE)

Migration `20260820_union_rake_daily_rollup.sql` (applied via MCP as
`union_rake_daily_rollup`). Incremental `(union_id, club_id, day)` rollup:

- `union_rake_rollup_days` + `union_rake_paid_daily` (RLS on, no policies).
  Detail stores UNROUNDED sums; `rake_paid_humans` is NULL (not 0) when no
  human contributed, so humans-mode reproduces legacy no-row behavior.
- `fn_union_rake_paid_live` — exact legacy computation, single jsonb
  expansion (window SUM replaces the per-row correlated subquery).
- `fn_union_rake_rollup_refresh_day` — idempotent per-day finalizer under an
  advisory xact lock; refuses incomplete UTC days.
- `fn_union_rake_paid_by_club` — same signature, now VOLATILE plpgsql:
  lazily finalizes missing whole days, reads rolled days + live edges;
  falls back to exact legacy whole-window computation if any day cannot be
  finalized. Only in-DB caller is fn_union_settle_player_pnl (VOLATILE).

Acceptance: 7-day call **1.07s** (extrapolated legacy: ~50s+ of double jsonb
expansion over ~640k records — outage class). Matches legacy **to the cent**
on a 42h window spanning two day boundaries, both horse modes. Days
2026-08-13..19 prewarmed (~3s/day each, one bounded query at a time).
Worst case: late-in-day calls carry up to ~24h of live edge (~3s) — still
bounded. Rollup is lazily self-maintaining; no new scheduler needed.

## P0-2 — Monday fires end to end (VERIFIED)

- Open Claw dispatcher deployed SHA == repo SHA; `openclaw.service` active;
  `/api/cron/auto-settlement` registered mon 10:00 UTC; dispatcher→workers
  HTTP delivery proven by 200s in journalctl.
- Running workers container (`ghcr .../smarter-poker-workers:latest`,
  matches local HEAD bea7591) contains PHASE 7
  (`fn_union_settle_player_pnl_weekly` in /app/dist/index.mjs).
- Chain anchor intact at `2026-08-20 03:42:22.209436+00` (latest
  settled/baseline by period_start); Monday gives ~102h >> p_min_hours=12.
- `notifyUnionSettlementProblem` delivery: union owner exists
  (47965354-…) + 1 union_admin; the exact `notifications` insert the worker
  performs was proven compatible via a forced-rollback probe.

## P0-3 — 90% rakeback (VERIFIED, one live bug found and fixed)

`fn_union_weekly_statement` over a 6h window: both clubs receive exactly 90%
of their own generated rake (SHARK 44,846.88→40,362.19; JAQK
1,398.95→1,259.06); `pay_or_collect` = net player loss − rakeback to the
cent; positive = club pays union. The old pay-nobody bug is gone.

**Bug found: two rival rakeback payers.** The engine
(`RakebackSettlerService.runUnionWeeklyRakeback` →
`fn_union_weekly_rakeback_close_all`, every settler cycle, idempotent per
ISO week) is the canonical payer per Dan's 90/10 spec — it paid the
2026-08-19 15:51 catch-up (980,957.04 to SHARK for 04-01..08-17; JAQK was
not a member then). But Open Claw ALSO had `/api/cron/union-rakeback`
scheduled mon 10:20 → workers route that **drains 100% of
union_wallets.rake_wallet and splits it by commission-rate WEIGHT (50/50
for two clubs at 0.90)** — wrong amount, wrong allocation, second payer on
the same wallet. It only ever no-op'd because it read the dead
`unions.rake_wallet` column; the 2026-08-19 wallet-read fix armed it, so
**2026-08-24 10:20 would have been its first real (double, misallocated)
payment**. Fixed by retiring the schedule + route mapping in
`scripts/openclaw-cron-dispatcher.py` (commit a8a4d92f35), deployed via
`deploy-openclaw.sh`: 90 jobs registered, union-rakeback absent, 0 errors,
auto-settlement/auto-settlement-distribute intact.

Known remaining nuance (P2, not a Monday blocker): the statement's rake
basis (`fn_union_rake_basis_by_club`) = cash rake + tournament entry fees;
the settle path's `fn_union_rake_paid_by_club` = cash rake only (tournament
tables write no rake_records; diff on a fixed 6h window = exactly the
988.70 of fees). The union wallet receives only cash rake, so the engine
close pays 0.9 × (rake + fees) out of a wallet fed by rake alone — the
union's effective keep is ~8% not 10%. Decide: credit fees to the rake
wallet, or exclude fees from the close basis.

## P1-4 — ambiguous overload dropped (DONE)

Both `fn_union_move_rake_to_chips_atomic` overloads were retired tombstones;
the duplicate made every named-arg call (union-wallet.js) fail with
"function is not unique" instead of returning the graceful refusal. Dropped
`(uuid,numeric,uuid,text,uuid)`; named-arg call verified to return
`retired_rake_is_held_in_trust`.
Migration `20260820_drop_ambiguous_move_rake_overload.sql`.

## P1-2 — deterministic cashout club attribution (DONE)

`atomic_credit_wallet_and_log`: club_members lookup now
`ORDER BY joined_at ASC NULLS LAST, club_id` (was unordered LIMIT 1 —
arbitrary for the 578 multi-club users), matching the P&L's attribution.
Last-resort fallback now books to the Midway Union house container club
(was SHARK CLUB), marker kept. 0 fallback rows in the last 7 days.
Migration `20260820_credit_wallet_attribution_determinism.sql`.

## P1-3 — 1,015 unkeyed 2026-08-19 cash-outs resolved (DONE)

1,365,360.08 chips across 765 ordinary "Cash-out from table" rows + 250
"Union migration: table restarted under union ownership" rows (all
16:01:34). Evidence trail: `table_cashout_history` is EMPTY (dead schema);
seat-leave ±5s → 70 unique; seat-session containment (seated at exactly one
table at the instant) → 153 unique; buy-in history useless (horses
multi-table; 1,014/1,015 ambiguous). Result: **153 backfilled** with
provenance metadata, **862 marked permanently unattributable** — no
guessing. Chain anchor (03:42) is after this window, so Monday unaffected.
Write path clean since the 23:33 cutover (0 new NULL-table cashouts).
Migration `20260820_backfill_unkeyed_cashouts_20260819.sql`.

## P1-5 — settlement bookkeeping hygiene (DONE)

- Deleted the orphan `open` period 2026-07-19..07-26 with NULL club AND
  NULL union (zero invoices referenced it).
- March `disputed` period 21d817b2 LEFT ALONE — carries a real invoice;
  resolving it is Dan's decision. **Dan: SHARK period 1 (2026-03-04..03-11)
  sits disputed with one invoice; say the word and an agent can close it.**
- `fn_union_governance_check` extended: `settlement_period_overdue_open`
  (warning, >24h past end_at) and `settlement_period_orphan` (critical).
- `seated_stack_snapshot` confirmed live (populated by the 03:42
  settlement for both clubs) — no longer dead schema.
Migration `20260820_settlement_period_hygiene_invariants.sql`.

## Incidents / operational notes

- Two transient DB blips during the session (connection timeouts + a
  hands/min dip to 0 then 10). Both self-recovered in ≤2 min. journalctl
  showed a workers 500 "Could not query the database for the schema cache"
  at 03:02 — the DB was flaky before this session's queries; every query
  this session was day-bounded or catalog-only. Protocol followed: stop,
  wait 90–150s, probe hands/min.
- This sandbox's GitHub MCP token only sees the stale PUBLIC duplicate
  `SmarterPoker/Smarter-Poker-World-Hub` (dead since March) — do NOT push
  there. The real repo is `Smarter-Poker/...` (private). Pushes done via
  host terminal + isolated worktree recipe with the Smarter-Poker identity.
- The VM mount cannot unlink files; never run git write commands through it.

## Work queue remaining (from the handoff)

- P1-1: unify the two cash-out write paths (chip_transactions vs
  wallet_transactions) — the FULL OUTER JOIN asymmetry remains.
- P2: `.eq('club_id', <uuid>)` sweep on `tables`; XMTTPage filter; BBJ pool
  fragmentation; admin 403 on union tables; human click-test of union
  dashboard (needs Dan or Claude-in-Chrome).
- P3: schedule governance+conservation invariants on Open Claw with
  alerting; CI regression for baseline-at-p_end and rake/P&L population
  parity; index review; read-replica proposal (RULE 12 — Dan);
  reconciliation dashboard. Plus the fee-basis decision from P0-3 above.

## P1-1 — cash-out ledgers unified (DONE, added after Dan's go-ahead)

Dan's correction recorded: union fee = 10% of all cash rake AND 10% of all
tournament fees, period. The "~8%" note above is withdrawn — no adjustment
needed while everything is test data.

`atomic_credit_wallet_and_log` now mirrors cash-outs into
wallet_transactions (canonical player-money ledger, same row shape as
atomic_table_cashout incl. balance_after) and marks its chip_transactions
row `metadata.mirrored_to_wallet=true`. `fn_union_pnl_all_clubs.chip_flows`
excludes mirrored rows — the chip leg is historical-only by data, no magic
cutover constant. Only 'cashout' is mirrored (prize/bounty/tournament
categories never pass through this function — no double-count risk). No
engine deploy needed; both write paths converge via their existing RPCs.
Migration `20260820_unify_cashout_ledger.sql`.

Verified: rollback probe wrote both ledgers + moved balance; live 5/5
engine cash-outs mirrored in first 3 min, 0 unmirrored since; settle
dry-run residual flat (-1,993.69 → -2,001.18, in-flight pot noise) while
5,489.44 of mirrored cash-outs accrued — double counting would have moved
it +5,489.

## Second DB incident (~05:35–05:45 UTC)

Supabase went fully unreachable for ~8 min (MCP connection timeouts, WH
/api/health timeout from the Mac, engine logged supabase_timeout and
restarted). No postgres FATALs in the platform logs for the window; no
heavy query from this session was in flight. Self-recovered. Same class as
the 03:02 blip. If this recurs, look at the pooler/compute tier, not the
application queries.

## Round 2 (after Dan's go-ahead): P2 + P3 items

- **P2-4 + P3-1 (engine, CA commit 2b144b85):** authorizeTableAdmin now
  authorizes the union owner, union admins, and admin-tier members of any
  member club on union-owned tables (they carried the union container as
  club_id, so every admin action 403'd). RakebackSettlerService runs
  fn_union_governance_check + fn_settlement_conservation_check every
  30-minute cycle (reportError only). Deployed via the server/** auto-deploy;
  verified in the running container bundle and by the adjacent treasury
  sentinel executing in the same cycle chain. tsc clean.
- **Rakeback recompute fix (unplanned, found in engine logs):**
  fn_rakeback_recompute_periods aborted EVERY cycle on the
  (user_id, period_start) unique constraint after the 08-19 catch-up close
  left paid rows with a different period_end. ON CONFLICT now targets that
  constraint; paid rows skip silently. Migration
  20260820f_rakeback_recompute_conflict_target.sql (CA repo, c52ce737);
  verified: the failing call returns written:129 and subsequent settler
  cycles log failures: 0.
- **P2-1 + P2-2 (CA frontend, c9c0268b):** new src/utils/unionScope.ts
  (clubGamesOrFilter). Union-aware table queries in AdminTableHeatmap,
  StatsExport, ClubFinancialDashboard, AdminDashboardPage (3 sites),
  ClubDashboard. XMTTPage was triple-broken (integer club code vs uuid
  column, union scope, type filter on a SELECT alias with lowercase values
  — tournament_type holds 'MTT'); status tabs also compared lowercase to
  uppercase. Deployed: production build-info.json serves ca_sha c9c0268b;
  WH prod /api/health served 69b9940ab8 (contains e4a641222f) at 06:22 UTC.
- **P2-3 BBJ fragmentation: already resolved.** Retired JAQK pool's last
  contribution predates the 08-19 merge; all live contributions flow to the
  active union pool (11,259.44/24h). No action.
- **P3-2 (WH 5e0ace61):** union-settlement-math tests now assert defect A
  (baseline anchored at p_end lets an inside-window bootstrap win) and
  defect B (rake/P&L population mismatch resurfaces rake as phantom loss).
  11/11 pass.
- **Operational:** engine settler is draining a ~26k-row backlog (9.2h lag)
  accumulated during tonight's repeated Supabase connection incidents; its
  own treasury sentinel is alerting and catch-up mode is active. Platform
  DB had at least three multi-minute unreachability episodes (~03:02,
  ~05:35, ~06:38) with no postgres FATALs logged — if this recurs, look at
  the pooler/compute tier, not application queries.

Still open from the handoff: P2 `.eq('club_id')` sweep only covered the
tables/tournaments read sites listed above (other candidates should be
reviewed per-site); P2-5 human click-test of the union dashboard (needs
Dan); P3 index review, read-replica proposal (RULE 12 — Dan), and the
reconciliation dashboard.

---

# REVIEW ROUND (2026-08-20 ~11:00–12:45 UTC) — line-by-line re-audit

Dan asked for a full verification that everything was pushed and published,
then a line-by-line hunt for bugs/stubs/gaps/regressions, then upgrades.
Dan's correction recorded: **the union fee is 10% of all cash game rake AND
10% of all tournament fees, period.** The earlier "~8%" note is withdrawn;
nothing needs adjusting while everything is test data.

## Publish audit — all 12 earlier commits verified live

WH 9 + CA 3 commits all ancestors of origin/main; 7 migrations registered in
production; dispatcher SHA == repo SHA; engine container contains the admin
+ sentinel code; prod CA bundle (ca_sha 96ff3e8d) contains c9c0268b, and the
deployed chunks were fetched and inspected: `unionScope-wzmhUs1v-v6.js` is
served, XMTT ships `.or(await le(r))` and `in("tournament_type",["MTT","XMTT"])`
with lowercase-safe status tabs.

## THE BIG ONE — my own rake rollup was silently WRONG

Diffing the rollup against the legacy computation on a fixed historical
window exposed it: SHARK CLUB **489,066.11 (rolled) vs 489,205.40 (live)**.
Two independent causes:

1. **Finalized days go stale.** The rollup caches a query whose inputs change
   retroactively — the union migration keeps setting `tables.union_id` on
   EXISTING tables, so historical `rake_records` enter the union's scope
   after a day was finalized. Measured: 2026-08-16 held 100,548 records when
   rolled and 102,171 an hour later (+1,623); 08-17/18/19 likewise. That rake
   was missing from the settlement basis, **under-crediting the club that
   earned it**.
2. **Attribution was baked in** at refresh time, so a player joining or
   leaving a club silently invalidated the cached answer.

**Fix (migration 20260820h):** rake is now stored **per user per day**;
club attribution and the horse filter are applied at READ time using exactly
the legacy expressions; every day carries `records_seen` and a day whose live
record count no longer matches is treated as MISSING and recomputed live for
that day only. The cache can now only ever be a SPEED optimisation.
Verified: readonly == live **to the cent in both horse modes**, and with the
cache deliberately poisoned (`records_seen` wrong AND `rake_amount` × 99) the
reader still returned the exact correct figure.

## Two more real defects in my own P0-1 work (migration 20260820g)

- **The fallback WAS the outage.** If a day failed to finalize, the function
  fell back to a live scan of the ENTIRE window — the ~50s query P0-1 existed
  to eliminate. The safety net was the hazard. Now every path is bounded to
  one day plus the ragged edges.
- **Monday would finalize days inside the money transaction.** The rollup is
  filled lazily by its first caller; on Monday that is
  `fn_union_settle_player_pnl` holding FOR UPDATE locks on `union_wallets`
  and `clubs.chip_treasury`. Measured: 4 unrolled days = ~12s of extra scan
  inside that lock window while live horse funding contends on the same rows.
  `fn_union_rake_rollup_catchup_all()` now warms it outside any money
  transaction.

## The weekly STATEMENT was still unbounded

`fn_union_weekly_statement` → `fn_union_rake_basis_by_club` still had the
original double-jsonb-expansion shape. P0-1 fixed the settle path only, so
the report **a human would actually run** was still outage-class. Rebuilt on
the rollup (cash leg) + live tournament fees (0.34s over 7 days). Both legs
kept, per Dan's 10% + 10% spec.

## Upgrades shipped

- `fn_union_rake_paid_readonly` — STABLE, never writes, always bounded.
- `fn_union_rake_day_is_fresh` — cheap per-day staleness probe.
- `fn_union_rake_rollup_catchup` / `_all` — re-validate and re-roll outside
  money transactions.
- `union_rake_rollup_unmaintained` governance invariant (warning: settlement
  would do the work inline; correctness is unaffected).
- **`fn_union_reconciliation_report(union, start, end)`** — the read-only
  pre-Monday preview (handoff P3-5): per-club settle_net, direction, rake,
  stack delta, plus residual/tolerance/within_tolerance. Granted to
  `authenticated` so the union dashboard can render it. Current window shows
  residual −5,608.61 against tolerance 11,204.93 → within tolerance.
- **Workers `/cron/union-rakeback` is now a 410 tombstone with no database
  access at all**, asserted by a test that strips comments and greps the code
  for `getSupabase` / `from(` / `rake_wallet`. Defence in depth behind the
  dispatcher retirement. 43/43 workers tests pass.

## Checked and found FINE (no change needed)

- `fn_settlement_conservation_check` 1.2s, `fn_union_governance_check` 0.86s
  warm (the 4.5s first call was cold cache) — safe at a 30-minute cadence.
- `authorizeTableAdmin` returns the union container as `clubId`, used only
  for the `anti_cheat_events` audit row — correct, that IS the table's owner.
- P1-1 mirroring cannot double-count: `chip_flows` already dropped NULL
  `table_id` rows, so nothing moved from "counted once" to "counted twice".
- `fn_rakeback_recompute_periods` ON CONFLICT rewrite cannot silently move a
  user between clubs — the `eligible` CTE already excludes users holding a
  row at another club for that period.
- Index review (handoff P3-3): the four indexes it asks for already exist.
  7-day `fn_union_pnl_all_clubs` is 6.7s, bounded and index-backed.

## BLOCKED — needs Dan (RULE 0 human-only exception)

**GitHub Actions stopped running at ~12:22 UTC.** Every workflow in
Smarter-Poker-Club-Arena and Smarter-Poker-World-Hub now fails in 3–6s with
**zero steps executed** (CI, Silent Revert Guard, Build for World Hub Sync,
Auto-Deploy Hetzner). The last green run was workers CI at 12:20:59Z. That
signature — instant failure, no steps, every workflow, multiple repos — is
what an **Actions spending-limit / billing block** looks like. The deploy
token cannot read the billing API (403) to confirm it.

**Dan: check GitHub → Settings → Billing → Actions spending limit.**

Consequences while it is down (nothing is broken, two changes are pending):
- `43a7ce579` + `f0a61596f` (engine: rollup catch-up wiring) are on main but
  NOT deployed. **Correctness is unaffected** — a stale/missing day is
  recomputed live at read time. The only cost is that Monday's settlement
  would roll up to ~4 days inline. Mitigated for now: the rollup was warmed
  by hand this session (`stale_remaining: 0` for every union).
- `db9bc64` (workers: retired-route tombstone) is on main but not deployed;
  the workers image only rebuilds on a `v*.*.*` tag or dispatch. The live
  route is still the old code — harmless, because its Open Claw schedule was
  removed, so only a manual call could reach it.
- The engine's P2-4 admin fix and P3-1 sentinel ARE already live (deployed
  earlier at d18479ff8), as is every DB migration.

Re-run both deploys once Actions is restored; no code changes needed.

---

# DEPLOY CLOSE-OUT (2026-08-20 ~12:55–13:25 UTC)

Dan raised the GitHub Actions budget; Actions recovered at ~12:55 UTC (first
green run 12:55:05Z). Both pending deploys are now LIVE and verified.

## Engine — DEPLOYED (`514f14e7d`)

Re-triggered with a `server/**` touch (the token cannot re-run or dispatch
workflows). Run for 514f14e7d: **success**. Verified inside the running
container: `runUnionRakeRollupCatchup` ×2, `runUnionGovernanceSentinel` ×2,
`"Union admin role required"` ×1. Proof it actually executes, from the
Supabase PostgREST logs: `POST /rpc/fn_union_rake_rollup_catchup_all → 200`,
twice in the first cycles. It logs nothing when there is nothing to roll,
which is the healthy state.

## Workers — DEPLOYED (`db9bc64`), and two VM defects found doing it

`v1.0.4` tagged and the release workflow succeeded, but the container did not
change, which exposed two pre-existing problems:

1. **The workers VM cannot pull from GHCR.** `docker compose pull` returns
   `error from registry: denied`. Credentials exist in
   `/root/.docker/config.json` for `ghcr.io` but are rejected — expired, or
   missing `read:packages`. This is why the release workflow has been
   building images that never reached production: the running container was
   `bea75913b23`, built locally on the VM on 2026-08-19, not pulled.
   **Dan: this needs a GHCR PAT with `read:packages` on the workers VM** —
   until then every workers release must be built on the box by hand.
2. **The container had `RestartPolicy=no`** while `/opt/workers/docker-compose.yml`
   — its own documented source of truth — specifies `unless-stopped`. It also
   carried no compose labels, i.e. it was created by a manual `docker run`,
   which is why `docker compose up -d` hit a name conflict. A reboot or crash
   would have left every cron handler down silently.

Deployed the way this VM actually works, preserving the running shape:
rsync the tag's source to `/opt/workers-build`, `docker build` with
`org.opencontainers.image.revision=db9bc64`, verify the image BEFORE swapping
(tombstone present, old drain code absent, PHASE 7 settlement intact), carry
the 21 runtime env vars across from the live container into a 0600 env file,
rename the old container to `smarter-poker-workers-rollback-bea7591` (kept as
a rollback target), then start the new one with `--restart unless-stopped`.

**Verified live from the allowlisted Open Claw IP:**
`POST /cron/union-rakeback → HTTP 410` with
`{"success":false,"retired":true,"error":"union_rakeback_route_retired"}`.
The double-payer is now closed at both layers — no schedule, and the route
itself refuses.

## Bonus fix found while verifying: the treasury sentinel was dead

The engine logs showed `fn_union_treasury_selftest failed: canceling
statement due to statement timeout` — every cycle, HTTP 500 in the PostgREST
logs. **The union treasury conservation sentinel, the check that exists to
catch chips being destroyed, has not run at all and could raise no
`financial_alerts`.**

Cause: its BBJ duplicate-contribution check grouped the ENTIRE
`bbj_contributions` table (212 MB, +30,700 rows/day) with no time bound —
the same unbounded-scan failure mode as the 2026-08-19 outage. Bounded to 7
days (the sentinel runs every 30 minutes, so nothing is missed). Now returns
`healthy: true` in ~5.3s instead of never completing.
Migration `20260820j_fix_treasury_selftest_unbounded_bbj_dup_scan.sql`,
verified md5-identical to production.

Related: the settler backlog that sentinel had flagged (9.2h lag, 26,008 rows)
has fully drained — `healthy: true`, no breaches.

## Still open for Dan

- **GHCR pull credentials on the workers VM** (above) — a credential I have no
  path to obtain.
- The March `disputed` settlement period (SHARK, 2026-03-04..03-11, one
  invoice) still needs a decision.
- Human click-test of the union dashboard.

---

# RE-EVALUATION / SECURITY AUDIT (2026-08-20 ~13:30–14:00 UTC)

Dan asked for a full re-evaluation before proceeding. Rather than re-confirm
earlier claims, this pass attacked the work from the outside — permissions,
reachability, and the actual Monday code path. **It found the most serious
problems of the entire session, including one I introduced.**

## SEC-1 (CRITICAL) — money-moving RPCs were callable by any logged-in user

Postgres grants EXECUTE to PUBLIC by default and Supabase exposes every
`public` function over PostgREST, so a plain user JWT could
`POST /rest/v1/rpc/fn_union_settle_player_pnl` with **any union_id, any
window, and p_dry_run=false**. The function is SECURITY DEFINER, so it would
execute with owner rights and move chips between club treasuries and the
union wallet. Same for `_guarded` and `_weekly`. None of the three has an
internal auth check — they were written for service-role callers only.

Also exposed: `fn_union_weekly_statement` (reachable by **anon** — fully
unauthenticated financial data), `fn_union_rake_basis_by_club`, and
`fn_union_rake_paid_by_club` (which also WRITES, so it was a cheap DoS lever
as well as a data leak).

Verified the only real callers are service-role (workers auto-settlement and
`pages/api/club-arena/settle-period.js` via `supabaseAdmin`), and that none
of them appear in the production browser bundle, then revoked all six from
PUBLIC/anon/authenticated. Confirmed after: `anon=false, authenticated=false,
service_role=true` for all six.
Migration `20260820k_lock_down_union_settlement_rpcs.sql`.

## SEC-2 (HIGH, MY BUG) — the reconciliation report I added was world-readable

`fn_union_reconciliation_report`, added earlier today, was executable by
PUBLIC — i.e. by `anon`, i.e. by anyone holding the publishable key with no
login. SECURITY DEFINER + arbitrary `p_union_id` meant it exposed every
union's full financial position. Granting it to `authenticated` had not
removed the default PUBLIC grant, and I did not check.

Fixed properly rather than just revoking: authorization now happens INSIDE
the function (service role, union owner, union admin, or an
owner/admin/super_agent of a member club), so it stays usable by the union
dashboard, and PUBLIC/anon are revoked.
Migration `20260820l_authorize_union_reconciliation_report.sql`.

## SEC-3 (HIGH, pre-existing) — `fn_member_leave_to_treasury` had no auth check

SECURITY DEFINER, granted to `authenticated`, arbitrary `(club_id, user_id)`:
**any logged-in user could evict any member of any club and sweep that
member's club chip_balance into the treasury**, with the victim's own id
recorded as the source. Guarded: service role, the member themselves (the
real client flow), or a club treasury manager.
Migration `20260820m_authorize_member_leave_to_treasury.sql`.

Checked the siblings while here — `fn_horse_seat_from_treasury` and
`fn_horse_fund_from_treasury` are **correctly guarded** via
`fn_actor_can_manage_club_treasury()`, and that helper is sound (service
role, club owner, admin-tier member, or agent). My initial `auth.uid()` grep
had wrongly flagged them; reading the bodies corrected it. The five
settlement-period functions with `auth.uid()` checks were also confirmed
guarded and left alone.

## Latent landmine in my own rollup finalizer

`fn_union_rake_rollup_refresh_day` divided by the per-record contribution
total with no `> 0` guard, while the live computation filters it. One
rake_records row summing to zero would raise division_by_zero → that day
would never finalize → it would fall back to the live path **forever, with no
error surfaced anywhere**. Zero such rows exist today, so this is
pre-emptive: `NULLIF(..., 0)` yields NULL and the existing
`WHERE share IS NOT NULL` drops it, exactly matching the live function.
Re-verified cent-equal to `fn_union_rake_paid_live` in both horse modes after
the change. Migration `20260820n_rollup_refresh_day_guard_zero_contrib.sql`.

## Monday's settlement re-verified end to end after all of the above

- Dry run vs `fn_union_reconciliation_report` **agree**: JAQK settle_net
  −14,486.27 identical in both; SHARK 8,572.93 vs 8,571.83 and residual
  −5,913.34 vs −5,914.44 — a 1.10 drift explained entirely by live play
  between the two calls (`now()` is a moving bound), not by logic.
- Read `fn_union_settle_player_pnl_guarded` in full: it dry-runs, rejects
  "net with no activity", then compares |residual| against
  `GREATEST(100, 1% of turnover)`. Current numbers: residual 5,913 vs
  tolerance 12,200.87 on 1,220,087 turnover → **the guard passes and Monday
  would pay**.
- Chain anchor still `2026-08-20 03:42:22`; Monday 10:00 UTC is ~102h out
  against `p_min_hours = 12`.
- Rollup: 0 stale days; engine catch-up confirmed executing in production
  (`POST /rpc/fn_union_rake_rollup_catchup_all → 200`).

## Note for whoever audits next

The default-PUBLIC-EXECUTE trap is not specific to these functions — it
applies to **every** SECURITY DEFINER function in `public` that nobody
explicitly revoked. This audit only swept the union/settlement/treasury
family. A project-wide sweep of `has_function_privilege('anon'|'authenticated', …)`
against SECURITY DEFINER functions is worth doing as its own piece of work.

---

## Round 4 (2026-08-20, late): the sentinel was dead

Found while verifying that the previously-deployed engine code was running
clean in production. Engine logs showed, every settler cycle:

```
[RakebackSettler.treasury_selftest_rpc] Error: fn_union_treasury_selftest
failed: canceling statement due to statement timeout
```

`fn_union_treasury_selftest` had been bounded EARLIER THE SAME DAY (the BBJ
duplicate-contribution scan) and was healthy at 5.3s afterwards. It had
since regressed past the timeout for a different reason. This matters more
than a normal perf bug: while it times out, the union treasury sentinel
detects **nothing** — not wallet non-negativity, not rake-wallet ledger
reconciliation, not lapsed unclosed weeks, not BBJ duplicates, not retired
pools holding money, not negative pool balances, not BBJ conservation
drift, not rakeback settler lag. A silent sentinel reads as health.

### Cause

The rake-wallet ledger reconciliation leg:

```sql
SELECT SUM(amount) FILTER (WHERE direction='credit'), ...
  FROM union_wallet_transactions
 WHERE union_id = ? AND wallet = 'rake_wallet';
```

609,174 rows / 186 MB, growing ~69,000 rows/day, no usable index — a
sequential scan on every 30-minute cycle. It was under the timeout when the
BBJ fix was made and crossed it later the same day.

A date bound was not available: the check compares the live wallet balance
against the sum of ALL ledger entries, so truncating the window changes
what the invariant means.

### Fix (20260821h, 20260821i)

Same incremental design as the union rake daily rollup:

* `idx_uwt_rake_wallet_recon` — partial covering index on the rake_wallet
  rows. Full sum 599 ms, down from a seq scan that never finished.
* `union_rake_ledger_checkpoint` — cumulative (credits, debits, rows_seen)
  folded in up to an exclusive `as_of`, plus a bounded live tail. Per-cycle
  cost becomes O(rows in the last hour). The index alone would have been a
  band-aid: ~600 ms today, ~6 s in a year, back over the timeout after that.
* One-hour lag on `as_of` as a commit-skew guard, so a row that commits
  slightly after its own `created_at` can never fall between the checkpoint
  and the tail.
* `fn_union_rake_ledger_checkpoint_verify` — full recompute once per 24h,
  overwrites the checkpoint with truth, raises a critical financial_alert
  on any disagreement.

Verified: checkpoint path returned credits, debits AND row count identical
to a live full recompute; warm path 6.6 ms. Adversarially: the checkpoint
was deliberately poisoned by +9,999.99, which moved the reported total by
exactly that amount (proving it is load-bearing, not decorative), was then
detected as `drift: 9999.99`, repaired, and alerted on. Test alert deleted.

### Second finding: the same shape again, in fn_bbj_conservation_check

With the reconciliation at 6.6 ms the sentinel was still ~4 s, so the
remaining legs were measured rather than assumed. `fn_bbj_conservation_check`
(2,701 ms) held three parallel seq scans:

| leg | cost | note |
|---|---|---|
| `bbj_contributions` full sum | 22,350 | genuinely O(history) |
| `union_wallet_transactions` `tx_type='bbj_fund'` | 21,839 | 610k rows scanned for ~12 matches |
| `wallet_transactions` `category='promotion' AND description='BBJ promo pool payout'` | 73,467 | most expensive leg, for ~1 row |

Fix (20260821j, 20260821k):

* Two partial covering indexes (88 kB and 8 kB) for the two selective
  filters — a complete fix there, since those row counts stay tiny.
  2,701 ms -> 513 ms.
* `money_flow_checkpoint` (generic, keyed by metric name) for the
  `bbj_contributions` inflow, same pattern as above.

**Contract trap avoided:** `fn_bbj_conservation_check` is STABLE. The naive
version of this change would have had it maintain its own checkpoint, which
requires writes and would have silently forced it to VOLATILE. Instead the
read (`fn_bbj_contributions_total`) stayed STABLE and side-effect free, and
the already-VOLATILE `fn_union_treasury_selftest` does the advancing before
it calls the check. The read is exact whether or not the checkpoint is
current — a stale checkpoint only means a longer tail, never a wrong answer.

Exactness is load-bearing here: the conservation gap is compared to a stored
baseline with tolerance 1.00, so a one-cent drift would raise a false
critical alert. Verified `exact_match = true` against a full recompute, and
the output contract unchanged (`gap 59510.86`, `drift_from_baseline 0`,
`healthy true`).

### Result

| | before | after |
|---|---|---|
| `fn_union_treasury_selftest` | statement timeout, every cycle | **287 ms**, `healthy:true`, `breaches:[]` |
| rake ledger reconciliation | unbounded seq scan | 5.5 ms |
| bbj conservation check | 2,701 ms | 6.5 ms |
| bbj duplicate scan (7d) | 265 ms | 265 ms (already bounded, flat) |
| settler lag | 3.1 ms | 3.1 ms |

Nothing in the sentinel path is O(all history) any more.

### Process note

The md5 parity check between migration files and production `prosrc` caught
real drift on `fn_union_rake_ledger_totals` (file 2,799 chars vs production
2,409): explanatory comments present in the committed file had been stripped
from the text hand-copied into `apply_migration`. Functionally identical,
but the file would no longer have reproduced production. Resolved by
re-applying the documented version (`union_rake_ledger_totals_comment_parity`)
rather than deleting the comments. All 7 function bodies now md5-match.

---

## INCIDENT (2026-08-20 16:10-16:11): I caused a DB stall that broke two live tournaments

Self-reported. Cause was my own action, not a pre-existing bug.

### What I did

To fix the treasury-sentinel timeout I built a covering index on the
rake-wallet rows:

```sql
CREATE INDEX CONCURRENTLY idx_uwt_rake_wallet_recon
  ON union_wallet_transactions (union_id, created_at)
  INCLUDE (amount, direction) WHERE wallet = 'rake_wallet';
```

`union_wallet_transactions` is 186 MB and one of the hottest write targets
in the system (~69,000 rake rows/day, ~0.8 writes/second sustained). I chose
CONCURRENTLY specifically to avoid the SHARE lock a plain CREATE INDEX
takes — which was the right call for locking, but I did not account for the
I/O cost of the build itself against live play. I also ran several
whole-table EXPLAIN ANALYZE probes in the same window.

### What happened

Engine writes began timing out. Distribution of `supabase_timeout` in the
engine log over 90 minutes:

```
  12   16:10
  67   16:11
   0   every other minute
```

79 timeouts, all inside the two minutes of the index build. Zero before,
zero since.

Consequences, in order:

1. `[completeHandSnapshot] Error: supabase_timeout` — hand snapshots failed.
2. `[FeeReconciler.queue_failed] Error: [A5] Could not queue unbanked rake
   for hand ... These chips left the pot and are now recoverable only by
   hand.` — 2 hands, rake 0.26 + 1.18, BBJ 0.12 + 0.06.
3. Two in-flight MTTs took the `All busted simultaneously — last eliminated
   wins` branch at 16:11:28 and force-completed:
   - `Afternoon Bounty (NLH)` (1f3650c7)
   - `Union PKO Afternoon (PLO4)` (58de422f)

### Money impact

| tournament | prize_pool | prize paid | undisbursed |
|---|---|---|---|
| Afternoon Bounty (NLH) | 483.00 | 193.20 | **289.80** |
| Union PKO Afternoon (PLO4) | 770.00 | 423.50 | **346.50** |
| | | | **636.30 total** |

Bounty pools were fully swept (`Champion collected remaining bounty pool`),
and rake settled normally (69 and 154). The shortfall is entirely in
finishing-place prizes: the players still active when the stall hit were
never assigned finishing positions, so positions 2-6 (Afternoon Bounty) and
2-5 (Union PKO) have no result rows and were never paid.

The 636.30 was collected at buy-in and never disbursed — it has not left the
system, so this is correctable rather than lost.

**Every affected finisher is a horse.** No human player was affected.

### What this is NOT

Initially this looked like fallout from the same-day bounty fee fix
(`fix_bounty_tournament_fee_not_charged`, applied 14:56:02), because both
broken tournaments were bounty events completing after it. That hypothesis
was tested and rejected:

* every non-bounty tournament completing after 14:56 shows `prize_gap 0.00`,
  including 9-place payouts like Lunch Rush (1104.00 paid in full);
* the entry accounting for both broken events is exactly correct under the
  new split — 69 buy-ins x 11.00 = 759.00 collected, splitting to prize 483
  + bounty 207 + rake 69 with no residue;
* both tournaments failed at the same instant (16:11:30.055 and
  16:11:30.087), which is a system event, not an arithmetic one.

The fee fix is behaving correctly. The trigger was the index build.

### Lessons

1. **CONCURRENTLY solves locking, not load.** On a hot, large table during
   live play the build's own I/O is enough to push engine writes past their
   timeout. The two later indexes in this round (88 kB and 8 kB, on highly
   selective predicates) caused nothing — size and write-rate of the target
   are what matter, and should be checked before building.
2. **A transient DB timeout should never be readable as "all players
   busted".** The `All busted simultaneously — last eliminated wins` branch
   turned an infrastructure blip into permanent, money-stranding tournament
   completions with no retry and no alert of its own. This is an engine
   robustness bug independent of my mistake, and it is the more dangerous of
   the two: any future Supabase hiccup reproduces it. Flagged for Dan; not
   changed here, because rewriting tournament completion logic unreviewed at
   the end of a session is exactly the kind of risk that caused this entry.
3. The TournamentSentinel caught both problems (`payout_conservation`,
   `stranded_players`) correctly and immediately. That sentinel works.

### Open items for Dan

* Whether to pay the 636.30 to the owed horse finishers, or void it. This is
  a money movement and a judgement call, so it was not executed.
* Whether to harden the `All busted simultaneously` path against transient
  DB errors (recommended).

---

## Tournament payout integrity (2026-08-20, follow-on from the incident)

The incident above stranded prize money in two tournaments. Checking whether
that was a one-off showed it was not: it is a long-standing structural defect
that has been quietly losing and duplicating prize money for months.

### The measurement

Every completed tournament, grouped by how many places its structure pays:

| places paid | tournaments | short-paid | only 1st place paid |
|---|---|---|---|
| 1 | 2,058 | 0 | 0 |
| 2 | 252 | 2 | 2 |
| 3 | 85 | 1 | 1 |
| 5 | 487 | 75 | 50 |
| 9 | 127 | 35 | 29 |

Single-place structures (Spins) are **2,058 for 2,058 perfect**. Every
multi-place format degrades, and the more places it pays the worse it gets:
113 of 951 multi-place tournaments under-paid, 79 of them paying only first
place. Separately, 11 tournaments paid a place to more than one player.

The defects cluster on particular days rather than spreading evenly, which
is the signature of disruption, not of bad arithmetic. The payout
percentages themselves are correct: THREE, FIVE and NINE each sum to exactly
100%.

### Root causes (three, all confirmed against production)

**1. A failed query read as "nobody left".** In
`TournamentManagerEliminations`:

```ts
const { count: remainingCount } = await supabase...   // error discarded
if ((remainingCount || 0) <= 1) {                     // null -> 0 -> "finish it"
```

On a Supabase timeout `count` returns null, `|| 0` turns that into 0, and the
engine concludes the tournament is over. It then finishes while players are
still live. The fingerprint is unmistakable in the data -- Afternoon Bounty
ended with 63 eliminated (positions 7..69), 1 winner, and **5 players still
`status='playing'` with `position=NULL`**. Those 5 were places 2..6: exactly
the paid places, which is exactly the money that went missing. Early Bird
Freeroll 3b02e894 shows the same shape with 8 unresolved players.

**2. A clamp that mints money.**

```ts
const position = Math.max(2, basePosition - i);
```

When `basePosition` is smaller than the number of players being eliminated,
every position computing below 2 collapses onto 2, so several players are
stamped place 2 and EACH is paid a full 2nd-place prize. The wallet
idempotency key is `tourney:{id}:prize:{user}:{place}` -- it dedupes a
repeated user, not a repeated PLACE -- so nothing downstream caught it.
Worked example, Early Bird Freeroll ad750179:

```
place 2 -> 8d100b96  18.75  at 04:30:48
place 2 -> face0000  18.75  at 04:44:51
total paid 93.75 against a 75.00 pool = 125%
```

**3. No final reconciliation.** Places 2..N are emitted per-elimination and
place 1 at finish; nothing ever checks the pool was fully disbursed. That is
why any disruption is permanent and silent.

### Fixes

Engine (`TournamentManagerEliminations.ts`):

* an unreadable player count is now treated as UNKNOWN, not zero -- the
  finish check is skipped for that cycle and the tournament stays live;
* the same for the count that positions are derived from: eliminations are
  deferred rather than assigned from a number we could not read;
* the clamp is gone. `basePosition` is floored at `bustedOrdered.length + 1`,
  which makes the run strictly decreasing and always >= 2, so places are
  distinct by construction and place 1 stays reserved for the winner;
* `finishTournament` refuses to leave anyone unresolved: any survivor other
  than the winner is assigned a distinct place (bigger stack finishes higher)
  and paid, so the pool is disbursed in full.

Database (`20260821m`): `fn_tournament_payout_reconcile` -- the backstop.
Format-agnostic, because it reconciles the POOL against the PAYMENTS instead
of trusting the sequence of elimination events. It recomputes every place
from `prize_pool` and `payout_structure`, compares against what each finisher
was actually paid, and tops up shortfalls. It is wired into the engine at the
COMPLETED transition, so every tournament now self-settles.

Deliberate constraints:

* reconciles against `wallet_transactions`, not `wallet_credit_idempotency`
  -- that table only starts 2026-07-24, and a key-based reconciler would
  conclude every older tournament was unpaid and pay it all again;
* the last paid place absorbs the rounding residual, so places sum to the
  pool exactly (the 9-place structure on a 483.00 pool otherwise rounds to
  483.01 -- a one-cent overpay on every such event);
* overpayment is reported, never clawed back automatically;
* auto-pay only where a place has EXACTLY ONE recorded finisher; otherwise it
  refuses to guess and raises a critical alert.

### Verification (every test rolled back; production untouched)

* double-pay case -> reports `duplicate_finishers`, pays nothing;
* only-1st-paid case -> reports places 2..5 `no_finisher_recorded`, refuses
  to invent a payee;
* clean control -> `clean:true`, 75.00 expected = 75.00 paid;
* apply path -> deleted the place-3 payment (13.50), reconciler credited
  exactly 13.50 to the correct CLUB wallet and re-emitted the ledger row.
  (`credit_player_wallet` routes Club Arena money to
  `club_members.chip_balance`, not `wallets.balance` -- the first test
  measured the wrong wallet and read as a failure until that was traced.)
* idempotency -> first apply +13.50, two further applies +0.00.
* `service_role` can execute; `anon` and `authenticated` cannot.
* `npx tsc --noEmit` clean.

### Honest limitation

The reconciler cannot repair the historical damage. A 7-day dry run found 6
tournaments with findings and **0.00 auto-payable**, because in every case
the finishers were never recorded -- the money is owed to nobody
identifiable. Detection is possible; attribution is not. The engine fixes
stop new occurrences; the historical 30k of gaps is a data loss that only
Dan can decide how to treat.

---

## Tournament round 2 (2026-08-20): rounding, add-ons, double-booked fees

Continuation of the payout work. Four more defects, found by walking every
remaining tournament money path rather than waiting for symptoms.

### 1. Three different rounding rules (fixed)

Each place was rounded independently, so the rounded places need not add up to
the pool. The 9-place structure on a 483.00 pool rounds to 483.01; 218.40 and
197.40 round the other way and UNDERpay. 8 of the 67 distinct (pool,
structure) pairs actually used in production are off by a cent -- the -0.01
prize gaps already visible in Midnight Bounty (101.50 paid 101.51) are exactly
this.

Worse, there were THREE implementations: eliminatePlayer, finishTournament,
and a separate formula inside recoverStuckCompletingTournaments. A tournament
rescued by the watchdog could be paid differently from one that finished
normally, and differently again from what fn_tournament_payout_reconcile
expects -- which would have raised a false "overpaid" critical alert on every
such event, because the reconciler had been written with the residual rule
while the engine had not.

All three now share `computePlacePrize`: normalise the structure to 100%,
round each place, last paid place absorbs the residual. Verified over 112
pool/structure combinations -- every one sums to the pool exactly, where the
old rule was wrong in 13. Malformed structures degrade proportionally (a 150%
and a 60% structure both resolve to [66.67, 33.33] on a 100 pool) instead of
over-paying the top places and starving the last.

The helper lives in its own import-free module: hosting it in
TournamentManagerEliminations made the import graph circular, because
TournamentManagerBase already imports tournamentRecovery
(recovery -> eliminations -> base -> recovery). ESM hoisting would have made
it work; a cycle around money code is not worth relying on.

### 2. Add-ons were raked, against an explicit rule (fixed)

Dan's rule is binding: "ADD ON'S AREN'T RAKED. ONLY REBUYS."
process_tournament_rebuy computed the same fee ratio for every purchase type,
so an add-on was charged base + ~10% and booked a 'tournament_addon_fee' rake
record -- behaviour deliberately introduced on 2026-07-24 and now reversed.

### 3. The fee was booked TWICE (fixed)

process_tournament_rebuy inserts a rake_records row and increments
tournaments.total_rake inside the same transaction as the chip deduction. The
client then called recordTournamentFee(), which inserted a SECOND rake_records
row and called increment_tournament_rake again. Every rebuy and re-entry fee
would have been counted twice in union rake revenue, in total_rake, and
therefore in rakeback. All three client call sites removed; the database
transaction is authoritative.

### 4. The prize pool would have shaved every add-on (fixed)

recalculatePrizePool divided EVERY rebuy/add-on debit by (1 + feeRatio) to
strip the fee back out. Correct for a rebuy, whose debit is base + fee -- but
once add-ons became fee-free their debit IS the base, so each add-on would
have had ~9% quietly removed from the prize pool. This defect was created by
fix 2 and caught before it shipped. Also swapped Math.trunc for Math.round on
the pool total: every term is 2dp, so the only difference is IEEE 754 error,
and 482.99999999999 truncates to 482.99, losing a cent players paid in.

### Why these were latent

process_tournament_rebuy has produced zero rake_records and the last 'rebuy'
wallet_transaction was 2026-04-19, so defects 2-4 were not corrupting anything
yet. They were not theoretical either: 28 live/recent tournaments have
add_on_available set, so all three fire the moment a player takes an add-on.

### Verification

* Server behaviour, in a rolled-back transaction against production: add-on
  fee 0.00, cost 100.00 at face value, rake rows unchanged 6 -> 6, prize pool
  +100.00; a rebuy in the same test still charged 10.00 and wrote its rake row
  6 -> 7.
* Function volatility, SECURITY DEFINER, search_path ('public','pg_temp'), the
  p_current_level DEFAULT and the authenticated/anon grants all unchanged.
  (The first apply failed with "cannot remove parameter defaults" -- caught
  before it could drop the default.)
* All payout structures in production sum to exactly 100 (10,797 checked), so
  normalisation is currently a no-op in both implementations.
* Reconciler still clean on the control (75.00 expected = 75.00 paid) and
  still detects the duplicate-finisher case after the change.
* fn_anon_exposure_check 0, treasury selftest healthy, tsc --noEmit clean.
* Migration files md5-match production for all three functions.

### Live proof the earlier fix works

At 17:18 another agent applied six migrations in quick succession, each
forcing a PostgREST schema-cache reload; the engine logged 268 errors in that
minute. The new guard fired 24 times ("remaining-player count unavailable --
skipping finish check this cycle") and NO tournament took the "All busted
simultaneously" branch. Under the old code those 24 unreadable counts would
each have read as zero and finished a live tournament, stranding its prize
money -- which is precisely how the 16:11 incident happened. The two
tournaments that did complete during the window reconciled clean
(6.00/6.00 and 80.00/80.00).
