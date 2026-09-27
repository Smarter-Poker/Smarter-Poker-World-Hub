# Phase 6 contracts - Floor operations

Binding for every agent building Phase 6. The Phase 1 to Phase 5 contracts
still apply in full.

Phase 6 is O1 to O8 of the ten-phase Stable Admin program: the live floor,
tournament oversight, club oversight, union oversight, the cashier queues,
rake reporting, the download centre, and announcements. It is the first phase
whose subject matter is almost entirely OWNED SOMEWHERE ELSE ALREADY. Club
Arena has sixty-four operator routes under `pages/api/club-arena/`, the engine
runs the floor, and the union money paths are roughly ninety `fn_union_*`
functions that predate this console by months.

So the governing question of this phase is not "what should we build". It is
"what already decides this, and how does the console reach it without becoming
a second, weaker copy of it".

Everything below was measured against production and against commit
`9373149ecb83b6f7130ca920535e3592a17dfce3` on 2026-09-23. Appendix A records
the measurements so a future agent can tell what has drifted. Where a thing
was NOT measured, it says so rather than asserting.

## 0. The safety rule that outranks everything here

**A FLOOR CONTROL MAY NEVER CLAIM AN AUTHORITY IT DOES NOT HOLD.**

Phase 4's rule was that an operator must not be told a player is stopped when
they are not. Phase 5's was that an integrity surface must not imply it is
watching something it is not watching. Phase 6's is the same failure applied
to a button: a control labelled "Close At Hand Boundary" that in fact writes
`tables.status = 'closed'` and hopes, or a "Pause" that the engine has never
heard of, is worse than no button, because the operator who pressed it walks
away believing the floor did what the label said.

This is not hypothetical. It is what the measurement found. See section 2.

Six consequences this phase is built around:

1. **Every control declares its class, and the class is honest.** A control is
   a LINK to a Club Arena surface, an EMBED of a Club Arena read, a READ, or
   an AUTHORITATIVE WRITE. Nothing in Phase 6 invents a fifth class called
   "we updated a status column and assumed the engine would notice".

2. **Where the console and the engine disagree about the floor, the console
   shows BOTH numbers and says they disagree.** On 2026-09-23 the database
   held 1,240 tables in `running` or `waiting` while the engine reported 450
   active and 102 dealable. A live floor panel that renders either number
   alone is lying by omission about which one an operator should act on.

3. **HORSES ARE PLAYERS (CLAUDE.md 10.5).** Every floor list, every rake
   report, every export and every composition figure counts horses exactly as
   it counts humans, and `p_include_horses` defaults to true, which is what
   production already does (appendix A.4). Horses are never called bots. They
   run deterministic HorseLogic and never a language model. No "AI Model"
   fleet control is restored by this phase or any other. On 2026-09-23 all
   3,352 occupied seats on the platform were horses and zero were humans, so a
   floor panel that suppressed horses would render an empty platform.

4. **Money stays where the money already is.** Every chip movement in this
   phase goes through an authoritative money function that exists today and
   through the ledger. Phase 6 adds no new money path. A `202 pending
   approval` is not a completed action: the queue item stays, the row is not
   removed, and nothing says a player was paid until the payment happened.

5. **Reads audit nothing; every write has an identity and an outcome.** A
   panel that renders a club's treasury writes no audit row. Every write files
   one through `auditOperatorAction` with the actor, the request id, and the
   before and after state, and records whether the underlying operation
   SUCCEEDED, not merely whether it was dispatched.

6. **Open Claw is the scheduler.** Scheduled application work is Open Claw's,
   never the Claude scheduler. No watcher, cron or repair loop supplies
   correctness to any surface in this phase, and none of them may certify a
   release. A surface that needs a periodic job to look right is a surface
   that is wrong between runs.

## 1. What Phase 6 covers, and what it does not

Phase 6 SHIPS four scopes on existing authority, ships two narrowed, and
DEFERS two that have no backing schema. That distribution is the measurement
talking, not an estimate.

| Scope | Verdict | One line |
| --- | --- | --- |
| O1 Live floor | **Ships READ-ONLY** | No authoritative engine control operation exists to call. |
| O2 Tournament oversight | **Ships READ plus payout audit** | Cancel and refund are engine-owned; no World Hub RPC exists. |
| O3 Club oversight | **Ships** | Club Arena owns the writes; funding has a real RPC and a real approval kind. |
| O4 Union oversight | **Ships as LINK and EMBED** | Club Arena owns essentially all of it already. |
| O5 Cashier queues | **Ships NARROWED** | `cashout_requests` is empty in production; `chip_requests` holds one row. |
| O6 Rake reporting | **Ships** | Rake data is real and large; the rate audit trail is empty. |
| O7 Download centre | **DEFERRED on schema** | No platform-operator export job table exists. |
| O8 Announcements | **Ships NARROWED** | Club and union paths exist; a platform-wide one does not. |

O7 and O8's platform tier are the two places where Phase 6 would otherwise
have to invent schema and a delivery path. Section 3.7 and 3.8 say what has to
exist first and what ships in the meantime.

## 2. What the measurement found, and why it reshapes the phase

Three findings changed the shape of this contract. They are stated here rather
than buried in the per-scope sections because each one invalidates a control
the phase brief assumed would be straightforward.

### 2.1 There is no engine control API to call

The brief says the live floor's controls "must call authoritative engine
operations". Measured: **they cannot, because no such operation is exposed.**

The engine's only HTTP surfaces referenced anywhere in this repository are
`GET /health` and `POST /admin/kick` (`pages/api/club-arena/anti-cheat.js:429`
builds the base URL, and the `fetch` to `${engineUrl}/admin/kick` follows at
line 436, authenticated with `GAME_SERVER_ADMIN_SECRET`). There is no pause,
no park, and no close-at-hand-boundary endpoint.

The Phase 3 Fleet Command Center does not talk to the engine over HTTP at all.
`pages/api/horses/fleet-admin.js` reads `ca_horse_fleet_policy`,
`ca_horse_fleet_state` and the heartbeat rows that the engine WRITES, and its
only two writes are a policy row and the disclosure register (see the route
header, `pages/api/horses/fleet-admin.js:17-34`). The interface between
console and engine is the DATABASE, and the engine's kill switch is a policy
field named `pause_new_seatings` whose whole meaning is "seat nobody new".

What Club Arena's table control actually does is a direct status update.
`pages/api/club-arena/manage-table.js:20` declares
`const VALID_ACTIONS = ['close', 'delete', 'pause', 'resume']`, and each case
performs an `UPDATE public.tables SET status = ...` guarded by an `.in(...)`
compare-and-set on the previous status (close at line 139, delete at 173,
pause at 215). Nothing in that file mentions a hand, a hand boundary, or the
engine.

The safety that makes this survivable is a DATABASE TRIGGER, not a route.
`fn_on_table_status_change` fires on a status transition into
`('closed','completed','cancelled','finished')` and does two things that
matter: it calls `fn_cashout_seats_for_closing_table` BEFORE releasing the
seats (the comment in the function body records the incident that forced the
ordering, 1,036 exits worth 432,100.90 chips released without their stacks on
2026-08-30), and it REFUSES to release seats when the table belongs to a
tournament that is still live, logging an `engine_recovery_events` row with
event `table_closed_under_live_tournament` instead.

And `fn_clear_table_seats(p_table_id uuid, p_reopen boolean)` refuses cash
tables outright:

```
IF v_tournament IS NULL THEN
  RAISE EXCEPTION 'CASH_SEAT_CLEAR_REQUIRES_ENGINE_DEPARTURES' USING ERRCODE='55000';
END IF;
-- Only tournament cleanup reaches this point. Cash departures are engine-owned.
```

That exception is the whole answer to O1. The database itself says cash seat
departures belong to the engine. **So O1 ships read-only**, and the controls
the brief asks for become a named engine dependency that Phase 6 specifies and
a later phase implements once the engine exposes it. Section 3.1 writes the
contract the engine operation must satisfy, so the work is not lost.

"Park" is engine vocabulary with no route anywhere. The engine reports
`spinLaunchParks: {count, terminal, oldestAgeMs, parked[]}` and
`maintenance.unparkedTables`, and a repository-wide grep for a park action in
`pages/api/` returns nothing but unrelated place names.

### 2.2 The console and the engine disagree about how big the floor is

Measured within the same two minutes on 2026-09-23:

| Question | Database says | Engine `/health` says |
| --- | ---: | ---: |
| Tables live | 1,240 (`running` 715 plus `waiting` 525) | `activeTables` 450 |
| Tables actually dealing | not represented | `dealableTableCount` 102 |
| Tables stalled | not represented | `stalledTableCount` 65, `deadStalledCount` 65 |
| Tournaments live | 747 | `activeTournaments` 425 |
| Humans seated | 0 | `humansSeatedTotal` 0 |
| Horses seated | 3,352 | not separately reported |

The two seat figures agree and every table figure disagrees by roughly a
factor of three. `tables` holds 285,519 rows of which 284,279 are `closed`, so
the live set is a small tail of a very large table, and the gap is not a
rounding artefact.

Phase 6 does not resolve this disagreement, because resolving it is engine
work and this console does not own the engine. It RENDERS it. Section 3.1
makes the divergence a first-class field of the live floor response and a
banner, in the same spirit as Phase 5's detector freshness rule: an operator
who is shown one number will act on it, and neither number is currently safe
to act on alone.

### 2.3 The cashier has almost no data, and the export centre has no schema

`cashout_requests` holds **zero rows**, and zero pending. `chip_requests`
holds **one**. Phase 1's row caps and Phase 2's `cashout` approval kind were
built against a queue that is, today, empty.

