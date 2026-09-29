# Phase 7 contracts - Economy and finance reporting

Binding for every agent building Phase 7. The Phase 1 to Phase 6 contracts
still apply in full.

Phase 7 is E1 to E10 of the ten-phase Stable Admin program: chip supply and
velocity, mint and burn, treasury by club, conservation and drift, the
burn-in gate, rake law oversight, rakeback and leaderboard payout oversight,
the Bad Beat Jackpot, promotions and bonus-abuse analysis, the daily close,
the weekly digest, per-club profit and loss, and regulatory-style exports. It
is the first phase whose subject matter ALREADY EXISTS, ALREADY RUNS ON A
SCHEDULE, AND IS ALREADY WRONG IN PLACES WHERE NOBODY IS LOOKING.

So the governing question of this phase is not "what should we build". It is
"which of these figures is safe to put in front of an operator, and what has
to be said beside the ones that are not". Phase 6 asked what already decides
a thing. Phase 7 asks what already MEASURES a thing, and then asks the harder
second question: whether the measurement is true.

Everything below was measured against production and against commit
`8b760a501dde201b87a891d26f6891262254ea1c` on 2026-09-23. Appendix A records
the measurements so a future agent can tell what has drifted. Where a thing
was NOT measured, it says so rather than asserting.

## 0. The safety rule that outranks everything here

**A FINANCIAL FIGURE MAY NEVER BE PRESENTED AS SETTLED, RECONCILED OR
DELIVERED WHEN IT IS NOT.**

Phase 1's rule was that a number the console cannot compute is reported as
unknown and never invented: `docs/horses/PHASE1-CONTRACTS.md` addendum item 15
requires `total: null` where the source supplies no count, "never a fabricated
number". Phase 2's was that nothing may lock an operator out or block a move
that works today until Dan turns it on. Phase 3's was that the fleet keeps
running exactly as it does today until a policy row says otherwise, and no
control reaches inside a hand. Phase 4's was that nothing takes a player's
access away until enforcement is on, and that what an operator is told must
match what the platform will actually do. Phase 5's was that an integrity
surface may never imply it is watching something it is not watching. Phase
6's was that a floor control may never claim an authority it does not hold.

Phase 7's is the same failure applied to a NUMBER. A balance labelled
reconciled when no reconciliation agreed, a close labelled closed when only a
hash manifest ran, a digest labelled delivered when the only evidence is that
a notification row was written, a supply total labelled current when the meter
behind it is eighteen hours old: each of these is worse than showing nothing,
because the operator who reads it stops looking. A blank panel gets
investigated. A green panel does not.

This is not hypothetical. It is what the measurement found. On 2026-09-23 the
platform's headline nightly reconciliation reported ten rows out of ten `ok`
while carrying a maximum absolute drift of 84,156,151.15 chips, and chip
conservation reported `balanced = false` with an unexplained residue of
4,222.95 chips and no operator surface anywhere that shows it. See section 2.

Six consequences this phase is built around:

1. **RECONCILED MEANS RECONCILED.** A figure carries the word only when a
   named reconciliation ran, completed, and AGREED. `reconcile_ledger_nightly()`
   inserts its `chip_circulation` rows into `ledger_reconcile_log` with a
   hardcoded `'ok'` severity, so `severity` from that source is not evidence of
   agreement and Phase 7 renders it as what it is: a label the writer chose,
   not a comparison the writer made.

2. **BALANCED IS COMPUTED ON THE PAGE, FROM BOTH NUMBERS, AND SHOWS BOTH.**
   `fn_ca_mint_register_vs_supply()` returns `register_net_at_meter`,
   `meter_total`, `difference` and `unexplained_since_baseline` and does NOT
   return a verdict. The verdict `balanced = (difference =
   unexplained_since_baseline)` is the console's arithmetic, it is currently
   FALSE, and every surface that states it also states the four inputs. No
   Phase 7 panel reports a boolean without the operands beside it.

3. **UNKNOWN, STALE, EMPTY-CLEAN AND NEVER-RUN ARE FOUR DIFFERENT SENTENCES.**
   Phase 5 established this for detectors. Phase 7 inherits it for money.
   `abuse_logs` holding zero rows because detectors ran and found nothing is
   not the same sentence as `abuse_logs` holding zero rows because nothing ever
   ran, and `financial_health_checks` holding 1,049 rows last written on
   2026-08-05 is a third sentence again: a dead table that still reads as a
   record. No Phase 7 surface collapses these into a green tick or a zero.

4. **HORSES ARE PLAYERS (CLAUDE.md 10.5).** Every supply figure, rake report,
   rakeback period, jackpot pool, profit and loss line and export counts horses
   exactly as it counts humans. The three `p_include_horses boolean DEFAULT
   true` parameters found in `fn_union_rake_paid_live`,
   `fn_union_rake_paid_readonly` and `fn_union_tournament_rake_by_club` are
   DISCLOSURE AND GROUPING toggles, they default to inclusion, every repository
   caller passes `true`, and they stay exactly as they are. No Phase 7 query
   excludes or down-ranks a horse on identity grounds. Horses are never called
   bots, they run deterministic HorseLogic, never a language model, and no
   surface in this phase offers an "AI Model" control.

5. **MONEY STAYS WHERE THE MONEY ALREADY IS.** Phase 7 is a REPORTING phase.
   It adds no new money path, no new issuance route, no payout button and no
   correction apply. Every chip figure it shows is read from the authoritative
   money functions and the ledger that already own it. A `202 pending approval`
   is not a completed action, and a score is never a verdict. Reads write no
   audit rows; every write files one with the actor, the request id and the
   real outcome.

6. **OPEN CLAW IS THE SCHEDULER.** Scheduled application work belongs to Open
   Claw, never to the Claude scheduler. No watcher, cron or repair loop in this
   phase supplies correctness to a surface or certifies a release. This matters
   more here than anywhere: Phase 7's entire subject is the output of scheduled
   jobs, and a report that is only true immediately after a job runs is a
   report that is wrong for the rest of the day. Every panel carries the age of
   the thing it is reporting, and a stale panel says so.

## 1. What Phase 7 covers, and what it does not

The brief named fourteen items. They are grouped into ten scopes, plus one
scope the brief did not name and section 2.3 forces.

| Briefed item | Scope |
| --- | --- |
| Chip supply by store | E1 |
| Velocity | E1 |
| Mint and burn | E2 |
| Treasury by club | E3 |
| Conservation and drift | E4 |
| Burn-in summary | E4 |
| Rakeback oversight | E6 |
| Leaderboard payout oversight | E6 |
| Bad Beat Jackpot pools and payouts | E7 |
| Promotions and bonus-abuse analysis | E8 |
| Daily close | E9 |
| Weekly digest | E9 |
| Per-club profit and loss | E9 |
| Regulatory-style exports | E10 |
| (not briefed) Rake law oversight and auditability | **E5** |

Four merges and one addition, each for a measured reason. Supply and velocity
share one source and one staleness problem, so they are one scope (E1).
Conservation and the burn-in gate are merged because the gate's three failing
checks are drift checks and reporting them apart would let an operator read
the conservation card green while the gate says do not restart (E4). The daily
close, the weekly digest and per-club profit and loss are merged because they
are one subject, THE PERIODIC FINANCIAL RECORD, and all three fail the same
way: each produces something transient and none produces a durable row an
auditor could later read (E9). E5 is added because section 2.3 found that the
rake law is correctly implemented and structurally unauditable after the fact,
and every payout scope downstream of it, E6 and E7, inherits that defect; a
contract that grouped rake oversight under rakeback would bury it.

| Scope | Verdict | One line |
| --- | --- | --- |
| E1 Chip supply and velocity | **Ships as wiring** | The meter exists, nothing reads it, and the obvious function is the wrong one. |
| E2 Mint, burn and the issuance register | **Ships READ-ONLY** | Issuance already has a console; Phase 7 adds oversight, not a second mint button. |
| E3 Treasury by club | **Ships as wiring** | `fn_ca_treasury_positions()` is correct, agrees exactly, and has never been called from the console. |
| E4 Conservation, drift and the burn-in gate | **Ships, and ships RED** | Conservation is failing today and the burn-in gate says do not restart. |
| E5 Rake law oversight and auditability | **Ships READ plus one additive migration** | The auditor runs hourly, finds 1,180 criticals, and no surface shows one. |
| E6 Rakeback and leaderboard payout oversight | **Ships READ-ONLY, NARROWED** | Automatic payers, no maker-checker, and the record tables are mutable. |
| E7 Bad Beat Jackpot pools and payouts | **Ships READ-ONLY** | Payouts are fully automatic and the payout tables are UPDATE-open. |
| E8 Promotions and bonus-abuse analysis | **Ships NARROWED on empty detectors** | `abuse_logs` and `signup_abuse_log` both hold zero rows. |
| E9 Daily close, weekly digest, per-club P and L | **Ships PARTLY, DEFERRED on schema** | There is no financial close, no durable digest and no durable P and L. |
| E10 Regulatory-style exports | **DEFERRED on schema** | No export job record, no audit identity, and truncation lands silently on disk. |

**What Phase 7 does NOT cover.** It does not issue, retire, pay, refund,
correct, settle or reverse anything. It does not call any function in its
applying form. It does not touch Club Arena's club-facing cashier, the union
settlement path, or the engine. It does not build a second rake engine, a
second payout engine or a second reconciliation. It does not turn approvals
on; that remains Dan's switch, exactly as Phase 2 built it.

**What Phase 7 adds that does not exist today**, and this is the whole build
list, five items long: a durable weekly-digest run record, a per-club profit
and loss that survives its own request, an export job record carrying an audit
identity, an operator-signed daily close distinct from the journal manifest,
and the two rake auditability columns. Everything else in this phase is
WIRING: reading a function that already runs and rendering what it returns.

## 2. What the measurement found, and why it reshapes the phase

Three findings changed the shape of this contract. They are stated here rather
than buried in the per-scope sections because each one invalidates an
assumption the phase brief could reasonably have made.

### 2.1 The console cannot see the machinery it already owns

The brief reads as though Phase 7 must build an economy console. Measured:
**most of it is already built, already scheduled, and simply not wired to a
screen.**

`ca_supply_snapshots` holds 559 rows spanning 2026-08-31 to 2026-09-23 and a
latest total of 192,764,749.68 chips across 25 declared stores.
`fn_ca_treasury_positions()` compares every club's stored treasury against the
ledger and returns `ok` for all four. `fn_ca_drift_metrics()` counts 52 open
incidents of which 44 are critical. `fn_ca_midway_burnin_gate(24)` runs twelve
checks. `fn_ca_mint_register_vs_supply()` compares the issuance register
against the supply meter. `fn_rake_law_check(interval)` runs hourly under
pg_cron job `rake-law-adherence-hourly` at `40 * * * *` and writes its findings
to `ledger_reconcile_log` with `entity_type = 'rake_law'`.

None of these is called from the operator console, with one exception noted
below. `fn_ca_treasury_positions()` has zero console callers.
`fn_rake_law_violations` has zero references anywhere in `pages/`, `src/` or
`lib/`. The burn-in gate has no surface at all.

What the console does have is a tab labelled "Economy" that is not about
chips. `pages/horses/index.js:4507` opens the Economy tab and immediately
renders `<h2>Diamond Economy</h2>`; the tab calls `/api/horses/economy-stats`,
which reads diamonds, VIP and `profiles` and touches ZERO chip tables and ZERO
chip RPCs. An operator who opens the tab named Economy to check the chip
economy is looking at a different currency.

The one real chip surface is "The Mint" at `pages/horses/index.js:4718`, and
it does carry the conservation card at `pages/horses/index.js:4744-4793`. That
card is correct and it is currently RED: it renders "The Register And The
Meter Disagree", which is the true state. It is also the only place in the
entire console where that sentence appears, it lives in an eight-thousand-line
page, and it is gated behind a tab an operator opens to mint chips rather than
to audit them.

Both tabs are registered `legacy: true` and inline at
`src/components/horses/tabRegistry.js:80-81`, both gated `money.read`. There is
no `EconomyPanel.jsx` and no `MintPanel.jsx`. Phase 5 shipped `IntegrityPanel.jsx`
as an extracted, code-split panel and that is the pattern Phase 7 follows.

So the shape of this phase is a WIRING JOB. That is not a smaller job than
building, and it is a more dangerous one, because wiring an existing function
to a screen means inheriting whatever that function believes. Section 2.2 is
what happens when a phase inherits without checking.

One inheritance is explicitly forbidden. **`fn_ca_circulation_total()` returns
222,887,573.15 and is WRONG for supply reporting.** It sums
`table_seats.stack WHERE left_at IS NULL` across every table including
tournament tables, where 3,260 seats carry 50,140,500.00 in tournament chips
that are not platform currency, against 189 non-tournament seats carrying
50,886.91; and it ignores the `is_platform` club filter entirely. It is off
from the meter by roughly thirty million chips. It is the function whose name
most invites use and it is the one Phase 7 must never call. Every supply figure
in this phase comes from `ca_supply_snapshots`.

### 2.2 Two financial surfaces are actively lying

Not stale, not approximate. Reporting a state that is not the state.

**The nightly reconciliation.** `reconcile_ledger_nightly()` writes to
`ledger_reconcile_log`, which now holds 59,274 rows. Its `drift` column is
GENERATED ALWAYS AS `(stored_balance - ledger_balance)`, so the table's whole
design assumes those two columns hold the same quantity measured two ways.
For `club_treasury`, `frozen_wallets_pool` and `insurance_bank` rows that is
exactly what they hold, and the drift is 0.00 every time.

For `chip_circulation` rows it is not. The function puts chips-on-the-felt in
`ledger_balance` and total club chips in `stored_balance`, which are two
DIFFERENT quantities, so the generated `drift` is a composition breakdown that
the schema then presents as a variance. And the function inserts those rows
with a hardcoded `'ok'` severity, so nothing downstream ever disagrees with
them. Re-verified on 2026-09-23 for this contract:

| `entity_type` | `severity` | Rows | Max abs `drift` |
| --- | --- | ---: | ---: |
| `chip_circulation` | `ok` | 4 | 84,156,151.15 |
| `club_treasury` | `ok` | 4 | 0.00 |
| `frozen_wallets_pool` | `ok` | 1 | 0.00 |
| `insurance_bank` | `ok` | 1 | 0.00 |

