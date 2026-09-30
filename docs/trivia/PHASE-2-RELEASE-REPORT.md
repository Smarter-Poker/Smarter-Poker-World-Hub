# Trivia Casino Realism — Phase 2 Release Report

**Phase:** 2 — Versioned Rules, Atomic Diamond Ledger, and Settlement Foundation
**Installed in production:** 2026-09-30, 04:32–04:35 UTC
**State:** installed and verified, dormant. No live caller was switched on, no flag was
enabled and no player's diamonds moved. The solo journal switch is OFF.

## What now exists

- **One versioned rules registry.** `src/lib/trivia/rules/index.mjs` is the single source.
  It holds 15 immutable versions: the 13 solo modes exactly as they run today (entry
  price, VIP/ticket/continuation rules, question count, timer, scoring, reward formula,
  daily cap, daily bonus, lifeline price, prize wheel, refund reference), PvP v1 from the
  competitive contract, and a provisional nightly tournament v1. The database seed is
  generated from the module (`scripts/trivia/rules-seed-sql.mjs`) and a test fails if they
  drift. Every new session, PvP match and tournament row is stamped with its rules
  version and hash automatically; historical rows stay blank.
- **A balanced Trivia journal linked to the platform wallet journal.** Accounts: player
  wallet, horse/promotional treasury, PvP escrow, tournament escrow, house rake/revenue,
  refund liability, platform issuance and a legacy suspense account. Journal headers and
  lines are append-only, every journal must balance to zero at commit, and each wallet
  line is exactly one `diamond_transactions` row written by the platform's own
  `add_diamonds_to_balance` / `deduct_diamonds` (same reference, amount and kind). There is
  no second balance: player balances still change only through the platform functions.
- **Atomic, idempotent money operations** for service code: hold, release, refund, debit,
  subsidy (horse seats), rake and payout; owner-only reversal, approved repair, treasury
  funding, switch, config and rules-pointer changes (each needs an approval record).
  Replays return the original result; a reused key with a different request is refused.
- **Treasury controls that fail closed:** floor, daily subsidy ceiling and open exposure
  ceiling. The treasury holds 0 today, so horse seats and treasury-funded prizes are
  refused until the owner funds it.
- **Settlement foundation:** one state machine (open → locked → settled / refunded /
  voided), one settlement record and idempotency key per match or tournament, and a
  settle call that takes rake, pays, refunds, closes escrow at exactly zero and records
  the terminal state in one transaction. Gross pool and final prize pool are stored
  separately from escrow. Participants carry entry, funding source, rake share, net
  contribution, payout/refund and the journal ids.
- **Reconciliation views** by account, transaction reference, settlement, match,
  tournament, user, treasury and date, and a ledger health check
  (`trivia_ledger_health_v1`) that the daily Trivia economy audit now also runs; any
  ledger exception makes the audit report unhealthy.
- **Solo paid paths behind a server-side switch.** Entry charges, run rewards, the daily
  bonus, the prize wheel and lifeline purchases now go through switch-aware wrappers.
  With the switch OFF (installed state) they make byte-identical platform calls; with it
  ON the same platform rows are written and journaled in the same transaction.
- **Legacy history explained.** All 514 historical trivia-family wallet rows (496 PvP,
  16 tournament, 2 solo) are linked to the journal against the legacy suspense account
  (balance −4,610), without touching any balance or historical row.

## Exit gate