That is not a reason to skip O5, and it is emphatically not a reason to test
with real chips. It is a reason to ship O5 as a real queue that renders its
empty state HONESTLY, the Phase 5 way: `nothing_to_review` when a healthy
source has no rows is a different sentence from `unknown` when the source
could not be read, and neither is "all clear".

For O7 there is no platform-operator export job table at all. Two export job
tables exist and neither is this one: `ca_club_data_exports` is club-scoped
and carries no `file_url`, `format` or `progress` column, and
`commander_export_jobs` is keyed on `venue_id integer` and belongs to the
Commander venue product. Section 3.7 defers O7's job record and says exactly
what schema would unblock it.

## 3. The eight scopes

Each scope below states its boundary, the authority that already exists with
a file, line or function name that was actually read, the class of every
control, the permission and approval rule, the engine dependency, the write
behaviour, the named states, the acceptance criteria and the tests.

Throughout, `PERMISSIONS` values are the exact strings from
`src/lib/horses/permissions.js:31-56`, and approval `kind` values are the
exact strings from `APPROVAL_KINDS` in `src/lib/horses/approvals.js:66-73`.

### 3.1 O1 Live floor

**Scope.** A platform-wide list of live tables with seats, stakes, hands per
hour, and horse versus human composition; a per-table drill-down; and the
engine's own view of the same floor beside the database's.

**Explicitly excluded.** Pause, park, and close at a safe hand boundary do NOT
ship as controls in Phase 6. Section 2.1 is the reason: there is no
authoritative engine operation to call, and a control built on a `tables`
status write would be exactly the lie section 0 forbids. Also excluded: any
seat-level write, any chip movement, and any table creation or deletion.

**Existing authority.**

- `pages/api/club-arena/manage-table.js:20` owns close, delete, pause and
  resume for club staff, as direct `tables.status` updates with a
  compare-and-set. It is a Club Arena surface and stays one.
- `pages/api/club-arena/auto-close-tables.js` closes tables past their
  configured `game_length_hours`, authenticated by `x-engine-key` against
  `ENGINE_INTERNAL_SECRET` or an admin bearer token.
- `fn_on_table_status_change()` is the trigger that pays out and releases
  seats on a terminal status, and protects a live tournament's tables.
- `fn_clear_table_seats(p_table_id uuid, p_reopen boolean)`, SECURITY DEFINER,
  tournament tables only; raises `CASH_SEAT_CLEAR_REQUIRES_ENGINE_DEPARTURES`
  for cash.
- `fn_cashout_seats_for_closing_table(table_id, reason)` is the pay-before-
  release path the trigger calls. Phase 6 never calls it directly.
- `GET https://engine.smarter.poker/health` is the engine's floor report.
  Measured fields in appendix A.1.
- Tables read: `tables` (285,519 rows), `table_seats` (720,238),
  `profiles.is_horse`, `tournaments`, `clubs`.
- **Nothing exists** for: a hand-boundary close, a park, or an engine-
  acknowledged pause reachable from an HTTP route.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Live table list, seats, stakes, composition | READ | New `?section=floor` |
| Table drill-down, seat list, horse or human per seat | READ | New `?section=table` |
| Engine floor report and divergence banner | READ | Engine `/health`, cached |
| Hands per hour | READ | Engine `telemetry.avgHandsPerHour`, labelled as the engine's figure |
| Pause / Resume / Close / Delete a table | **LINK** | Club Arena table management for that club |
| Close at safe hand boundary | **NOT SHIPPED** | Blocked on an engine operation. See below. |
| Park a table | **NOT SHIPPED** | Blocked on an engine operation. See below. |

**Permission and maker-checker.** Every section above is a READ and requires
`clubs.read`. There are no writes in O1, therefore no approval kind applies
and no audit row is written by any O1 request.

**Engine dependency.** Explicitly named and explicitly UNMET. O1 reads
`GET /health` over the network, with a short timeout, a cache, and a stale
marker; a failed read renders `unknown`, never zero. The controls this phase
declines to ship require a new engine operation that Phase 6 specifies here so
a later phase can build against it:

> The engine must expose an authenticated operation that accepts a table id
> and one of `pause`, `park` or `close`, applies it AT A HAND BOUNDARY and
> never inside a hand, returns the hand number at which it took effect, is
> idempotent under a caller-supplied operation id, and answers distinctly for
> "applied", "already in that state", "table unknown" and "refused because the
> table belongs to a live tournament". Until that exists, the console links to
> Club Arena and says plainly that the close is immediate, not boundary-safe.

Safe hand-boundary semantics are therefore DEFINED here and IMPLEMENTED
nowhere. The console must not imply otherwise in any copy.

**Rollback, retry, idempotency, audit.** Not applicable: O1 performs no
writes. This is itself a test assertion, not a note.

**States, named per surface.**

- `floor.loading`, `floor.ready`, `floor.empty_no_live_tables`,
  `floor.partial` (the database answered and the engine did not, or the
  reverse), `floor.diverged` (both answered and disagree by more than a
  configured tolerance), `floor.stale` (the engine report is older than its
  cache window), `floor.unknown` (neither source could be read).
- `table.loading`, `table.ready`, `table.not_found`, `table.unknown`.
- `floor.diverged` is NOT a failure state and must not be rendered as one. It
  is the normal state as measured on 2026-09-23 and it carries both numbers
  and the sentence naming which is which.
- `floor.empty_no_live_tables` and `floor.unknown` are never collapsed.

**Acceptance criteria.**

- Mobile at 375px: the table list is a single column of cards, each showing
  club, stake, seats occupied over capacity, and the horse and human split as
  two labelled counts. No horizontal scroll. The divergence banner is above
  the list, full width, and is readable without expanding anything.
- Desktop: a separate intentional presentation, not the mobile cards widened.
  A dense table with sortable columns and a persistent right-hand engine
  panel showing the `/health` figures beside the database's.
- Both: composition is never a single percentage. Horses and humans are two
  counts with two labels, because a percentage hides that one side is zero.

**Tests before implementation.**

1. A law test asserting no O1 code path issues an `UPDATE` or an `rpc` call of
   any kind, and that the route rejects every method except GET.
2. A test that the divergence field is computed from two live reads and is
   never a constant or a default.
3. A test that with the engine read stubbed to fail, the response is
   `floor.partial` with the database numbers present and the engine numbers
   absent, and is NOT `floor.ready` with zeroes.
4. A test that horses appear in every seat count and that no O1 query carries
   an `is_horse` filter that would remove them.
5. A copy test: no O1 string contains "bot", "AI", an em dash, or an emoji.

**Production verification to close O1.** The live floor rendered in a browser
at 375px and at desktop, against production, with the divergence banner
visible and both numbers matching what `/health` and a direct count return at
that moment. Read-only, so no rollback is required and no sim is needed.

### 3.2 O2 Tournament oversight

**Scope.** Running, upcoming and late-registration events across every club
and union; registration counts; overlay and guarantee exposure; payout audit;
and a read of the cancellation and refund record.

**Explicitly excluded.** Cancel and refund are NOT shipped as console writes.
See below. Also excluded: editing a structure, changing a payout table,
seating or unseating a player, and anything touching a tournament in progress.

**Existing authority.**

- `fn_tournament_payout_reconcile(p_tournament_id uuid, p_apply boolean)`,
  SECURITY DEFINER. The payout audit. `p_apply = false` is a dry run and is
  the only form O2 calls.
- `fn_tournament_payout_sweep(p_days integer, p_apply boolean, p_limit integer)`,
  SECURITY DEFINER. The same audit across a window.
- `fn_settle_tournament_rake(p_tournament_id uuid, p_source text)`, SECURITY
  DEFINER. Re-measured on 2026-09-23: its body **no longer mentions
  `is_horse`**, so the suppression Phase 5 recorded has been removed. O2 must
  not reintroduce it.
- `fn_release_tournament_holds(p_tournament_id uuid)`, NOT security definer.
- `fn_tournament_atomic_register`, `fn_seat_late_registrant`,
  `fn_release_seats_on_tournament_finish`, `fn_tournament_chip_conservation_check`.
- Tables read: `tournaments` (214,451), `tournament_players` (685,949),
  `tournament_payouts` (235,706), `tournament_escrow` (134,667),
  `tournament_guarantee_overlays` (227), `tournament_cancellation_receipts`
  (665), `tournament_refund_entitlements` (211,285),
  `tournament_refund_tranches` (1,371), `tournament_rake_settlements`
  (196,310), `tournament_schedules` (211), `tournament_series` (58).
- **Nothing exists** for a cancel or refund RPC callable from the World Hub.
  A repository-wide search for a tournament cancel or refund function found
  none, and the only references to `tournament_cancellation_receipts` in this
  repository are two CI probe fixtures,
  `scripts/ci/probes/owner-operational-notification/inputs/schema.sql` and
  `.../inputs/access.sql`. The 665 receipts in production were written by
  something outside this repository, which the evidence says is the engine.

**Cancel and refund, and why they are a LINK.** The brief asks for cancel and
refund "using existing authoritative RPCs". The measurement says those RPCs do
not exist in the World Hub, and the receipt table's twenty-nine columns
(source and released seat ids, refund line count, ticket returns, zero-refund
registrations, fee reversals, rake before and after, escrow close, spin
unwind) describe a transaction far larger than a status update. Reimplementing
it here would be a second money path, which section 0 rule 4 forbids outright.
So cancel and refund are a LINK plus a READ of the resulting receipt, and the
console states that the cancellation is performed by the engine.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Schedule: running, upcoming, late-reg | READ | New `?section=tournaments` |
| Registration counts, field size | READ | `tournament_players` |
| Overlay and guarantee exposure | READ | `tournament_guarantee_overlays` |
| Payout audit for one event | READ (dry run) | `fn_tournament_payout_reconcile(id, false)` |
| Payout audit across a window | READ (dry run) | `fn_tournament_payout_sweep(days, false, limit)` |
| Cancellation and refund record | READ | `tournament_cancellation_receipts` and the refund tables |
| Cancel a tournament | **LINK** | The engine's own path, via Club Arena |
| Refund a tournament | **LINK** | Same |
| Apply a payout correction | **NOT SHIPPED** | `p_apply = true` is never called from this console |

