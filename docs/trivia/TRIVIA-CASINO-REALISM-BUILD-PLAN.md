# Trivia Casino Realism: Twelve-Phase Build Plan

Status: implementation contract  
Program: Trivia World modernization  
Design direction: `#SmarterCasinoRealism`  
Repository baseline reviewed: `origin/main` at `d8109a3a29`  
Production audit date: September 6, 2026

This plan consolidates the production, engine, economy, tournament, question-bank,
and every-page UI audits into one dependency-ordered delivery program. It is the
execution contract for rebuilding Trivia without weakening the existing server-owned
grading work or risking diamond balances.

The program has twelve phases. A phase is complete only when its exit gate passes;
shipping code or producing screenshots is not completion. Work inside a phase should
be split into small, independently reviewed changes, and every change should include
the tests and telemetry needed to prove its own behavior.

## Delivery status

| Phase | State | Release boundary |
|---:|---|---|
| 1 | Complete | Competitive containment, production baseline, final smoke, and release evidence are recorded in `PHASE-1-RELEASE-REPORT.md`. |
| 2 | Ready next | Versioned rules, balanced journal/ledger, atomic economic operations, and settlement foundation. |
| 3 | Planned | Question-bank and deterministic-engine defects found during Phase 1 are explicit entry blockers. |
| 4–12 | Planned | Start only when the dependency graph and prior phase exit gates permit it. |

The release controls for PvP, PvP horses, tournaments, and tournament horses remain
off after Phase 1. “Ready next” does not mean enabled or partially shipped.

## Non-negotiable product requirements

1. The complete Trivia world uses `#SmarterCasinoRealism`: obsidian, carbon,
   gunmetal, chrome, electric blue, and restrained prize gold rather than purple
   arcade glass.
2. Every game mode has distinct artwork. A lobby thumbnail is not reused as the
   central image on its destination page, and essential text or controls are never
   baked into an image.
3. Mobile mode cards and mode introductions always stack in this order: image,
   title/status, description, entry/reward/rules, then action. Image and description
   must not be side by side on mobile.
4. Desktop is a separate cinematic composition, not an enlarged mobile stack.
5. Preserve the recognizable Daily Trivia header and Quick Stakes footer identity,
   while rebuilding their wrappers with semantic, responsive HTML.
6. PvP is human-first. If no compatible live human is available, exactly one clearly
   labeled Smarter Horse joins after one server-persisted randomized wait of 20 to 45
   seconds inclusive. Refreshes and retries never reroll that time.
7. One live tournament starts every calendar day at 8:00 PM in
   `America/Chicago`. Its persisted horse target is randomly chosen once from 70
   through 140 inclusive. Humans are additive, and every horse is disclosed.
8. Every diamond entry, stake, hold, treasury subsidy, rake, refund, payout,
   reversal, and repair has an immutable, idempotent transaction record. A terminal
   match or tournament cannot retain unexplained escrow.
9. Paid and competitive play uses only verified, eligible, server-owned questions
   and server-authoritative grading.
10. No browser creates competitive records, chooses a horse, grades a question,
    changes a balance, declares a winner, or settles a game.

## Audited production baseline

The release must be measured against the following verified starting state:

| Area | Verified state |
|---|---:|
| Horse profiles | 1,000 active/available; 900 with a positive diamond balance |
| PvP matches | 4 lifetime; 0 completed; 4 abandoned human-versus-horse |
| Human-versus-human PvP | 0 lifetime |
| PvP queue | 11 historical rows; none live at audit time |
| PvP stakes, last 30 days | 3 rows, net `-120` diamonds |
| PvP refunds, last 30 days | 488 rows, net `+14,240` diamonds |
| Tournaments | 5 lifetime; 0 in the last 90 days; 0 upcoming or active |
| Tournament entries | 208 lifetime; all horses |
| Tournament settlement gap | One completed 8-horse event, 184-diamond pool, no ranks or payouts |
| Questions | 24,168 total |
| Audit-verified questions | 14,627 |
| Failed-audit questions | 1,256 |
| Audit state unset | 8,285 |
| Low/missing quality score | 9,214 |
| Duplicate rows beyond canonical | 3,930 across 2,620 normalized groups |
| Recent sessions | 14 in 30 days; 11 open over two hours; 3 submitted without stats |

The existing tournament cron reports success while processing no tournaments. A
green HTTP invocation is therefore not evidence of a working business outcome.

## Target system ownership

| Layer | Sole responsibility |
|---|---|
| World Hub browser | Render sanitized state, collect player intent, resume sessions, show receipts |
| World Hub API | Authenticate, rate-limit, validate transport shapes, return sanitized DTOs |
| Supabase/PostgreSQL | Rules, queue claims, rosters, grading, match/tournament state, ledger, settlement, idempotency |
| Smarter Poker Workers | Invoke authoritative database operations and publish operational telemetry |
| OpenClaw | Sole schedule owner for tournament creation/advancement and recovery jobs |

Business rules must not be duplicated in cron handlers. OpenClaw may have an
active/passive failover process, but a database lease/fencing token permits only one
logical owner to advance or settle an event. The Vercel tournament tick and legacy
OpenClaw tournament/PvP cleanup routes are retired in the same controlled cutover
that enables the replacement.

## Dependency graph

```text
Phase 1  Control plane, baseline, containment
   |
   +--> Phase 2  Rules + diamond ledger --------+
   |                                             +--> Phase 5  PvP engine --------+
   +--> Phase 3  Questions + sessions -----------+--> Phase 6  Tournament engine -+--> Phase 7
   |
   +--> Phase 4  Casino UI foundation ------------------------------------------+

Phase 2 + Phase 3 + Phase 4 --> Phase 8 --> Phase 9 and Phase 10
Phase 5 through Phase 10 ----> Phase 11 ----> Phase 12
```

Phases 2, 3, and 4 can proceed in parallel after Phase 1. Phases 5 and 6 can proceed
in parallel after Phases 2 and 3. No competitive UI may graduate before its
authoritative engine and ledger path have passed their own exit gates.

## Delivery rules that apply to every phase

- Use additive forward migrations. Backfill, validate, switch reads/writes, observe,
  and only then remove legacy structures.
