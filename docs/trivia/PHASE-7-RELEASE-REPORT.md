# Trivia Casino Realism Phase 7 Release Report

Phase 7 implements the competitive Trivia presentation for the main lobby, head-to-head PvP,
and the 8:00 PM Central nightly tournament. It consumes the server-owned Phase 5 and Phase 6
contracts, preserves immutable Diamond receipts, and applies the published
`#ClubArenaConsole` / `#SmarterCasinoRealism` system at mobile and desktop widths.

This report is intentionally a pre-release record. The database additions described below are
installed, but the application candidate has not yet completed protected delivery. Every release
field marked **PENDING** must be replaced with observed evidence before Phase 7 is called complete.

## Release state

| Boundary | Current state |
|---|---|
| Application source | Implemented in the owned Phase 7 working candidate; final exact-candidate validation is **PENDING** |
| Database | Three additive Phase 7 migrations installed with exact source and ledger identity |
| Competitive activation | Off by design; PvP, PvP horses, tournaments, tournament horses, and the nightly schedule remain disabled |
| Candidate revision | **PENDING - working tree is not yet committed** |
| Remote branch | **PENDING - not yet pushed** |
| Pull request | **PENDING - not yet opened or attached** |
| Required checks | **PENDING** |
| Protected merge | **PENDING** |
| Canonical Vercel deployment | **PENDING** |
| Production `/api/health` identity | **PENDING** |
| Live route/API verification | **PENDING** |

Database installation does not activate competitive play. The server release controls remain the
final gate even though the installed PvP configuration can report that its own join and horse
capabilities are available.

## Scope

Phase 7 covers these application routes:

- `/hub/trivia`
- `/hub/trivia/pvp`
- `/hub/trivia/tournaments`

It does not activate PvP, register the nightly schedule, fund production horse entries, run a
production money canary, or schedule Phase 5 recovery. Those operations remain later rollout
work. It also does not change question generation, the approved Phase 5/6 economics, or any
unrelated Trivia mode.

## Delivered application behavior

### Competitive lobby

- Preserves the recognizable Daily Trivia header and Quick Stakes footer while inserting a
  rendered competitive briefing between Daily and the game catalog.
- Reads the official nightly schedule and sanitized PvP resume envelope instead of fabricating
  availability from local time or raw queue data.
- Shows 8:00 PM Central and viewer-local time, registration state, countdown, human count, Smarter
  Horse count/target, and active-match recovery when those authoritative fields exist.
- Gives authoritative fresh state priority over a stale retained snapshot. A start time that has
  passed is never relabeled `Live` without a live server state.
- Covers feature-off, authentication loading, signed-out, loading, empty, ready, resume, partial,
  stale, offline, and error states with a bounded manual retry.
- Uses authenticated transport for signed-in schedule and resume reads while keeping the signed-out
  public schedule read public.
- Clears balance/VIP/account state immediately on identity change and rejects late results from a
  previous account by user and request-generation guards.
- Keeps mobile cards stacked and uses the separate desktop catalog composition.

### Head-to-head PvP

- Replaces the legacy browser-owned matchmaking and settlement presentation with one server-owned
  quote, join, resume, search, play, settlement, refund, receipt, and history experience.
- Shows the exact quoted stake, pot, rake, possible return, net win, balance, rules version,
  cancellation boundary, human-first rule, and stored 20–45 second Smarter Horse window before
  commitment.
- Binds join to the exact rules version the player confirmed. A rules change between quote and
  join fails as `rules_quote_stale` before a ticket, match, or escrow mutation.
- Obeys both the server release controls and the database-derived `joinsEnabled` and effective
  horse capability. No browser flag can turn either capability on.
- Resumes the existing waiting ticket or match and preserves the server's question position,
  stored answer receipt, contract signature, and settlement state rather than opening another
  chargeable run.
- Resolves the current access token for every PvP API and server-graded start, answer, and submit
  request. A same-account token rollover therefore does not strand a live match.