**Permission and maker-checker.** Reads require `clubs.read`. The payout audit
additionally requires `money.read`, because it discloses per-player amounts.
No approval kind applies, because O2 performs no write. If a future phase
ships an apply path for `fn_tournament_payout_reconcile`, it moves chips and
therefore requires `money.write` and approval kind `mint` or a new kind; it is
out of scope here and must not be added without its own contract.

**Engine dependency.** Named. The cancel and refund path is engine-owned. O2
depends on the engine only for the accuracy of the rows it reads, and on
`/health`'s `activeTournaments` for the same divergence disclosure O1 makes:
747 live tournaments in the database against 425 reported by the engine on
2026-09-23.

**Rollback, retry, idempotency, audit.** O2 performs no writes. Every RPC it
calls is invoked with its apply flag set to false, and a law test asserts that
the literal `true` never reaches the `p_apply` parameter from this route. Read
calls write no audit rows.

**States.** `tournaments.loading`, `.ready`, `.empty_none_scheduled`,
`.partial` (the schedule read succeeded and the payout audit did not),
`.stale`, `.unknown`. Per event: `event.ready`, `event.not_found`,
`event.audit_unavailable`. An event with no overlay row renders "No Overlay
Recorded", never a zero that reads like a funded guarantee of nothing.

**Acceptance criteria.** At 375px the schedule is a single column grouped by
state (running, late registration, upcoming) with the guarantee and the
current prize pool as two lines, never one composite figure. Desktop gets a
separate dense schedule with the overlay exposure column sortable. Currency
is never rendered as a float; amounts come through the `money2dp` path in
`src/lib/horses/validate.js`.

**Tests before implementation.** A law test that no O2 path passes
`p_apply: true`; a test that overlay absence renders as absence and not zero;
a test that the tournament list includes events whose fields are entirely
horses; a test that the divergence disclosure is present; a copy test for
em dashes and emoji.

**Production verification to close O2.** The schedule and one event's payout
audit rendered in a browser at both widths against production, with the dry
run's output compared by hand against `tournament_payouts` for that event.

### 3.3 O3 Club oversight

**Scope.** Full pagination over every club; treasury, member chips, stop-loss
versus deposit and settlement state; suspend with a reason; and club funding
through the authoritative funding RPC under maker-checker.

**Explicitly excluded.** Creating or deleting a club, editing club settings,
managing club staff, and moving chips to a player. Chips never reach a person
directly: `EXECUTION_TARGETS` in `src/lib/horses/approvals.js:364` pins chips
to `['club','union']` and diamonds to `['player']`, and Phase 6 does not
widen it.

**Existing authority.**

- `pages/api/horses/club-arena-admin.js` already owns the club read surface.
  Its `SECTIONS` list is declared at line 71 and covers `overview`, `club`,
  `user_search`, `user`, `ledger`, `revenue`, `badges`, `platform` and
  `tickets`. Its ONE mutation is `set_club_status`, rejected for anything else
  at line 1142.
- Pagination already exists and is per-list, not console-wide. `PAGE_OPTS` at
  `pages/api/horses/club-arena-admin.js:120-135` gives clubs a default of 200
  and a max of 500, members 300 and 500, cashouts 100 and 500. The 200-club
  cap the gap analysis recorded is already lifted; O3 extends the SURFACE to
  use the pager, it does not add the pager.
- `fn_ca_fund_club(p_club_id uuid, p_amount numeric, p_reason text, p_idempotency_key text)`,
  SECURITY DEFINER. This is the authoritative club funding function. Note the
  key parameter is `p_idempotency_key`, NOT `p_op_id`; `fundClubValidator` at
  `src/lib/horses/approvals.js:442-460` already builds the call correctly and
  records the naming trap in its docblock.
- `fn_mint_club_chips`, `fn_credit_treasury`, `fn_debit_treasury` exist and
  are lower-level. O3 calls `fn_ca_fund_club` and nothing below it.
- `pages/api/club-arena/club-health.js` and `.../club-analytics.js` are the
  Club Arena health surfaces.
- Tables read: `clubs` (5), `club_members` (1,926), `chip_transactions`
  (790,991), `settlement_periods` (10).

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Club list with full pagination | READ | `club-arena-admin?section=overview`, existing pager |
| Club drill-down, treasury, member chips | READ | `club-arena-admin?section=club` |
| Stop-loss versus deposit, settlement state | READ | New fields on the existing `club` section |
| Club health detail | **EMBED** | `pages/api/club-arena/club-health.js` |
| Suspend a club with a reason | **AUTHORITATIVE WRITE** | Existing `set_club_status`, extended to carry a reason |
| Fund a club | **AUTHORITATIVE WRITE** | `fn_ca_fund_club` under approval |
| Create, delete or configure a club | **LINK** | Club Arena |
| Move chips to a player | **NOT SHIPPED** | Forbidden by `EXECUTION_TARGETS` |

**Permission and maker-checker.**

- Reads: `clubs.read`.
- Suspend with a reason: `clubs.write`. No approval kind: suspension moves no
  money. It writes an audit row with the before and after status and the
  reason, and the reason is mandatory, minimum ten characters, matching the
  `text(p.reason, { min: 10, max: 500 })` rule the approval validators use.
- Fund a club: `money.write`, approval **kind `fund_club`**, measured against
  the `fundThreshold` policy field (`THRESHOLD_FIELD` at
  `src/lib/horses/approvals.js:80-87`). `KIND_PERMISSION.fund_club` is
  `money.write` (line 93), and `fund_club` is in `EXECUTABLE_APPROVAL_KINDS`
  (line 299-304), so an approved request can actually be carried out from the
  Approvals tab. As of 2026-09-23, `ca_operator_approvals` holds zero rows and
  `ca_operator_policy.approvals_enabled` defaults to false, so a funding
  request records an `auto_approved` row and proceeds, exactly as Phase 2
  specifies.

**Engine dependency.** None. Club funding and suspension do not touch the
engine, and suspending a club does not close its tables; the console must say
so rather than implying the floor emptied.

**Rollback, retry, idempotency, audit.**

- Funding is idempotent on `p_idempotency_key`, which is the approval row's
  `op_id`. The same key replayed returns the same result and moves nothing
  twice. A key raised for a different request is a 409 refusal, not a
  permission, per `executionKey` at `src/lib/horses/approvals.js:557-574`.
- A 202 pending response does NOT remove the request from the operator's view
  and does not say the club was funded. The copy is Phase 2's
  `DEFAULT_PENDING_MESSAGE`: "Sent For Approval. Another Operator Must Approve
  This Before Anything Moves".
- After the money moves, `markApprovalExecuted` closes the row and NEVER
  throws. If it returns `refused: true` the route surfaces that loudly, because
  it means chips moved against a row nobody approved.
- Rollback: there is none for a completed funding, and the console must not
  offer one. A reversal is a new, separately approved movement in the opposite
  direction, with its own key and its own audit row.
- Suspension is reversible by setting the status back, which is a second
  write with its own audit row. The console never edits the first row.

**States.** `clubs.loading`, `.ready`, `.empty_no_clubs`, `.partial`,
`.stale`, `.unknown`. Per club: `club.ready`, `club.not_found`,
`club.treasury_unavailable`. Funding: `fund.idle`, `fund.submitting`,
`fund.pending_approval`, `fund.done`, `fund.refused`, `fund.unknown_outcome`.
`fund.unknown_outcome` is mandatory and is rendered when the RPC could not be
reached after the request was recorded; it tells the operator to check the
ledger before retrying, and it never auto-retries.

**Acceptance criteria.** At 375px the club card shows treasury and member
chips as two figures with a stated as-of time, and the funding form is a full
screen step with the amount, the reason and an explicit confirmation naming
the club and the amount in words. Desktop shows the club list and the
drill-down side by side. Amounts use `money2dp`; no float comparison anywhere.

**Tests before implementation.** A test that the funding call names
`p_idempotency_key` and not `p_op_id`; a test that a 202 leaves the item in
place and the copy does not claim payment; a test that a suspension without a
reason of at least ten characters is refused; a test that no O3 path can
target a player with chips; a rolled-back production simulation of one funding
call before any real one.

**Production verification to close O3.** A funding request proved first in a
rolled-back transaction against production, then the surface rendered at both
widths, then one real funding of a trivial amount to a club Dan nominates,
with the ledger row and the audit row both checked by hand. Never a real chip
spent merely to test a rule: this single movement is a real operational
funding that Dan wants performed anyway, or it does not happen.

### 3.4 O4 Union oversight

**Scope.** Member clubs, rake share, settlement rounds, presettlements,
applications and leave requests, presented as reads and as links into the
Club Arena operator surfaces that already own the decisions.

**Explicitly excluded.** Every union WRITE. Phase 6 adds no union mutation of
any kind. This is the scope where duplicating Club Arena authority would be
easiest and most damaging.

**Existing authority.** Club Arena owns essentially all of it:

- `pages/api/club-arena/manage-union.js` carries the union action set:
  `create` (line 73), `request_leave` (160), `update_settings` (238),
  `add_club` (300), `remove_club` (383), `add_admin` (428), `remove_admin`
  (459), `search_user` (478), `update_club_commission` (507),
  `union_announcement` (554), `list_leave` (613), and
  `approve_leave` or `deny_leave` (624).
