# Stable Admin Phase 8 Contracts

Date frozen: 2026-10-05
Scope: C1-C7, Platform Controls And Observability
Parent plan: `docs/horses/STABLE-ADMIN-OVERHAUL-PLAN.md`

## 0. The Rule Before The Screen

Phase 8 is a control-plane projection over authorities that already exist. It
must never create a switch that no runtime consumes, turn missing evidence into
green, or call an acknowledgement a resolution.

The old plan's deploy-dispatch wording is stale. The database dispatcher was
deliberately retired by Club Arena migration
`20260910183316_retire_legacy_autofix_and_db_deploy_dispatch.sql`. Stable Admin
shows **Engine Release Receipts** from `ca_engine_deploy_attempts`; it does not
recreate, retry or simulate a deployment dispatcher.

Every card and row names its authoritative source. A failed source is Unknown,
never zero, Off, inactive or healthy. Horses remain players in every count.

## 1. Permission And Transport Boundary

- The tab and every GET require `console.read` through `withOperatorRoute`.
- The Phase 8 route is service-side only. The browser never queries Supabase or
  the engine directly.
- Existing writes retain their existing source-specific permission and route.
  A general `settings.write` permission is not authority to move money, freeze
  payouts, change the engine or dispatch a release.
- Phase 8 adds no generic table/column updater.
- External engine reads have a hard timeout and a short server cache. A timeout
  is an Unknown engine, not an engine with zero tables.
- Lists are server-paged, capped and newest first. Fault text and JSON evidence
  are bounded before returning to the browser.

## 2. C1 Engine View

The engine section reads the same bounded health adapter used by Live Floor and
reconciles it with database platform counts. It may show:

- engine reachability, liveness, version, release SHA, instance and uptime;
- active, dealable and stalled tables and active tournaments;
- humans seated from engine health and occupied seats from database evidence;
- average measured-table hands per hour;
- **Estimated Platform Hands Per Second**, calculated as
  `activeTables * averageHandsPerHour / 3600` and always labelled Estimated;
- average action-processing latency and the sample/violation evidence the
  engine actually supplies;
- checked time, cache state, staleness and per-source failures.

The current JSON health contract does not provide authoritative rolling
platform hands/second, p95 action latency or total engine seats across humans
and horses. The screen does not invent them. A 503 carrying a valid engine
health body is degraded evidence and is still parsed.

## 3. C2 Maintenance, Break Evidence And Releases

### Status

Maintenance status reconciles `/health.maintenance` with the durable singleton
`engine_maintenance_break` and the latest `engine_maintenance_thaws` row.

- Engine unreachable: Unknown.
- Durable break plus inactive runtime: Divergence.
- Active runtime break without durable authority: Freeze Authority Missing.
- Both aligned: show the actual phase, timing, freeze enforcement and recovery.
- Neither present: no active break.

### Evidence

Break evidence is SELECT-only and independently reads:

- `ca_break_scorecards`;
- `engine_maintenance_break_log`;
- `engine_maintenance_break_faults`;
- `engine_maintenance_thaws`;
- `ca_freeze_circulation_marks`.

Refresh never calls recorder or capture functions. Raw financial freeze deltas
are not returned without `money.read`.

### Controls

There is no safe authenticated engine contract for starting, cancelling or
ending a global break. A direct database update would bypass ownership fencing,
hand-boundary parking, broadcasts, timers, thawing and recovery waves. Phase 8
therefore exposes status and the exact authority gap; it does not ship a no-op
or a dangerous database button. Table-level Club Arena pause/resume is not
mislabelled as global maintenance.

### Engine Release Receipts

`ca_engine_deploy_attempts` is read-only release evidence: attempt time,
workflow run, target SHA, shipped state, reason and actor. The screen compares
the current engine SHA with the latest shipped receipt. Provider dispatch and
retry remain provider-owned actions.

## 4. C3 Feature And Policy Registry

The registry is an allowlisted projection. It does not copy authoritative state
into a second generic table.

Each row carries `key`, `domain`, `kind`, `enabled/state`,
`rolloutPercent|null`, scope, source table and field, named consumer, writable
state, write authority, update evidence, audit source and source health.

Minimum inventory:

- Club Entry `create_club`, `find_player`, `join_club` from
  `club_entry_feature_flags`; these are real deterministic percentage rollouts.
- Fleet `pause_new_seatings`; the existing Fleet Command is the write owner.
- Operator governance from `ca_operator_policy`; Staff And Roles is the owner.
- Video pipeline controls; Video Operations is the write owner.
- Arena release gates, payout freezes and Trivia ledger switch as read-only,
  with their written human-only authority displayed.

Environment values are configuration, not runtime flags, and secrets are never
returned. `vip_plan_switches` is audit history and is excluded.

Unknown/unreadable state is non-writable. Percentage rollout appears only for a
consumer that implements deterministic bucketing. Seed values are not presented
as live values.

## 5. C4 Kill-Switch Inventory