- Remounts the complete PvP experience at an account boundary, hides history while signed out, and
  sequences history reads so a prior account or older page cannot overwrite the current account.
- Orders every status poll and recovery read behind a monotonic DTO authority. A join, cancel,
  answer, submit, or explicit recovery aborts any older poll, and a transport that ignores abort
  still cannot restore stale queue or match state.
- Handles quote loading/error, sign-in, insufficient balance, searching, cancellation, human or
  Smarter Horse match, dealing, playing, answer retry, waiting, reconnect, settling, win, loss,
  tie, void, refund, receipt, empty history, and paginated history states.
- Labels every horse `Smarter Horse` in search, play, results, history, and transaction details.
- Keeps history viewer-scoped and bounded, and displays immutable stake, settlement, and player
  credit references without exposing opponent IDs, queue IDs, session IDs, rosters, answer data,
  or horse plans.

The maintained PvP HTTP surface is:

| Method | Route | Authoritative operation |
|---|---|---|
| `GET` | `/api/trivia/pvp/quote` | Service-only `trivia_pvp_quote_v3` pre-commit quote |
| `POST` | `/api/trivia/pvp/join` | Quote-bound `trivia_pvp_join_v3` |
| `GET` or `POST` | `/api/trivia/pvp/status` | Viewer-scoped `trivia_pvp_status_v2` |
| `POST` | `/api/trivia/pvp/heartbeat` | Viewer-scoped status/lease continuation |
| `GET` or `POST` | `/api/trivia/pvp/resume` | Viewer-scoped active ticket/match recovery |
| `POST` | `/api/trivia/pvp/cancel` | Search-only `trivia_pvp_cancel_v2` cancellation |
| `GET` | `/api/trivia/pvp/history` | Bounded `trivia_pvp_history_v1` receipt history |

Every route checks method, the server-only release control, rate limit, and authenticated identity
before making one service-role RPC. Responses are private/no-store allowlisted DTOs.

### Nightly tournament

- Replaces legacy direct persistence and retired 40-second/24-hour client rules with the Phase 6
  nightly API and its stored rules, clocks, entry state, bracket, run, result, and receipts.
- Shows official Central and viewer-local time, registration close, rules version, entry, rake,
  pool, human/horse field, persisted horse target, and reminder state.
- Opens mobile on My Run, then the current opponent, deadline/action, bracket rounds, roster,
  results, and receipts. The image remains above status, description, rules, and actions.
- Uses a separate desktop command composition with the bracket theatre, search, current-path
  emphasis, and detail surfaces rather than scaling the mobile stack sideways.
- Clears all event-scoped cached state when the selected tournament changes and ignores stale
  responses by request sequence.
- Lets history open an exact historical summary and receipt without pretending that an event must
  still appear in the eight-day schedule window.
- Re-enables a valid same-question answer or timeout retry from authoritative server state and
  refuses to skip a missing, locked, malformed, or out-of-order position.
- Distinguishes failures that can be retried without changing entry terms from errors that require
  a fresh authoritative quote/state.
- Uses no direct Supabase browser write and no legacy tournament authority.

The nightly API remains `/api/trivia/nightly/[action]` with these maintained actions:

- Public or optionally authenticated reads: `schedule`, `summary`, `field`, `bracket`, `match`,
  and `results`.
- Authenticated reads: `my-run`, `receipt`, and `history`.
- Authenticated writes: `enter` and `play`; `play` accepts only `open`, `question`, `answer`,
  `finish`, and `view`.

Field, bracket, match, and results now call viewer-aware v2 database reads. Unknown SQL fields and
forbidden answer, revision, permutation, secret, and horse-plan keys are dropped before a browser
response. The competitive `play` projection also strips grade totals, correct/wrong sequences,
per-question verdicts, correct display indexes, and explanations. Only a scalar answer sequence
and non-grading `recorded`/`late`/`timeout` acknowledgements can reach the browser while a shared
tournament question set is in use.