Ten rows out of ten `ok`, and the job's own summary reports `worst_drift:
84,166,606.77` alongside `"ok": true` in the same object. A panel that renders
`severity` from this table renders a green tick over an eighty-four million
chip number, and the operator stops looking. **Phase 7 must not render
`chip_circulation` severity at all.** It renders the two operands under their
true names, states that they are a composition and not a variance, and treats
the hardcoded `ok` as an artefact to be disclosed rather than a result to be
shown. The reconciliation that DOES work, `club_profit_reconcile_log` under
pg_cron job 273 at `35 0 * * *`, holds 3,851 rows of which 1,495 are applied
and records exactly what it corrected; that is the shape a trustworthy
reconciliation has, and E4 renders it beside the other one so the contrast is
visible.

**Conservation.** `fn_ca_mint_register_vs_supply()`, re-read on 2026-09-23 for
this contract, returns `register_net_at_meter` 192,758,945.84, `meter_total`
192,764,749.68, `difference` 5,803.84 and `unexplained_since_baseline`
1,580.89. The verdict `balanced = (difference = unexplained_since_baseline)`
is therefore **FALSE**, with an unexplained residue of **4,222.95 chips**.
Diamonds pass exactly, with a difference of 0.

Something put chips into a balance without a register row, or took them out.
`chip_ledger` is append-only through `trg_ca_append_only` calling
`fn_ca_journal_append_only()`, it carries a `chain_seq` hash chain with zero
breaks in 50,000 rows checked, and `ab_ca_chip_store_declared` calling
`fn_ca_chip_store_declared()` blocks any insert naming an undeclared store, so
the journal legs cannot be the source. The writer is somewhere else, and
appendix B names the candidates. The residue has been non-zero since before
this contract was written and NOBODY IS WATCHING IT, because the only surface
that states it is the Mint tab's card.

There is a third fact that makes both of the above worse.
**`ca_supply_snapshots` has NO TRIGGERS.** It is freely mutable: no
append-only guard, no hash chain, no store-declaration check. `chip_ledger`
and `ca_mint_ledger` are tamper-evident and this table is not, so the meter
that every supply figure in this phase depends on carries strictly weaker
evidence than the register it is compared against. Phase 7 states that on the
surface rather than treating the two sources as equals, and appendix B carries
the question of whether the meter should be guarded.

### 2.3 The rake law is right, and unauditable after the fact

The rake law itself is CORRECT. `ca_rake_rules` holds one row, id 1, with
`heads_up_cap_factor` 0.5, `short_handed_cap_factor` 0.75,
`short_handed_max_players` 3, `short_handed_min_seats` 9,
`bbj_min_players_dealt` 3, `heads_up_percent` 5, `max_rake_percent` 10,
`max_rake_cap_bb` 10 and `no_flop_no_drop` true. `fn_rake_cap_for_dealt` and
`fn_effective_rake` apply it. All three of the owner's stated rules match what
the database does. That is a good result and it should be said plainly before
anything else.

The auditor is real too. `fn_rake_law_check(interval)` calls
`fn_rake_law_violations` and writes to `ledger_reconcile_log` with
`entity_type = 'rake_law'`, under pg_cron `rake-law-adherence-hourly`
(`40 * * * *`) and `rake-law-wide-daily` (`50 7 * * *`). Re-counted on
2026-09-23: **1,180 critical findings** and 61 non-critical, the criticals all
`under_spec` between 2026-09-15 and 2026-09-17, the warnings all
`board_not_recorded`, and **zero `over_spec`**. Nobody has ever been
overcharged. That is the right direction for the error to point.

The problem is that none of it can be re-derived later.

`rake_records` holds 3,306,470 rows, one per hand, and records `rake_amount`,
`bbj_contribution`, `pot_size`, `num_players`, `rake_method`,
`player_contributions` and `is_tournament`. It does NOT record the number of
SEATS at the table, and it does NOT record the max rake cap that was in force
when the hand was raked. `num_players` is dealt players, not table size, and
it is complete: zero NULLs across 503,306 rows over seven days.

So `fn_rake_law_violations` reads `tables.max_players` LIVE and recomputes the
cap from six mutable inputs. Change one table from 9-max to 6-max and every
historical three-handed hand at that table flips its verdict, retroactively,
with nothing in the record to say the verdict changed or why. `ca_rake_rules`
has no history table either, so amending the law rewrites the past as well as
the future. **A rake audit whose answer depends on today's table configuration
is not an audit.**

There is a second-order effect in the same place. `fn_effective_rake` sets
`v_short_ok := p_seats IS NULL OR p_seats <= 0 OR p_seats >= short_handed_min_seats`,
so when the table size is UNKNOWN the function grants the 75 per cent
short-handed discount rather than charging full rake. That is a deliberate
fail-open toward the player and it is the right default. It is also a second
reason seats must be recorded: an unknown seat count silently becomes a
discount, and today nothing distinguishes a hand that was discounted because
the table was genuinely short from a hand that was discounted because nobody
knew.

The engine side compounds it. `src/lib/poker-engine/LobbyManager.js:781` reads
`const rakeAmount = data.rake || 0;` and accepts the engine's computed rake on
trust, and `atomic_distribute_rake` has NO `p_seats` parameter, so the seat
count is not merely unrecorded, there is no channel through which it could
arrive. And the repository disagrees with the database about the jackpot:
`src/lib/poker-engine/RakeConfig.js:190` sets `minPlayersDealt: 4` while
`ca_rake_rules.bbj_min_players_dealt` is 3, so `calculateBBJFee` returns zero
BBJ contribution at three players where the database law says it should
contribute.

**Phase 7's response is narrow and additive.** It does not change the rake
law, does not change the engine, does not backfill, and does not fix the
RakeConfig disagreement, which is engine work with its own blast radius. It
adds two nullable columns to `rake_records` so that from the migration forward
the seat count and the cap in force travel WITH the hand, it renders every
verdict with an explicit `derived_live` or `derived_from_record` marker so an
operator can see which findings are stable, and it surfaces the RakeConfig
disagreement as a named open finding rather than silently correcting it. Rows
written before the migration render `rakelaw.verdict_unstable` and say why.

## 3. The scopes

Each scope below states the boundary as briefed, a verdict, the authority that
already exists with a file, line or function name that was actually read, what
is missing, what ships, the class of every control, the permission and
approval rule, the engine dependency, the write behaviour, the named states,
the acceptance criteria and the tests.

Throughout, `PERMISSIONS` values are the exact strings from
`src/lib/horses/permissions.js:32-57`, and approval `kind` values are the
exact strings from `APPROVAL_KINDS` in `src/lib/horses/approvals.js:66-73`.
Control classes are LINK, EMBED, READ and AUTHORITATIVE WRITE, as Phase 6
defined them. Mobile acceptance is stated at 375px in every scope because
every scope has a surface.

### 3.1 E1 Chip supply and velocity

**Scope as briefed.** Chip supply broken down by store, with the store
registry and its coverage, plus a velocity measure: how many chips move, how
often, over an operator-chosen window.

**Verdict: ships as WIRING, read-only, with a staleness disclosure that is
part of the contract and not a decoration.**

**Existing authority.** `ca_chip_store_coverage` holds 25 rows and is the
authoritative store registry: 16 `counted`, 4 `noncirculating`, 5
`uncounted`. The trigger `ab_ca_chip_store_declared` calling
`fn_ca_chip_store_declared()` blocks an INSERT into `chip_ledger` that names
an undeclared store, which is what makes the registry authoritative rather
than documentary. `fn_ca_chip_store_coverage_gaps()` returns zero gaps today.
`ca_supply_snapshots` holds 559 rows from 2026-08-31 to 2026-09-23, latest
total 192,764,749.68 chips on basis `pending-addon-v4`, broken down in
appendix A.1. `chip_ledger` holds 5,572,013 rows, is append-only through
`trg_ca_append_only` calling `fn_ca_journal_append_only()`, carries the
`chain_seq` hash chain with zero breaks in 50,000 rows checked, and is indexed
for time-window reads by `idx_chip_ledger_created_at`. `chip_transactions`
holds 829,517 rows and is append-only as well.

**What does not exist.** There is no operator velocity measure of any kind: no
function, no view, no route, no panel. The numbers exist only because they
were computed for this contract, directly against `chip_ledger`: 24 hours is
362,036 rows moving 4,024,425.34 chips, 7 days is 1,543,683 rows moving
17,515,040.18 chips. There is also no console surface for the store registry
or the coverage gap check, and no surface for the supply meter itself.

**What ships in Phase 7.** A supply section that reads the LATEST
`ca_supply_snapshots` row, renders the per-store breakdown against
`ca_chip_store_coverage` with each store's coverage class shown, renders the
snapshot's age in minutes and its `basis` string, and renders
`fn_ca_chip_store_coverage_gaps()` as a count with its rows. A velocity
section that aggregates `chip_ledger` over an operator-chosen window of 24
hours, 7 days or 30 days, returning row count and absolute chips moved, using
`idx_chip_ledger_created_at`, with a hard row cap and the Phase 1 `truncated`
flag. A trend line over `ca_supply_snapshots` for the window the snapshots
actually cover, which is 23 days and not 188, and which the surface states.

**`fn_ca_circulation_total()` IS FORBIDDEN IN THIS SCOPE AND IN EVERY OTHER
SCOPE OF THIS PHASE.** Section 2.1 records why: 222,887,573.15 against a meter
of 192,764,749.68, because it counts tournament chips and ignores
`is_platform`. A law test asserts the string does not appear in any Phase 7
source file.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Supply total and per-store breakdown | READ | `ca_supply_snapshots` latest row |
| Store registry with coverage class | READ | `ca_chip_store_coverage` |
| Coverage gap check | READ | `fn_ca_chip_store_coverage_gaps()` |
| Supply trend over the snapshot window | READ | `ca_supply_snapshots` |
| Velocity by window | READ | `chip_ledger` aggregate over `idx_chip_ledger_created_at` |
| Circulation total | **NOT SHIPPED** | `fn_ca_circulation_total()` is wrong. See section 2.1. |
| Take or force a snapshot | **NOT SHIPPED** | Snapshotting is scheduled work and is Open Claw's. |

**Permission and maker-checker.** Every control requires `money.read`. There
are no writes in E1, so no approval kind applies, `none` is the entry in the
matrix, and no E1 request writes an audit row. `money.read` is deliberately
absent from `READ_FLOOR` at `src/lib/horses/permissions.js:80`, so the
`support` role cannot open this surface and that is intended, not a defect to
be helpfully fixed.

**Engine dependency.** None. E1 reads the database only. It does not call the
engine, does not ask the engine for a chip count, and does not reconcile
against one. Where a store is `uncounted` in the registry, the surface says
`uncounted` and never substitutes an engine figure or a zero.

**Rollback, retry, idempotency, audit.** Not applicable: E1 performs no
writes. That is itself a test assertion rather than a note. The velocity
aggregate is a read with a statement timeout and a row cap; a timeout renders
`velocity.window_unavailable`, never a partial sum presented as a total.

**States.** `supply.idle` before any read, `supply.ready`, `supply.stale` when
the latest snapshot is older than its configured window, `supply.unbalanced`
when the conservation verdict from E4 is false and the supply figure is
therefore known to be unreconciled, `supply.gap_uncovered` when
`fn_ca_chip_store_coverage_gaps()` returns rows, `supply.unknown` when the
snapshot table could not be read. For velocity: `velocity.ready`,
`velocity.window_unavailable`, `velocity.truncated`. `supply.stale` and
`supply.unknown` are never collapsed, and neither is ever rendered as a zero.

**Acceptance criteria.** At 375px the supply total is one line, the per-store
breakdown is a single column of rows each carrying store, amount and coverage
class, and there is no horizontal scroll; the snapshot age and basis sit above
the total, not below it, because an operator who scrolls past the age has
already believed the number. Desktop is a separate intentional presentation: a
dense store table with the trend chart beside it, not the mobile column
widened. Both: amounts render through the `money2dp` path in
`src/lib/horses/validate.js` and never as a float. The word "current" does not
appear next to any supply figure; the age does.

**Tests before implementation.** A law test that `fn_ca_circulation_total`
appears in no Phase 7 source file. A test that the supply figure is read from
`ca_supply_snapshots` and from nowhere else. A test that a snapshot older than
the staleness window renders `supply.stale` with the age, not `supply.ready`.
A test that an unreadable snapshot table renders `supply.unknown` and not
zero. A test that every store in the response carries its coverage class and
that `uncounted` stores are visible rather than filtered out. A test that the
velocity window is bounded and that an exceeded cap sets `truncated`. A copy
test: no E1 string contains an em dash, an emoji, "bot" or "AI".

**Production verification to close this scope.** The supply panel rendered in
a browser at 375px and at desktop against production, with the per-store
breakdown compared by hand against the latest `ca_supply_snapshots` row and
the total matching to the cent, and with the snapshot age visibly counting up
between two loads. Read-only, so no rollback and no simulation is required.

### 3.2 E2 Mint, burn and the issuance register

**Scope as briefed.** Mint and burn oversight: what has been issued and
retired, by whom, under what authority, and whether the register agrees with
itself.

**Verdict: ships READ-ONLY. The console already has a mint button and Phase 7
does not build a second one.**

**Existing authority.** `fn_ca_mint` and `fn_ca_burn` are both VOLATILE,
SECURITY DEFINER and granted to `service_role` only, and both are idempotent
under a caller-supplied `op_id`. `ca_mint_ledger` holds 349,527 rows as
measured and 349,994 when re-counted while this contract was being written, is
append-only through `trg_ca_mint_register_append_only`, and carries a unique
constraint on `op_id`. The existing operator surface is the Mint tab at
`pages/horses/index.js:4718`, served by `pages/api/horses/mint.js`, gated
`money.read` at `src/components/horses/tabRegistry.js:81`, with approval kinds
`mint` and `burn` both measured against `mintThreshold` per
`src/lib/horses/approvals.js:80-87`.

**What does not exist.** No oversight view over the register itself: no
issuance-by-class breakdown, no issuance-by-destination breakdown, no
issuance-over-time series, and no surface that answers "what was issued
yesterday and who authorised it". And the authorisation record is empty:
`admin_audit_log` holds 17 rows in total with **zero mint actions**, and
`ca_operator_approvals` holds **zero rows**, because `ca_operator_policy` has
`approvals_enabled = false` and all three thresholds at 0. **Approvals have
never run for money on this platform.** Every mint that produced those 349,994
register rows was auto-approved by design, which is Phase 2's deliberate
default and not a defect, but it means the register is the ONLY record of
issuance and the audit log is not a second one.

There is a worse gap. **`fn_mint_chips_from_diamonds` is SECURITY DEFINER and
executable by `authenticated`**, and it is a chip issuance path that does not
go through the `service_role`-only `fn_ca_mint`. It is one of 58
authenticated-executable money-named functions out of 334 total; zero are
anon-executable and zero carry a default PUBLIC EXECUTE, so the surface is
narrower than it could be, but 58 is not zero. The others flagged by the
measurement are `fn_admin_remove_player_chips` (SECURITY DEFINER),
`fn_cashier_batch_transfer`, `fn_wallet_type_transfer`, `fn_cashout_approve`
and `fn_cashout_release` (not SECURITY DEFINER, relying on RLS), the credit
facility functions, and `fn_ca_drift_metrics`, which leaks the platform's
drift posture to any authenticated caller with no admin gate at all.

**What ships in Phase 7.** A register oversight section: issuance and
retirement by class, by destination type and by day over a bounded window,
read from `ca_mint_ledger`; the `op_id` uniqueness and append-only guarantees
stated on the surface as facts about the source rather than as a result; the
count of mint actions in `admin_audit_log`, which is zero, rendered as
`mint.no_audit_trail` with the sentence that approvals have never been
enabled, NOT as a clean bill of health; and a named list of the issuance paths
that bypass `fn_ca_mint`, currently `fn_mint_chips_from_diamonds`, rendered as
an open finding with its grant.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Issuance and retirement by class, destination, day | READ | `ca_mint_ledger` |
| Register integrity facts (append-only, unique `op_id`) | READ | `pg_trigger`, `pg_constraint` |
| Approval and audit coverage of issuance | READ | `ca_operator_approvals`, `admin_audit_log` |
| Unregistered issuance paths | READ | `pg_proc` plus grants, rendered as findings |
| Mint or burn chips | **LINK** | The existing Mint tab and `pages/api/horses/mint.js` |
| Revoke a grant, alter a function | **NOT SHIPPED** | Phase 7 writes no DDL and changes no grant. |

**Permission and maker-checker.** Every E2 control requires `money.read`. E2
performs no writes, so the approval column is `none` and no audit row is
written. The LINK to the existing mint surface carries that surface's own
rules unchanged: `money.write` plus approval kind `mint` or `burn` against
`mintThreshold`. Phase 7 does not alter those rules and does not turn
approvals on.

**Engine dependency.** None. The engine neither mints nor burns; issuance is
`service_role` work inside the database.

**Rollback, retry, idempotency, audit.** E2 performs no writes. A law test
asserts that no Phase 7 source file references `fn_ca_mint`, `fn_ca_burn`,
`fn_mint_club_chips` or `fn_mint_chips_from_diamonds` as a CALL rather than as
a name in a finding list. Read calls write no audit rows.

**States.** `mint.ready`, `mint.register_diverged` when E4's conservation
verdict is false and the register is therefore known not to reconcile with the
meter, `mint.no_audit_trail` when `admin_audit_log` holds zero mint actions,
`mint.unregistered_path_present` when a known issuance path outside
`fn_ca_mint` is executable by a non-service role, `mint.unknown` when the
register could not be read. `mint.no_audit_trail` is NOT a green state and is
never rendered as one.

**Acceptance criteria.** At 375px the register summary is a single column: one
issuance card per class with its total and count, the audit-coverage sentence
above them, no horizontal scroll. Desktop gets a dense register table with the
by-day series beside it. Both: the sentence "Approvals Have Never Been
Enabled For Money On This Platform" appears in full whenever
`ca_operator_approvals` is empty, in Title Case, with no em dash. No figure in
this scope is labelled verified, reconciled or audited.

**Tests before implementation.** A test that E2 calls no money-moving
function. A test that an empty `ca_operator_approvals` produces
`mint.no_audit_trail` and the full disclosure sentence, not a zero badge. A
test that the unregistered-path finding lists `fn_mint_chips_from_diamonds`
while that grant exists and disappears when it does not, rather than being a
hardcoded string. A test that `money.read` is required and that a `support`
operator receives 403 `permission_denied`. A copy test for em dashes and
emoji.

**Production verification to close this scope.** The register oversight
rendered at both widths against production, the by-class totals summing to the
register net that `fn_ca_mint_register_vs_supply()` reports, and the
audit-coverage sentence visible with `admin_audit_log` genuinely holding zero
mint rows at that moment.

### 3.3 E3 Treasury by club

**Scope as briefed.** Treasury balances by club, with whatever the platform
already knows about whether each balance is right.

**Verdict: ships as WIRING. The comparison already exists, already agrees
exactly, and has never been shown to anyone.**

**Existing authority.** `fn_ca_treasury_positions()` is STABLE, SECURITY
DEFINER and `service_role` only. It compares each club's stored treasury
against the ledger and returns a per-club status. Measured 2026-09-23: four
clubs, all `ok`, ledger equal to stored EXACTLY. `fn_credit_treasury` and
`fn_debit_treasury` are the movement functions and are Club Arena's, not this
console's. `ledger_reconcile_log` carries `club_treasury` rows nightly with
drift 0.00.

**What does not exist.** A console caller. `fn_ca_treasury_positions()` is
never called from `pages/`, `src/` or `lib/`, so the four `ok` results have
never been rendered. And the thing being checked is structurally weak:
**`clubs.chip_treasury` is a MUTABLE COLUMN on the `clubs` table, not a
treasury table with its own history.** There is no per-club treasury ledger,
no append-only guard on the column, and no row-level record of what the
treasury was yesterday. The nightly `club_treasury` reconciliation is
therefore the only historical evidence that the column was ever right, and it
keeps only what `ledger_reconcile_log` retains.

**What ships in Phase 7.** A treasury section that calls
`fn_ca_treasury_positions()` and renders, per club, the stored balance, the
ledger balance, the difference and the function's own status; a plain
statement that the stored side is a mutable column and the ledger side is
append-only, so that an operator reading `ok` knows which of the two numbers
is the stronger evidence; and the nightly `club_treasury` history from
`ledger_reconcile_log` as a small trend so a position that has only just
become `ok` is distinguishable from one that has always been.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Treasury position per club | READ | `fn_ca_treasury_positions()` |
| Stored versus ledger, with the difference | READ | Same function's columns |
| Nightly treasury reconciliation history | READ | `ledger_reconcile_log` where `entity_type = 'club_treasury'` |
| Fund a club | **LINK** | Phase 6 O3's funding path, `fn_ca_fund_club`, approval kind `fund_club` |
| Credit or debit a treasury | **LINK** | Club Arena. `fn_credit_treasury` and `fn_debit_treasury` are not called here. |
| Correct a treasury balance | **NOT SHIPPED** | Phase 7 corrects nothing. |

**Permission and maker-checker.** Reads require `money.read`. E3 performs no
writes, so the approval kind is `none` and no audit row is written. The
funding LINK carries Phase 6 O3's rules unchanged: `money.write`, approval
kind `fund_club`, threshold field `fundThreshold`.

**Engine dependency.** None. Treasury balances are database state. The engine
moves chips at tables and those movements reach the treasury through the
ledger, but E3 reads the result, never the engine.

**Rollback, retry, idempotency, audit.** E3 performs no writes.
`fn_ca_treasury_positions()` is STABLE and is called with no arguments; a law
test asserts it is never called from a POST handler. Reads write no audit
rows.

**States.** `treasury.ready`, `treasury.position_mismatch` when any club's
status is not `ok`, `treasury.never_read` when the function has not yet been
called in this session, `treasury.unknown` when the call failed. Four clubs
all `ok` renders `treasury.ready` with the four positions listed, never a
single aggregate tick, because an aggregate hides which club it was.

**Acceptance criteria.** At 375px one card per club with four labelled lines:
stored, ledger, difference, status. No horizontal scroll, no sparkline that
requires a wide viewport to read. Desktop: a four-row table with the
reconciliation history beside it. Both: the difference is always shown even
when it is 0.00, because a difference that disappears when it is zero teaches
an operator to read absence as agreement, and in this console absence means
unknown.

**Tests before implementation.** A test that E3 calls
`fn_ca_treasury_positions()` and no treasury movement function. A test that a
zero difference renders as 0.00 and not as an empty cell. A test that a failed
call renders `treasury.unknown` and not four zeroes. A test that the mutable
column disclosure is present in the response and rendered. A copy test.

**Production verification to close this scope.** The four real club positions
rendered at both widths against production, each compared by hand against
`clubs.chip_treasury` and the ledger sum for that club, and the disclosure
sentence about the mutable column visible without expanding anything.

### 3.4 E4 Conservation, drift and the burn-in gate

**Scope as briefed.** Chip conservation and drift, plus the burn-in summary
for the Midway, Shark and JAQK restart decision.

**Verdict: ships, and SHIPS RED. Both headline figures are currently negative
and the contract requires them to render that way.**

**Existing authority.** `fn_ca_mint_register_vs_supply()` returns
`register_net`, `register_net_at_meter`, `meter_total`, `meter_taken_at`,
`difference` and `unexplained_since_baseline`; it does NOT return a verdict.
`fn_ca_drift_metrics()` returns the open drift posture: 52 open, 44 critical,
13 past target, worst open drift 2,624.78, over `ca_drift_incidents` which
holds 6,283 rows as measured and 6,298 when re-counted during drafting.
`fn_ca_midway_burnin_gate(24)` runs twelve checks and currently returns
**`"FAIL - do not restart Midway/Shark/JAQK yet"`**. `reconcile_ledger_nightly()`
writes `ledger_reconcile_log`, 59,274 rows. `club_profit_reconcile_log` under
pg_cron job 273 at `35 0 * * *` holds 3,851 rows, 1,495 applied.
`financial_alerts` holds 62,200 rows of which 57,129 are critical and 21,618
are unresolved. The Mint tab's conservation card at
`pages/horses/index.js:4744-4793` already computes and renders the verdict,
correctly, in red.

**What does not exist.** A surface for drift, a surface for the burn-in gate,
and any surface at all outside the Mint tab that states the conservation
verdict. Also missing: any watcher on the residue. `fn_ca_drift_metrics` is
executable by `authenticated` with **no admin gate**, which is an information
disclosure finding in its own right and is recorded in appendix B; Phase 7
calls it server-side under `money.read` and does not widen it. And
`financial_health_checks`, 1,049 rows with 10 passed and 1,039 failed, was
**last written on 2026-08-05**: a dead health table that still reads as the
record, which is exactly the failure mode section 0 names.

**What ships in Phase 7.** The conservation verdict, computed on the page from
the function's four operands, rendered with all four visible, with the residue
stated as a number: today `difference` 5,803.84 minus
`unexplained_since_baseline` 1,580.89 is a residue of **4,222.95 chips**
unaccounted for. The diamond conservation result beside it, which passes
exactly. The drift posture from `fn_ca_drift_metrics()` with open, critical,
past-target and worst-drift as four separate figures. The burn-in gate with
all twelve checks listed individually, the nine that pass and the three that
fail by name: `no_open_critical_incidents` (44), `no_unresolved_unknowns`
(38), `no_new_criticals_in_window` (38), alongside the nine that pass,
including the clean ledger chain, zero suspense flow, zero write failures and
no unregistered money RPCs. And the two reconciliations side by side, with
`club_profit_reconcile_log` shown as the one that records what it corrected
and `reconcile_ledger_nightly` shown with its `chip_circulation` rows
DISCLOSED AS A COMPOSITION AND NOT AS A VARIANCE, per section 2.2.

**The hardcoded severity is never rendered.** A law test asserts that no Phase
7 code path reads `severity` from a `ledger_reconcile_log` row whose
`entity_type` is `chip_circulation`. The two operands are rendered under their
true names, `ledger_balance` labelled as chips on the felt and
`stored_balance` labelled as total club chips, with the generated `drift`
column labelled as their arithmetic difference and explicitly NOT as a
variance.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Chip conservation verdict and operands | READ | `fn_ca_mint_register_vs_supply()` |
| Diamond conservation | READ | The diamond equivalent already on the Mint tab |
| Drift posture | READ | `fn_ca_drift_metrics()` |
| Open drift incidents list | READ | `ca_drift_incidents` |
| Burn-in gate, twelve checks | READ | `fn_ca_midway_burnin_gate(24)` |
| Nightly reconciliation, disclosed | READ | `ledger_reconcile_log` |
| Club profit reconciliation | READ | `club_profit_reconcile_log` |
| Financial alerts backlog | READ | `financial_alerts` |
| Restart Midway, Shark or JAQK | **NOT SHIPPED** | The gate reports. It does not act, and neither does this console. |
| Resolve a drift incident | **NOT SHIPPED** | Deferred to a phase that contracts the resolution path. |
| Re-run a reconciliation | **NOT SHIPPED** | Scheduled work is Open Claw's. |

**Permission and maker-checker.** Every control requires `money.read`. E4
performs no writes, so the approval kind is `none` and no audit row is
written. The `operations` role holds `money.read` and not `money.write`, so an
operations operator can see the whole of E4 and act on none of it, which is
the correct shape for a reporting surface.

**Engine dependency.** Named and one-directional. The burn-in gate exists to
inform a decision about restarting engine instances, so the gate's OUTPUT is
an input to engine work. E4 never calls the engine, never restarts anything,
and never renders the gate's verdict as an action taken. A `FAIL` renders as
`burnin.fail` with the failing checks named, and the copy says the gate
advises and does not enforce.

**Rollback, retry, idempotency, audit.** E4 performs no writes. Every function
it calls is STABLE or a pure read; `fn_ca_midway_burnin_gate` is called with
its window argument and with no apply flag of any kind. Reads write no audit
rows. A failed call to any one of the five sources degrades that card to
`unknown` and leaves the others rendered, because a single dead source must
not blank a page whose purpose is to show trouble.

**States.** `conservation.balanced`, `conservation.residue` with the residue
figure, `conservation.unknown`. `drift.ready`, `drift.past_target` when the
past-target count is above zero, `drift.unknown`. `burnin.pass`,
`burnin.fail`, `burnin.unknown`. `reconcile.disclosed` for the nightly job
whose severity is not evidence, `reconcile.recorded` for
`club_profit_reconcile_log`. `health.dead_source` for
`financial_health_checks`, whose last write was 2026-08-05 and which renders
with that date and the word STALE rather than with its pass and fail counts
alone.

**Acceptance criteria.** At 375px the conservation card is the first thing on
the screen, full width, with the verdict sentence, then the four operands as
four labelled lines, then the residue. No horizontal scroll. The burn-in gate
below it lists twelve checks as twelve rows, each with its own pass or fail,
and never as a single badge. Desktop is a separate presentation: conservation
and burn-in side by side with the drift incident list beneath. Both: red means
red. A failing conservation verdict is not softened, not collapsed into a
tooltip, and not rendered in a neutral colour because the page looks better
that way. The word "balanced" appears only when the verdict is true.

**Tests before implementation.** A law test that no Phase 7 path reads
`severity` for a `chip_circulation` row. A test that the conservation verdict
is computed from the two operands and is never a constant or a server-supplied
boolean. A test that with `difference` 5,803.84 and
`unexplained_since_baseline` 1,580.89 the surface renders
`conservation.residue` with 4,222.95 and NOT `conservation.balanced`. A test
that the burn-in gate renders twelve rows and that a FAIL names its failing
checks. A test that `financial_health_checks` renders its last-written date
and a STALE marker. A test that one dead source does not blank the others. A
copy test.

**Production verification to close this scope.** The conservation card, the
drift posture and the burn-in gate rendered at both widths against production,
with the residue matching a direct call to `fn_ca_mint_register_vs_supply()`
at that moment, the gate showing FAIL with its three named failures, and the
nightly reconciliation's disclosure visible beside its 84,156,151.15 figure
without the word `ok` appearing anywhere near it.

### 3.5 E5 Rake law oversight and auditability

**Scope as briefed.** Not briefed. Added by section 2.3, because the rake law
is the substrate under E6 and E7 and its findings have no surface.

**Verdict: ships READ, plus the one additive migration this phase permits.**

**Existing authority.** `ca_rake_rules`, one row at id 1, holds the law:
`heads_up_cap_factor` 0.5, `short_handed_cap_factor` 0.75,
`short_handed_max_players` 3, `short_handed_min_seats` 9,
`bbj_min_players_dealt` 3, `heads_up_percent` 5, `max_rake_percent` 10,
`max_rake_cap_bb` 10, `no_flop_no_drop` true. `fn_rake_cap_for_dealt` and
`fn_effective_rake` apply it, and all three of the owner's stated rules match.
`rake_records` holds 3,306,470 rows, one per hand, from 2026-04-16 to now,
carrying `rake_amount`, `bbj_contribution`, `pot_size`, `num_players`,
`rake_method`, `player_contributions` and `is_tournament`.
`fn_rake_law_check(interval)` calls `fn_rake_law_violations` and writes
findings to `ledger_reconcile_log` with `entity_type = 'rake_law'`, under
pg_cron `rake-law-adherence-hourly` at `40 * * * *` and `rake-law-wide-daily`
at `50 7 * * *`. Re-counted 2026-09-23: 1,180 critical `under_spec` findings
between 2026-09-15 and 2026-09-17, 61 `board_not_recorded` warnings, zero
`over_spec`.

**What does not exist.** Any operator surface. `fn_rake_law_violations` has
ZERO references in `pages/`, `src/` and `lib/`, so an auditor that has been
running hourly and finding criticals for a week has been talking to nobody.
Also missing, and this is the structural gap: `rake_records` does not record
the number of SEATS at the table and does not record the max rake cap in
force. `fn_rake_law_violations` therefore reads `tables.max_players` LIVE and
recomputes the cap from six mutable inputs, so a table changed from 9-max to
6-max retroactively flips the verdict on every historical three-handed hand
there. `ca_rake_rules` has no history table, so amending the law rewrites the
past too. There is no channel for a seat count to arrive:
`atomic_distribute_rake` has no `p_seats` parameter, and
`src/lib/poker-engine/LobbyManager.js:781` takes `data.rake` on trust.

**What ships in Phase 7.** A rake law section with four parts. First, THE LAW
AS IT STANDS, read live from `ca_rake_rules` and rendered field by field, with
a statement that the table has no history and that the figures describe today
only. Second, THE FINDINGS, read from `ledger_reconcile_log` where
`entity_type = 'rake_law'`, grouped by severity and verdict class, with
`under_spec` and `over_spec` counted separately and the fact that `over_spec`
is zero stated in words rather than implied by an empty group. Third, THE
STABILITY MARKER: every finding renders `derived_live` when its verdict was
recomputed from today's `tables.max_players`, or `derived_from_record` when
the hand carries its own seat count and cap, and today every finding is
`derived_live`. Fourth, THE OPEN DEFECTS, as a named list: the RakeConfig
disagreement at `src/lib/poker-engine/RakeConfig.js:190` where
`minPlayersDealt: 4` contradicts `bbj_min_players_dealt` 3 so `calculateBBJFee`
returns zero at three players, and the unknown-seats fail-open in
`fn_effective_rake` where `v_short_ok` grants the short-handed discount when
`p_seats IS NULL`.

**The migration.** ONE additive migration, and the only one this phase ships
without a further decision from Dan: two nullable columns on `rake_records`,
a seat count and the max rake cap in force at the moment the hand was raked,
both `ADD COLUMN ... DEFAULT NULL` because `rake_records` is over a million
rows and `.agent/workflows/migration-safety.md` requires that form above that
size. No backfill: rows written before the migration keep NULL and render
`rakelaw.verdict_unstable` with the reason. No index in the same migration; if
one is needed it is `CREATE INDEX CONCURRENTLY` in its own migration, per the
same workflow. The migration follows the four-step gate in full: written from
the template, pre-flight with advisors, function dependency and overload
check, RLS scope and row-count sanity, applied, then verified by
`execute_sql` against `supabase_migrations.schema_migrations` and NEVER by
`list_migrations`, which triggers a PostgREST schema-cache reload of roughly
28 seconds that the database refuses in the break window from :50 to :03 UTC.
An applied migration is never edited; a mistake is rolled back with a new
`_revert_` migration.

**Populating the columns is NOT Phase 7's work.** Writing a seat count into
`rake_records` requires a `p_seats` parameter on `atomic_distribute_rake` and
an engine change to supply it. That is an RPC signature change, which
`.agent/workflows/migration-safety.md` classes Tier 3 and which requires a
copy-paste rollback section in the migration body, and it is engine work this
console does not own. Phase 7 adds the columns and the reader. The writer is
named in appendix B as a blocker.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| The rake law as it stands | READ | `ca_rake_rules` |
| Findings by severity and verdict class | READ | `ledger_reconcile_log` where `entity_type = 'rake_law'` |
| Per-finding stability marker | READ | Computed from the new `rake_records` columns |
| Rake by club, day and method | READ | `rake_records` aggregates |
| Open defect list | READ | Static findings with their file and line |
| Run the auditor now | **NOT SHIPPED** | `fn_rake_law_check` is Open Claw's and pg_cron's. |
| Amend the rake law | **NOT SHIPPED** | `ca_rake_rules` is never written by this console. |
| Two nullable columns on `rake_records` | **AUTHORITATIVE WRITE** | One additive migration. DDL only, no data write. |

**Permission and maker-checker.** Every read requires `money.read`. The
migration is not an operator action and has no approval kind; it is applied by
an agent under `.agent/workflows/migration-safety.md`, not by a console
button, so its row in the matrix reads `none` for approval and names the
workflow instead. No runtime write path exists in E5 at all.

**Engine dependency.** Named and UNMET. The seat count cannot reach
`rake_records` until the engine supplies it and `atomic_distribute_rake`
accepts it. The contract that future work must satisfy:

> The rake distribution RPC must accept the number of SEATS at the table, as
> distinct from the number of players dealt, and must persist it with the hand
> along with the max rake cap that was applied. The value must come from the
> engine's own table configuration at the moment the hand was raked, not from
> a later read of `tables.max_players`. Until that exists, every rake law
> verdict is recomputed from mutable inputs and the console says so on every
> finding.

**Rollback, retry, idempotency, audit.** The migration is additive and
reversible by dropping two columns that nothing writes; the revert is a new
`_revert_` migration, never an edit. Every created or replaced SECURITY
DEFINER function in the migration, if any, ends `SET search_path = public,
extensions;`. There are no runtime writes, so no idempotency key and no audit
row. Reads write no audit rows.

**States.** `rakelaw.ready`, `rakelaw.findings_open` when criticals are
outstanding, which today means 1,180, `rakelaw.verdict_unstable` for any
finding derived from live table configuration, `rakelaw.stale` when the last
`rake_law` row in `ledger_reconcile_log` is older than the hourly cadence
plus its grace, `rakelaw.never_run` when no `rake_law` row exists at all.
`rakelaw.findings_open` and `rakelaw.stale` are independent and both can be
true; the surface shows both.

**Acceptance criteria.** At 375px the law renders as a single column of
labelled fields, then the finding counts as three lines, `under_spec`,
`over_spec` and warnings, with `over_spec` shown as 0 in words: "No Hand Was
Over-Raked". No horizontal scroll. Desktop: the law beside the findings with a
sortable finding table. Both: every finding carries its stability marker
inline, not in a legend, because a legend is a thing an operator reads once.
The phrase "rake audit" never appears next to a `derived_live` finding; the
copy says the verdict was recomputed from today's table configuration.

**Tests before implementation.** A test that the law is read from
`ca_rake_rules` and never hardcoded in the client. A test that zero
`over_spec` renders as an explicit sentence and not an absent row. A test that
a finding with NULL seat columns renders `rakelaw.verdict_unstable`. A test
that the RakeConfig disagreement appears as a finding while
`src/lib/poker-engine/RakeConfig.js` sets `minPlayersDealt: 4`, read from the
file rather than hardcoded. A test that no Phase 7 path calls
`fn_rake_law_check`. A migration test asserting both columns are nullable with
no default value beyond NULL. A copy test.

**Production verification to close this scope.** The rake law and its findings
rendered at both widths against production, with the 1,180 criticals visible
and grouped, `over_spec` visibly zero, every finding marked `derived_live`,
and the migration verified by `execute_sql` against
`supabase_migrations.schema_migrations` with both columns present, nullable
and empty.

### 3.6 E6 Rakeback and leaderboard payout oversight

**Scope as briefed.** Rakeback oversight and leaderboard payout oversight: who
is owed what, what has been paid, and whether the payers are behaving.

**Verdict: ships READ-ONLY and NARROWED. Both are fully automatic payers with
no human in the loop, and both keep their records in tables that can be
changed after the fact.**

**Existing authority.** `rakeback_periods` holds 7,135 rows: 3,777 paid
totalling 413,221.89 and **3,358 pending totalling 433,681.29**.
`rakeback_period_payouts` holds 3,124 rows, 3,123 paid totalling 369,231.29
and one failed. Settlement is automatic and weekly, Mondays at 04:00
America/Chicago. `leaderboard_payouts` holds 6 rows totalling 1,000.00, paid
by `fn_payout_leaderboard` under pg_cron `leaderboard-payout-waterfall-daily`
at `20 0 * * *`. `settle_club_rakeback(uuid)` is a wrapper over the
`service_role`-only `fn_settle_club_rakeback_batch`.

**What does not exist.** Any Stable Admin surface for either. And three
integrity gaps that the oversight surface exists to disclose. First,
**`rakeback_period_payouts` is append-only but `rakeback_periods` is
MUTABLE**, so the 3,358 pending rows holding 433,681.29 can be edited before
they are ever paid, and nothing records that they were. Second,
**`leaderboard_payouts` and `leaderboard_payout_batches` have ZERO
TRIGGERS**: fully mutable and fully deletable, with no append-only guard and
no delete guard. Third, **`settle_club_rakeback(uuid)` is SECURITY DEFINER,
granted to `authenticated`, and contains NO AUTHORIZATION CHECK IN ITS OWN
BODY**; it is contained only by the checks inside the `service_role`-only
function it wraps, which means its safety is entirely borrowed.

There is a fourth, narrower defect. `fn_payout_leaderboard` sets
`app.ledger_category` and never resets it, so any later write in the same
transaction inherits the category `leaderboard_payout`. Rows categorised that
way are not necessarily leaderboard payouts, and E6 must not report the
category as if it were.

And there is **NO MAKER-CHECKER ON ANY PAYOUT PATH IN THIS PHASE'S
SUBJECT MATTER.** `APPROVAL_KINDS` at `src/lib/horses/approvals.js:66-73` is
exactly `['mint','burn','fund_club','cashout','fleet_policy','sanction']`.
There is no `rake`, no `rakeback`, no `bbj`, no `leaderboard` and no
`promotion` kind. Phase 7 does not add one, because adding an approval kind
for a payer this console does not call would be a kind that never fires. It
states the absence.

**What ships in Phase 7.** A rakeback section: periods by status with the
pending total stated prominently, because 433,681.29 owed is the largest
uncommitted number in this phase; the payout history from the append-only
`rakeback_period_payouts`; the one failed payout named; and the run record,
which is where the worst finding lives. **`/cron/rakeback-period-settle` has
12 runs in `cron_execution_log`, every one with `result = {}`, and its LAST
RUN WAS 2026-08-24.** Four Mondays have been missed. It does not appear in
`v_openclaw_job_staleness` because that view requires five or more successes
in thirty days, so the staleness watcher cannot see a job that stopped
running. E6 renders the last run date against the expected weekly cadence and
raises `rakeback.run_missed` directly, from the dates, without depending on
the view.

A leaderboard section: the six payouts, the batches, the payer's schedule and
last run, and an explicit mutability disclosure stating that these tables
carry no triggers so the rows shown are not tamper-evident.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Rakeback periods by status, pending total | READ | `rakeback_periods` |
| Rakeback payout history | READ | `rakeback_period_payouts` |
| Rakeback run record and missed-run check | READ | `cron_execution_log`, computed from dates |
| Leaderboard payouts and batches | READ | `leaderboard_payouts`, `leaderboard_payout_batches` |
| Mutability disclosure for both | READ | `pg_trigger`, rendered as a finding |
| Settle a rakeback period | **NOT SHIPPED** | `settle_club_rakeback` is never called from this console. |
| Pay a leaderboard | **NOT SHIPPED** | `fn_payout_leaderboard` is never called from this console. |
| Edit or void a pending period | **NOT SHIPPED** | Phase 7 changes no money record. |

**Permission and maker-checker.** Every read requires `money.read`, because
every one of them discloses per-player amounts. E6 performs no writes, so the
approval kind is `none` throughout. The matrix records that the underlying
payers have no approval kind at all and that this is a measured absence, not
an omission from the table.

**Engine dependency.** None. Both payers are database jobs. E6's only external
dependency is the scheduler record, and section 5 of this contract and the
measurement both note that TWO schedulers run money work: Open Claw, whose
status lands in `public.cron_execution_log`, and pg_cron, with 130 in-database
jobs whose status lands in `cron.job_run_details`, which a retention job at
jobid 280 DELETES past 14 days. Neither is the Claude scheduler. E6 reads both
and says which one it read.

**Rollback, retry, idempotency, audit.** E6 performs no writes. A law test
asserts that `settle_club_rakeback`, `fn_settle_club_rakeback_batch` and
`fn_payout_leaderboard` appear in no Phase 7 call site. Reads write no audit
rows. The missed-run check is computed from timestamps on every request and is
never cached into a status column, because a cached staleness verdict is the
same defect as `financial_health_checks`.

**States.** `rakeback.ready`, `rakeback.period_pending` with the pending
count and total, `rakeback.run_missed` when the last successful settle is
older than the weekly cadence plus its grace, `rakeback.record_mutable` as a
standing disclosure, `rakeback.unknown`. `leaderboard.ready`,
`leaderboard.unguarded` as a standing disclosure that the tables carry no
triggers, `leaderboard.unknown`. `rakeback.run_missed` is currently TRUE and
the surface must render it true on day one.

**Acceptance criteria.** At 375px the pending total is the first figure on the
rakeback card, in full, with its row count beside it, and the last-run date
directly under it with the number of missed runs in words. No horizontal
scroll. Desktop: periods and payouts side by side with the run history
beneath. Both: a pending amount is never described as owed, due, or scheduled.
It is described as pending, with its date. The category leak from
`fn_payout_leaderboard` is disclosed wherever `ledger_category` is displayed,
and `ledger_category = 'leaderboard_payout'` is never used as a filter to
produce a leaderboard total.

**Tests before implementation.** A test that the pending total is summed
server-side over all pending rows and not over the page. A test that the
missed-run check is computed from `cron_execution_log` timestamps and does not
consult `v_openclaw_job_staleness`. A test that the mutability disclosure is
derived from `pg_trigger` and not hardcoded, so it disappears if guards are
added. A test that no leaderboard total is derived from `ledger_category`. A
test that E6 calls no settlement or payout function. A copy test.

**Production verification to close this scope.** Both sections rendered at
both widths against production, the pending total matching a direct count and
sum of `rakeback_periods`, the last-run date visibly 2026-08-24 or later with
the missed-run count correct for the day it is verified, and the leaderboard
mutability disclosure present.

### 3.7 E7 Bad Beat Jackpot pools and payouts

**Scope as briefed.** Bad Beat Jackpot pools and payouts: what is in the
pools, what has been paid out, and whether the contributions reconcile.

**Verdict: ships READ-ONLY. The payouts are fully automatic with no human in
the loop, and the payout record is DELETE-guarded but not UPDATE-guarded.**

**Existing authority.** `bbj_pools` holds 5 rows. Live balances measured
2026-09-23: union main 84,120.01 and union backup 53,644.05, club main
34,016.10 and club backup 21,421.79. `bbj_payouts` and `bbj_winners` hold 80
rows each: main 36 rows totalling 218,914.74 and mini 44 rows totalling
26,400.00. `bbj_contributions` holds 1,689,069 rows. `bbj_atomic_payout_v2`
performs the payout as `service_role`, automatically, with **no human in the
loop at any point**. `rake_records.bbj_contribution` is the per-hand
contribution and `ca_rake_rules.bbj_min_players_dealt` is 3.

**What does not exist.** Any operator surface, any maker-checker, and any
UPDATE guard. **`bbj_payouts` and `bbj_winners` are DELETE-guarded but NOT
UPDATE-guarded**, so a paid jackpot's recorded amount or winner can be
changed after the fact without a trigger objecting. There is also a
conservation gap specific to this scope: BBJ credits a seated player by
`UPDATE table_seats SET stack = stack + p_amount`, and **`table_seats` has no
autoledger trigger**, so the only journalled leg of a jackpot payout is the
`bbj_pools` debit. The credit side exists as a stack change with no ledger
row. That is a named candidate for the conservation residue in section 2.2 and
appendix B carries it as an open question rather than an assertion, because
the residue was not traced to a source in this measurement.

**What ships in Phase 7.** A pools section showing all five pools with main
and backup separated and never summed into a single jackpot figure, because a
backup pool is not payable and a combined number implies it is. A payouts
section showing main and mini separately with their counts and totals. A
contributions section aggregating `bbj_contributions` over a bounded window
with the `bbj_min_players_dealt` threshold stated. And two disclosures: that
the payout tables accept UPDATEs, and that the credit leg of a payout lands in
`table_seats` without a ledger row.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Pool balances, main and backup separately | READ | `bbj_pools` |
| Payout history, main and mini separately | READ | `bbj_payouts`, `bbj_winners` |
| Contribution flow over a window | READ | `bbj_contributions` |
| Qualification threshold in force | READ | `ca_rake_rules.bbj_min_players_dealt` |
| UPDATE-guard and ledger-leg disclosures | READ | `pg_trigger`, rendered as findings |
| Pay, void or adjust a jackpot | **NOT SHIPPED** | `bbj_atomic_payout_v2` is never called from this console. |
| Move chips between main and backup | **NOT SHIPPED** | Pool movement is not a console operation in this phase. |

**Permission and maker-checker.** Every read requires `money.read`. E7
performs no writes, so the approval kind is `none`. The matrix records that
`bbj` is NOT an approval kind and that jackpot payment has never had a second
pair of eyes; Phase 7 states that and does not add a kind for a payer it does
not call.

**Engine dependency.** Named. The engine detects the qualifying hand and the
payout runs as `service_role` from the database side. E7 reads the results and
never participates. The RakeConfig disagreement recorded in E5, where
`src/lib/poker-engine/RakeConfig.js:190` sets `minPlayersDealt: 4` against a
database law of 3 so `calculateBBJFee` returns zero at three players, is an
ENGINE-SIDE defect that suppresses contributions this scope reports on; E7
links to E5's finding rather than restating it as its own.

**Rollback, retry, idempotency, audit.** E7 performs no writes. A law test
asserts `bbj_atomic_payout_v2` appears in no Phase 7 call site. Reads write no
audit rows.

**States.** `bbj.ready`, `bbj.pool_unwitnessed` as a standing disclosure that
the payout tables accept UPDATEs, `bbj.credit_leg_unjournalled` as the
standing disclosure about `table_seats`, `bbj.contributions_suppressed` when
the RakeConfig disagreement is still present in the repository,
`bbj.unknown`. A pool that holds zero renders zero with its name; it never
disappears from the list, because an absent pool reads as no jackpot rather
than as an empty one.

**Acceptance criteria.** At 375px each pool is its own card with its balance
and an explicit main or backup label, in a single column, no horizontal
scroll. Payout history is a single column grouped by main and mini with counts
and totals as separate lines. Desktop: pools across the top, payout table
beneath, contribution series beside it. Both: no figure in this scope is
labelled "the jackpot" without saying which pool, and main and backup are
never added together anywhere, including in a total row.

**Tests before implementation.** A test that main and backup are never summed
in any response field. A test that a zero-balance pool still appears. A test
that the UPDATE-guard disclosure is derived from `pg_trigger` and vanishes if
a guard is added. A test that the contribution threshold is read from
`ca_rake_rules` and not hardcoded. A test that E7 calls no payout function. A
copy test.

**Production verification to close this scope.** Pools and payouts rendered at
both widths against production, the four live balances matching `bbj_pools` to
the cent, main and mini payout totals matching 218,914.74 and 26,400.00 or
their values at that moment, and both disclosures visible without expanding
anything.

### 3.8 E8 Promotions and bonus-abuse analysis

**Scope as briefed.** Promotions and bonus-abuse analysis: what promotional
value has gone out, and whether it is being farmed.

**Verdict: ships NARROWED, on detectors that have never produced a row. The
honest surface here is mostly a statement about what is not known.**

**Existing authority.** Abuse detectors exist. `abuse_logs` holds **zero
rows** and `signup_abuse_log` holds **zero rows**. `commander_promotion_awards`
is the promotional award record. Phase 4's player restriction machinery and
Phase 5's integrity queues are the places where a confirmed abuse finding
would be acted on, and both already have contracts.

**What does not exist.** A single detector output. Zero rows in both abuse
tables means one of two things and the measurement did not determine which:
the detectors run and the platform is clean, or the detectors do not run.
Appendix B carries it as a blocking open question because the two states
demand opposite operator behaviour, and this scope's entire value depends on
the answer.

There is also a live permissions defect in this scope's subject matter.
**`commander_promotion_awards` grants `arwdxtm` to BOTH `anon` AND
`authenticated` at table level.** The table-level grant includes INSERT,
UPDATE and DELETE. Only RLS policies stand between an anonymous caller and
that table, and **there is no DELETE policy**, so the grant's delete privilege
is unaccompanied by a policy that would describe who may use it. Phase 7 does
not change a grant and does not write a policy; that is a migration with real
blast radius and it belongs to whoever owns the Commander product. Phase 7
RENDERS it, as a named finding with the grant string, in the same list as E2's
unregistered issuance paths.

**What ships in Phase 7.** A promotions section reading
`commander_promotion_awards` for value issued over a bounded window, by
promotion and by day. An abuse section that renders
`abuse.detector_never_fired` for each of `abuse_logs` and `signup_abuse_log`,
with the row count of zero and the explicit sentence that a zero here is not
a clean result because the detector's last run could not be established. A
findings list carrying the `commander_promotion_awards` grant.

This scope does not compute an abuse score, does not rank players by
suspicion, and does not flag anyone. A score is not a verdict, and a score
computed in a reporting console over data whose detectors may not be running
would be a verdict dressed as arithmetic.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Promotional value issued by promotion and day | READ | `commander_promotion_awards` |
| Abuse detector output | READ | `abuse_logs`, `signup_abuse_log` |
| Detector liveness disclosure | READ | Row counts plus the open question, rendered honestly |
| Grant finding on `commander_promotion_awards` | READ | `information_schema` grants, rendered as a finding |
| Act on an abuse finding | **LINK** | Phase 4 player restrictions, Phase 5 integrity queues |
| Grant or void a promotional award | **NOT SHIPPED** | Promotional issuance is not a Stable Admin operation. |
| Compute an abuse score or ranking | **NOT SHIPPED** | A score is not a verdict. |

**Permission and maker-checker.** Promotional value is money, so the
promotions section requires `money.read`. The abuse sections read player
conduct records and require `players.read`, matching the Anti-Abuse tab at
`src/components/horses/tabRegistry.js`. E8 performs no writes, so the approval
kind is `none` and no audit row is written. The LINK to Phase 4's restriction
path carries that phase's rules unchanged, including that nothing is shown as
enforced unless production enforced it.

**Engine dependency.** None.

**Rollback, retry, idempotency, audit.** E8 performs no writes. Reads write no
audit rows. A law test asserts no Phase 7 path writes to
`commander_promotion_awards`, which matters more here than elsewhere because
the table's grants would permit it.

**States.** `promo.ready`, `promo.grant_overbroad` as a standing disclosure
while the `anon` grant exists, `promo.unknown`. `abuse.nothing_detected` when
a detector's last run is known and recent and its table is empty,
`abuse.detector_never_fired` when the table is empty and the last run is not
known, which is TODAY'S STATE FOR BOTH TABLES, and `abuse.unknown` when the
table could not be read. These three are never collapsed, and none of them
renders as a green tick.

**Acceptance criteria.** At 375px the abuse cards come first and each carries
its state in words, not a colour alone, because `abuse.detector_never_fired`
rendered green would be the exact lie section 0 forbids. Promotional value
follows as a single column by promotion. No horizontal scroll. Desktop: the
promotions table with the detector cards in a right-hand column. Both: the
words "no abuse detected" appear nowhere while the detector liveness is
unknown.

**Tests before implementation.** A test that an empty `abuse_logs` with no
known last run renders `abuse.detector_never_fired` and not
`abuse.nothing_detected`. A test that no string in E8 asserts cleanliness. A
test that the grant finding is read from `information_schema` and not
hardcoded. A test that E8 writes nothing to `commander_promotion_awards`. A
test that no ranking, score or suspicion ordering appears in any E8 response
field. A copy test.

**Production verification to close this scope.** Both abuse states rendered at
both widths against production with their true zero counts and the
never-fired wording, the promotional value matching a direct query, and the
grant finding visible.

### 3.9 E9 Daily close, weekly digest and per-club profit and loss

**Scope as briefed.** A daily close, a weekly digest, and per-club profit and
loss.

**Verdict: the READ half ships first. The three durable records this scope
needs are SPECIFIED HERE with their shapes settled, and are built during Phase
7 implementation rather than in this contract. Every phase from 1 to 6 shipped
its own migrations under `.agent/workflows/migration-safety.md`, and this scope
is no different.**

**Existing authority.** `fn_ca_ledger_day_manifest(day, reason)` runs under
pg_cron job `ca-ledger-day-manifest`, jobid 181, at `25 4 * * *`, and writes
`ca_ledger_day_manifests` with columns `day`, `row_count`, `first_seq`,
`last_seq`, `net_amount`, `sha256`, `created_at`, `last_checked_at` and
`restated_at`. `fn_ca_weekly_revenue_digest(7)` runs under pg_cron jobid 203
at `0 13 * * 1` and last succeeded 2026-09-21. `fn_ca_daily_attestation()`
runs under jobid 180 and behaves the same way. `fn_ca_fleet_pnl` is exposed at
`pages/api/horses/fleet-admin.js:653`, gated `MONEY_READ`, and is the only
profit and loss an operator can reach today. `fn_union_pnl_cash_by_club`,
`fn_union_pnl_all_clubs` and `ca_club_overlay_pnl` are the other on-demand
forms. `settlement_invoices` holds 131 rows, 125 paid, 4 overdue, 2 generated,
and `accounting_invoice_deliveries` holds 211 rows, every one with a
resolvable `message_id` and `notification_id`, written by
`fn_deliver_accounting_invoice`, which enforces eight named refusal codes.
That invoice layer is the strongest financial evidence on the platform and
E9 says so.

**What does not exist.** A financial close. **`ca_ledger_day_manifests` is a
JOURNAL-INTEGRITY MANIFEST, not a close**: it hashes a day's ledger rows and
records the sequence range, which proves the journal was not altered and
proves nothing about whether the day's money was right. It holds 51 rows over
a 188-day span, so **137 days have no manifest at all**; the contiguous run is
23 days since financial epoch 2 (`ca_financial_epochs` id 2, started
2026-08-31 14:35:01), and the last row is day 2026-09-22 with `row_count`
264,488 and `net_amount` 2,951,807.80.
`ca_ledger_day_manifest_restatements` holds one row whose `restated_by` AND
`application` are both NULL, so the single restatement on record has no
identity behind it. **`commander_day_closes`, the only table on the platform
shaped like an operator-signed close, holds ZERO ROWS.** Nobody has ever
closed a day.

A durable digest. `fn_ca_weekly_revenue_digest(7)` **persists NOTHING as a
table**. Its figures survive only inside `notifications.data->'digest'`, three
rows to one distinct recipient. `fn_ca_daily_attestation()` is identical, 26
notification rows to three recipients. The jsonb these functions return is
discarded by the scheduler. A weekly revenue figure that exists only inside a
notification payload cannot be charted, cannot be compared week over week, and
disappears when notifications are pruned.

A durable profit and loss. `club_financial_summary` holds 2 rows and has been
dead since 2026-02-16. There are **ZERO financial matviews**; the only four
matviews on the database are unrelated. `union_pnl_settlements`, 10 rows with
a `club_results` jsonb, is the closest thing to a materialised P and L that
exists. Everything else is computed per request and thrown away.

And there is a category of failure that spans all three.
**NO RECONCILIATION EXISTS BETWEEN WHAT A JOB BELIEVED IT DID AND WHAT THE
LEDGER SHOWS.** Nothing compares `/cron/auto-settlement`'s reported "0
invoices generated" against `settlement_invoices`. Several money jobs carry
INVOCATION-ONLY EVIDENCE: `/cron/vip-stipend`, a daily diamond payer, has
**zero rows in `cron_execution_log`**; `/cron/auto-settlement` and
`/cron/auto-settlement_distribute` last recorded `result = {}` at or before
2026-08-24; `ca-settlement-correctness-30m`, jobid 178, **failed on 2026-09-23
at 12:15 with a statement timeout**; and `/cron/ledger-reconcile` **errored on
2026-09-23 at 08:00 with HTTP 500, `supabase request exceeded 20000ms` on
`rpc/reconcile_ledger_nightly`**. A job that returns an empty object has
recorded that it was invoked and nothing else.

Delivery is the same story one level down. `fn_deliver_accounting_invoice`
records a delivery at WRITE TIME and it is IN-APP ONLY: there is no external
confirmation of any kind. 108 of the 211 deliveries are marked read, and that
is a UI read flag, not a receipt. E9 renders delivery as recorded-not-confirmed
and never as delivered.

**What ships in Phase 7.** The read half, in full. A close section rendering
`ca_ledger_day_manifests` as a COVERAGE CALENDAR: which days have a manifest
and which do not, 51 of 188, with the contiguous epoch-2 run marked, each
manifest's `row_count`, `net_amount` and `sha256` available, and a heading
that says journal integrity rather than close. Beside it, a statement that
`commander_day_closes` holds zero rows and that no day has been
operator-signed. The restatement row rendered with its NULL identity shown as
NULL, not blank. A digest section rendering what exists: the run history from
pg_cron, the last success on 2026-09-21, the recipient count, and the fact
that the figures are not retained. A profit and loss section calling
`fn_ca_fleet_pnl` and the union P and L functions on demand, clearly labelled
as computed at request time from live data, with `club_financial_summary`
rendered as a DEAD SOURCE carrying its 2026-02-16 date. An invoice section
rendering `settlement_invoices` by status and `accounting_invoice_deliveries`
with the eight refusal codes named and delivery labelled recorded, not
confirmed. And a job-evidence section rendering, for each money job, its last
run, its last result shape, and whether that result contained anything at all.

**Specified, and decided here.** Three records. This programme does not
escalate design choices, so each shape is settled in this contract rather than
left open, and each is described so nobody invents a different one later.

> **A weekly digest run record.** One row per digest run, carrying the run's
> window, the figures the function returned as typed columns rather than as
> jsonb alone, the recipients it reached, the scheduler and job that invoked
> it, and the outcome. Append-only. This makes week-over-week comparison
> possible and makes a missed week visible as a gap rather than as a silence.

> **A per-club profit and loss record.** One row per club per period, written
> from the same functions that compute it on demand today, so that the number
> an operator saw last month can be produced again. Append-only, with
> restatements as new rows rather than updates, and every row carrying which
> function and which epoch produced it.

> **An operator-signed daily close.** Distinct from the journal manifest and
> layered on top of it: a row per day carrying the manifest's `sha256`, the
> operator identity that signed it, the time, and the exceptions accepted.
> `commander_day_closes` is the nearest existing shape and holds zero rows, but
> it belongs to the Commander venue product and Phase 6 already found its
> sibling `commander_export_jobs` keyed on `venue_id integer` and wrong for the
> platform tier. It is therefore the WRONG table. Phase 7 adds `ca_daily_closes`
> instead, matching the `ca_` convention every other operator table follows,
> and leaves the Commander table alone. A close
> is an operator act, so it is an AUTHORITATIVE WRITE with an approval kind,
> and the kind does not exist yet.

All three ship during Phase 7 implementation, not in this contract. Each
follows
`.agent/workflows/migration-safety.md` in full: template, pre-flight with
advisors and the function dependency and overload check and RLS scope and
row-count sanity, apply, then verify with `execute_sql` against
`supabase_migrations.schema_migrations` and never `list_migrations`.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Manifest coverage calendar | READ | `ca_ledger_day_manifests` |
| Manifest detail with `sha256` and `net_amount` | READ | Same |
| Restatement record with its NULL identity | READ | `ca_ledger_day_manifest_restatements` |
| Operator-signed close status | READ | `commander_day_closes`, currently zero rows |
| Digest run history and recipients | READ | pg_cron job 203, `notifications` |
| Fleet and union profit and loss, on demand | EMBED | `fn_ca_fleet_pnl` via `pages/api/horses/fleet-admin.js:653` |
| Dead P and L source disclosure | READ | `club_financial_summary`, last written 2026-02-16 |
| Invoices by status | READ | `settlement_invoices` |
| Invoice delivery, recorded not confirmed | READ | `accounting_invoice_deliveries` |
| Money job evidence, last run and result shape | READ | `cron_execution_log`, `cron.job_run_details` |
| Run a manifest, a digest or an attestation | **NOT SHIPPED** | Scheduled work is Open Claw's and pg_cron's. |
| Sign a daily close | **DEFERRED** | No table, no approval kind. Specified above. |
| Durable digest record | **DEFERRED** | Specified above. |
| Durable per-club P and L | **DEFERRED** | Specified above. |

**Permission and maker-checker.** Every read requires `money.read`. The
deferred close, when it ships, is an AUTHORITATIVE WRITE requiring
`money.write` and a NEW approval kind that does not exist in `APPROVAL_KINDS`
today; its threshold field would be null, meaning it always needs a second
pair of eyes once approvals are on, which is the correct treatment for a
signature. Phase 7 does not add the kind, because adding an approval kind for
an operation this phase does not ship would be dead code in a security
module.

**Engine dependency.** None directly. E9 depends on SCHEDULERS, and there are
two: Open Claw, whose dispatcher is `scripts/openclaw-cron-dispatcher.py` and
whose status lands in `public.cron_execution_log`, and pg_cron, with 130
in-database jobs whose status lands in `cron.job_run_details`, which a
retention job at jobid 280 deletes past 14 days. Neither is the Claude
scheduler. `vercel.json` still carries 13 legacy crons and
`.agent/workflows/no-vercel-crons.md` forbids adding more; Phase 7 adds none.
Every job-evidence row states WHICH scheduler it came from, and the 14-day
retention on pg_cron history is stated on the surface, because a job whose
history was pruned is not a job that never ran.

**Rollback, retry, idempotency, audit.** The shipped half performs no writes
and files no audit rows. The deferred close, when it ships, is idempotent on
the day it closes, files exactly one audit row through `auditOperatorAction`
with the actor, the request id and the before and after state, and records
whether the close SUCCEEDED rather than whether it was dispatched. A `202
pending approval` on a close means the day is NOT closed, the surface
continues to show it open, and no figure anywhere is relabelled.

**States.** `close.not_closed` as the standing state for every day, because
zero days are signed. `close.manifest_only` for a day with a manifest and no
signature, which is every day that has one. `close.day_missing` for the 137
days with neither. `close.signed` exists in the vocabulary and is currently
unreachable. `close.restated_unattributed` for the one restatement whose
`restated_by` is NULL. `digest.delivered_not_durable` for every digest run,
`digest.run_missed` when a Monday passed without one, `digest.unknown`.
`pnl.on_demand_only` as the standing state, `pnl.dead_source` for
`club_financial_summary`, `pnl.unknown`. `invoice.recorded_not_confirmed` for
every delivery. `job.invocation_only` for a job whose last result was an empty
object, `job.no_evidence` for a job with no rows at all, which is
`/cron/vip-stipend`, and `job.failed` for `ca-settlement-correctness-30m` and
`/cron/ledger-reconcile`. `job.no_evidence` is never rendered as healthy.

**Acceptance criteria.** At 375px the coverage calendar is a vertical list of
days rather than a grid, because a 188-cell grid at 375px is unreadable, and
each row carries the day, whether a manifest exists, and its net amount. The
sentence "No Day Has Been Operator-Signed" appears above it in Title Case. No
horizontal scroll. Desktop: a calendar grid with the manifest detail in a side
panel and the job-evidence table beneath. Both: the word "closed" never
appears next to a day that only has a manifest, the word "delivered" never
appears next to an invoice delivery, and a profit and loss figure always
carries the words "computed at request time" beside it.

**Tests before implementation.** A test that the manifest surface never uses
the word close for a manifest-only day. A test that 51 manifests over a
188-day span renders 137 `close.day_missing` days and not a 100 per cent
coverage bar over the epoch-2 window alone. A test that the restatement with
NULL `restated_by` renders `close.restated_unattributed`. A test that a digest
run renders `digest.delivered_not_durable` and that no digest figure is read
from anywhere except `notifications.data`. A test that
`club_financial_summary` renders its 2026-02-16 date and a dead-source
marker. A test that an empty `result` object renders `job.invocation_only` and
a missing job renders `job.no_evidence`, and that neither renders as success.
A test that every job row names its scheduler. A copy test.

**Production verification to close this scope.** The coverage calendar, the
digest history, one on-demand club profit and loss, the invoice list and the
job-evidence table all rendered at both widths against production, with the
137 missing days visible, the zero-row close state stated in words, and
`/cron/vip-stipend` visibly carrying no evidence at all.

### 3.10 E10 Regulatory-style exports

**Scope as briefed.** Regulatory-style exports: the ability to produce a
defensible file of financial records on request.

**Verdict: DEFERRED on schema. What ships is an honest truncation fix and a
specification, because an export without a job record and an audit identity is
not a regulatory export, it is a download.**

**Existing authority.** `src/components/horses/exportAllCsv.js` is the export
path the console already uses: page size 500 at line 27, page cap 200 at line
28, so a ceiling of 100,000 rows as their product, and it returns an honest
`complete` flag at line 84. `ca_rake_export_start` is the one export function
with a real gate: it raises 42501 on a null `auth.uid()` and caps at 20,000
rows and 730 days. `ca_club_data_exports` and `ca_club_data_export_rows` are
the existing export job tables.

**What does not exist.** An export job record that anyone has used:
`ca_club_data_exports` holds **zero rows** and `ca_club_data_export_rows`
holds **zero rows**, and the table carries no `file_url`, no `format` and no
`progress` column, so it could not describe a produced file even if it were
used. An audit identity: `admin_audit_log` holds 17 rows in total with **zero
export actions**, so no export in the history of this console has an actor
recorded against it.

And there is a live defect in the code that does run. In
`src/components/horses/exportAllCsv.js`, `downloadCsv` is called
UNCONDITIONALLY at line 83, and the `complete` flag is returned to the caller
at line 84 AFTERWARDS. The flag is honest; the ordering is not. **A truncated
file lands on the operator's disk with a normal stamped name and no marker
inside it**, and whether the operator learns it is partial depends entirely on
whether the caller checks the return value. `src/components/horses/FleetPanel.jsx:258`
and `src/components/horses/ApprovalsPanel.jsx:332` do check it and do surface
it. `pages/horses/index.js:2441` was NOT verified, and appendix B carries
that.

**What ships in Phase 7.** Two things, neither of them a new table.

First, THE TRUNCATION FIX, which is the smallest change in this phase and the
one with the highest ratio of safety to effort: when `complete` is false, the
exported file itself carries the truncation IN THE FILE, as a first-row marker
naming the row count exported, the total if known, and the cap that stopped
it, and the file name carries a truncated marker. A file that leaves the
console must state its own completeness, because the file outlives the screen
that produced it and a regulator reads the file. Callers keep their existing
surfaced warning; this is belt and braces, not a replacement.

Second, THE EXPORT SPECIFICATION, deferred, so the work is not lost:

> **An export job record.** One row per export, carrying the actor, the
> request id, the scope and filters exported, the row count, the completeness
> flag, the format, the time, and the outcome. Append-only. Either
> `ca_club_data_exports` gains `file_url`, `format` and `progress` and a
> platform tier, or a new `ca_` table is added; that choice is Dan's and
> appendix B asks it. Every export files exactly one row and one
> `auditOperatorAction` entry, so that "who pulled this file" has an answer.

Until that exists, EVERY EXPORT SURFACE IN PHASE 7 SAYS SO: the copy states
that exports are not recorded and that the operator's own record is the file
they downloaded.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Export any Phase 7 list to CSV | READ | `exportAllCsv.js`, with the in-file truncation marker |
| In-file truncation marker and file name marker | **AUTHORITATIVE WRITE** | Client-side file content. No database write. |
| Rake export with its own gate | EMBED | `ca_rake_export_start`, 20,000 rows and 730 days |
| Export job record | **DEFERRED** | Specified above. No table today. |
| Export audit identity | **DEFERRED** | `admin_audit_log` has zero export actions. |
| Scheduled or emailed export | **NOT SHIPPED** | Delivery is not a Phase 7 capability. |

**Permission and maker-checker.** An export requires exactly the permission
its underlying list requires, and never less: a rake export requires
`money.read` because the rake list does. There is no separate export
permission and Phase 7 does not create one, because a second permission on the
same data is a way for the two to drift apart. The approval kind is `none`:
an export moves no money. When the deferred job record ships, the export
becomes a write that files an audit row, and the approval kind stays `none`
because reading data the operator may already read is not a money operation.

**Engine dependency.** None.

**Rollback, retry, idempotency, audit.** The truncation fix writes only to the
file being produced, so there is nothing to roll back and no database state to
retry. It is idempotent by construction: exporting the same list twice
produces the same marker. **No audit row is written, because today there is
nowhere to write one**, and that absence is itself disclosed on the surface
rather than quietly tolerated. When the job record ships, every export files
exactly one row with the real outcome.

**States.** `export.ready`, `export.truncated` when `complete` is false,
`export.no_job_record` as a standing disclosure that exports are unrecorded,
`export.no_audit_identity` as the companion disclosure, `export.unknown` when
the underlying list could not be read. `export.truncated` is rendered BEFORE
the file is offered, not after it is produced.

**Acceptance criteria.** At 375px the export control is a full-width button
with the row count it will export stated on it and the cap stated beneath it,
so that an operator on a phone knows before tapping whether the file will be
whole. No horizontal scroll. Desktop: the same control with the filter summary
beside it. Both: a truncated export shows a blocking acknowledgement before
the file is produced, the file name carries the truncated marker, and the
first row of the file states the truncation in plain words with no em dash and
no emoji.

**Tests before implementation.** A test that a truncated export writes the
marker into the file content and into the file name. A test that
`downloadCsv` is not reached for a truncated export until the acknowledgement
resolves. A test that the standing `export.no_job_record` disclosure is
present on every export surface. A test that each export's permission equals
its list's permission, enumerated from the route manifest rather than asserted
per case. A test that `pages/horses/index.js:2441` either surfaces `complete`
or is removed from the Phase 7 surface. A copy test.

**Production verification to close this scope.** A real export taken from a
Phase 7 list at both widths against production, once whole and once forced
past the cap, with the truncated file opened and its first row read, the file
name inspected, and the standing disclosure visible on the surface before
either export was taken.

## 4. Permission matrix

Scope by permission by approval kind. Permission strings are exactly those in
`src/lib/horses/permissions.js:32-57`; approval kinds are exactly those in
`APPROVAL_KINDS` at `src/lib/horses/approvals.js:66-73`. `none` in the
approval column means the operation moves no money and needs no second pair of
eyes. Phase 7 is a reporting phase, so `none` is the answer almost everywhere,
and that is the point rather than an oversight.

| Scope | Operation | Permission | Approval kind | Threshold field |
| --- | --- | --- | --- | --- |
| E1 | Supply, store registry, coverage gaps | `money.read` | none | none |
| E1 | Velocity by window | `money.read` | none | none |
| E1 | Circulation total | not shipped | none | none |
| E2 | Register oversight, issuance by class and day | `money.read` | none | none |
| E2 | Approval and audit coverage of issuance | `money.read` | none | none |
| E2 | Unregistered issuance path findings | `money.read` | none | none |
| E2 | Mint or burn chips | LINK to `pages/api/horses/mint.js` | `mint` or `burn` there | `mintThreshold` |
| E3 | Treasury positions, stored versus ledger | `money.read` | none | none |
| E3 | Treasury reconciliation history | `money.read` | none | none |
| E3 | Fund a club | LINK to Phase 6 O3 | `fund_club` there | `fundThreshold` |
| E4 | Conservation verdict and operands | `money.read` | none | none |
| E4 | Drift posture and incident list | `money.read` | none | none |
| E4 | Burn-in gate, twelve checks | `money.read` | none | none |
| E4 | Reconciliation comparison, disclosed | `money.read` | none | none |
| E4 | Financial alerts backlog | `money.read` | none | none |
| E5 | The rake law as it stands | `money.read` | none | none |
| E5 | Rake law findings and stability markers | `money.read` | none | none |
| E5 | Rake by club, day and method | `money.read` | none | none |
| E5 | Two nullable columns on `rake_records` | migration under `.agent/workflows/migration-safety.md` | none | none |
| E6 | Rakeback periods, payouts, run record | `money.read` | none | none |
| E6 | Leaderboard payouts and batches | `money.read` | none | none |
| E6 | Settle rakeback, pay a leaderboard | not shipped | no kind exists | none |
| E7 | BBJ pools, payouts, contributions | `money.read` | none | none |
| E7 | Pay or adjust a jackpot | not shipped | no kind exists | none |
| E8 | Promotional value issued | `money.read` | none | none |
| E8 | Abuse detector output and liveness | `players.read` | none | none |
| E8 | Act on an abuse finding | LINK to Phase 4 and Phase 5 | those phases' kinds | those phases' fields |
| E9 | Manifest coverage, detail, restatements | `money.read` | none | none |
| E9 | Digest run history and recipients | `money.read` | none | none |
| E9 | Profit and loss, computed on demand | `money.read` | none | none |
| E9 | Invoices and delivery records | `money.read` | none | none |
| E9 | Money job evidence | `money.read` | none | none |
| E9 | Sign a daily close | deferred, would be `money.write` | **new kind required** | null, always approved |
| E9 | Durable digest and P and L records | deferred | none | none |
| E10 | Export a Phase 7 list | same as that list's read | none | none |
| E10 | In-file truncation marker | same as that list's read | none | none |
| E10 | Rake export | `money.read` | none | none |
| E10 | Export job record and audit identity | deferred | none | none |

Four facts the table cannot carry.

First, `money.read` is deliberately NOT in `READ_FLOOR` at
`src/lib/horses/permissions.js:80`, so the `support` role cannot see money at
all. Almost every row above is `money.read`, which means almost all of Phase 7
is invisible to support by design. Nothing in this phase widens that, and an
agent who finds a support operator unable to open an economy panel has found
the design working.

Second, the `operations` role holds `money.read` and NOT `money.write`. That
is exactly the right shape for this phase: an operations operator sees every
figure in Phase 7 and can act on none of them, because Phase 7 has nothing to
act on.

Third, `THRESHOLD_FIELD` at `src/lib/horses/approvals.js:80-87` maps `mint`
and `burn` to `mintThreshold`, `fund_club` to `fundThreshold`, `cashout` to
`cashoutThreshold`, and `fleet_policy` and `sanction` to NULL. A null
threshold means the kind ALWAYS needs a second pair of eyes once approvals are
on. The deferred daily close belongs in that null category, because a
signature is not an amount. And `requiresApproval` at
`src/lib/horses/approvals.js:147` treats a MISSING amount as REQUIRED, per
line 154, because "we could not read the amount" is not the sentence "the
amount is small". Phase 7 relies on that and never papers over an unreadable
amount with a zero.

Fourth, and this is the fact most likely to be misread: **THERE IS NO
APPROVAL KIND FOR ANY PAYOUT PATH IN THIS PHASE'S SUBJECT MATTER.**
`APPROVAL_KINDS` contains no `rake`, no `rakeback`, no `bbj`, no `leaderboard`
and no `promotion`. Rakeback settles weekly, leaderboards pay daily and
jackpots pay automatically, and none of them has ever had a second pair of
eyes. Phase 7 does not add a kind, because a kind attached to a payer this
console does not call would never fire and would read, on inspection, as
coverage that does not exist. It states the absence on the surface and in
appendix B.

As of 2026-09-23, `ca_operator_approvals` holds zero rows and
`ca_operator_policy` has `approvals_enabled = false` with all three thresholds
at 0, so even the kinds that do exist have never run for money. That is Phase
2's deliberate default. Phase 7 does not change it and does not imply it has
been exercised.

## 5. Console and route shape

New route `/api/horses/economy-admin`, sections `supply`, `velocity`,
`register`, `treasury`, `conservation`, `drift`, `burnin`, `rakelaw`,
`rakeback`, `leaderboard`, `bbj`, `promotions`, `abuse`, `close`, `digest`,
`pnl`, `invoices`, `jobs`, `exports`. **It has no actions**, because Phase 7
writes nothing at runtime. A route with no action handler is not an oversight
here; it is the contract, and a law test asserts the handler map is empty.

Built on `withOperatorRoute` from `src/lib/horses/operatorRoute.js` exactly as
every other console route is, with the method allowlist, the rate limit,
operator auth, the permission check and the response envelope owned by the
wrapper. The method allowlist is GET only. Responses use the Phase 1 paged
shape `{ rows, total, limit, offset, hasMore }` with `truncated` wherever a
cap can bite, `total: null` rather than a fabricated count on the large
tables, and `.maybeSingle()` wherever a single row is read.

**Tabs.** `src/components/horses/tabRegistry.js:80-81` currently registers
`economy` and `mint` as `legacy: true` inline entries. Phase 7 converts both
to code-split entries with their own `load` thunk, exactly like the Phase 5
`integrity` entry at `src/components/horses/tabRegistry.js:132-133`:

- `economy`, label "Economy", permission `money.read`, loading
  `EconomyPanel.jsx`
- `mint`, label "The Mint", permission `money.read`, loading `MintPanel.jsx`

The Economy tab's heading stops being "Diamond Economy". Diamonds do not
disappear: they become a named section of the economy panel beside chips, and
`/api/horses/economy-stats` keeps serving them. What changes is that a tab
called Economy shows the platform's economy rather than one currency of it.

**New components** under `src/components/horses/`, each mirroring the Phase 5
`IntegrityPanel.jsx` pattern: `EconomyPanel.jsx` for E1, E3, E4 and E9's read
half; `MintPanel.jsx` for E2, carrying the existing mint form unchanged;
`RakePanel.jsx` for E5, E6 and E7; `EconomyExport.jsx` for E10's shared export
control. Shared model files sit beside them as `economyModel.js` and
`economyAdmin.js`, matching `integrityModel.js` and `integrityAdmin.js`.

**None of this goes in `pages/horses/index.js`.** That file is 8,118 lines on
2026-09-23 and already holds both of the tabs this phase owns. Phase 7 MOVES
code out of it and adds none to it. The conservation card now inline at
`pages/horses/index.js:4744-4793` moves into `MintPanel.jsx` with its
behaviour preserved exactly, including the red state, and a law test asserts
the file's line count went DOWN in a Phase 7 commit rather than merely not up.
This is the first phase where that assertion is a decrease.

Every surface renders the freshness or disclosure its scope requires BEFORE
its own content, in the Phase 5 and Phase 6 pattern: the snapshot age above
the supply total, the conservation verdict above the register, the last-run
date above the rakeback figures, the detector liveness above the abuse counts,
the export disclosure above the export button.

## 6. Tests

The per-scope tests each section names above, plus one law file,
`__tests__/horses-phase7-no-figure-claims-more-than-it-knows.law.test.mjs`,
pinning the rules that cut across scopes:

- No Phase 7 source file references `fn_ca_circulation_total`.
- No Phase 7 path reads `severity` from a `ledger_reconcile_log` row whose
  `entity_type` is `chip_circulation`.
- No Phase 7 path calls a money-moving function: not `fn_ca_mint`, `fn_ca_burn`,
  `fn_mint_club_chips`, `fn_mint_chips_from_diamonds`, `fn_credit_treasury`,
  `fn_debit_treasury`, `settle_club_rakeback`, `fn_settle_club_rakeback_batch`,
  `fn_payout_leaderboard`, `bbj_atomic_payout_v2`, `fn_ca_fund_club`.
- No Phase 7 path calls a scheduled job function in any form:
  `fn_ca_ledger_day_manifest`, `fn_ca_weekly_revenue_digest`,
  `fn_ca_daily_attestation`, `fn_rake_law_check`, `reconcile_ledger_nightly`.
- The `/api/horses/economy-admin` handler map contains no action, and the
  method allowlist is GET only.
- Every control in every Phase 7 route manifest is classified LINK, EMBED,
  READ or AUTHORITATIVE WRITE, and the manifest matches the code.
- Every conservation, balance or reconciliation verdict is computed from its
  operands in the response, and no response field carries a verdict boolean
  that was not derived in the same request.
- Every figure that depends on a scheduled job carries the job's last run time
  and the scheduler that ran it.
- `unknown`, `stale`, empty-clean and never-run are four distinct states in
  every scope that can produce them, and no code path collapses any pair.
- No read path writes an audit row, and Phase 7 has no write path to test.
- Every read path excludes no horse, and every `p_include_horses` is omitted
  or passed true; no Phase 7 query filters on `is_horse`.
- No Phase 7 source file contains an em dash, an en dash or an emoji, and no
  Phase 7 string contains "bot" or "AI Model".
- `pages/horses/index.js` got SHORTER.

Two testing prohibitions carry the same weight as the assertions.
**No test spends a real chip.** Every money-adjacent behaviour is proved by
reading production, by a rolled-back transaction, or by a fixture; no test
mints, burns, funds, settles or pays anything, including small amounts,
including on a club that looks unused. And **no test asserts against a live
production count that moves**: `ca_mint_ledger` grew by 467 rows and
`ca_drift_incidents` by 15 while this contract was being written. Tests assert
SHAPES, STATES and RELATIONSHIPS. Appendix A's numbers are evidence, not
fixtures.

## 7. What Phase 7 will NOT do

Stated as prohibitions because each one is a thing a reasonable agent would
otherwise do.

**No new money path, and no button that moves a chip.** Phase 7 reports. It
does not mint, burn, fund, settle, pay, refund, correct, void or reverse. The
existing mint form moves into `MintPanel.jsx` unchanged and keeps its own
rules; nothing else in this phase writes money, and a second writer into a
money table is a defect regardless of how convenient it is.

**No calling `fn_ca_circulation_total()`.** It is the most tempting function
in the schema and it is wrong by roughly thirty million chips for this
purpose. Section 2.1 records why. Supply comes from `ca_supply_snapshots`.

**No rendering a hardcoded severity as a result.** `reconcile_ledger_nightly`
writes `'ok'` into every `chip_circulation` row it produces. That string is an
artefact of the writer, not a finding, and no Phase 7 surface presents it as
one.

**No green tick over an unknown.** Zero rows in `abuse_logs` is not clean.
Zero mint actions in `admin_audit_log` is not clean. A manifest is not a
close. A read flag is not a receipt. An empty `result` object is not a
success. Each of these renders as what it is.

**No fixing the rake law, the engine, or the grants.** The rake law is
correct. The RakeConfig disagreement at
`src/lib/poker-engine/RakeConfig.js:190` is engine work. The
`commander_promotion_awards` grant to `anon` is a migration with a blast
radius this console does not own. The 58 authenticated-executable money
functions are a security finding, not a Phase 7 task. Phase 7 renders all of
them as findings and changes none of them.

**No backfill of the new rake columns.** Rows written before the migration
keep NULL and say so. A backfilled seat count would be a guess dressed as a
record, and a guess in an audit column is worse than a gap.

**No watcher, cron or repair loop.** Nothing in this phase certifies a
release, supplies correctness, or repairs data so a surface looks right.
Scheduled application work is **Open Claw's**, never the Claude scheduler. No
Vercel cron is added; `vercel.json` already carries 13 legacy ones and
`.agent/workflows/no-vercel-crons.md` forbids more. Phase 7 is forbidden to
invoke `fn_ca_ledger_day_manifest`, `fn_ca_weekly_revenue_digest`,
`fn_ca_daily_attestation`, `fn_rake_law_check` or `reconcile_ledger_nightly`
to freshen a panel. A stale panel says it is stale.

**No real-chip testing.** Every money-adjacent behaviour is proved by reading
production or in a rolled-back transaction. There is no funding, no mint and
no payout anywhere in this phase's verification.

**No new inline code in `pages/horses/index.js`.** The file is 8,118 lines.
Phase 9 exists to shrink it, and Phase 7 shrinks it early by moving the
Economy and Mint tabs out.

**No "AI Model" control, and no calling horses bots.** Horses are players
running deterministic HorseLogic, never a language model. No economy surface
describes them otherwise.

**No hiding horse evidence.** No Phase 7 figure, report, aggregate or export
excludes, suppresses or down-ranks a horse because it is a horse. The three
`p_include_horses boolean DEFAULT true` parameters are disclosure toggles,
they default to inclusion, and they stay. Given that every seated player on
the platform was a horse on 2026-09-23, an economy report that suppressed them
would report an economy with no players in it.

**No score presented as a verdict.** E8 computes no abuse score and ranks
nobody. E5 renders findings with their stability marker and never as a
judgement about a club or an operator.

**No restriction, sanction or enforcement presented as applied.** Phase 4's
enforcement flag is still Dan's to turn on, and nothing in Phase 7 implies a
player was restricted, a club was suspended or a payout was held unless
production did it.

**No approval kind invented for an operation this phase does not ship.** The
absence of a `rakeback`, `bbj`, `leaderboard` and `promotion` kind is a
measured fact that gets disclosed, not a gap an agent quietly fills.

## Appendix A. Measured reality, 2026-09-23

Measured against commit `8b760a501dde201b87a891d26f6891262254ea1c` and
Supabase project `kuklfnapbkmacvwxktbh`. Counts are exact `count(*)` where the
table is small and the planner's `reltuples` estimate where it is large; the
distinction is marked. These are moving numbers, not fixtures. Two of them
moved while this document was being written and both are shown with their
drift, because the fact that they move is itself the evidence that they are
live and not copied from an older document.

### A.1 Chip supply, as the meter reports it

Latest `ca_supply_snapshots` row, basis `pending-addon-v4`, total
**192,764,749.68** chips, meter taken at 2026-09-23 13:05:00 UTC.

| Store | Chips |
| --- | ---: |
| `member_wallets` | 172,817,428.29 |
| `agent_wallets` | 10,071,000.00 |
| `club_wallets` | 4,353,569.22 |
| `union_wallets` | 3,139,800.85 |
| `treasuries` | 1,859,884.94 |
| `bbj_pools` | 193,145.22 |

`ca_supply_snapshots` holds 559 rows spanning 2026-08-31 to 2026-09-23 and
**has NO triggers**: no append-only guard, no hash chain, no store-declaration
check. It is freely mutable and is NOT tamper-evident the way `chip_ledger`
is.

`ca_chip_store_coverage` holds 25 rows: 16 `counted`, 4 `noncirculating`, 5
`uncounted`. `fn_ca_chip_store_coverage_gaps()` returns 0 gaps. The trigger
`ab_ca_chip_store_declared` calling `fn_ca_chip_store_declared()` blocks a
`chip_ledger` INSERT naming an undeclared store.

**`fn_ca_circulation_total()` returns 222,887,573.15 and is WRONG for supply
reporting.** It counts `table_seats.stack WHERE left_at IS NULL` across all
tables, including tournament tables, and ignores the `is_platform` club
filter.

| Seat set | Seats | Chips |
| --- | ---: | ---: |
| Tournament tables | 3,260 | 50,140,500.00 |
| Non-tournament tables | 189 | 50,886.91 |

Velocity, measured directly against `chip_ledger` for this contract, using
`idx_chip_ledger_created_at`. No operator measure exists.

| Window | Ledger rows | Chips moved |
| --- | ---: | ---: |
| 24 hours | 362,036 | 4,024,425.34 |
| 7 days | 1,543,683 | 17,515,040.18 |

### A.2 Conservation, drift and the burn-in gate

`fn_ca_mint_register_vs_supply()`, re-read at drafting time:

| Field | Value |
| --- | ---: |
| `register_net` | 192,758,225.66 |
| `register_net_at_meter` | 192,758,945.84 |
| `meter_total` | 192,764,749.68 |
| `meter_taken_at` | 2026-09-23 13:05:00 UTC |
| `difference` | 5,803.84 |
| `unexplained_since_baseline` | 1,580.89 |
| `balanced`, computed | **false** |
| Unexplained residue | **4,222.95** |

Diamonds pass exactly: difference 0.

`fn_ca_drift_metrics()`: `open_total` 52, `open_critical` 44, `past_target`
13, `worst_open_drift` 2,624.78. It is **executable by `authenticated` with no
admin gate**, which discloses the platform's drift posture to any signed-in
caller. `ca_drift_incidents` held 6,283 rows at measurement and 6,298 when
re-counted during drafting.

`fn_ca_midway_burnin_gate(24)` returns
**`"FAIL - do not restart Midway/Shark/JAQK yet"`**. Nine of twelve checks
pass. The three that fail:

| Check | Value |
| --- | ---: |
| `no_open_critical_incidents` | 44 |
| `no_unresolved_unknowns` | 38 |
| `no_new_criticals_in_window` | 38 |

Passing, and worth recording because they are the platform's strongest
evidence: the ledger hash chain is clean with 0 breaks in 50,000 rows checked,
suspense flow is zero, write failures are zero, and there are no unregistered
money RPCs.

`reconcile_ledger_nightly()` into `ledger_reconcile_log`, 59,274 rows, for
run date 2026-09-23, re-queried for this contract:

| `entity_type` | `severity` | Rows | Max abs `drift` |
| --- | --- | ---: | ---: |
| `chip_circulation` | `ok` | 4 | 84,156,151.15 |
| `club_treasury` | `ok` | 4 | 0.00 |
| `frozen_wallets_pool` | `ok` | 1 | 0.00 |
| `insurance_bank` | `ok` | 1 | 0.00 |

Ten of ten `ok`. The job summary reports `worst_drift: 84,166,606.77` and
`"ok": true` in the same object. The `drift` column is
`GENERATED ALWAYS AS (stored_balance - ledger_balance)`, and for
`chip_circulation` those two columns hold different quantities, so the value
is a composition, not a variance. The severity is hardcoded by the writer.

`club_profit_reconcile_log`, pg_cron jobid 273 at `35 0 * * *`: 3,851 rows,
1,495 applied, each recording what it corrected. This is the reconciliation
that works.

`financial_health_checks`: 1,049 rows, 10 passed and 1,039 failed, **last
written 2026-08-05 22:36 UTC**. `financial_alerts`: 62,200 rows, 57,129
critical, 21,618 unresolved at measurement and 21,621 when re-counted during
drafting.

### A.3 Row counts by scope

Exact counts unless marked estimate.

| Table or object | Rows | Scope |
| --- | ---: | --- |
| `ca_chip_store_coverage` | 25 | E1 |
| `ca_supply_snapshots` | 559 | E1 |
| `chip_ledger` | 5,572,013 (est) | E1, E4 |
| `chip_transactions` | 829,517 (est) | E1 |
| `ca_mint_ledger` | 349,527, re-counted 349,994 | E2 |
| `ca_operator_approvals` | **0** | E2, all |
| `admin_audit_log` | 17 total, **0 mint, 0 export** | E2, E10 |
| Money-named functions | 334 total, **58 authenticated-executable**, 0 anon | E2 |
| `clubs` with a treasury position | 4, all `ok` | E3 |
| `ca_drift_incidents` | 6,283, re-counted 6,298 | E4 |
| `ledger_reconcile_log` | 59,274 | E4, E5 |
| `club_profit_reconcile_log` | 3,851, 1,495 applied | E4 |
| `financial_health_checks` | 1,049, dead since 2026-08-05 | E4 |
| `financial_alerts` | 62,200, 21,618 critical unresolved | E4 |
| `ca_rake_rules` | 1 (id 1), **no history table** | E5 |
| `rake_records` | 3,306,470 (est) | E5 |
| `rake_law` findings, critical | **1,180** `under_spec` | E5 |
| `rake_law` findings, warning | 61 `board_not_recorded` | E5 |
| `rake_law` findings, `over_spec` | **0** | E5 |
| `rakeback_periods` | 7,135: 3,777 paid, **3,358 pending** | E6 |
| Rakeback paid total | 413,221.89 | E6 |
| Rakeback **pending** total | **433,681.29** | E6 |
| `rakeback_period_payouts` | 3,124: 3,123 paid 369,231.29, 1 failed | E6 |
| `leaderboard_payouts` | 6, totalling 1,000.00 | E6 |
| `bbj_pools` | 5 | E7 |
| `bbj_payouts` / `bbj_winners` | 80 / 80 | E7 |
| `bbj_contributions` | 1,689,069 (est) | E7 |
| `abuse_logs` | **0** | E8 |
| `signup_abuse_log` | **0** | E8 |
| `ca_ledger_day_manifests` | **51** over a 188-day span | E9 |
| `ca_ledger_day_manifest_restatements` | 1, `restated_by` NULL | E9 |
| `commander_day_closes` | **0** | E9 |
| Weekly digest `notifications` rows | 3, 1 distinct recipient | E9 |
| Daily attestation `notifications` rows | 26, 3 recipients | E9 |
| `club_financial_summary` | 2, dead since 2026-02-16 | E9 |
| Financial matviews | **0** | E9 |
| `union_pnl_settlements` | 10, with `club_results` jsonb | E9 |
| `settlement_invoices` | 131: 125 paid, 4 overdue, 2 generated | E9 |
| `accounting_invoice_deliveries` | 211, 108 marked read | E9 |
| `ca_club_data_exports` | **0** | E10 |
| `ca_club_data_export_rows` | **0** | E10 |

Live BBJ pool balances: union main 84,120.01, union backup 53,644.05, club
main 34,016.10, club backup 21,421.79. BBJ payouts: main 36 rows totalling
218,914.74, mini 44 rows totalling 26,400.00.

`ca_ledger_day_manifests` last row: day 2026-09-22, `row_count` 264,488,
`net_amount` 2,951,807.80. Contiguous run of 23 days since financial epoch 2
(`ca_financial_epochs` id 2, started 2026-08-31 14:35:01). **137 days in the
188-day span have no manifest.**

### A.4 Functions and guards actually read

Money functions, with their volatility and grants as read from `pg_proc` and
`information_schema`:

```
fn_ca_mint(...)                      VOLATILE, SECURITY DEFINER, service_role only, op_id idempotent
fn_ca_burn(...)                      VOLATILE, SECURITY DEFINER, service_role only, op_id idempotent
fn_ca_treasury_positions()           STABLE,   SECURITY DEFINER, service_role only, 0 console callers
fn_ca_mint_register_vs_supply()      returns register_net, register_net_at_meter, meter_total,
                                     meter_taken_at, difference, unexplained_since_baseline.
                                     Returns NO verdict column.