Every kill switch states its exact blast radius. Generic labels such as
"Disable Tournaments" are prohibited.

- Fleet: reuse `pause_new_seatings`; it stops new horse seating only and never
  removes a seated player or interrupts a hand.
- Arena release gates: read-only under
  `docs/laws.d/only-a-person-moves-the-arena-switches.md`.
- Payout freezes: human-only source authority. No detector or cron may trip one.
- Diamond issuance freeze: only Diamond issuance, not all mint activity.
- Cashout: scheduled maintenance freeze is not a dedicated cashout kill switch.
- General tournament registration: no complete global kill exists today.
- Chip issuance: no complete positive-issuance kill exists today.

Missing controls are displayed as **Not Implemented In The Authoritative
Path**, never as Off. Phase 8 does not add API-only gates that another caller
can bypass. A future control is complete only after every authoritative RPC
enforces it, refusal and recovery paths are tested, and cancellation, refund,
burn, reversal and repair paths remain available where required.

## 6. C5 Cron Health

Cron health combines the actual telemetry stores without claiming coverage they
do not provide:

- `cron_health_log` for instrumented handlers;
- `v_openclaw_job_staleness` for Open Claw jobs that have enough successful
  history for that view;
- route-owned heartbeat evidence where the prior phases already established it.

One source cannot make another green. Jobs absent from telemetry are Unknown,
not Never Run, unless the registry proves the job should report there. The
screen names scheduler ownership and never adds, advances or retries a job.

## 7. C6 Alert Health

The operator view reads service-owned alert evidence, including
`operational_alert_events`, `engine_alerts`, `deploy_alerts` and
`financial_alerts`, with per-source failure disclosure and bounded rows.
Resolved source signals are not described as investigated or fixed unless the
investigation state says so.

## 8. C7 Platform Incidents And Acknowledgement

The incident list normalizes, without merging identities:

- `ca_drift_incidents`;
- `operational_alert_events`;
- engine, deploy and financial alert evidence.

Acknowledgement means an operator has seen and taken ownership of evidence. It
does not alter the source verdict, resolve a drift, clear an alert, repair a
break or make a health card green.

Where the source already has a safe acknowledgement state, the source-specific
contract owns it. Otherwise the UI must remain read-only until a durable,
audited acknowledgement schema exists. No direct write may guess legacy alert
columns.

## 9. Visual Contract

The code-split tab is **Platform Operations**. It is 375px-first and follows
the Club Arena console language: machined gunmetal frames, restrained electric
blue energy, dense instrumentation, sharp geometry and live evidence. It uses
the existing icon system and no emoji, generic glass cards, flat stock art or
decorative imagery.

Desktop may expand the information grid and evidence tables. Mobile preserves
the same facts and actions in one-column priority order; it does not hide bad
states or financial disclosure.

## 10. Verification Gate Before Phase 9

Phase 8 is not complete until all of the following are pinned:

1. Route method, permission and unauthenticated refusal tests.
2. Engine timeout and malformed payload return Unknown, never zero.
3. HTTP 503 with valid health evidence renders Degraded.
4. Runtime/database maintenance disagreement renders a named divergence.
5. Every evidence source can fail independently without erasing other rows.
6. Pagination, caps, ordering and evidence scrubbing tests.
7. Estimated throughput is labelled Estimated in route and UI.
8. Retired deploy-dispatch identifiers and recorder/capture calls are forbidden.
9. Registry keys and sources are allowlisted; no generic updater exists.
10. Human-only Arena, payout and Trivia laws remain read-only.
11. Missing tournament, cashout and chip-issuance controls render Missing, not
    Off or Available.
12. Incident acknowledgement is never rendered as resolution.
13. Keyboard, focus, 375px overflow, reduced-motion and contrast checks pass.
14. Focused Phase 8 tests, adjacent Phase 6/7 tests and the production build pass.
15. Protected merge, provider deployment, served build identity and live route
    authentication behavior are verified separately.

## 11. Delivery Checkpoint

- Operation owner: Stable Admin Phase 8 task.
- Checkout: `/Volumes/SmarterWork/agent-work/stable-admin-phase7-20261005/release-repo`.
- Branch: `agent/codex/stable-admin-phase8-20261005`.
- Candidate base read on 2026-10-05: `origin/main` at `b46fd3551`.
- Component classification: World Hub application and tests only. No database
  migration, Club Arena client package or engine replacement is included.
- Shared policy receipt read in full on 2026-10-05:
  `policyVersion=2.9`,
  `manifestSHA256=a659f31c5c1c2b0864889508079a635dd5fe2fc98decfbfc9d3f9c80dd45ec3b`.
- Local evidence: Phase 6 through Phase 8 focused regression suite 108 passed,
  focused ESLint passed, exact production `npm run build` passed after replacing
  a read-only shared dependency link with a task-owned SSD copy.
- Remaining evidence: protected PR checks, protected merge, Vercel production
  READY identity, served `/api/health` ancestry and live `/horses` plus
  `/api/horses/platform-admin` authentication and method behavior.