- Preserve existing identifiers and transaction references. Quarantine ambiguous
  historical data instead of deleting it.
- Put each independently reversible capability behind a feature flag.
- Every state-changing operation gets a client nonce or stable server idempotency
  key before it can reach production.
- Every database constraint is tested under authenticated, anonymous, and service
  roles as applicable.
- Every money-moving path includes success, duplicate, insufficient funds,
  interruption, retry, and rollback tests.
- New functionality ships with structured logs, run IDs, domain metrics, and alerts;
  observability is not deferred to the end of the program.
- A phase cannot exit with an unresolved Critical or High security/economy defect.
- The production build continues to use the repository's webpack build pipeline and
  required pre-build patch/pruning sequence.

---

## Phase 1 — Control Plane, Production Baseline, and Competitive Containment

### Objective

Create a safe control plane, preserve forensic evidence, and close the current
competitive payout surface before adding features or changing visuals.

### Dependencies

None.

### Deliverables

#### Product and release control

- Approve and version the PvP rules, nightly format, entry/rake/refund policies,
  horse disclosure language, treasury funding, and official Central time contract.
- Add independent server-side kill switches for:
  - PvP v2
  - Nightly tournament v2
  - PvP horses
  - Tournament horses
- Make lobby availability consume the same server-only competitive switches so a
  card can never advertise a disabled route. The broader casino-UI canary and
  route-family rollout belongs to Phase 4, where both old and new shells exist.
- Define canary users, canary wallets, treasury exposure limits, release owner,
  rollback owner, and incident channel.
- Create a state/path inventory covering every Trivia URL, API, RPC, table, view,
  policy, trigger, cron, worker handler, transaction type, and legacy component.

#### Production evidence and containment

- Store reproducible read-only baseline queries and results for the audited state.
- Quarantine the four abandoned PvP matches from automated settlement pending
  reconciliation. Do not silently refund, pay, or delete them.
- Keep the historical 184-diamond tournament in a review state. Do not auto-pay it;
  first determine whether it is a real liability or test-script activity.
- Disable the unsafe legacy four-hour PvP cleanup money path.
- Disable public PvP entry until the server-owned engine passes Phase 5.
- Revoke authenticated direct INSERT/UPDATE/DELETE on PvP matches and broad raw
  queue reads/writes.
- Restrict current settlement to valid source states and reject foreign/reused
  sessions, mismatched participants, mutable stakes, and roster mismatches.

#### Reproducible schema

- Add a forward migration that reproduces the live score-only PvP alias-trigger
  behavior; do not rely on a manual production hotfix.
- Add dedicated participant/session binding columns or match-player records and
  plan the removal of overloaded `challenger_id`/`opponent_id` semantics.
- Add missing participant/status indexes, valid stake checks, ticket/match status
  checks, and one-active-record constraints.
- Record the exact current production function, trigger, constraint, privilege,
  publication, and RLS definitions for replay comparison.

#### Tests and telemetry

- Add schema-contract tests comparing a clean migration replay with the expected
  production contract.
- Add authenticated abuse tests for match creation, opponent/stake mutation,
  score/winner mutation, queue enumeration, and invalid settlement.
- Add alerts for any attempted browser match mutation and any invocation of a
  retired money route.

### Rollout and rollback

- Deploy flags first, off by default.
- Deploy privilege/settlement containment before structural migrations.
- Keep all historical rows; rollback restores application reachability only after
  the original vulnerability is demonstrably closed.
- If a migration parity check fails, stop before enabling any new competitive path.

### Exit gate

- The product/economy contract is versioned, records its approval source, and is
  independently reviewed with the implementation evidence.
- All baseline queries are repeatable and their counts match the stored snapshot.
- An authenticated browser cannot create/mutate a match, enumerate another queue
  identity, alter money-bearing fields, or settle an abandoned match.
- Clean replay matches the approved production schema contract.
- PvP remains safely disabled and retired cleanup cannot move money.
- No Critical/High containment issue remains open.

---

## Phase 2 — Versioned Rules, Atomic Diamond Ledger, and Settlement Foundation

### Objective

Create the common financial and rules foundation used by every paid solo game, PvP,
horse, tournament, achievement, refund, and repair path.

### Dependencies

Phase 1.

### Deliverables

#### Versioned rules

- Build one typed rules registry with immutable versions for question count, timer,
  cost/stake, cap, rake, scoring, tie, no-show, disconnect, refund, and payout.
- Persist a rules snapshot on every paid session, PvP match, and tournament instance.
- Make UI copy, Geeves/help content, analytics, tests, and server behavior consume the
  same versioned contract.

#### Double-entry economy

- Introduce explicit accounts or equivalent balanced journals for:
  - Player wallet
  - Horse/promotional treasury
  - PvP escrow
  - Tournament escrow
  - House rake/revenue
  - Refund liability
- Add immutable journal headers and lines, transaction references, source event,
  rules/settlement version, actor kind, funding source, before/after balance, and
  reconciliation state.
- Enforce that every journal balances to zero.
- Preserve the current user-facing `diamond_transactions` history through linked
  projections or compatibility writes; never maintain an unlinked second ledger.
- Store entry fee, net contribution, rake, funding source, and transaction IDs on
  every tournament/PvP participant.
- Add atomic RPCs for hold, release, debit, subsidy, rake, payout, refund, reversal,
  and explicitly approved repair.
- Add daily treasury subsidy/exposure ceilings and fail closed when funding is not
  available.

#### Settlement contracts

- Define one settlement state machine and terminal-state vocabulary.
- Require one settlement record and one idempotency reference per match/tournament.
- Make stats, outcome, journal lines, escrow close, and terminal status one database
  transaction.
- Add reconciliation views by match, tournament, user, treasury, transaction
  reference, and date.
- Keep immutable gross pool and final prize-pool values separate from remaining
  escrow; never reuse `prize_pool` for both historical display and unpaid balance.

#### Tests and telemetry

- Property-test balance conservation across randomized costs, fields, rake, ties,
  refunds, partial participation, and rounding.
- Inject failure before and after every settlement step.
- Race duplicate client nonces, two tabs, two workers, and recovery sweeps.
- Emit ledger imbalance, duplicate prevention, treasury floor, settlement latency,
  and nonzero terminal escrow metrics.