fn_ca_drift_metrics()                executable by authenticated, NO admin gate
fn_ca_midway_burnin_gate(integer)    twelve checks, returns a text verdict
fn_ca_chip_store_coverage_gaps()     returns 0 rows today
fn_ca_circulation_total()            WRONG for supply. 222,887,573.15. Never call.
fn_ca_ledger_day_manifest(day, reason)   journal integrity, NOT a financial close
fn_ca_weekly_revenue_digest(7)       persists nothing; figures live in notifications.data->'digest'
fn_ca_daily_attestation()            same pattern, jsonb discarded by the scheduler
fn_ca_fleet_pnl(...)                 exposed at pages/api/horses/fleet-admin.js:653, MONEY_READ
fn_rake_cap_for_dealt(...)           applies ca_rake_rules
fn_effective_rake(...)               v_short_ok := p_seats IS NULL OR p_seats <= 0
                                       OR p_seats >= short_handed_min_seats  (fails OPEN to the player)
fn_rake_law_check(interval)          -> fn_rake_law_violations -> ledger_reconcile_log
fn_rake_law_violations(...)          reads tables.max_players LIVE; 0 references in pages/, src/, lib/
settle_club_rakeback(uuid)           SECURITY DEFINER, granted to authenticated,
                                       NO authorization check in its own body
