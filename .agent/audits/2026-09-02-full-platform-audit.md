# Full platform audit — 2026-09-02

Run immediately after The Mint shipped (PR #1251, merged 18:34 UTC). Scope was
the whole estate: production Supabase, the World Hub repo, Club Arena, CI and
cron governance, and the API security surface.

Every figure below was read from live production or counted from source on
2026-09-02. Nothing here is estimated. Where a first pass and a closer look
disagreed, the closer look is recorded — that happened three times and is noted
each time, because two of them would otherwise have entered this file as false
findings.

A rendered version was delivered to Dan as `smarter-poker-systems-audit.html`.

---

## P0 — money owed to players right now

### 66 players finished in the money and their wallets received nothing

`fn_payout_guarantee_check` holds **66 unresolved critical alerts**. Summed from
the alert messages:

| | chips |
|---|---|
| owed | 1,176.50 |
| received | 339.71 |
| **shortfall** | **836.79** |

Oldest `2026-09-01 13:14 UTC`, newest `2026-09-02 05:13 UTC`. Representative
message:

> DSS Tuesday $100 Freeroll • 10 AM CT: the player who finished 2 is owed 20.00
> and their wallet received 0

This is the exact pattern CLAUDE.md §10.6 was written after. Under that section
it is an agent decision, not Dan's — it needs settling through
`fn_tournament_payout_reconcile` (idempotent, per-user prize keys), proven first
in a rolled-back transaction per §11.5, then each alert resolved with a note.

**Not actioned in this session.** The session's task was the audit, and a
settlement of this size deserves its own focused pass rather than being tacked
onto one. It is the highest-priority item on the platform.

### Six top-ups were refused by their own idempotency key

Six alerts carry `top_up_refused_by_idempotency`. The payout system attempted a
top-up, its own retry key reported the operation as already done, and the player
stayed unpaid.

This is a **code defect, not a data problem**: re-running reconciliation will not
clear it, because the key will refuse again. The key needs to incorporate the
amount or a correction sequence so a genuine second top-up for the same player
and place is a distinct operation rather than a replay.

---

## P1 — the alert system is burying its own signal

`financial_alerts`: **8,627 total, 985 unresolved.** Unresolved by age:

| bucket | count |
|---|---|
| today | 545 |
| 1–3 days | 266 |
| 3–7 days | 163 |
| older than 7 days | 12 |

### 185 alerts fire for behaviour that is working as designed

185 issues across the payout alerts are `overpaid`, totalling 4,490.69 chips.
Their own context says *"reported only; automatic clawback is deliberately not
done"* — which is §10.6 rule 3 being obeyed correctly. Nothing will ever action
them, so they accumulate as unresolved **critical** forever and bury the 66
genuinely unpaid players above.

Fix: have the reconciler auto-resolve overpay-only alerts on creation with a
resolution of `absorbed per 10.6 rule 3`. Keep the row and the audit trail; stop
calling it unresolved.

### Two chip checkers disagree and one of them is wrong

- `ledger_reconcile_log`: **1,033 critical `seat_stack_exit` rows in 3 days**,
  431,906 chips of drift, average 418 per row.
- `fn_unaccounted_seat_exits()`: **0**, across 36,320 seat exits in 7 days.

Both cannot be right. Either the reconciler compares incompatible things and a
thousand daily criticals are noise, or the checker is blind and chips are moving
unwatched. Trace one drifting exit end to end and fix whichever is wrong — the
disagreement makes both signals worthless.

### Club treasury reconciliation has no opening balance

Critical drift of 9,979,213.44 chips, with `ledger_balance = -7,504,220.16`
against `stored_balance = +2,474,993.28`. A negative derived balance means the
journal does not contain the chips that existed before the journal did.

The fix was started and abandoned: `ca_chip_baseline` holds 1,502 rows,
`ca_treasury_baseline` holds **3**. Backfill an opening-balance row per club and
have the reconciler start from it; the daily critical stops and subsequent drift
is real drift.

---

## P1 — security

Two routes are open in production right now.

### `pages/api/test-e2e-seed.js` — unauthenticated writes to the live engine

No auth, no rate limit, no environment guard. Reaches the same `GameController`
singleton production uses: creates a real table, seats players, starts a hand.
Returns `err.stack` to the caller on error.

Eight sibling seed and debug routes are already tombstoned to `410 Gone`. This
one was missed. Delete it or tombstone it alongside them.

### `gen-lobby-img.js:12` and `gen-lobby-bg.js:14` — hardcoded password

Both gate on a literal string comparison against a password committed in the repo
and repeated in each file's own doc comment. No rate limit, and each call fires a
real billed image-generation request.

Fix: env var compared with `crypto.timingSafeEqual` — the pattern already used
correctly in `venue-scraper/receive.js` — plus `applyRateLimit`.

### 43 routes bypass the PGRST retry added after the 2026-08-31 outage

`src/lib/supabaseServerClient` exists to verify JWTs locally and to retry
`PGRST001/002/003` pre-execution 503s. 43 files import raw
`@supabase/supabase-js` and lose both. Three move money on a schedule:

- `pages/api/cron/rakeback-period-settle.js:58`
- `pages/api/cron/vip-stipend.js:67`
- `pages/api/cron/vip-lapse.js:35`

Swap all 43, money crons first, then add a CI check so number 44 cannot land.

### Twelve admin debug routes gated only by `NODE_ENV`

A dozen files under `pages/api/admin/` open a service-role client behind a
copy-pasted production check returning 404. Not exploitable in the current build,
but one omitted line away, in front of routes that dump user emails and call
`auth.admin.listUsers()`.

### Verified clean — do not re-investigate

- **Zero** real `.single()` violations across 634 API files.
- All **13** routes with IDOR-shaped `userId` params already hardened, each with
  a dated fix comment.
- Stripe webhook is exemplary: mandatory signature verification, DB-backed event
  idempotency, throws rather than silently dropping a paid grant.
- **Correction.** An automated scan flagged 7 money-moving SECURITY DEFINER
  functions as ungated (`fn_agent_wallet_self_stake`,
  `fn_redeem_tournament_ticket`, `fn_ca_fund_overlay_on_lock`,
  `fn_leave_seat_and_refund`, `fn_cancel_tournament_ticket`,
  `claim_daily_challenge`, `claim_daily_challenges`). Reading each proved that
  wrong — all gate on `auth.uid()` and are self-scoped, and
  `fn_ca_fund_overlay_on_lock` is a trigger, not directly callable. Of 1,390
  SECURITY DEFINER functions, 577 are executable by `authenticated`, only 10 move
  money, and all 10 are correctly gated.

---

## P1 — guardrails with holes where the money laws live

### 18 laws are unregistered, and they are the payout ones

`tests/law-registry.law.test.ts:45` scans only `tests/`. It never looks under
`server/src/`, so 18 of the 25 law tests there are invisible to the registry that
exists to stop a law being silently contradicted or deleted. Unregistered
include `payoutExactness`, `EveryEarnerIsPaid`, `aGuaranteeIsAPromise`,
`aTournamentPayoutIsARecord` and `theReconcilerTrustsWhatItCanProve`.

The registry was built after the hamburger revert war. It currently cannot see
the laws that guard payouts. Widen the scan root, then backfill `docs/LAWS.md`.

### The branch-protection watchdog does not exist

CLAUDE.md §11.4 documents `branch-protection-watchdog.yml` as a daily 09:00 UTC
job and it is named on the CHECK 6c allowlist. **The file is not in
`.github/workflows/`.** Its logic survives in
`scripts/check-branch-protection.mjs`, but the only caller is `agent-push.sh`, a
script CLAUDE.md never sanctions.

Nothing watches for protection drift today. Restore the workflow, or add
`check-branch-protection.mjs --fix` to `vercel-uniqueness-check.yml`, which
already runs at 09:00 daily.

Related doc drift: `vercel-deploy-retry` is listed in §11.4 as a workflow file
but is actually a job inside `build-safety-gate.yml` with no `schedule:` trigger.

### CI runs 16 of 205 test files, and commerce is not among them

`build-safety-gate.yml` CHECK 8 runs a hardcoded list of 16. The npm scripts
`test:marketplace` and `test:store-phase-7` through `13` — **29 files covering
diamond store purchases, VIP subscriptions, club-shop atomic commerce and
Printful fulfilment** — appear in no workflow at all and can be red indefinitely
without blocking a deploy.

Separately, 15 of 32 cron handlers have zero tests, including
`rakeback-period-settle.js` (207 lines, pays agent commissions) and
`vip-stipend.js` (314 lines, pays diamonds daily).

### The TypeScript check cannot fail and has no ratchet

Advisory with `continue-on-error: true`, logging a warning regardless of error
count. Unlike `check-swallowed-money-errors.mjs` (baseline 171, blocks any
increase), nothing stops type errors accumulating. Give it the same ratchet
shape.

Also noted: duplicate CHECK numbers in `build-safety-gate.yml` — 16 and 18 are
each used twice. Both steps run, but it will confuse the next editor.

---

## P2 — scale and cost

Database is **110 GB**. Largest tables:

| table | size | note |
|---|---|---|
| `solved_spots_gold` | 80 GB | 73% of the entire database |
| `hand_state_snapshots` | 6.3 GB | |
| `hand_history` | 4.6 GB | pruned at 7d for horse-only hands |
| `ca_hand_player_idx` | 3.8 GB | |
| `data_audit_log` | 3.1 GB | |
| `rake_records` | 1.2 GB | |

`solved_spots_gold` is static solver reference data riding in the same instance
as the live transactional platform, inflating every backup and restore and
competing for the same cache. Moving it out takes the live platform to ~30 GB.

**819 Supabase advisories:** 575 SECURITY DEFINER functions executable by
`authenticated`, 195 tables RLS-enabled-with-no-policy (service-role-only by
design), 17 with mutable `search_path`, 1 ERROR (`spatial_ref_sys`, PostGIS's own
table, benign). The 17 mutable search paths are the ones worth acting on — that
is a real privilege-escalation shape inside a SECURITY DEFINER function.

---

## P2 — the health endpoint (a correction)

**First three probes returned `status: degraded`** with
`Database health check timed out` at exactly 3001ms. I nearly filed this as a
permanent production outage. Every one of those probes carried `uptime: 17s`.

Re-measured on a warm instance, six consecutive probes returned **`status: ok`**
with database latency 69–614ms. The database was never the problem: at the moment
of the failing probes it had 12 active connections, 81 total, zero lock waits.

The real finding is narrower: **the 3000ms deadline is not sized for the first
connection from a cold Node runtime.** It still matters, because
`publish-watchdog.yml` polls every 15 minutes — an interval long enough to land
on cold instances regularly and raise false alarms — and CLAUDE.md §1.5 makes
this endpoint the sole proof that a deploy landed.

Worth confirming while in there: with the anon key the same query returns
`42501 permission denied for table profiles`, so if `SUPABASE_SERVICE_ROLE_KEY`
ever fails to reach the route the fallback cannot succeed — it would degrade
silently rather than say why.

---

## P3 — maintainability

- `src/pages/TablePage.tsx` is **22,845 lines** — routing, ~30 realtime
  subscriptions and the UI for every table feature in one component. Highest-
  leverage refactor in the estate; extract subscriptions first.
- Five near-identical migrations redefine `fn_offer_open_seat` within 30 hours,
  and two files carry byte-identical `fn_club_union_join_blockers` bodies.
  Harmless (last write wins) but every future agent must read and rule out all
  five.
- `MIGRATION-CHANGELOG.md` received a new entry on 2026-09-01 despite being
  frozen precisely because concurrent appends to its last line were the single
  biggest source of merge conflict in the repo.

---

## Open decision for Dan

`fn_enforce_four_club_limit()` (migration
`20260827_four_club_limit_enforced_server_side.sql:57-63`) exempts horses from
the four-club membership cap, reasoning that production has 580 horses holding
2–3 memberships each.

Operationally necessary, but §10.5 says a horse *"IS SUBJECT TO every rule a
human is subject to — limits"*, and unlike hand-history retention and the deploy
drain gate, this exemption was never put to Dan. Either record it as a third
sanctioned exception in §10.5, or remove it. Right now it is an undocumented
carve-out inside a law that states there are none.

---

## Verified healthy — do not spend time re-checking these

- **The server-authoritative migration is genuinely complete.** Not taken on the
  changelog's word: grepping the client for `handControllerRef`,
  `HandController`, `runHand(` and `dealHand(` returns zero authoritative
  matches, and there is no client `src/engine/` directory. All 8 steps done; the
  473 dated changelog files since 2026-08-26 are feature work.
- **Horses are being treated as players.** 150+ `is_horse` references reviewed.
  The one real historical bug (`fn_offer_open_seat` skipping horses for open
  seats) is fixed, and the fixing migration ends with a `RAISE EXCEPTION` guard
  that fails any future migration reintroducing the pattern. The deploy drain
  gate has moved past `humansSeatedTotal` twice and now waits on
  `maintenance.readyForRestart`, which counts every player.
- **Engine crash and shutdown handling is mature.** `uncaughtException` and
  `unhandledRejection` both crash deliberately after logging the queued
  hand-history count. Shutdown races `drainHands(18000)` against a 30s timeout so
  SIGKILL grace is never hit. Every settlement step is individually caught and
  raises a `financial_alerts` row rather than aborting the rest. All 17
  `setInterval` calls have a paired `clearInterval`. Zero TODO/FIXME markers in
  either source tree.
- **Cron governance has zero drift.** 12 workflows carry a real `schedule:`
  trigger and all 12 are on the §11.4 allowlist. The Open Claw dispatcher
  registers 92 jobs with no duplicate ids, no dead handlers and no orphaned
  schedules. `vercel.json` at 17 of its 40 cap; `pages/api/cron/` at 32 of 45.
  **Correction:** an initial pass suspected several dispatcher paths had no
  handler; tracing all three routing layers (60 to the workers service, 5 script
  jobs, 16 to the monolith) showed all 16 monolith paths have a matching file.
- **No chips escaping the felt.** `fn_unaccounted_seat_exits()` returns 0 across
  36,320 seat exits in 7 days, with 1 ledger write failure in the same window.
- **Diamonds now agree.** After today's Mint migration the four diamond stores
  that disagreed by ~800,000 are reconciled: 0 mismatches across all 1,308
  profiles.

---

## Suggested order

1. Pay the 66 owed players (836.79 chips, ~30h old)
2. Close `test-e2e-seed.js` and the two hardcoded-password routes
3. Fix the idempotency-refused top-ups
4. Auto-resolve overpay alerts (185 of 985 disappear)
5. Widen the law registry scan root
6. Restore the branch-protection watchdog
7. Settle which chip checker is right
8. Wire the commerce test suites into CI
9. Backfill `ca_treasury_baseline`
10. Swap the 43 raw Supabase imports, money crons first
11. Widen the health-check deadline for cold starts
12. Move `solved_spots_gold` out of the live database
13. Rule on the horse four-club exemption