### Rollout and rollback

- Add tables/RPCs and compatibility views without switching live callers.
- Shadow-write non-money fixtures first, then canary-wallet transactions.
- Compare old projections with the new journal before any live caller cutover.
- Rollback switches callers back while retaining new immutable records for audit;
  never delete a partially observed journal.

### Exit gate

- A clean migration, seed, backfill, and rollback rehearsal passes.
- Randomized journal tests always balance to zero.
- Forced mid-operation faults commit either the entire settlement or nothing.
- Concurrent retries create exactly one financial result.
- Every synthetic terminal match/tournament has zero escrow.
- Reconciliation reports have zero unexplained variance.

---

## Phase 3 — Question Quality, Deterministic Selection, and Session Integrity

### Objective

Make question selection, grading, session recovery, stats, and progression trustworthy
before competitive engines depend on them.

### Dependencies

Phase 1. Ledger-linked reward settlement also depends on Phase 2.

### Deliverables

#### Question eligibility and curation

- Competitive and paid pools require:
  - Structurally valid options and answer index
  - `audit_verified = true`
  - Approved quality threshold
  - Supported rules/source version
  - Explicit mode eligibility
- Exclude the 1,256 failed-audit and 8,285 unaudited questions immediately from paid,
  PvP, and tournament selection.
- Process unset questions in deterministic review batches and store reviewer/model,
  version, evidence, and timestamp.
- Canonicalize the 3,930 duplicate rows through fingerprint/alias mapping while
  retaining historical foreign keys.
- Add source provenance, factual review age, rule compatibility, report state, and
  quarantine reason.
- Decide embedding backfill only after measuring semantic duplicate/retrieval value.

#### Deterministic engine

- Create immutable question revisions and private answer-key roster snapshots.
- Select deterministic, balanced rosters by category, difficulty, player history,
  recent exposure, and mode.
- Preflight sufficient unique tournament questions for every possible round; do not
  wrap a 20-question list across an eight-round bracket.
- Keep option permutation deterministic per player/session while never exposing the
  answer key.
- Sign/version competitive roster, timer, and submission contracts.
- Reject duplicates, foreign questions, legacy self-graded shapes, late answers, and
  forged client timing.

#### Sessions, stats, reports, and achievements foundation

- Enforce one active competitive session per seat while allowing a legitimate
  reconnect to resume it.
- Make session start, entry charge, answer events, submission, stats/mastery,
  settlement, and reward projections retry safe.
- Expire/reconcile the 11 stale recent sessions.
- Backfill the three submitted-without-stats sessions only after verifying their
  authoritative result and transaction references.
- Add an accessible report-question action and restricted operations queue.
- Define achievement criteria/events now, but do not display diamond earnings until
  Phase 10 wires exact-once awards through the Phase 2 ledger.

#### Tests and telemetry

- Golden-seed tests for roster, permutation, grading, score, and replay.
- Adversarial tests for key exposure, duplicate answers, cross-round IDs, stale
  sessions, forged time, tab conflicts, and report spam.
- Inventory tests by category/difficulty/rules/mode.
- Metrics for pool size, rejection reason, repeat rate, invalid-question skip,
  question reports, session expiry, and submitted-without-stats.

### Rollout and rollback

- Quarantine changes affect eligibility, not historical records.
- Run the new selector in shadow mode and compare coverage before switching paid
  sessions.
- Retain old selection only for free/noncompetitive fallback behind a separate flag;
  paid paths fail closed when the verified pool is insufficient.

### Exit gate

- Paid/competitive queries return zero failed, unset, low-quality, incompatible, or
  duplicate-canonical questions.
- One thousand golden-seed replays are identical.
- No public DTO or browser request exposes an answer key or grading oracle.
- Session start/resume/submit survives refresh, two tabs, retry, and process failure
  without double charge, lost score, or missing stats.
- The eligible inventory supports the maximum nightly bracket with no question reuse.
- Question and session domain alerts are active.

---

## Phase 4 — #SmarterCasinoRealism Design System, Shell, and Unique Art Pipeline

### Objective

Replace fragmented page styling with a reusable, accessible, mobile-first system that
also supports purpose-built desktop compositions.

### Dependencies

Phase 1 product contract. This phase can run in parallel with Phases 2 and 3.

### Deliverables

#### Visual system

- Establish tokens for casino void, carbon, gunmetal, cold steel, chrome, electric
  table blue, prize gold, win green, and loss red.
- Use Rajdhani/Orbitron selectively for compact display data and Inter for body,
  controls, explanations, forms, and tables.
- Define machined frames, chrome rails, carbon/felt wells, status lamps, restrained
  motion, focus, hover, pressed, disabled, selected, and high-contrast states.
- Move world styles into scoped CSS Modules or `sp-trivia-*` selectors; remove active
  generic selectors and large unscoped route blocks.

#### Shared shell and primitives

- Build `TriviaCasinoShell` using `--sp-header-height`,
  `--active-world-footer-height`, and device safe areas.
- Build a typed route/mode registry containing route, title, copy, rules version,
  art key, entry/reward contract, SEO, analytics ID, and component family.
- Build shared:
  - `TriviaModeIntro`
  - `TriviaQuestionStage`
  - `TriviaAnswerButton`
  - `TriviaProgress`
  - `TriviaResultLedger`
  - `CasinoDialog`
  - `TriviaDataBoard`
  - `StateBanner`
  - `ResponsiveModeArt`
  - `DiamondValue`
  - `TransactionReceiptLink`
  - `HouseHorseBadge`
  - Overlay/focus manager
- Add shared signed-out, loading, partial, empty, offline, reconnecting, saving,
  settling, refund, and support-required states.

#### Responsive composition

- Mobile, 320–767px: natural one-column flow; artwork above description/content;
  action last; 44px controls; no competing fixed navigation.
- Tablet, 768–1023px: two-column catalogs and collapsible context.
- Desktop, 1024px and wider: cinematic 12-column layouts with question stage centered
  and only real data in side rails.
- Preserve the Daily Trivia header and Quick Stakes footer visual identity while
  replacing baked text/hitboxes with semantic controls.

#### Unique art program