## Visual, responsive, and accessibility contract

- The three surfaces reuse the published Trivia Console chassis, machined charcoal/chrome frame
  system, black-first field, restrained electric blue, and prize gold only for economy emphasis.
- Existing unique rendered PvP and tournament destination art is retained. The implementation does
  not replace it with generic cards, flat icons, glass panels, or a reused lobby thumbnail.
- Mobile is designed at 375/390 px as image first, status and description second, economics/rules
  third, and semantic actions last. PvP history and tournament details remain stacked.
- Desktop at 1440 px uses purpose-built lobby, duel, and tournament compositions.
- Semantic headings, buttons, status text, lists, and disclosure/details controls replace baked
  labels and invisible hit targets.
- Interactive controls retain visible keyboard focus and a minimum 44 px target where the console
  contract requires it. Reduced-motion and forced-colors modes receive explicit treatment.
- PvP stake choices implement one roving radio tab stop with Arrow, Home, and End navigation while
  skipping unavailable stakes. Tournament view selectors use native button and `aria-pressed`
  semantics because the desktop layout can display My Run beside the selected center view.
- The final three-route browser certificate at 375, 390, and 1440 px is **PENDING** on the exact
  release candidate.

## Journey analytics

All three surfaces use one finite event, `trivia_competitive_journey`, with modes `lobby`, `pvp`,
and `nightly_tournament`. The only journey stages are:

1. `impression`
2. `intent`
3. `commitment`
4. `play`
5. `verified_settlement_receipt`

The event builder accepts only enumerated values. Identifiers, answers, amounts, and arbitrary
server strings are discarded. Each mounted surface emits a mode/stage at most once, and analytics
failures are isolated from navigation, entry, play, and settlement. Commitment and verified
settlement are emitted only from authoritative entry/receipt references, not from button clicks or
optimistic client state.

## Installed database image

All three migrations are additive. They were installed outside the protected `:50–:03 UTC` DDL
window and recorded in the canonical/private migration ledger. Rollback, if ever required, must be
an explicit new migration; none of the installed history is deleted or replayed.

| Version | Name | Source SHA-256 | Installed result |
|---|---|---|---|
| `20261005120500` | `trivia_p7_competitive_read_boundaries` | `f6c97665028e6917e4c014a3176c3933e09c7693c1e0ab101c753d3342022efc` | Viewer-aware tournament field/bracket/match/results v2 reads installed; service execution revoked from their unscoped v1 predecessors; initial service-only rules-derived PvP quote installed |
| `20261005122000` | `trivia_p7_pvp_quote_join_binding` | `ca2b437d4342a6676456ead56e0e0d4b1ba75efe6a7e4f01fc4acda0a1f97426` | Service-only v3 quote/join installed; join binds the confirmed immutable rules version before queue, match, or escrow mutation; obsolete v2 quote/join service grants revoked |
| `20261005124500` | `trivia_p7_pvp_history_receipts` | `7e0ea517bdefb9a423989c4dfc2af069cee1b875f3e753dcd5efb64e7b8ac1f8` | Service-only viewer-scoped settled PvP history installed with bounded pagination and immutable receipt references |

### Readback: competitive read boundaries

- The exact source and canonical/private ledger identity for `20261005120500` match.
- `trivia_tournament_visible_v1` fails closed unless the event is a public nightly or the viewer
  holds canary access.
- Service execution is present on the viewer-aware field, bracket, match, and results v2 functions
  and absent from the unscoped v1 versions.
- The first rules-derived quote was superseded at the service boundary by the stronger v3 quote;
  the installed function remains part of immutable migration history.

### Readback: quote and join binding

- Canonical version/name, source name, source SHA, stored statement SHA, and idempotency key match.
- Installer identity is `antigravity_sql_push:v4`; private integrity state is `applied`; the file
  was applied once with no unknown or duplicate outcome.