fn_settle_club_rakeback_batch(...)   service_role only; the only real gate on the above
fn_payout_leaderboard(...)           sets app.ledger_category and never resets it
bbj_atomic_payout_v2(...)            service_role, fully automatic, no human in the loop
fn_deliver_accounting_invoice(...)   enforces 8 named refusal codes; in-app delivery only
ca_rake_export_start(...)            raises 42501 on null auth.uid(); caps 20,000 rows / 730 days
fn_mint_chips_from_diamonds(...)     SECURITY DEFINER, authenticated-executable,
                                       a chip issuance path OUTSIDE service_role-only fn_ca_mint
fn_admin_remove_player_chips(...)    SECURITY DEFINER, authenticated-executable
fn_cashier_batch_transfer(...)       authenticated-executable
fn_wallet_type_transfer(...)         authenticated-executable
fn_cashout_approve / _release        NOT security definer; rely on RLS
```

Triggers and guards:

```
trg_ca_append_only            -> fn_ca_journal_append_only()   chip_ledger, append-only
ab_ca_chip_store_declared     -> fn_ca_chip_store_declared()   blocks undeclared stores
trg_ca_mint_register_append_only                                ca_mint_ledger, append-only
chip_ledger.chain_seq          hash chain, 0 breaks in 50,000 rows checked
ca_supply_snapshots            NO TRIGGERS. Freely mutable.
rakeback_period_payouts        append-only
rakeback_periods               MUTABLE. 3,358 pending rows editable before payout.
leaderboard_payouts            NO TRIGGERS. Mutable and deletable.
leaderboard_payout_batches     NO TRIGGERS. Mutable and deletable.
bbj_payouts / bbj_winners      DELETE-guarded, NOT UPDATE-guarded.
table_seats                    NO autoledger trigger. BBJ credits a stack here with no ledger leg.
commander_promotion_awards     grants arwdxtm to anon AND authenticated; NO DELETE policy.
```

`ca_rake_rules`, the law as it stands, id 1: `heads_up_cap_factor` 0.5,
`short_handed_cap_factor` 0.75, `short_handed_max_players` 3,
`short_handed_min_seats` 9, `bbj_min_players_dealt` 3, `heads_up_percent` 5,
`max_rake_percent` 10, `max_rake_cap_bb` 10, `no_flop_no_drop` true. All three
of the owner's stated rules MATCH. `rake_records` records `num_players` with 0
NULLs in 503,306 rows over 7 days, and records **no seat count and no cap in
force**.

### A.5 Scheduled money work, and the evidence it leaves

**Two schedulers run money work, and neither is the Claude scheduler.** Open
Claw, dispatched by `scripts/openclaw-cron-dispatcher.py` with status in
`public.cron_execution_log`; and pg_cron, **130 in-database jobs**, status in
`cron.job_run_details`, which a retention job at jobid 280 **deletes past 14
days**. `vercel.json` still carries 13 legacy crons and
`.agent/workflows/no-vercel-crons.md` forbids adding more.

| Job | Schedule | Evidence it leaves |
| --- | --- | --- |
| `ca-ledger-day-manifest`, jobid 181 | `25 4 * * *` | `ca_ledger_day_manifests`, 51 rows over 188 days |
| `ca-revenue-digest-weekly`, jobid 203 | `0 13 * * 1` | Notification only; jsonb discarded. Last success 2026-09-21 |
| `ca-daily-attestation`, jobid 180 | daily | Notification only; jsonb discarded |
| `rake-law-adherence-hourly` | `40 * * * *` | `ledger_reconcile_log`, `entity_type='rake_law'` |
| `rake-law-wide-daily` | `50 7 * * *` | Same |
| `leaderboard-payout-waterfall-daily` | `20 0 * * *` | `leaderboard_payouts` (no triggers) |
| `club-profit-reconcile`, jobid 273 | `35 0 * * *` | `club_profit_reconcile_log`, records what it corrected |
| `ca-settlement-correctness-30m`, jobid 178 | every 30 min | **FAILED 2026-09-23 12:15, statement timeout** |
| `/cron/ledger-reconcile` | nightly | **ERROR 2026-09-23 08:00, HTTP 500, `supabase request exceeded 20000ms`** |
| `/cron/rakeback-period-settle` | weekly Mon | 12 runs, `result = {}` every time, **last run 2026-08-24** |
| `/cron/vip-stipend` | daily | **0 rows in `cron_execution_log`** |
| `/cron/auto-settlement` and `_distribute` | daily | `result = {}` at or before 2026-08-24 |
| Retention, jobid 280 | daily | Deletes `cron.job_run_details` past 14 days |

`/cron/rakeback-period-settle` is **absent from `v_openclaw_job_staleness`**
because that view requires five or more successes in thirty days, so a job
that stopped running four Mondays ago is invisible to the staleness watcher.
**No reconciliation exists anywhere between what a job believed it did and
what the ledger shows**: nothing compares `/cron/auto-settlement`'s reported
"0 invoices generated" against `settlement_invoices`.

### A.6 Console facts

`pages/horses/index.js` is 8,118 lines.

The Economy tab opens at `pages/horses/index.js:4507` and renders
`<h2>Diamond Economy</h2>`, calling `/api/horses/economy-stats`, which reads
diamonds, VIP and `profiles` and touches **zero chip tables and zero chip
RPCs**. The Mint tab opens at `pages/horses/index.js:4718` and carries the
conservation card at `pages/horses/index.js:4744-4793`, which is currently
RED and is the only place in the console where the conservation verdict
appears.

Both tabs are registered `legacy: true` and inline at
`src/components/horses/tabRegistry.js:80-81`, both gated `money.read`. There is
no `EconomyPanel.jsx` and no `MintPanel.jsx`. The Phase 5 pattern to follow is
`src/components/horses/IntegrityPanel.jsx` with its registry entry at
`src/components/horses/tabRegistry.js:132-133`.

`src/components/horses/exportAllCsv.js`: page size 500 at line 27, page cap
200 at line 28, so a 100,000-row ceiling as their product; `downloadCsv` is
called at line 83 UNCONDITIONALLY and the honest `complete` flag is returned
at line 84 afterwards. Callers `src/components/horses/FleetPanel.jsx:258` and
`src/components/horses/ApprovalsPanel.jsx:332` do surface it;
`pages/horses/index.js:2441` was not verified.

`src/lib/horses/permissions.js:32-57` holds `PERMISSIONS`; `READ_FLOOR` is at
line 80 and does NOT contain `money.read`. `src/lib/horses/approvals.js:66-73`
holds `APPROVAL_KINDS`; `THRESHOLD_FIELD` is at lines 80-87; `requiresApproval`
is at line 147 and treats a missing amount as REQUIRED at line 154.

Engine-side, `src/lib/poker-engine/RakeConfig.js:190` sets
`minPlayersDealt: 4` against a database law of 3, and
`src/lib/poker-engine/LobbyManager.js:781` reads
`const rakeAmount = data.rake || 0;`, accepting the engine's rake on trust.
`atomic_distribute_rake` has no `p_seats` parameter.

## Appendix B. Open questions

Things that could not be determined from this worktree or this database. None
of them is assumed in the contract above; each one blocks something named.

1. **What is writing the 4,222.95 chip residue.** Conservation reports
   `difference` 5,803.84 against `unexplained_since_baseline` 1,580.89, so
   4,222.95 chips reached or left a balance without a register row. The
   journal legs cannot be the source: `chip_ledger` is append-only with an
   unbroken hash chain and an undeclared-store guard. Three candidates were
   NOT ruled out and NOT confirmed: `fn_mint_chips_from_diamonds`, which is a
   chip issuance path outside `fn_ca_mint`; the BBJ credit leg, which does
   `UPDATE table_seats SET stack = stack + p_amount` against a table with no
   autoledger trigger; and direct writes to `ca_supply_snapshots`, which has
   no triggers at all. **Blocks: closing E4 with a green conservation card
   ever.** Resolve by tracing the residue to its writer before Phase 8.

2. **Whether `ca_supply_snapshots` should be tamper-evident.** Every supply
   figure in this phase rests on a table with no append-only guard, no hash
   chain and no store-declaration check, and it is compared against a register
   that has all three. Whether to add guards, and whether adding them would
   break the writer that populates it, was not determined. **Blocks: treating
   the meter as evidence of equal weight to the register.**

3. **Whether the abuse detectors run.** `abuse_logs` and `signup_abuse_log`
   both hold zero rows. Whether the detectors execute and find nothing, or do
   not execute, was not established; no scheduler entry for either was
   identified. The two answers demand opposite operator behaviour. **Blocks:
   knowing which E8 empty state is the honest one.**

4. **Who supplies the seat count to `rake_records`.** E5 adds the columns and
   the reader. The writer needs a `p_seats` parameter on
   `atomic_distribute_rake` and an engine change to pass it, which is a Tier 3
   RPC signature change under `.agent/workflows/migration-safety.md` and is
   engine work. **Blocks: any rake law finding ever becoming
   `derived_from_record`.**

5. **DECIDED, not open. The operator-signed close gets a new `ca_daily_closes`
   table.** `commander_day_closes` is the only close-shaped table and it holds
   zero rows, but it belongs to the Commander venue product, which is a
   different domain, and Phase 6 already found its sibling
   `commander_export_jobs` keyed on `venue_id integer` and wrong for the
   platform tier. Reusing it would put a platform act in a venue table. E9
   therefore adds `ca_daily_closes`, append-only, carrying the manifest
   `sha256` it signs. **Blocks nothing.**

6. **DECIDED, not open. The platform export job record is a new
   `ca_operator_export_jobs` table.** `ca_club_data_exports` holds zero rows,
   is club-scoped, and has no `file_url`, `format` or `progress` column.
   Widening a club table to carry platform-operator exports would blur a scope
   boundary that the rest of the console keeps clean, and it would change a
   table that another product may yet start using. E10 adds a separate
   `ca_operator_export_jobs` and leaves `ca_club_data_exports` untouched.
   **Blocks nothing.**

7. **RESOLVED, not open. All three callers surface the flag.**
   `pages/horses/index.js:2479-2482` branches on `result.complete` and shows
   `Exported N Audit Entries. The Export Stopped At Its Page Cap And Is
   Incomplete.` at tone `info`, the same honest wording as
   `FleetPanel.jsx:258` and `ApprovalsPanel.jsx:332`. No truncated export
   reaches an operator unlabelled from any current caller. The residual defect
   is the one named in E10: the FILE itself still carries no marker, only the
   notification does. **Blocks nothing.**

8. **What the 58 authenticated-executable money functions are collectively
   exposed to.** The measurement named nine of them and confirmed that zero
   are anon-executable and zero carry a default PUBLIC EXECUTE. The remaining
   functions were not individually reviewed, and `fn_ca_drift_metrics` shows
   that even a read-only one can be an information disclosure. **Blocks:
   nothing in Phase 7, which only renders the finding, but it blocks any claim
   that the money surface is understood.**

9. **Why `/cron/vip-stipend` leaves no row in `cron_execution_log` at all.** A
   daily diamond payer with zero execution evidence is either not running or
   running outside the recorded path. Which was not determined. **Blocks:
   E9's job-evidence section distinguishing `job.no_evidence` from a job that
   never existed under that name.**

10. **Whether `reconcile_ledger_nightly`'s `chip_circulation` rows are a bug
    or a deliberate composition report wearing the wrong table.** The
    hardcoded `'ok'` and the generated `drift` column suggest the rows were
    added to an existing table because it was convenient. Whether to fix the
    function, move the rows, or leave both and document, was not decided.
    **Does not block E7's disclosure, which renders the truth either way, but
    it blocks the surface ever showing a `chip_circulation` severity.**

11. **Whether the digest's figures can be reconstructed from
    `notifications.data` for past weeks.** Three notification rows exist. If
    the payload is complete, the deferred digest record could be seeded from
    them; if it is a rendered summary, it cannot. The payload shape was not
    inspected. **Blocks: knowing whether E9's deferred digest record starts
    empty or with history.**

12. **Whether a CI gate scans `docs/` for em dashes and emoji.** Phase 6 asked
    the same question and it was not resolved. This file complies regardless
    and was verified to contain zero non-ASCII characters before it was
    committed to the branch.

## 8. Verification before Phase 8

Phase 7 is not done when the panels render. It is done when:

- Every scope's named tests pass, the law file passes, and the build and all
  gates are green.
- The one migration this phase ships, E5's two nullable columns on
  `rake_records`, is additive, applied in one transaction, dry run first,
  registered, and verified by `execute_sql` against
  `supabase_migrations.schema_migrations` and never by `list_migrations`. Both
  columns are present, nullable and empty, and no backfill ran.
- Every deferred item, E9's three durable records and E10's export job record,
  has been put to Dan as a decision with its schema written out, and his
  answer is recorded in this document's successor rather than assumed by an
  agent.
- `pages/horses/index.js` is SHORTER than 8,118 lines and the Economy and Mint
  tabs are loaded from `EconomyPanel.jsx` and `MintPanel.jsx`.
- The conservation card has been seen RED in the new panel, with the residue
  of 4,222.95 chips or its value on the day, because a red state that has only
  been seen in a test is a state nobody has checked the wording of.
- The burn-in gate has been seen rendering FAIL with its three failing checks
  named, and no surface anywhere offers a restart.
- The nightly reconciliation's 84,156,151.15 figure has been seen rendered
  with its disclosure and WITHOUT the word `ok` anywhere near it.
- The 1,180 rake law criticals have been seen grouped and marked
  `derived_live`, and `over_spec` has been seen rendered as an explicit zero
  in words.
- A truncated export has been taken, the file opened, and its in-file
  truncation marker read, because the file outlives the screen.
- No chip was minted, burned, funded, settled or paid at any point in this
  phase's verification, and the audit log shows no Phase 7 write, because
  Phase 7 has no write path.
- Every surface has been RENDERED IN A BROWSER at desktop and at 375px against
  production. Phase 4 proved that step finds defects the tests cannot, and
  Phases 5 and 6 repeated the finding.
- An adversarial review pass has run with its findings closed.
- The branch is pushed. Nothing in this phase is committed or pushed by an
  agent without Dan asking for it.