- `pages/api/club-arena/union-application.js` carries `apply`, `status`,
  `list` and `approve`, and its approve path runs inside a SECURITY DEFINER
  transaction whose docblock records the four money bugs that forced it
  (line 320).
- `pages/api/club-arena/settle-period.js` drives settlement and calls
  `fn_union_club_player_pnl` (line 201), `fn_debit_treasury` (444),
  `fn_union_credit_wallet` (457) and `fn_credit_treasury` (467).
- `pages/api/club-arena/settlement-history.js`, `.../union-wallet.js` and
  `.../union-invoice.js` are the remaining union money surfaces.
- Read RPCs available to the console, all SECURITY DEFINER:
  `fn_union_settlement_preview(p_union_id, p_period_start, p_period_end)`,
  `fn_union_rake_ledger_summary(p_union_id)`,
  `fn_union_rake_ledger_totals(p_union_id)`,
  `fn_union_rake_ledger_checkpoint_verify(p_union_id)`,
  `fn_union_club_exposure`, `fn_union_reconciliation_report`,
  `fn_union_hierarchy_warnings`, `fn_union_governance_check`.
- Tables read: `unions` (1), `union_clubs` (2), `union_admins` (1),
  `union_settlement_rounds` (11), `union_presettlements` (0),
  `union_applications` (0), `union_leave_requests` (0).

**Control classification.** Every control in O4 is a READ, an EMBED or a LINK.
There are no AUTHORITATIVE WRITEs in this scope at all.

| Control | Class | Target |
| --- | --- | --- |
| Member clubs, rake share | READ | `union_clubs`, `fn_union_rake_by_club` |
| Settlement rounds | READ | `union_settlement_rounds` |
| Settlement preview for a period | READ (dry run) | `fn_union_settlement_preview` |
| Ledger checkpoint verification | READ | `fn_union_rake_ledger_checkpoint_verify` |
| Presettlements | READ | `union_presettlements` |
| Applications, leave requests | READ | `union_applications`, `union_leave_requests` |
| Approve or deny a leave request | **LINK** | `manage-union.js` action `approve_leave` / `deny_leave` |
| Approve a union application | **LINK** | `union-application.js` action `approve` |
| Record a presettlement | **LINK** | `fn_union_record_presettlement` via Club Arena |
| Run a settlement | **LINK** | `pages/api/club-arena/settle-period.js` |
| Add or remove a club, admin, commission | **LINK** | `manage-union.js` |

**Permission and maker-checker.** Reads require `clubs.read`; the settlement
preview and the ledger totals additionally require `money.read`. No approval
kind applies, because O4 writes nothing. A future phase that moves a union
settlement write into this console would need `money.write` and a new approval
kind, and would need to explain why Club Arena's existing transaction is not
the right home, which on today's evidence it is.

**Engine dependency.** None.

**Rollback, retry, idempotency, audit.** Not applicable: no writes. Every read
is invoked in its non-applying form, and `fn_union_settle_player_pnl` has a
`p_dry_run boolean` parameter that O4 always passes as true if it calls it at
all. A law test asserts that the applying forms of the settlement functions
are never referenced from `pages/api/horses/`.

**States.** `unions.loading`, `.ready`, `.empty_no_unions`, `.partial`,
`.stale`, `.unknown`. Four of the six union tables held zero rows on
2026-09-23, so the empty states are the states an operator will actually see
first, and each says which source was read and when, never a bare "None".

**Acceptance criteria.** At 375px each union is one card with member club
count, the current period's rake share, and the settlement round state, and
every LINK is a full-width tappable row with a label that names the
destination ("Approve In Club Arena"), never a bare arrow. Desktop presents
the union, its clubs and its settlement rounds as three panes. The LINK label
must make it obvious the operator is leaving this console.

**Tests before implementation.** A law test that `pages/api/horses/` contains
no reference to any union mutation function or to `manage-union`'s write
actions; a test that every O4 control is classified READ, EMBED or LINK in the
route's own manifest and that the manifest is asserted against the code; a
test that an empty union table renders the named empty state and not a zero.

**Production verification to close O4.** The union surface rendered at both
widths against production with one LINK followed end to end into Club Arena
and back, confirming the destination exists and the operator is not dropped
on a 404. See appendix B for why this cannot be fully specified today.

### 3.5 O5 Cashier queues

**Scope.** Cashouts and chip requests as two queues, with filters, aging and
SLA display, full pagination, bulk selection, maker-checker above a threshold,
and honest pending-versus-completed messaging.

**Explicitly excluded.** Creating a cashout or a chip request on a player's
behalf. Editing an amount. Any bulk action that would move money without a
per-item confirmation and a per-item audit row.

**Existing authority.**

- `pages/api/club-arena/approve-cashout.js` owns cashout approval and is the
  authority. It imports `requireApproval`, `markApprovalExecuted`,
  `approvalPendingResponse` and `cashoutAuthPath` at line 12, resolves the
  caller's door at line 90, and raises the approval at line 103 with
  `kind: 'cashout'`. It owns the settlement lock, the MFA gate (it reads
  `user_mfa_factors` at line 62), the notifications, and the club-side
  authorisation.
- `cashoutAuthPath` at `src/lib/horses/approvals.js:250-262` is the rule that
  the approval gate applies ONLY to the platform-override door. A club agent,
  club admin or union admin is not gated, because they cannot see or clear the
  Approvals queue and turning approvals on would otherwise freeze every
  cashout on the platform. Phase 6 does not change this and must not.
- `cashout` is deliberately ABSENT from `EXECUTABLE_APPROVAL_KINDS`
  (`src/lib/horses/approvals.js:286-304`): an approved cashout cannot be
  replayed from the Approvals tab, because the settlement lock, the MFA gate
  and the club-side authorisation cannot be reconstructed there. O5 must
  therefore route the operator BACK to the cashout route to complete an
  approved cashout, and must say so.
- Money RPCs: `fn_approve_cashout_atomic(p_cashout_id, p_agent_id, p_agent_note)`,
  `fn_agent_approve_cashout(...)`, `fn_cancel_cashout_atomic(p_cashout_id, p_user_id, p_is_agent, p_note)`,
  `fn_complete_cashout(p_cashout_id, p_completed_by)`,
  `fn_request_cashout(...)`, `fn_expire_stale_cashouts(p_ttl_hours)`.
- `pages/api/horses/club-arena-admin.js` already reads the pending cashout
  list and its total, with a deliberate cap: `CASHOUT_SUM_CAP = 1000` at
  line 100, so the headline figure does not move when the operator pages.
- Tables: `cashout_requests` (**0 rows**, 0 pending), `chip_requests`
  (**1 row**: `id, club_id, requester_id, approver_id, amount, note, status,
  responded_by, responded_at, created_at, op_id`).
- **Nothing exists** for chip requests as an operator surface: no route in
  `pages/api/` references `chip_requests` at all.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Cashout queue with filters, aging, SLA | READ | New `?section=cashouts` |
| Chip request queue | READ | New `?section=chip_requests` |
| Approve one cashout | **LINK** | `pages/api/club-arena/approve-cashout.js` |
| Cancel one cashout | **AUTHORITATIVE WRITE** | `fn_cancel_cashout_atomic` |
| Approve or deny one chip request | **AUTHORITATIVE WRITE** | New route, on `chip_requests.op_id` |
| Bulk approve cashouts | **NOT SHIPPED** | See below |
| Bulk cancel cashouts | **AUTHORITATIVE WRITE, chunked** | One RPC call and one audit row per item |

**Bulk actions, and the one that does not ship.** Bulk CANCEL ships because
cancelling returns chips to where they came from and each item is independently
idempotent. Bulk APPROVE does not ship, because approval runs through
`approve-cashout.js` with an MFA gate and a settlement lock per item, and a
bulk loop across that route would either bypass the gate or prompt for MFA
once and apply it to many. Every bulk operation is chunked, performs one RPC
call per item, writes one audit row per item, and reports per-item outcomes as
a list of succeeded, failed and skipped. A bulk action never reports a single
aggregate "Done".

**Permission and maker-checker.**

- Reads: `money.read`.
- Cancel a cashout, approve or deny a chip request: `cashier.write`.
- Approval kind `cashout`, measured against the `cashoutThreshold` policy
  field. `KIND_PERMISSION.cashout` is `cashier.write`
  (`src/lib/horses/approvals.js:94`). The gate applies only on the platform
  override door, per `cashoutAuthPath`.
- A chip request that moves chips into a club treasury is a club funding in
  substance. If its amount is at or over `fundThreshold`, it additionally
  raises approval kind `fund_club`. This is a deliberate decision recorded
  here rather than left implicit, because `chip_requests` has no approval
  kind of its own today.

**Engine dependency.** None.

**Rollback, retry, idempotency, audit.**

- `chip_requests.op_id` is the idempotency key for the chip request decision;
  the same key replayed decides nothing twice.
- Cashout cancellation is idempotent on the cashout's own status transition:
  `fn_cancel_cashout_atomic` refuses a cashout that is not in a cancellable
  state, and the console renders that refusal rather than retrying.
- **A 202 is not a payment.** The queue item stays in the list with a
  `pending_approval` badge, its row is not removed, and no copy anywhere says
  the player was paid. The item leaves the queue when the underlying row's
  status says it left, and never because the console optimistically removed it.
- Every write files an audit row through `auditOperatorAction` with the actor,
  the request id, the before and after status, and the RPC's own outcome. A
  write whose outcome could not be read files `unknown_outcome`, not success.
- No rollback is offered for a completed cashout. A reversal is a new,
  separately authorised movement.