- Create one distinct environment family for Lobby, Daily, Arcade, History, Rules,
  Pro, MTT, Cash, ICM, GTO, Endless, Mixed, Survival, Time Attack, PvP, and
  Tournaments.
- Each family receives a lobby thumbnail, mobile intro, desktop intro, quiet gameplay
  background, and result accent when useful.
- Supply 640/960/1440 responsive AVIF/WebP sources with dimensions, crops, contrast
  treatment, alt behavior, priority/lazy-load rules, and content-hashed filenames.
- Migrate service-worker caches so installed clients cannot retain rejected art.

#### Tests and telemetry

- Fixture coverage for every primitive and operational state.
- Automated keyboard, focus, dialog, contrast, forced-colors, reduced-motion, 200%
  zoom, 400% reflow, safe-area, overflow, and footer/header collision checks.
- Visual fixtures at 320, 375, 390, 430, 768, 1024, 1280, 1440, and landscape.
- Image error, slow-load, fast-scroll, delayed-font, long-copy, and large-number tests.

### Rollout and rollback

- Ship primitives and fixture routes without switching production pages.
- Keep per-route casino UI flags so each route family can graduate independently.
- Version assets and preserve the prior manifest until service-worker migration and
  rollback have been proven.

### Exit gate

- Design review approves shell, intro, question, result, data, dialog, and state
  fixtures on mobile and desktop.
- Mobile always stacks image above description/action; desktop uses a distinct
  composition.
- No fixture has overlap, horizontal overflow, nested viewport traps, inaccessible
  controls, or image-only essential content.
- Axe, keyboard, screen-reader, contrast, reduced-motion, and zoom gates pass.
- Fast scrolling never leaves an essential blank image panel.

---

## Phase 5 — Server-Owned PvP Matchmaking, Horse Fallback, and Settlement

### Objective

Deliver a complete human-human and human-horse PvP engine whose timing, participants,
questions, stakes, and settlement are controlled atomically by the server.

### Dependencies

Phases 2 and 3.

### Deliverables

#### Queue and matching model

- Persist queue ticket, user, validated stake/rules, client nonce, joined time,
  heartbeat, lease expiry, state, match ID, and one stable `horse_eligible_at`.
- Enforce one waiting ticket and one active competitive match per player.
- Build authenticated join/status/heartbeat/cancel/resume endpoints returning only a
  sanitized user-scoped DTO.
- On join, set `horse_eligible_at = server_now + random_integer(20,45) seconds` once.
- Under stake/rules-scoped locking, expire dead presence and claim the oldest
  compatible live human first.
- At the boundary, retry the human claim before considering a horse. Only if no human
  is claimable and the stored deadline has passed may the server create one horse
  match.
- Make cancel versus match, two-join, two-tab, retry, and failover races idempotent.

#### Horse behavior

- Select from the complete eligible fleet, not the first 50 records.
- Respect horse active state, concurrency ceiling, appearance cooldown, persona
  category strengths, and skill tier.
- Persist a server-secret-seeded answer plan and plan hash; do not call an LLM during
  a paid match.
- Generate bounded, auditable answer and response-time distributions independent of
  the player's stake.
- Record horse answer events with `actor_type = horse` while keeping human learning
  analytics uncontaminated.

#### Escrow and settlement

- Fund a horse profile from the explicit house treasury, then atomically bind two
  identical match-player seats, immutable roster/rules, and the same per-player
  stake contract before marking a match active.
- Use dedicated session foreign keys and validate seat/session/owner/roster binding.
- Settle human-human and human-horse win, loss, tie, forfeit, abandonment, void, and
  refund through one Phase 2 transaction.
- Record scores, stats, rake, treasury movement, receipts, events, and terminal state
  in the same commit.
- Add one recovery job for expired leases and interrupted `settling` records.

#### Tests and telemetry

- Fake-clock property tests for every value from 20 through 45 seconds.
- Boundary race proving a human committed before the claim always wins priority.
- At least 100 concurrent join/cancel/two-tab clients by compatible stake/rules.
- Refresh/resume at searching, dealing, playing, waiting, settling, and result.
- Settlement fault injection and exact conservation for every outcome.
- Metrics for join-to-match p50/p95, fallback distribution, human match rate, ghost
  prevention, cancel races, completion, abandonment, settlement latency, and ledger
  variance.

### Rollout and rollback

- Run headless zero-diamond fixtures, then limited canary-wallet matches.
- Keep public PvP disabled while shadow traffic validates the new state machine.
- Enable the server engine before the Phase 7 UI.
- A rollback disables new joins while allowing valid active matches to finish or
  invokes the tested atomic refund path; never strand escrow.

### Exit gate

- Fallback never occurs before 20 seconds or after 45 seconds while the client is
  live, and refresh/retry never changes the stored deadline.
- A compatible live human committed before fallback always receives priority.
- No concurrency test creates duplicate ticket, match, charge, session, or settlement.
- Human-human and human-horse happy, tie, timeout, cancel, disconnect, and recovery
  paths settle with zero variance.
- A forced mid-settlement failure commits nothing.
- No browser direct-write path remains.

---

## Phase 6 — 8 PM Nightly Tournament, 70–140 Horses, Live Bracket, and Settlement

### Objective

Create one coherent, same-evening tournament every day at 8:00 PM Central time,
populate it with an exact persisted 70–140-horse field plus humans, and settle every
entry through an auditable live bracket.

### Dependencies

Phases 2 and 3.

### Deliverables

#### Schedule and lifecycle ownership

- Add `scheduled_local_date`, `schedule_timezone`, UTC start/end,
  `registration_closes_at`, `rules_version`, `horse_target`, `engine_version`, and a
  unique nightly schedule key.
- Reconcile at least the next seven upcoming instances continuously.
- Derive 8:00 PM with the IANA `America/Chicago` zone:
  - CDT becomes 01:00 UTC the following day.
  - CST becomes 02:00 UTC the following day.
- Always write a valid non-null end time.
- Use one canonical OpenClaw job/telemetry identity with a database lease and fencing
  token; workers invoke authoritative RPCs rather than reimplementing rules.
- Retire duplicate Vercel/legacy scheduler ownership during Phase 12 cutover.

#### Horse population