- `trivia_pvp_quote_v3(uuid)` is owned by `postgres`, security-definer, `search_path=""`, and
  executable only by `service_role`. Definition SHA-256:
  `8f7e66663144c59d4bb71bf9a1ba0b9d3de58c87b4bf7107896848cbd41e588e`.
- `trivia_pvp_join_v3(uuid,integer,uuid,boolean,text)` has the same owner/security/search-path and
  public-entry ACL. Definition SHA-256:
  `ef4588e088c42642a5837a9c8337f395af4771e8b0eb6807ed30ed85d7e358cc`.
- Internal `trivia_pvp__join_core_v3` is not executable by service, authenticated, or anonymous
  roles. Definition SHA-256:
  `e8a9212a557da01f5731d23d06d68f2c82cf08d690bb072b4220b588f412fb21`.
- Service execution on `trivia_pvp_quote_v2` and `trivia_pvp_join_v2` is absent.
- A positive sanitized quote returned `pvp.standard@1`, four stakes, human-first matching, and a
  20–45 second horse window. Its database capability fields were true; the server release flags
  still keep the public routes off.

The retained installation certificate is
`/Volumes/SmarterArchives/agent-evidence/trivia-program-20260929/evidence/p7-competitive-ui/p7-pvp-quote-binding-install-20261005.json`.

### Readback: PvP history receipts

- Installed at `2026-10-05T12:43:30Z` from the exact captured file.
- Canonical/private ledger version and name match `20261005124500` and
  `trivia_p7_pvp_history_receipts`.
- Source and stored statement SHA-256 are both
  `7e0ea517bdefb9a423989c4dfc2af069cee1b875f3e753dcd5efb64e7b8ac1f8`; installer identity is
  `antigravity_sql_push:v4`; integrity state is `applied`.
- `trivia_pvp_history_v1(uuid,integer,integer)` is owned by `postgres`, security-definer,
  `search_path=""`, executable by `service_role`, and not executable by anonymous or authenticated
  roles. Definition SHA-256:
  `a32e3d3c9c1ad41f2550098384fd989b1c2eafbf150f9faa7ec4812dd74b0bfd`.
- A positive viewer-scoped contract probe returned success, engine `pvp-v2`, bounded limit/offset,
  a total, and an empty item list. No settled Phase 5 sample existed, so no production match or
  Diamond movement was created merely to populate this read test.

## Security and state hardening

- Authenticated identity is derived from the verified session only, never request `userId` data.
- Browser routes make a single service RPC and return nested allowlist projections; forbidden keys
  cause refusal rather than accidental forwarding.
- Competitive session signatures now reach the Phase 3 start contract, and server-owned question
  state/position survives resume.
- PvP token rollover is resolved at request time for join, start, answer, and submit.
- Lobby account transitions clear player state and reject late cross-account completions.
- Lobby competitive schedule/resume reads are independently aborted, generation-guarded, and
  rerun on account changes; a retained A response cannot paint in B.
- PvP and tournament account boundaries remount all private state. Tournament receipts require an
  authenticated viewer, and stale PvP status reads cannot outrank newer actions.
- PvP history binds rows to the authenticated participant in the database and never exposes raw
  opponent identity.
- Tournament private-canary reads fail closed at the database boundary even when invoked through
  the server's service role.
- No browser chooses a horse, grades an answer, writes a queue/bracket, changes a wallet, declares
  a winner, or settles/refunds a competitive event.
- The production build's maintained Next patch layer now handles Google font URLs with query/hash
  suffixes or no filename extension by reading the downloaded font signature. It preserves Next's
  original fetch/cache/preload/CSS-replacement flow and fails closed on unknown bytes instead of
  dereferencing a missing regular-expression match.

## Verification record

The following focused results were observed during implementation. They are retained evidence for
their tested inputs, not a substitute for the final exact-candidate run after all integrations:

| Focus | Latest observed result |
|---|---:|
| Competitive analytics contract and wiring | 6/6 passed |
| Nightly tournament consumer, action, retry, state-isolation, history, art, and containment subset | 21/21 passed |
| PvP engine/history contract subset | 12/12 passed |
| PvP request-time token rollover integrated subset | 57/57 passed |
| Lobby account/auth isolation integrated subset | 18/18 passed |
| Updated console and destination-art focused regressions | 24/24 passed |
| Consolidated Phase 7 and directly affected Trivia regressions | 155/155 passed |
| Final lobby account-switch hardening subset | 19/19 passed |
| Final tournament account/receipt/selector hardening subset | 23/23 passed |
| Final PvP stale-response and radiogroup hardening subset | 41/41 passed |
| Final tournament selector and grade-oracle hardening subset | 23/23 passed |
| Next Google font-loader root-cause regression | 5/5 passed |
| Scoped lane lint | Passed with no new errors; only previously recorded warnings where applicable |

The first broad integration attempt reported 143/146 because three direct-source visual contracts
still named the replaced legacy components. Those assertions were updated to the new composed PvP
surface and mutually exclusive tournament art branches; the affected focused set then passed
24/24. This is not yet the final candidate certificate.

### Required before completion

- Final focused Phase 7 and directly affected Trivia regression suite: passed 155/155 before the
  three final isolation/keyboard fixes; those changed inputs then passed their 19/19, 23/23, and
  41/41 focused suites. The same focused changed-input set will be rerun after final rebase.
- Final scoped ESLint on every changed JavaScript/JSX/module file: passed with zero errors and five
  previously recorded warnings before the three final fixes; their targeted lint passes were clean
  apart from the same warnings. The final rebased candidate remains to be recorded.
- Final whitespace/diff validation: passed before candidate freeze; final rebased check remains to
  be recorded.
- Final 375/390/1440 browser certificate with flags off/on, signed-out, human and Smarter Horse PvP,
  and a 140-horse-plus-human tournament fixture: **PENDING**.
- One production build on the exact rebased candidate: **PENDING**.
- Policy/candidate classification checks on the exact final revision: **PENDING**.
- Protected PR required checks: **PENDING**.
- Canonical `hub-vanguard` READY deployment and live identity/behavior proof: **PENDING**.

No product-wide suite or repeated unchanged test is required merely to fill this report. Changed
inputs invalidate only their affected evidence.

## Disabled production behavior to verify after publication

With release controls still off, the published candidate must continue to prove all of the
following:

- PvP quote, join, status, heartbeat, resume, cancel, and history fail closed with private,
  non-cacheable HTTP 503 responses and `Retry-After: 300`.
- The nightly schedule/API fails closed with the same private release-control semantics.
- PvP and tournament pages gate or redirect truthfully to `/hub/trivia`; they never render fixture
  or optimistic live state in production.
- The lobby does not advertise competitive entry when the server controls are off.
- No production PvP ticket, match, tournament, entrant, settlement, escrow, or wallet movement is
  created by Phase 7 delivery.

Observed post-publication values, response headers, deployment ID, selected commit, and health
identity are **PENDING**.

## Rollback and activation boundary

- The immediate application rollback is the existing protected World Hub release route. Database
  migration history remains intact.
- Keeping the server flags off prevents entry even if a presentation route is reachable.
- Database rollback requires a new reviewed migration. Never replay or delete one of the three
  installed Phase 7 ledger rows.
- Existing Phase 5/6 sessions, settlements, refunds, and receipts remain authoritative across a UI
  rollback.
- Activation, treasury qualification, money canaries, nightly schedule registration, recovery
  ownership, and an observed live competitive run remain later rollout work.

## Completion gate

Phase 7 is not complete while any release placeholder in this report remains **PENDING**. Completion
requires the exact candidate to pass the scoped checks, merge through branch protection, publish
from the protected merge to canonical `hub-vanguard`, appear in production health identity (or a
proven descendant), and pass the disabled-route live certificate without activating competitive
money or schedules.