**States.** Per queue: `queue.loading`, `queue.ready`,
`queue.empty_none_pending`, `queue.empty_none_ever`, `queue.partial`,
`queue.stale`, `queue.unknown`. The distinction between
`empty_none_pending` and `empty_none_ever` is load-bearing right now, because
`cashout_requests` is genuinely empty: an operator must be able to tell "no
one is waiting" from "this platform has never processed a cashout" from "the
queue could not be read". Per item: `item.idle`, `item.submitting`,
`item.pending_approval`, `item.done`, `item.refused`, `item.unknown_outcome`.

**Acceptance criteria.** At 375px each queue item is a card with the amount,
the age in plain words ("Waiting 3 Days"), the club, and one primary action;
bulk selection is a mode toggle rather than a permanent row of checkboxes, and
the bulk confirm screen lists every selected item with its amount before
anything runs. Desktop is a dense table with the SLA column sortable and a
selection column. Aging is computed from `created_at` against the request
time and is labelled with that time, never rendered as a bare relative string
that goes stale in the tab.

**Tests before implementation.** A test that no bulk approve path exists; a
test that a 202 leaves the item present and unchanged; a test that the three
empty states are distinct and that an unreadable source never renders as
`empty_none_pending`; a test that `cashout` is still absent from
`EXECUTABLE_APPROVAL_KINDS` and that O5 does not try to execute one; a test
that each bulk item produces its own audit row; a rolled-back production
simulation of a cancellation and of a chip request decision.

**Production verification to close O5.** Rendered at both widths against
production. Because the cashout queue is empty, the verification is of the
EMPTY STATES and of a rolled-back simulated item, not of a real cashout. No
real chips are moved to prove this scope works.

### 3.6 O6 Rake reporting

**Scope.** Rake by club, union, stake and date; the rake method and cap audit;
and a full export of any report.

**Explicitly excluded.** Changing a rake rate or cap. Rake configuration is
not a Phase 6 control in any form.

**Existing authority.**

- `fn_union_rake_by_club(p_union_id uuid, p_days integer)` and
  `fn_union_rake_by_day(p_union_id uuid, p_days integer)`, both SECURITY
  DEFINER. Neither takes a horse filter, so both count every player.
- `fn_union_rake_paid_by_club`, `fn_union_rake_paid_live` and
  `fn_union_rake_paid_readonly`, each
  `(p_union_id uuid, p_start timestamptz, p_end timestamptz, p_include_horses boolean DEFAULT true)`.
  The default is true, measured on 2026-09-23. O6 never passes false except as
  an explicit, labelled operator view filter, and never as a default.
- `fn_union_tournament_rake_by_club(p_union_id, p_start, p_end, p_include_horses DEFAULT true)`.
- `fn_union_rake_basis_by_club`, `fn_union_rake_ledger_summary`,
  `fn_union_rake_ledger_totals`, `fn_union_rake_ledger_checkpoint_verify`,
  `fn_union_rake_stale_days(p_union_id, p_from, p_to_exclusive)`,
  `fn_union_rake_day_is_fresh(p_union_id, p_day)`.
- `pages/api/horses/club-arena-admin.js` already reads `rake_records` for the
  platform section, over 24-hour and 7-day windows, from around line 858.
- Tables: `rake_records` (2,956,705), `tournament_rake_settlements` (196,310),
  `rake_rate_audit` (**0 rows**; columns `id, club_id, changed_by, old_rate,
  new_rate, rate_type, notes, created_at`).
- The engine reports `rakeSpec` on `/health`: on 2026-09-23 it read
  `drifted: false`, `detail: "database and engine agree"`, with the compiled
  and database checksums both `f9cfc362daedd898780b84f20be3e4e4`.

**The rake method and cap audit has schema and no data.** `rake_rate_audit`
is empty. O6 therefore ships the audit panel against the engine's `rakeSpec`
drift report, which is live and real, and renders the rate-change history as
`empty_none_recorded` with a sentence saying no rate change has ever been
filed. It does not render an empty table as "no drift", because those are
different claims.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Rake by club | READ | `fn_union_rake_by_club`, `rake_records` |
| Rake by union | READ | `fn_union_rake_ledger_totals` |
| Rake by stake | READ | `rake_records` joined to `tables` |
| Rake by date | READ | `fn_union_rake_by_day` |
| Rake freshness and stale days | READ | `fn_union_rake_stale_days` |
| Rake method and cap drift | READ | Engine `/health` `rakeSpec` |
| Rate change history | READ | `rake_rate_audit` |
| Full export of any report | READ | See O7 |
| Change a rake rate or cap | **NOT SHIPPED** | Out of scope |

**Permission and maker-checker.** All of O6 requires `money.read`. No writes,
therefore no approval kind and no audit rows.

**Engine dependency.** Named and partial. The `rakeSpec` drift report comes
from `/health`; if the engine cannot be read, the drift panel renders
`unknown` and must not render `drifted: false`.

**Rollback, retry, idempotency, audit.** No writes. `fn_union_rake_rollup_catchup`
and its `_all` and `_refresh_day` variants WRITE rollup rows and are therefore
forbidden to this console: they are Open Claw's, not the operator's, and a
law test asserts `pages/api/horses/` never calls them. A report that is stale
says it is stale via `fn_union_rake_stale_days`; it does not fix itself by
triggering a catchup, because a surface that repairs data to look right is the
watcher pattern section 0 rule 6 forbids.

**States.** `rake.loading`, `.ready`, `.empty_no_rake_in_window`,
`.partial`, `.stale` (named days are missing from the rollup),
`.unknown`. Drift: `drift.ok`, `drift.drifted`, `drift.unknown`.
Rate history: `history.ready`, `history.empty_none_recorded`.

**Acceptance criteria.** At 375px each dimension is its own screen reached
from a dimension selector, with the window stated at the top and the
horse-inclusion state stated explicitly ("Includes Horses"). Desktop presents
the dimensions as tabs with a shared date range. Every figure carries its
window and its as-of time. If an operator narrows to exclude horses, the
surface shows the unfiltered total beside the filtered one, so the exclusion
is visible as an exclusion.

**Tests before implementation.** A law test that every rake RPC call either
omits `p_include_horses` or passes true, unless it originates from an explicit
operator filter, and that the unfiltered total accompanies any filtered view;
a law test that no rollup catchup function is called from
`pages/api/horses/`; a test that drift `unknown` is never rendered as `ok`; a
test that an empty `rake_rate_audit` renders `empty_none_recorded`.

**Production verification to close O6.** Rake by club and by day for the
single production union cross-checked by hand against a direct
`rake_records` aggregate for the same window, and the drift panel compared
against a live `/health` read, then rendered at both widths.

### 3.7 O7 Download centre

**Scope as briefed.** Full exports rather than loaded-page exports, a durable
job record, permission checks, audit identity, and bounded resource use.

**Verdict: DEFERRED on schema, with a narrowed interim that ships.**

**Existing authority.** The console already exports the whole result set
rather than the page on screen. `src/components/horses/exportAllCsv.js` walks
the route's own offset until it has `total` rows: `collectAllRows` is a pure
async function so it can be unit tested without a browser, and the wrapper
defaults are `limit = 500` and `maxPages = 200` at lines 64 and 65, giving a
100,000-row ceiling that is reported through `onProgress` and surfaced as
`complete: false` so a truncated export cannot look complete. It is used by
`FleetPanel.jsx:258`, `ApprovalsPanel.jsx:332` and `pages/horses/index.js:2441`.

So the "full export not loaded-page export" half of O7 is ALREADY DONE, in the
browser, with an honest truncation signal.

**What does not exist.** A durable job record for a platform-operator export.
Two export job tables exist and neither is this one:

- `ca_club_data_exports` (0 rows) is CLUB-scoped: `user_id, club_id,
  request_id, kind, total_rows, status, created_at, expires_at, scope_type,
  scope_id, union_id, agent_user_id, date_from, date_to, request_search,
  sort_key, total_amount, metadata, metadata_fingerprint`. It has no
  `file_url`, no `format` and no `progress`, so it records that an export
  happened rather than producing a retrievable file.
- `commander_export_jobs` (1 row) is VENUE-scoped on `venue_id integer` and
  belongs to the Commander venue product, not to Club Arena chips. It does
  have the right shape (`export_type, date_from, date_to, filters, format,
  status, progress, file_url, file_size, row_count, error_message, started_at,
  completed_at, expires_at`), which is useful as a template and useless as a
  destination.

**What ships in Phase 6.** The existing `exportAllCsv` path, extended to every
Phase 6 list, with three additions that need no new schema: the truncation
signal rendered as a visible warning rather than a console log; the permission
check applied to the export exactly as it is applied to the read, so an
operator cannot export what they cannot see; and an audit row per export that
records the actor, the surface, the filters and the row count. That last one
is the only WRITE in O7, and it is an audit write, not a money write.

**What must exist before the rest of O7 ships.** A platform-scoped export job
table, additively created in its own migration, with at minimum: an id, the
requesting operator, the surface and filters requested, a status, a progress
figure, a row count, a retrievable artifact reference, an error message, and
an expiry. Plus a bounded worker to fill it, scheduled by **Open Claw**, and a
stated resource ceiling. Until that exists, the console must not render a
"Download Centre" that promises server-side jobs it cannot run.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| Export the whole result set of any Phase 6 list | READ plus audit write | `exportAllCsv` |
| Truncation warning | READ | `complete: false` from `collectAllRows` |
| Durable server-side export job | **DEFERRED** | No schema |
| Job list, progress, retrieval | **DEFERRED** | No schema |

**Permission and maker-checker.** An export requires the SAME permission as
the read it exports, and no more. There is no separate export permission and
Phase 6 does not add one. No approval kind: an export moves no money. The
audit row uses `audit.read` surfaces for display and is written regardless of
the operator's role.