- At instance creation, choose and persist one inclusive 70–140 `horse_target`.
- Reserve enough capacity that human entries cannot make that target impossible.
- Launch with a 256-player bracket and support controlled 512 expansion if needed.
- Add an idempotent horse schedule unique by tournament and horse.
- Stagger server-owned joins roughly from 7:15 to 7:58 PM CT using full-fleet
  rotation and a deliberate skill distribution.
- Run a final 7:58 PM reconciliation. If fewer than 70 can be safely entered, hold or
  cancel and alert rather than fabricate records.
- Fund each horse entry from the house treasury through the same entry contract.
- Persist a population run containing target, selected, inserted, skipped, failed,
  funding total, run ID, and idempotency key.

#### Normalized live bracket

- Replace round-wide matchup JSONB writes with indexed matchup, submission, roster,
  horse-action, and result rows.
- Transactionally close registration, snapshot every paid entrant, commit/reveal the
  seed, create the bracket, and open round one.
- Use the approved live format: default 10 questions, 20-second shot clock, five-minute
  round windows, and 60–90-second transitions. Keep 20-question/two-hour events as a
  separate future rules version.
- Assign identical private question revisions to both seats with per-user option
  permutations.
- Schedule horse submissions durably inside each round and advance as soon as both
  seats finish or the deadline resolves.
- Handle bye, no-show, disconnect, resume, exact tie, delayed worker, and crash retry.
- Remove all 50/100-row assumptions through explicit pagination or uncapped
  server-side processing.

#### Settlement, results, and rankings

- Use one atomic settlement path for ranks, gross entries, rake, prize pool, treasury
  funding, refunds, payouts, and terminal escrow.
- Route horse winnings according to the approved treasury policy and keep them
  distinct from human winnings in reporting.
- Publish answer-free field, bracket, My Run, match, result, and receipt DTOs.
- Standardize winner fields as display name, participant kind, rank, score, and
  payout; stop mixing `username/prize` with `user_id/payout` contracts.
- Add authoritative tournament history and standings events for Phase 10.

#### Tests and telemetry

- Fake-clock schedule tests surrounding both DST transitions and leap/calendar edges.
- Duplicate-fire tests across active/passive scheduler processes.
- Exact 70-, 100-, and 140-horse population property tests.
- Tests with humans arriving before, during, and after horse population.
- 140-horse-plus-human and 256-player bracket/load/reconnect/failure runs.
- Conservation tests for entry, cancellation, short field, every payout tier, horse
  win, human win, rounding, and recovery.
- Metrics for next-instance coverage, population target/actual, human/horse mix,
  round duration, no-shows, stuck matches, completion, payout, and variance.

### Rollout and rollback

- Create `test`/canary instances outside the public nightly schedule first.
- Run zero-diamond 70/100/140 canaries, then capped treasury-funded canaries.
- Keep nightly v2 off until one logical scheduler is ready to replace all old owners
  in the same maintenance window.
- Rollback closes registration/new transitions, lets an already valid atomic
  settlement finish, or refunds each stored entry snapshot exactly once.

### Exit gate

- Exactly one instance is produced for every tested Central calendar date at 8 PM,
  including March and November DST boundaries.
- Replayed creation/population/tick jobs create no duplicate instance, entry, charge,
  matchup, submission, or payout.
- Actual unique horse count equals the persisted target for 70, 100, and 140 cases.
- A 140-horse-plus-human tournament includes every charged entrant and finishes
  inside the approved event duration.
- A 256-player failure/reconnect run ends with complete standings and zero variance.
- Staging has one logical scheduler owner and a proven failover fence.

---

## Phase 7 — Competitive UI: Lobby, PvP, and Tournaments

### Objective

Deliver the highest-value competitive experiences on the shared casino system and
authoritative Phase 5/6 DTOs.

### Dependencies

Phases 4, 5, and 6.

### Route coverage

- `/hub/trivia`
- `/hub/trivia/pvp`
- `/hub/trivia/tournaments`

### Deliverables

#### Main lobby

- Preserve Daily Trivia header and Quick Stakes footer identity.
- Add Tonight at 8:00 PM CT countdown, registration status, and human/horse field
  summary above the mode catalog.
- Add sanitized PvP availability without showing raw queue identities.
- Keep all mobile cards vertically stacked and use a three-column desktop catalog.
- Handle signed-out, auth loading, profile/VIP/balance partial failure, stale balance,
  reconnect, filter-empty, and resume states truthfully.

#### PvP

- Show exact stake, rake, possible return, balance, cancel behavior, human-first rule,
  and 20–45-second fallback before commitment.
- Cover sign-in, stake selection, insufficient funds, queue join, searching, stable
  countdown, cancel pending, human found, horse found, dealing, battle, answer retry,
  waiting, reconnect, forfeit, settling, refund, win/loss/tie/void, and receipt.
- Label Smarter Horses in search, play, result, history, and transaction detail.
- Resume a valid existing match rather than creating or charging another one.
- Replace baked result/finding panels and invisible hitboxes with decorative art plus
  semantic controls.

#### Tournaments

- Show official CT and viewer-local time, registration close, rules version, entry,
  rake, prize pool, human count, horse target/actual, and reminder opt-in.
- Mobile opens on My Run, current opponent/deadline/action, then round tabs and field.
- Desktop uses a virtualized/pannable bracket with minimap, search, and current-path
  emphasis.
- Use searchable/virtualized roster data rather than one giant profile-ID query.
- Explain byes, seeding, no-shows, tie resolution, advancement, and payout.
- Cover no event, registration phases, already entered, full, countdown, bracket
  loading/error, playing, submit retry, waiting, advance, elimination, champion,
  cancel/refund, settlement, payout, receipt, and history.

#### Tests and telemetry

- Two-browser human-human and lone-human horse-fallback E2E.
- Real mobile and desktop 140-horse tournament E2E.
- Refresh/resume, offline/reconnect, two-tab, pending-settlement, and support-reference
  tests.
- Full visual/accessibility matrix for the three routes.
- Journey analytics from impression through verified settlement receipt.

### Rollout and rollback

- Use independent Lobby, PvP, and Tournament visual flags.
- Enable server engines first; graduate UI routes separately.
- UI rollback restores the old presentation only while keeping authoritative v2
  engine/session/ledger state and receipts intact.