| Gate item | Result | Evidence |
|---|---|---|
| Clean migration, seed, backfill and rollback rehearsal | Passed on a fresh replica copy and as a rolled-back production rehearsal (all postconditions, build fingerprints, pre-image checks, 514 rows linked, health clean) before install | `docs/trivia/evidence/phase2-ledger-install-20260930.json` |
| Randomized journals always balance to zero | 190 randomized settlements (160 PvP incl. horse seats, 30 tournaments), 699 journals: global sum 0, every journal balances, no drift, wallet legs equal balance movement | same file, `replica_tests.t03_property` |
| Forced mid-operation faults commit all or nothing | 20 of 20 fault points roll back completely; a clean retry settles once | `replica_tests.t04_faults` |
| Concurrent retries create exactly one result | 21 of 21 parallel races (duplicate keys, two tabs, two workers, sweeps) | `replica_tests.t05_races` |
| Every synthetic terminal match/tournament has zero escrow | 190 of 190 | `replica_tests.t03_property` |
| Reconciliation reports zero unexplained variance | Replica: 0 across all views. Production after install: 0 exceptions, 0 unexplained rows, 0 reference variance | `production.health_after_install` |

Also passed: solo shadow comparison (legacy path, switch OFF and switch ON produce
identical balances, wallet rows, Mint register, sessions, scores, wheel and item rows),
358 access-control probes as anon/authenticated/service_role, and the legacy backfill
checks. The repository test `__tests__/trivia-ledger-phase-2.test.mjs` keeps the rules
seed, legacy price/cap/count parity, money conservation and migration access rules honest.

## Installed migrations

| Version | Name |
|---|---|
| 20260930043221 | `trivia_p2_ledger_foundation` |
| 20260930043426 | `trivia_p2_solo_paths_switch` |
| 20260930043447 | `trivia_p2_legacy_backfill` |

Each migration asserts its own postconditions and ends with a build fingerprint, so an
install whose objects differ from the replica-tested build rolls back. Read-back after
install: 57 functions whose definitions hash identically to the replica build, 15 tables
with row-level security and no browser access, 8 read-only views, service role read-only
on every ledger table, the two deferred balance constraints, the three snapshot triggers,
switch OFF, health clean.

## Provisional economics (owner may change with a new rules version)

- **Nightly tournament v1:** 10-diamond entry, no VIP discount; 256-seat single
  elimination (expandable to 512) with 70–140 treasury-funded horses; 10% rake taken only
  on settled entries (minimum 1, none on refunds); no treasury overlay; prizes paid from
  the final prize pool — champion 32%, runner-up 20%, 3rd–4th 23% shared, 5th–8th 25%
  shared, remainder to the champion; horse prizes return to the treasury; cancellation
  refunds every stored entry exactly.
- **Treasury:** opening balance 0, floor 0, daily subsidy ceiling 3,000, open exposure
  ceiling 3,000, warning level 6,000.
- **Settlement time targets:** PvP 5 minutes, tournament 30 minutes.

## Pending, and why

- **Solo journal switch stays OFF** until the owner approves a canary run. Proposed
  canary: two internal test accounts chosen by root (not real players), each given a
  small balance through the normal admin path; run one paid solo entry, one lifeline, one
  reward, one daily bonus, one PvP hold-and-settle at the 10-diamond stake and one
  tournament hold-and-refund, all with `canary_` references; confirm health stays clean,
  then flip the switch.
- **Treasury funding** needs the owner. Proposal: 20,000 diamonds from platform issuance
  (the size of the existing monthly trivia-tournament budget line), recorded with an
  approval reference.
- **UI copy and Geeves/help content** do not read the rules module yet; that belongs to
  the phases that rebuild those surfaces. PvP and tournament engines (Phases 5 and 6) are
  built on this API and are not part of this release.

## Findings outside this phase (reported, not fixed)

1. The dormant tournament entry path credits its 10% cut to the house wallet without a
   matching Mint register row, which would open a register-versus-supply difference for
   every paid entry if that path were re-enabled.
2. The per-user daily earning cap for the Trivia engine (2,000/day) also counts PvP
   winnings, so a large PvP payout could be refused; Phase 5 should settle with
   refund-liability fallback or the cap needs an owner decision.
3. `/api/diamonds/spend` still accepts the `trivia_entry` source, a stray charge path
   that bypasses the session entry flow.