**Engine dependency.** None.

**Rollback, retry, idempotency, audit.** An export is a read plus one audit
row; there is nothing to roll back. A retried export writes a second audit
row, which is correct: two exports happened. The audit row records the row
count actually delivered and the `complete` flag, so an audit trail can tell a
complete export from a truncated one.

**States.** `export.idle`, `export.running` (with fetched and total),
`export.complete`, `export.truncated`, `export.failed`. `export.truncated` is
rendered as a warning naming the cap, never as success.

**Acceptance criteria.** At 375px the export control is a full-width button
that becomes a progress line with fetched over total, and a truncated result
shows a persistent warning rather than a toast that disappears. Desktop may
show the same inline. A file is never offered for download while the walk is
incomplete without the warning attached.

**Tests before implementation.** A test that the export permission equals the
read permission for every surface; a test that `complete: false` produces the
truncated state and a visible warning; a test that an export writes exactly
one audit row carrying the row count and the completeness flag; a test that no
Phase 6 code references `commander_export_jobs` or writes to
`ca_club_data_exports`.

**Production verification to close the narrowed O7.** One export of a Phase 6
list run against production at both widths, with the row count in the file
compared against the surface's stated total and the audit row checked by hand.

### 3.8 O8 Announcements and broadcast

**Scope as briefed.** Announcements to the platform, a union, or a club,
through existing authoritative notification tables and delivery paths.

**Verdict: club and union tiers ship as LINKs; the platform tier is
DEFERRED on schema.**

**Existing authority.**

- `pages/api/club-arena/announcements.js` owns club announcements. It writes
  `club_announcements` on `action === 'create'` at line 108 and reads it at
  line 64, authorises through club membership and falls back to union admin
  and union owner checks, and sanitises the body through
  `src/lib/club-arena/sanitize`.
- `pages/api/club-arena/manage-union.js:554` owns union announcements under
  `action === 'union_announcement'`.
- Delivery is the notification outbox, and it is durable and already correct.
  `fn_emit_home_notification` writes the notification;
  `fn_mirror_notification_to_push_outbox` mirrors it to `push_outbox`; and
  `pages/api/cron/push-dispatch.js` drains the outbox every minute from **Open
  Claw on Hetzner, explicitly not vercel.json** (see its header, lines 1 to
  29), claiming a deduplicated slot in `push_dispatch_runs` so two dispatchers
  cannot double-send, requeueing rows stuck in `processing` for more than
  fifteen minutes, and claiming batches with `FOR UPDATE SKIP LOCKED` through
  `claim_push_outbox_batch` because PostgREST cannot express SKIP LOCKED.
- Tables: `notifications` (12,131), `club_announcements` (**0 rows**, columns
  `id, club_id, author_id, title, content, priority, is_pinned, expires_at,
  created_at, message, type, is_active, created_by, management_revision,
  updated_at`), `union_announcements` (**0 rows**, columns `id, union_id,
  club_id, message, created_by, created_at`),
  `commander_club_announcements` (6 rows, Commander venue product).
- **Nothing exists** for a platform-wide announcement: there is no
  platform-scoped announcement table, and no route that addresses every
  player.

**Why the club and union tiers are LINKs and not writes.** Both already have a
route, an authorisation model and a sanitiser. Adding a second writer in
`pages/api/horses/` would mean two code paths inserting into the same table
with two different authorisation rules and two different sanitisers, which is
precisely the duplicated authority this phase exists to avoid. The console
lists announcements and links to the Club Arena surface that composes them.

**What must exist before the platform tier ships.** A platform-scoped
announcement table with an author, a title, a body, a priority, an activation
window and an audience predicate, plus a decision about how a platform
announcement reaches players: whether it fans out into `notifications` per
player, or is read at render time from a single row. The second is almost
certainly right at 1,199 profiles, and the first becomes necessary later.
Either way the delivery path is the EXISTING outbox and its Open Claw
dispatcher. **Phase 6 builds no parallel delivery engine**, no browser-driven
send loop, and no second dispatcher.

**Control classification.**

| Control | Class | Target |
| --- | --- | --- |
| List club announcements | READ | `club_announcements` |
| List union announcements | READ | `union_announcements` |
| Compose a club announcement | **LINK** | `pages/api/club-arena/announcements.js` |
| Compose a union announcement | **LINK** | `manage-union.js` action `union_announcement` |
| Delivery health (outbox depth, last drain) | READ | `push_outbox`, `push_dispatch_runs` |
| Platform-wide announcement | **DEFERRED** | No schema, no audience path |
| Any direct write to `push_outbox` | **FORBIDDEN** | Section 0 rule 6 |

**Permission and maker-checker.** Reads require `console.read`. The delivery
health read requires `console.read`. Composition is a LINK, so the permission
that applies is Club Arena's own, not this console's. If a future phase brings
composition in-house it requires `content.write`, and a platform-wide
announcement should additionally require a second pair of eyes, which means a
new approval kind rather than reuse of an existing one, since none of the six
current kinds describes a broadcast.

**Engine dependency.** None.

**Rollback, retry, idempotency, audit.** O8 writes nothing in Phase 6.
Recorded here for the future: an announcement that has been DELIVERED cannot
be recalled, so a compose surface must treat send as irreversible and confirm
the audience size in words before sending. Deleting the row afterwards
removes the announcement from a list; it does not un-buzz a phone, and no copy
may suggest it does.

**States.** `announcements.loading`, `.ready`, `.empty_none_published`,
`.partial`, `.stale`, `.unknown`. Delivery: `delivery.ok`,
`delivery.backlogged` (outbox depth above a threshold or the last drain older
than its cadence), `delivery.unknown`. `delivery.backlogged` is rendered as
loudly as Phase 5's detector staleness banner, for the same reason: a
broadcast surface that looks healthy over a stalled dispatcher will be trusted.

**Acceptance criteria.** At 375px announcements are a single column with
priority and pin state as labels rather than colour alone, and each LINK names
its destination. Desktop shows club and union lists side by side with the
delivery health strip across the top. No emoji anywhere, and announcement
bodies rendered from the database are treated as untrusted text and escaped.

**Tests before implementation.** A law test that `pages/api/horses/` contains
no insert into `club_announcements`, `union_announcements`, `notifications` or
`push_outbox`; a test that delivery health distinguishes `ok`, `backlogged`
and `unknown`; a test that no Phase 6 code schedules delivery itself.

**Production verification to close the narrowed O8.** The announcement lists
and the delivery health strip rendered at both widths against production, with
the outbox depth compared against a direct count at that moment.

## 4. Permission matrix

Scope by permission by approval kind. Permission strings are exactly those in
`src/lib/horses/permissions.js:31-56`; approval kinds are exactly those in
`src/lib/horses/approvals.js:66-73`. "none" in the approval column means the
operation moves no money and needs no second pair of eyes.

| Scope | Operation | Permission | Approval kind | Threshold field |
| --- | --- | --- | --- | --- |
| O1 | Live floor read, table read | `clubs.read` | none | none |
| O1 | Pause, park, close at boundary | not shipped | not shipped | not shipped |
| O2 | Schedule, registrations, overlay read | `clubs.read` | none | none |
| O2 | Payout audit dry run | `money.read` | none | none |
| O2 | Cancel or refund | LINK to engine path | none here | none here |
| O3 | Club list, drill-down, health | `clubs.read` | none | none |
| O3 | Suspend a club with a reason | `clubs.write` | none | none |
| O3 | Fund a club | `money.write` | `fund_club` | `fundThreshold` |
| O4 | Every union read | `clubs.read` | none | none |
| O4 | Settlement preview, ledger totals | `money.read` | none | none |
| O4 | Every union write | LINK to Club Arena | none here | none here |
| O5 | Cashout and chip request queues | `money.read` | none | none |
| O5 | Cancel a cashout | `cashier.write` | `cashout` | `cashoutThreshold` |
| O5 | Approve or deny a chip request | `cashier.write` | `cashout` | `cashoutThreshold` |
| O5 | Chip request at or over the fund threshold | `cashier.write` plus `money.write` | `fund_club` | `fundThreshold` |
| O5 | Approve a cashout | LINK to `approve-cashout.js` | `cashout` there | `cashoutThreshold` |
| O6 | Every rake report and the drift panel | `money.read` | none | none |
| O7 | Export any list | same as that list's read | none | none |
| O7 | Durable export job | deferred | deferred | deferred |
| O8 | Announcement lists, delivery health | `console.read` | none | none |
| O8 | Compose club or union announcement | LINK to Club Arena | none here | none here |
| O8 | Platform-wide announcement | deferred | new kind required | to be decided |

Two facts about thresholds that the table cannot carry. First,
`THRESHOLD_FIELD` at `src/lib/horses/approvals.js:80-87` maps `fleet_policy`
and `sanction` to null, meaning they ALWAYS require approval once approvals
are on; every kind Phase 6 uses has a threshold, so none of them is in that
category. Second, `requiresApproval` at line 147 treats a MISSING amount as
REQUIRED rather than exempt, because "we could not read the amount" is not the
same sentence as "the amount is small". Phase 6 relies on that and must never
paper over an unreadable amount with a zero.

As of 2026-09-23, `ca_operator_approvals` holds zero rows and
`ca_operator_policy` holds one row with approvals off by default, so every
approval-bearing operation above currently records an `auto_approved` row and
proceeds. That is Phase 2's deliberate design and Phase 6 does not change it.

## 5. Console and route shape