### Exit gate

- Each route completes signed-out-to-settled journeys on mobile and desktop.
- Mobile is stacked and action-first; desktop is a purpose-built composition.
- Every horse is clearly identified in every competitive state.
- Every charge/refund/payout links to an immutable receipt.
- No route reads raw queue/answer keys or writes competitive/economy state directly.
- Visual, accessibility, error, resume, and reconciliation tests pass.

---

## Phase 8 — Core Solo and Strategy UI

### Objective

Move Daily and the strategy family to the shared shell/question/result architecture
without changing authoritative rules or duplicating game infrastructure.

### Dependencies

Phases 2, 3, and 4.

### Route coverage

- `/hub/trivia/daily`
- `/hub/trivia/mtt`
- `/hub/trivia/cash`
- `/hub/trivia/icm`
- `/hub/trivia/gto`

### Deliverables

- Daily uses its recognizable broadcast identity with live HTML attempt, streak,
  reward, reset, completion, leaderboard, prize, and receipt states.
- MTT displays blinds, positions, stacks, payout stage, and action context.
- Cash displays stakes, effective stack, positions, action, and high-limit table
  context.
- ICM distinguishes chip EV and money EV with accessible payout/stack context.
- GTO uses a real-table analysis booth and provides text equivalents for frequencies,
  ranges, EV, and color-coded analysis.
- All routes use shared intro, question, answers, timer, progress, report, result
  ledger, dialogs, and state banners.
- Replace portrait-only entrances, image hitboxes, duplicated shells, and autonomous
  in-game cost popups.
- Support invalid-question skip, session-start retry, answer failure, reconnect/resume,
  cap adjustment, settlement replay, report, and long-content states.

### Tests and telemetry

- Signed-out through settlement/receipt E2E for every route.
- Rules/version/cost/reward copy parity tests.
- Question context and long-answer responsive fixtures.
- Keyboard shortcut scoping, timer, background/foreground, and reduced-motion tests.
- Route completion, abandon, report, retry, cap, and settlement metrics.

### Rollout and rollback

- Graduate Daily independently, followed by the shared strategy family.
- Preserve authoritative sessions across visual rollback.
- Do not remove legacy strategy components until import/runtime parity is proven.

### Exit gate

- All five routes pass signed-out, start, play, reveal, result, settlement, receipt,
  failure, and resume journeys.
- No duplicated strategy game shell, answer, modal, or result implementation remains.
- No essential title, rule, price, or control is image-only.
- Rules and ledger copy exactly match server contracts.

---

## Phase 9 — Challenge and Knowledge UI

### Objective

Complete the remaining playable game families with unique art, shared behavior, and
complete operational states.

### Dependencies

Phases 2, 3, 4, and 8.

### Route coverage

- `/hub/trivia/arcade`
- `/hub/trivia/history`
- `/hub/trivia/rules`
- `/hub/trivia/pro`
- `/hub/trivia/endless`
- `/hub/trivia/mixed`
- `/hub/trivia/survival-game`
- `/hub/trivia/survival` compatibility redirect
- `/hub/trivia/time-attack`

### Deliverables

- Arcade uses mechanical casino score-reel styling with exact entry, cap, prize-wheel,
  inventory, retry, and receipt states.
- History uses a poker archive with readable dates/context, review, source, and report.
- Rules uses dealer-school/floor-ruling context with source/version distinctions.
- Pro uses championship-table editorial context without unlicensed endorsement.
- Endless receives a real Start button, explicit pause/background/resume, lives,
  lifelines, save recovery, review, share, and receipt.
- Mixed receives a real Start button, accessible Dealer's Choice rotation, category
  state, and category breakdown.
- Survival uses one canonical progressive implementation, mobile two-column/vertical
  bays, desktop command board, saved progress, lives/checkpoints, and shared ledger.
- `/survival` redirects before auth, question loading, or charging and cannot render a
  fallback implementation.
- Time Attack uses a physical shot-clock composition, one-column mobile answers, one
  completion state, personal best/cap, failure recovery, and receipt.
- Remove shake/particles and decorative loops when reduced motion is active.

### Tests and telemetry

- Full state fixtures and primary E2E for all nine URLs.
- Redirect-before-charge assertion for `/survival`.
- Lifeline/inventory, prize wheel, pause, background, save, replay, cap, and share
  tests.
- Mobile/desktop visual, keyboard, screen-reader, long-copy, and slow-network tests.

### Rollout and rollback

- Graduate Knowledge, continuous/challenge, then Survival/Time Attack groups under
  separate flags.
- Keep one compatibility redirect throughout rollback.
- Remove duplicate game components only after production analytics show no traffic.

### Exit gate

- Every listed URL and operational state passes its route matrix.
- Endless and Mixed have semantic Start controls.
- Only one Survival game can initialize or charge.
- Every route has distinct responsive art and the shared accessibility/receipt
  contract.
- No legacy alternate is reachable through navigation or direct URL.

---

## Phase 10 — Progress, Leaderboards, Achievements, and Settings UI

### Objective

Make all progression/account surfaces truthful reflections of authoritative events,
with complete guest, partial, error, and cross-device behavior.

### Dependencies

Phases 2, 3, 4, and the authoritative events produced by Phases 5, 6, 8, and 9.

### Route coverage

- `/hub/trivia/stats`
- `/hub/trivia/leaderboard`
- `/hub/trivia/achievements`
- `/hub/trivia/settings`

### Deliverables

- Stats uses a casino analytics desk, explicit sign-in/new-player states, accurate
  denominators, semantic chart summaries, mode/time filters, stale-data warnings,
  and mobile label/value cards.
- Leaderboard gets a working Retry, persistent Your Rank, pagination, tie behavior,
  semantic desktop table, mobile cards, and separate comparable boards.
- Competitive boards default to Humans and offer a clearly labeled All Entrants
  view; tournament standings come from the stable tournament result DTO.
- Achievements receive real definitions, criteria, user awards, pending/credited/error
  states, exact-once Phase 2 credit, and transaction receipts before any diamond is
  presented as earned.
- Settings uses native/labeled controls grouped into Gameplay, Feedback,
  Accessibility, Notifications, Privacy, and Sync.