New route `/api/horses/floor-admin`, sections `floor`, `table`,
`tournaments`, `event`, `clubs`, `club`, `unions`, `union`, `cashouts`,
`chip_requests`, `rake`, `announcements`; actions `suspend_club`,
`fund_club`, `cancel_cashout`, `decide_chip_request`. Built on
`withOperatorRoute` from `src/lib/horses/operatorRoute.js` exactly as every
other console route is, with the method allowlist, the rate limit, operator
auth, the permission check and the response envelope owned by the wrapper.

Money and cashier actions take the durable rate limit, matching the treatment
`operatorRoute` already gives money routes.

New tabs in `src/components/horses/tabRegistry.js`, each code split behind its
own `load` thunk exactly like the Phase 5 entry at lines 132-133:

- `floor`, label "Live Floor", permission `clubs.read`
- `tournaments`, label "Tournaments", permission `clubs.read`
- `cashier`, label "Cashier", permission `money.read`
- `rake`, label "Rake", permission `money.read`

Club and union oversight extend the existing `clubarena` tab and its
`CA_SECTIONS` rather than adding a third club surface. Announcements are a
section of the Club Arena tab, not a tab.

**None of this goes in `pages/horses/index.js`.** That file is 8,118 lines on
2026-09-23. Every Phase 6 panel is a module under `src/components/horses/`
loaded by the registry, and a law test asserts the file's line count does not
grow in a Phase 6 commit.

Every surface renders the divergence or freshness disclosure its scope
requires BEFORE its own content, in the Phase 5 pattern.

## 6. Tests

The four-file split each scope names above, plus one law file,
`__tests__/horses-phase6-the-floor-says-what-it-owns.law.test.mjs`, pinning
the rules that cut across scopes:

- No Phase 6 route writes to a table Club Arena owns: not
  `club_announcements`, `union_announcements`, `notifications`, `push_outbox`,
  `union_applications`, `union_leave_requests`, or `tables`.
- No Phase 6 route calls a union settlement, rake rollup catchup, or
  tournament payout function in its APPLYING form.
- Every control in every Phase 6 route manifest is classified LINK, EMBED,
  READ or AUTHORITATIVE WRITE, and the manifest matches the code.
- Every read path excludes no horse, and every `p_include_horses` either is
  omitted or is passed true unless an explicit operator filter set it, in
  which case the unfiltered total travels with the response.
- Every queue distinguishes empty-clean from empty-never from unknown.
- No write path removes an item or claims a payment on a 202.
- Every write files exactly one audit row per item, carrying the operation's
  real outcome including `unknown_outcome`.
- No read path writes an audit row.
- No Phase 6 source file contains an em dash or an emoji.
- `pages/horses/index.js` did not grow.

## 7. What Phase 6 will NOT do

Stated as prohibitions because each one is a thing a reasonable agent would
otherwise do.

**No duplicate Club Arena authority.** Club Arena owns club status beyond
suspension, club and union configuration, union membership, union settlement,
leave requests, applications, announcement composition, and cashout approval.
Phase 6 reads those and links to them. It does not reimplement one of them,
and a second writer into a table Club Arena writes is a defect regardless of
how convenient it is.

**No new inline code in `pages/horses/index.js`.** The file is 8,118 lines.
Phase 9 exists to shrink it. Phase 6 adds nothing to it.

**No watcher, cron or repair loop.** Nothing in this phase certifies a
release, supplies correctness, or repairs data so a surface looks right.
Scheduled application work is **Open Claw's**, never the Claude scheduler. The
rake rollup catchup functions exist and Phase 6 is forbidden to call them; a
stale report says it is stale.

**No real-chip testing.** Every money path is proved in a rolled-back
transaction against production first. The one real funding in O3's
verification is an operation Dan wants performed anyway, not a test. The
cashier scope is verified against its empty states and a rolled-back
simulation, because the queue is genuinely empty.

**No browser-owned engine simulation.** The console does not compute what the
engine would do, does not predict a hand boundary, and does not model the
floor. Where the engine is the authority and is unreachable, the answer is
`unknown`.

**No parallel notification delivery engine.** `push_outbox` and its Open Claw
dispatcher are the delivery path. Phase 6 writes no row to `push_outbox`,
starts no second dispatcher, and sends nothing from a browser.

**No "AI Model" fleet control, and no calling horses bots.** Horses are
players running deterministic HorseLogic. No surface in this phase describes
them otherwise, and no control in this phase selects a model for them.

**No hiding horse evidence.** No Phase 6 list, total, report or export
excludes, suppresses or down-ranks a horse because it is a horse. On
2026-09-23 every seated player on the platform was a horse, so this is not an
abstract principle here: it is the difference between a floor panel and a
blank screen.

**No restriction presented as enforced.** Phase 4's enforcement flag is still
Dan's to turn on. Nothing in Phase 6 implies a suspension, a restriction or a
pause was enforced by production unless production enforced it.

## Appendix A. Measured reality, 2026-09-23

Measured against commit `9373149ecb83b6f7130ca920535e3592a17dfce3`, Supabase
project `kuklfnapbkmacvwxktbh`, and `https://engine.smarter.poker/health`.
Counts are exact `count(*)` where the table is small and the planner's
`reltuples` estimate where it is large; the distinction is marked. These are
moving numbers, not fixtures.

### A.1 Engine health

`version` 8825af51, `releaseSha` 8825af51817f379c4261658ca29ecc9d8d81932d,
`liveness` ok, `status` ok, `running` true.

| Field | Value |
| --- | ---: |
| `activeTables` | 450 to 451 across two reads |
| `dealableTableCount` | 102 to 103 |
| `stalledTableCount` | 65 |
| `deadStalledCount` | 65 |
| `activeTournaments` | 425 |
| `humansSeatedTotal` | 0 |
| `handsInFlightTotal` | 38 |
| `totalHandsDealt` | 5,863,676,540 |
| `tableLivenessSummary.tables` | 451 |
| `tableLivenessSummary.undealable` | 149 |
| `tableLivenessSummary.dealableSeats` | 678 |
| `telemetry.avgHandsPerHour` | 153 |
| `telemetry.avgHandDurationMs` | 19,608 |
| `telemetry.tablesWithMetrics` | 103 |
| `settlementStatus` | ok |
| `blockedSettlementCount` | 0 |
| `wholeFleetStalled` | false |

`rakeSpec`: `drifted` false, `detail` "database and engine agree", compiled
and database checksums both `f9cfc362daedd898780b84f20be3e4e4`.
`spinLaunchParks`: count 0, terminal 0, parked empty.
`maintenance`: active false, phase idle, protocol `engine-recovery-window-v1`,
`unparkedTables` 0, `unparkedReasons` `{f06_preparation_unresolved: 1}`.
`leadership`: role leader, holder `1-3846b8bb`, errors 9.

The only engine HTTP surfaces referenced anywhere in this repository are
`/health` and `/admin/kick` (`pages/api/club-arena/anti-cheat.js:429`).

### A.2 Floor, from the database

| Measure | Exact count |
| --- | ---: |
| `tables` total | 285,519 |
| `tables` closed | 284,279 |
| `tables` running | 715 |
| `tables` waiting | 525 |
| `tables` paused | 0 (no such row exists today) |
| Live tables (running plus waiting) | 1,240 |
| Live tournament tables | 1,103 |
| Live cash tables | 137 |
| Occupied seats on live tables | 3,352 |
| Horse seats | 3,352 |
| Human seats | 0 |
| Tournaments not COMPLETED or CANCELLED | 747 |

### A.3 Row counts by scope

Exact counts unless marked estimate.

| Table | Rows | Scope |
| --- | ---: | --- |
| `table_seats` | 720,238 (est) | O1 |
| `hand_history` | 2,970,260 (est) | O1 |
| `tournaments` | 214,451 (est) | O2 |
| `tournament_players` | 685,949 (est) | O2 |
| `tournament_payouts` | 235,706 (est) | O2 |
| `tournament_escrow` | 134,667 (est) | O2 |
| `tournament_guarantee_overlays` | 227 | O2 |
| `tournament_cancellation_receipts` | 665 | O2 |
| `tournament_refund_entitlements` | 211,285 (est) | O2 |
| `tournament_refund_tranches` | 1,371 (est) | O2 |
| `tournament_refund_authorizations` | 0 | O2 |
| `tournament_rake_settlements` | 196,310 (est) | O2, O6 |
| `tournament_schedules` | 211 (est) | O2 |
| `clubs` | 5 | O3 |
| `club_members` | 1,926 (est) | O3 |
| `chip_transactions` | 790,991 (est) | O3 |
| `settlement_periods` | 10 | O3, O4 |
| `unions` | 1 | O4 |
| `union_clubs` | 2 | O4 |
| `union_admins` | 1 | O4 |
| `union_settlement_rounds` | 11 | O4 |
| `union_presettlements` | **0** | O4 |
| `union_applications` | **0** | O4 |
| `union_leave_requests` | **0** | O4 |
| `cashout_requests` | **0** (0 pending) | O5 |
| `chip_requests` | **1** | O5 |
| `rake_records` | 2,956,705 (est) | O6 |
| `rake_rate_audit` | **0** | O6 |
| `ca_club_data_exports` | **0** | O7 |
| `commander_export_jobs` | 1 | O7, wrong domain |
| `club_announcements` | **0** | O8 |
| `union_announcements` | **0** | O8 |
| `commander_club_announcements` | 6 | O8, wrong domain |
| `notifications` | 12,131 (est) | O8 |
| `ca_operator_approvals` | **0** | all |
| `profiles` | 1,199 (est) | all |

**Scopes with NO backing schema for the thing the brief asked for: O7** (no
platform-operator export job table) **and the platform tier of O8** (no
platform-wide announcement table). Every other scope has schema; O5's schema
exists but is empty, which is a different problem and is treated differently.

### A.4 Function signatures actually read from `pg_proc`

All SECURITY DEFINER unless marked.