- Support reduced motion, high contrast, larger text, sound, haptics, timer visibility,
  local/cloud state, autosave, conflict, failure/rollback, and Restore defaults.

### Tests and telemetry

- Guest, empty, partial, stale, error, retry, loaded, pagination, and realtime tests.
- Ranking tests that prevent incompatible raw scores from being combined.
- Human/horse filtering and tied-rank tests.
- Exact-once achievement unlock/credit/concurrent-claim tests.
- Local/cloud settings conflict, cross-tab, cross-device, offline, and rollback tests.

### Rollout and rollback

- Enable read-only Stats/Leaderboard first, then Achievements after credit canaries,
  then Settings sync.
- Never roll back authoritative event/award history with a visual rollback.
- If achievement credit fails, preserve pending state and receipt reference rather
  than displaying success or retrying with a new key.

### Exit gate

- Guest, new-player, returning, partial, error, and retry states are truthful.
- Rankings compare compatible rules and visibly distinguish Humans/All Entrants.
- Every displayed achievement diamond has exactly one settled journal reference.
- Settings persist according to their labeled local/cloud contract and remain
  accessible at all target widths.
- No zero-value guest data is mislabeled as personal history.

---

## Phase 11 — Operations, Observability, Performance, Accessibility, and Full-System Hardening

### Objective

Prove the entire rebuilt system under production-like load, failure, device, and
operator conditions, and ensure every failure is detectable and recoverable.

### Dependencies

Phases 5 through 10.

### Deliverables

#### Trivia operations control room

- Restricted views for next-seven nightly events, local/UTC schedule, registration,
  horse target/actual, queue health, fallback distribution, active matches, rounds,
  no-shows, escrows, payouts, and reconciliation.
- Question approval/quarantine, duplicates, reports, source/version history, and
  category inventory.
- Feature flags, kill switches, safe idempotent replay, payout hold/release, support
  lookup, and incident notes.
- Named roles, required reason text, least privilege, and immutable operator events.

#### SLOs, dashboards, and alerts

- Tomorrow's tournament exists by midnight CT.
- Horse target is exact by 7:58 PM CT.
- Tournament starts within 60 seconds of 8 PM CT and pays within 60 seconds of the
  final result.
- PvP live-client fallback p95 is at or before 45 seconds; settlement p95 is below
  10 seconds.
- Every terminal escrow is zero and reconciliation is 100 percent.
- Competitive question serving is at least 99.9 percent available during the nightly
  window.
- Alert on missing event, early/late/short horse population, duplicate owner,
  queue ghosts, abandonment spike, stuck round, payout retry exhaustion, ledger
  variance, key exposure, and low eligible-question inventory.
- Cron health must evaluate domain outcomes, not merely an HTTP 200.

#### Verification suites

- SQL integration against a clean migrated database with real role/RLS behavior.
- Playwright two-browser, mobile/desktop, reconnect, installed-PWA upgrade, and
  service-worker rollback tests.
- Concurrency/property/fake-clock/failure-injection tests from earlier phases in CI.
- Sustained 256-player tournament load and 100-client PvP bursts.
- Visual regression and accessibility matrix at 320, 375, 390, 430, 768, 1024,
  1280, 1440, 1920, and landscape.
- Slow 4G, low-memory, background/foreground, no-hover, software-keyboard,
  notched-safe-area, delayed-font, corrupt-art, and long-content tests.
- Real-device moderated comprehension tests for entry, rake, possible return, horse
  identity, fallback, cancel, tournament format, and receipt.
- 30- and 90-day treasury/economy simulations before final production limits.

#### Performance and privacy

- Mobile p75 LCP below 2.5 seconds, INP below 200 milliseconds, and CLS below 0.10.
- Route JavaScript, CSS, image, memory, and query-count budgets enforced in CI.
- Only current hero art is high priority; below-fold assets reserve dimensions.
- Define retention for queue presence, answer events, device/integrity signals, and
  operator audit logs; public boards never expose private operational data.

### Rollout and rollback

- Run chaos and rollback drills in staging using the exact production release shape.
- Page test alerts to a non-production channel first and prove acknowledgement/runbook
  links before production paging.
- Any budget/SLO regression blocks Phase 12; it is not waived by screenshot approval.

### Exit gate

- Alert drills catch missing tournament, short horse field, stuck match/round, payout
  failure, scheduler duplication, and ledger variance.
- 256-player and 100-client load tests meet error/latency budgets.
- Full route, state, visual, accessibility, resume, PWA, and Web Vitals matrices pass.
- Kill-switch, active/passive scheduler fencing, interrupted settlement, exact refund,
  and rollback drills pass.
- No open Sev-1/Sev-2 defect and no unexplained reconciliation variance remains.

---

## Phase 12 — Historical Reconciliation, Staged Production Cutover, Rollback Proof, and Legacy Removal

### Objective

Move production to the new engines and UI safely, prove real business outcomes, repair
or quarantine historical anomalies, and leave one maintainable implementation.

### Dependencies

Phases 1 through 11.

### Cutover sequence

1. Re-run and archive the Phase 1 production baseline.
2. Deploy additive schema, compatibility views, and generated types with all feature
   flags off.
3. Backfill in bounded batches, validate constraints, and compare reconciliation
   reports before switching writes.
4. Run internal zero-diamond PvP and 70/100/140-horse tournament canaries.
5. Run capped treasury-funded canaries with named test wallets and immutable receipts.
6. Disable legacy Vercel/OpenClaw/worker scheduler paths in the same controlled window
   that enables the one canonical OpenClaw owner.
7. Enable server engines before public UI flags.
8. Graduate Lobby, PvP, and Tournaments independently; then Daily/Strategy,
   Challenge/Knowledge, and Progress/Account route families.
9. Preserve legacy fields read-only through the observation period.
10. Investigate the 184-diamond tournament from original balance/ledger evidence.
    Quarantine it as test data unless a legitimate liability is proved; any repair
    requires an approved, idempotent reference.
11. Backfill participant kind and stable result DTOs for old settled tournaments, and
    exclude test-era records from public seasons without erasing audit history.