```
fn_ca_fund_club(p_club_id uuid, p_amount numeric, p_reason text, p_idempotency_key text)
fn_ca_mint(p_asset text, p_destination text, p_target_id uuid, p_amount numeric, p_reason text, p_op_id text, p_class text)
fn_ca_burn(p_asset text, p_source text, p_target_id uuid, p_amount numeric, p_reason text, p_op_id text, p_class text)
fn_ca_operator_request_approval(p_kind text, p_payload jsonb, p_requested_by uuid, p_amount numeric,
                                p_asset text, p_target_type text, p_target_id text, p_reason text,
                                p_op_id text, p_request_id text)
fn_ca_operator_decide_approval(p_approval_id uuid, p_decision text, p_decided_by uuid, p_note text)
fn_ca_operator_mark_executed(p_approval_id uuid, p_result jsonb, p_status text)
fn_ca_operator_has_second_approver(p_requested_by uuid, p_permission text)
fn_ca_operator_permissions(p_user_id uuid)
fn_ca_fleet_set_policy(p_scope text, p_scope_id uuid, p_patch jsonb, p_updated_by uuid, p_reason text)
fn_clear_table_seats(p_table_id uuid, p_reopen boolean)
fn_seed_horses_to_floor(p_club_id uuid, p_floor numeric)
fn_settle_tournament_rake(p_tournament_id uuid, p_source text)
fn_tournament_payout_reconcile(p_tournament_id uuid, p_apply boolean)
fn_tournament_payout_sweep(p_days integer, p_apply boolean, p_limit integer)
fn_expire_stale_cashouts(p_ttl_hours integer)
fn_mint_club_chips(p_club_id uuid, p_amount numeric, p_reason text, p_op_id text)
fn_union_rake_by_club(p_union_id uuid, p_days integer)
fn_union_rake_by_day(p_union_id uuid, p_days integer)
fn_union_rake_paid_by_club(p_union_id uuid, p_start timestamptz, p_end timestamptz, p_include_horses boolean DEFAULT true)
fn_union_rake_paid_live(p_union_id uuid, p_start timestamptz, p_end timestamptz, p_include_horses boolean DEFAULT true)
fn_union_rake_paid_readonly(p_union_id uuid, p_start timestamptz, p_end timestamptz, p_include_horses boolean DEFAULT true)
fn_union_tournament_rake_by_club(p_union_id uuid, p_start timestamptz, p_end timestamptz, p_include_horses boolean DEFAULT true)
fn_union_settlement_preview(p_union_id uuid, p_period_start timestamptz, p_period_end timestamptz)
fn_union_record_presettlement(p_union_id uuid, p_club_id uuid, p_amount numeric, p_method text, p_reference text, p_note text)
fn_union_apply_presettlements(p_union_id uuid, p_settlement_id uuid, p_club_id uuid)
fn_union_settle_player_pnl(p_union_id uuid, p_start timestamptz, p_end timestamptz, p_dry_run boolean)

NOT security definer:
fn_approve_cashout_atomic(p_cashout_id uuid, p_agent_id uuid, p_agent_note text)
fn_agent_approve_cashout(p_cashout_id uuid, p_agent_user_id uuid, p_agent_note text)
fn_cancel_cashout_atomic(p_cashout_id uuid, p_user_id uuid, p_is_agent boolean, p_note text)
fn_cancel_cashout(p_cashout_id uuid, p_user_id uuid)
fn_complete_cashout(p_cashout_id uuid, p_completed_by uuid)
fn_request_cashout(p_player_id uuid, p_club_id uuid, p_amount numeric, p_note text, p_agent_id uuid, p_type text)
fn_release_tournament_holds(p_tournament_id uuid)
fn_credit_treasury(p_club_id uuid, p_amount numeric, p_reason text, p_metadata jsonb, p_op_id text)
fn_debit_treasury(p_club_id uuid, p_amount numeric, p_reason text, p_metadata jsonb)
fn_tournament_atomic_register(p_user_id uuid, p_club_id uuid, p_tournament_id uuid, p_buy_in numeric)
```

`fn_settle_tournament_rake`'s body was re-checked on 2026-09-23 and does NOT
contain `is_horse`. The suppression PHASE5-CONTRACTS.md section 0 rule 4
recorded has been removed. Do not reintroduce it.

### A.5 Route inventory

`pages/api/horses/` holds nineteen files:
`admin-reviews.js`, `analytics.js`, `anti-abuse.js`, `club-arena-admin.js`,
`economy-stats.js`, `fleet-admin.js`, `generate-avatars.js`,
`grinder-stats.js`, `hg-appeals.js`, `hg-gdpr-erase.js`,
`hg-onboarding-status.js`, `hg-reports.js`, `integrity-admin.js`,
`merch-catalog-admin.js`, `mint.js`, `operator-admin.js`, `player-admin.js`,
`stable-admin.js`, `trigger-pipeline.js`.

Of these, only `club-arena-admin.js` serves a Phase 6 concern today: club and
union reads, the pending cashout list, and the platform rake summary. Its one
mutation is `set_club_status`. Nothing in `pages/api/horses/` serves the live
floor, tournaments, chip requests, exports or announcements.

`pages/api/club-arena/` holds sixty-four files. The ones Phase 6 links to or
embeds are `announcements.js`, `approve-cashout.js`, `auto-close-tables.js`,
`cancel-my-cashout.js`, `cashier-info.js`, `cashout-history.js`,
`club-health.js`, `club-analytics.js`, `manage-table.js`, `manage-union.js`,
`mint-chips.js`, `settle-period.js`, `settlement-history.js`,
`union-application.js`, `union-invoice.js`, `union-wallet.js`,
`update-table-settings.js`, `table-chips.js`, `waitlist.js`,
`audit-trail.js`.

### A.6 Client facts

`pages/horses/index.js` is 8,118 lines.
`src/components/horses/` holds the shared primitives including
`exportAllCsv.js` (defaults `limit = 500`, `maxPages = 200`, hard ceiling
100,000 rows with a `complete` flag), `tabRegistry.js` (twenty-three tab
entries; the Phase 5 `integrity` entry at lines 132-133 is the pattern a new
tab follows), and the Phase 3, 4 and 5 panels.

## Appendix B. Open questions

Things that could not be measured from this worktree, this database or the
engine's public health endpoint. None of them is assumed in the contract
above; each one blocks something named.

1. **The Club Arena operator UI's base URL.** Every LINK in O3, O4, O5 and O8
   needs a destination, and there is none in this repository. There is no
   Club Arena hostname in the source, and no environment variable whose name
   contains `CLUB` or `ARENA`. `pages/club/[id].js` is a PUBLIC club page, not
   an operator surface, and there is no `pages/club-arena/` directory. The
   Club Arena operator front end is a separate deployment this worktree cannot
   see. **Blocks: every LINK control.** Resolve by asking Dan for the base URL
   and the per-surface path convention before building any LINK.

2. **Whether the engine will expose a hand-boundary table operation, and on
   what terms.** Section 3.1 writes the contract such an operation must
   satisfy, but it was specified from the console's side only. The engine
   repository was not read for this document. **Blocks: O1's controls.**

3. **What writes `tournament_cancellation_receipts`.** 665 receipts exist and
   nothing in this repository writes them. The evidence points to the engine
   but this was inferred, not verified: the engine repository was not read.
   **Blocks: O2's cancel and refund LINK destination.**

4. **Whether `cashout_requests` being empty is normal or is a regression.**
   The table has zero rows and zero pending, yet `club-arena-admin.js` has a
   `CASHOUT_SUM_CAP` of 1000 and per-list pagination built for a busy queue,
   and Phase 2 built an approval kind for it. Whether cashouts were migrated,
   archived, or have genuinely never been used was not determined. **Blocks:
   knowing which O5 empty state is the honest one.**

5. **The engine's floor divergence.** Section 2.2 measures that the database
   and the engine disagree by roughly a factor of three on live tables and
   tournaments. WHY was not determined. It may be that `tables` retains
   `running` rows for tables the engine has finished with, or that the engine
   counts only tables it currently holds. **Does not block O1's read-only
   surface, which discloses both, but it does block interpreting either
   number as correct.**

6. **Whether a CI gate scans `docs/` for em dashes and emoji.** Gates exist
   that scan source files, and several law tests read files under `docs/`, but
   no gate was found that applies the punctuation rule to a document. This
   file complies regardless.

7. **Stop-loss versus deposit.** O3's brief names it and no column or function
   was found that expresses it. It may live in club settings JSON or in a
   Club Arena surface not read here. **Blocks: that one field of O3's club
   drill-down.**

8. **Stakes on a live table.** O1's brief asks for stakes per table. The
   `tables` columns were not enumerated for this document, so which column
   carries the blind level was not confirmed. **Blocks: one column of O1.**

## 8. Verification before Phase 7

Phase 6 is not done when the panels render. It is done when:

- Every scope's named tests pass, the law file passes, and the build and all
  gates are green.
- Every migration this phase adds (there should be at most one, for O7 or O8,
  and only if Dan unblocks them) is additive, applied in one transaction, dry
  run first, registered, and proved in a rolled-back production simulation.
- Every LINK has been followed end to end in a browser and lands on a real
  surface, not a 404. This cannot start until open question 1 is answered.
- The live floor divergence banner has been seen rendering real, disagreeing
  numbers, because a banner that has only been seen in a test is a banner
  nobody has checked the wording of.
- Every surface has been RENDERED IN A BROWSER at desktop and at 375px against
  production. Phase 4 proved that step finds defects the tests cannot, and
  Phase 5 repeated the finding.
- An adversarial review pass has run with its findings closed.
- The branch is pushed. Nothing in this phase is committed or pushed by an
  agent without Dan asking for it.