12. Remove old RPCs, direct-write services, cron mappings, unsafe horse test scripts,
    stale verifier, duplicate UI components, obsolete selectors/assets, and
    contradictory copy only after traffic and rollback gates pass.

### Rollback contract

- Flags provide route-family and engine rollback independently.
- Disable new joins/registrations before disabling an engine.
- Active valid sessions finish on their recorded rules version; otherwise the tested
  atomic refund path returns the exact original stored amount.
- Scheduler rollback uses the fenced previous owner only after the replacement lease
  is released; two owners are never made active as a recovery shortcut.
- Database rollback is forward-fix/additive. Immutable journals and competitive events
  are never deleted or rewritten.
- Service-worker/asset rollback uses the versioned prior manifest and cannot produce a
  mixed old-shell/new-engine contract.

### Production verification gate

- The next seven nightly instances exist with correct Central local dates and UTC
  offsets.
- Production canaries complete one human-human and one human-horse PvP match with
  exact receipts and zero variance.
- Seven consecutive nightly events:
  - Reach the persisted 70–140 horse target exactly.
  - Start within 60 seconds of 8:00 PM America/Chicago.
  - Include every charged entrant in the bracket.
  - Complete within the approved live-event budget.
  - Pay/refund within the settlement SLO.
  - End with zero escrow and zero reconciliation variance.
- Duplicate scheduler invocations cannot produce duplicate business actions.
- Abandonment, refund, question rejection, JavaScript error, accessibility, and Web
  Vital rates remain within approved thresholds.
- Rollback has been exercised against the production release shape.
- Production analytics show no traffic to removed implementations before deletion.

---

## Complete route and state coverage

The program covers all twenty-one reachable Trivia URLs/aliases:

| Family | Routes |
|---|---|
| Lobby | `/hub/trivia` |
| Dynamic knowledge | `/daily`, `/arcade`, `/history`, `/rules`, `/pro` |
| Strategy | `/mtt`, `/cash`, `/icm`, `/gto` |
| Challenge | `/endless`, `/mixed`, `/survival-game`, `/survival`, `/time-attack` |
| Competitive | `/pvp`, `/tournaments` |
| Progress/account | `/stats`, `/leaderboard`, `/achievements`, `/settings` |

Every applicable route must cover signed-out, auth loading, new user, returning user,
loading, empty, partial, stale, offline, reconnecting, insufficient funds, entry,
playing, answer pending/failure, reveal, saving, settlement pending/failure/replay,
refund, receipt, error/retry, resume, and terminal result states.

## Program acceptance matrix

### PvP

- Stable fallback is always 20–45 seconds inclusive.
- A horse is never claimed early, and a compatible committed human has priority.
- One ticket/user, one active match/user, one session/seat, one settlement/match.
- Dead presence cannot be matched.
- Refresh and two-tab races do not create another charge.
- Human-human and human-horse outcomes conserve every ledger leg.

### Tournament

- Exactly one 8 PM CT instance per Central calendar day across DST.
- Horse target is persisted once and actual unique horses equal it.
- A 140-horse field plus humans loses no entrant to pagination or a row cap.
- Creation, population, advancement, and settlement are replay safe.
- Roster, bracket, My Run, results, and leaderboard use answer-free stable DTOs.
- Gross entry, treasury subsidy, rake, refund, prize pool, and payout reconcile.

### Questions and sessions

- Paid pools contain only verified eligible question revisions.
- Tournament questions are unique across rounds for the event.
- Answer keys and grading oracles remain server-only.
- Reconnect/retry does not duplicate charge, answer, score, stats, or reward.
- Invalid content fails safely without penalizing the player.

### UI and accessibility

- Mobile cards always place image above description and action.
- Desktop uses a deliberate independent composition.
- Every mode has unique responsive art.
- Controls are semantic, keyboard reachable, visibly focused, and at least 44px.
- Dialogs trap/restore focus and support Escape.
- Outcome is never communicated by color alone.
- No essential UI is hidden behind header, footer, safe area, image, or nested scroll.
- Reduced motion removes nonessential animation and shake.

### Economy

- Every movement has an immutable reference and balanced journal.
- Duplicate retries move zero additional diamonds.
- Horses are explicitly treasury funded.
- Refunds use original stored entry/stake values.
- Every terminal escrow is zero.
- UI amounts and receipts match authoritative settlement exactly.

## Explicit Definition of Done

The Trivia Casino Realism program is done only when all of the following are true:

1. All twelve phase exit gates have passed with stored evidence.
2. Every Trivia page, subpage, compatibility route, gameplay state, dialog, result,
   and failure state uses the shared `#SmarterCasinoRealism` system.
3. Mobile always stacks artwork over description/content/action, while desktop uses a
   purpose-built cinematic composition.
4. Every mode has unique responsive art, and no essential copy/control exists only
   inside an image.
5. Daily Trivia header and Quick Stakes footer retain their recognizable identity in
   responsive, semantic components.
6. A real human can join, complete, and settle a human-human PvP match.
7. A lone human receives exactly one disclosed Smarter Horse after the same persisted
   server-owned 20–45-second wait through refresh/retry.
8. Exactly one tournament starts at 8:00 PM `America/Chicago` each night and enrolls
   its persisted 70–140 disclosed horses plus humans.
9. Humans and horses complete the live bracket and every entrant, match, rank, payout,
   refund, and receipt is present once.
10. Every diamond movement—including treasury and rake legs—has an immutable balanced
    transaction record, and every terminal escrow reconciles to zero.
11. Paid and competitive modes serve only verified eligible questions through
    server-owned rosters and grading.
12. Stats, leaderboards, achievements, notifications, help copy, and receipts derive
    from the same authoritative rules and events.
13. All route/state, SQL/RLS, concurrency, fake-clock/DST, failure-injection, PWA,
    visual-regression, accessibility, real-device, performance, and ledger suites pass.
14. Production proves seven consecutive correct nightly events, working PvP canaries,
    scheduler single ownership, zero unexplained variance, and tested rollback.
15. Legacy direct-write services, duplicate scheduler logic, alternate game shells,
    obsolete image hitboxes, conflicting styles, unsafe test tools, and stale copy are
    no longer reachable and are removed after the observation window.

Until all fifteen conditions are met, the program remains in progress.
