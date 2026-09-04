# Phase 4 contracts - Player 360, account controls, protection and support

Binding for every agent building Phase 4. The Phase 1, Phase 2 and Phase 3
contracts still apply in full.

Phase 4 is ONE repository: the World Hub. It adds no engine code. It does add
one thing the engine will have to learn before enforcement is switched on, and
section 6 says exactly what and why.

## 0. The safety rule that outranks everything here

**NOTHING IN THIS PHASE TAKES A PLAYER'S ACCESS AWAY UNTIL DAN TURNS
ENFORCEMENT ON, AND WHAT AN OPERATOR IS TOLD MUST MATCH WHAT THE PLATFORM WILL
ACTUALLY DO.**

This is the first phase that can hurt a real person by working correctly. A
mint that misfires costs chips, which are recoverable and which section 10.6
gives an agent the authority to put back. A restriction that misfires locks
somebody out of the thing they came here for, at the moment they came for it,
and no migration gives that evening back.

1. **Additive only.** Every table and column is new. No existing table is
   altered. In particular `profiles.status` is NOT written by this phase. It is
   decorative today - every one of the 1,310 rows says `active`, one admin
   badge renders it, and nothing on any money, seat, tournament or auth path
   reads it. Writing it would create a second opinion about a player's standing
   that nothing enforces and that the next agent would find and believe.

2. **Recorded from day one, refusing nothing until Dan says so.** The guards
   are installed and live, and while `ca_operator_policy.restrictions_enforced`
   is false they OBSERVE: every attempt a restriction would have refused is
   written to `ca_restriction_observations` and shown in the console, and the
   attempt succeeds. One switch makes every guard bite at once.

   This is the Phase 2 pattern (`approvals_enabled`, `enforce_named_roles`, both
   still false), and it is also Dan's own ruling about this exact trigger: a
   raising BEFORE trigger on `table_seats` INSERT was judged high-risk, which is
   why `fn_ca_guard_seat_creation` sits in dry-run to this day
   (`20260902174600_the_seat_guard_watches_before_it_refuses.sql`).

   **It is NOT the defect Phase A removed**, and the difference is worth stating
   because it is the difference between a rollout and a lie. The AI Model
   control had no reader anywhere and no path to one. Here the reader exists, is
   tested, is attached to the two tables every seat and every tournament entry
   converges on, and is already recording what it would do. Only the refusal is
   held back.

   **Therefore the console must say so, every time, in the sentence the
   operator reads before they act.** A confirm dialog that says "Suspend This
   Player" while enforcement is off is the lie. "Enforcement Is Off. This Will
   Be Recorded And Observed, Not Refused." is the truth, and it is what ships.

3. **Fail OPEN.** A restriction lookup that errors ALLOWS the action. This is
   the opposite of `refuseWhileFrozen`, which fails closed, and the difference
   is deliberate: the freeze protects money integrity across a restart, where
   the safe answer to "I do not know" is stop. A restriction carries a policy
   decision about one person, where the safe answer to "I do not know" is let
   them play. A player refused a seat because a lookup timed out is a support
   ticket about something nobody chose.

4. **HORSES ARE PLAYERS (CLAUDE.md 10.5).** Search, the 360, notes, tags,
   restrictions and every count in this phase cover horses exactly as they cover
   humans. `p_include_horses` defaults to **true** everywhere it appears. The
   horse badge is IDENTIFICATION, which section 10.5 sanctions explicitly, and
   it is the only place `is_horse` may appear in this phase.

   Enforcement binds a horse **by construction, not by a second code path**:
   `HorseFleetManager` seats through `atomic_table_buyin`, the identical RPC a
   human's browser calls, and both land on the same `table_seats` INSERT the
   guard watches. There is no horse branch to forget to update. A restriction
   applied to a horse is honoured by the same trigger, at the same moment, with
   the same message.

5. **Nothing irreversible.** No player is deleted, no account is erased, no
   history is rewritten. Notes are soft-deleted and keep their author. A lifted
   restriction is marked lifted, never removed - the record of a decision is
   part of the decision. P11 (data-subject export and erase at platform scope)
   is DEFERRED for exactly this reason and section 7 says so.

6. **Severe actions need a second pair of eyes.** A full account restriction and
   any restriction with no expiry go through the Phase 2 approvals queue as kind
   `sanction`, which is already declared in `APPROVAL_KINDS`. It is deliberately
   NOT added to `EXECUTABLE_APPROVAL_KINDS`: see section 3.

7. **An operator is not a bypass of a player's protection.** Responsible-gaming
   limits may be TIGHTENED by an operator immediately. LOOSENING one - raising a
   limit, shortening an exclusion, ending a cooling-off early - is subject to the
   same `limit_increase_available_at` hold the player is subject to, and is
   refused before it. The console explains the refusal rather than hiding the
   control, because an operator who cannot see the control assumes the platform
   cannot do it and reaches for SQL.

8. **The support role may not sanction.** `support` holds `players.write`, which
   this phase uses for notes and tags. Restrictions and RG writes require
   `moderation.write`, which `support` does not hold. A help-desk account can
   annotate a player and answer their ticket; it cannot take their access.

## 1. What Phase 4 covers, and what it does not

Built here: **P1** (platform player search), **P2** (Player 360), **P3**
(account state machine with reason codes and expiry), **P4** (operator notes and
tags), **P5** (KYC event viewer), **P6** (responsible gaming console), **P8**
(support tickets with assignment, priority and SLA ageing), **P9** (user reports
queue), **P10** (platform restriction list).

Deferred, with the reason, because a phase that quietly drops two of its eleven
items is how a plan stops being true:

- **P7, markers of harm.** Loss chasing, session length and late-night play are
  derived signals, and the two tables that would carry them
  (`responsible_gaming_sessions`, `responsible_gaming_limits`) hold ZERO rows in
  production. Building a queue over an empty derivation produces a panel that
  says "no markers" forever and cannot be told apart from a broken one. It needs
  the session pipeline first, and that is not console work.
- **P11, data-subject export and erase at platform scope.** Erase is the one
  irreversible action in the whole programme and section 0 rule 5 forbids it
  here. It also collides with the audit trail, the ledger and the seven-year
  retention rules, none of which this phase has settled. It gets a phase.

**What the empty tables mean for what ships.** Measured 2026-09-04:
`kyc_events` 0, `responsible_gaming_limits` 0, `responsible_gaming_sessions` 0,
`user_reports` 0, `live_help_tickets` 5, `profiles` 1,310 of which 1,000 are
horses. Four of the nine surfaces built here have no data to show yet. Each of
those panels must state THAT rather than render an empty table that looks like a
failed load: "No KYC Event Has Ever Been Recorded" is a fact about the platform;
a blank list is a bug report waiting to be filed. This is the Phase 3 heartbeat
discipline, applied to four more panels.

## 2. Database

One migration, one transaction (CLAUDE.md section 2's DDL policy: ten separate
statements outside a transaction is up to ten 28-second PostgREST reloads). It
takes `ACCESS EXCLUSIVE` briefly on two hot tables, so it opens with
`SET LOCAL lock_timeout = '3s'`: a timeout means retry off-peak, and never means
force. `table_seats` and `tournament_players` are the only two hot tables it
touches, and the 2026-09-02 deadlock caution is why it touches no third.

### Tables

`ca_player_restrictions` - the state machine.

```
id           uuid primary key default gen_random_uuid()
user_id      uuid not null                 -- no FK to profiles: a restriction outlives a profile row
scope        text not null                 -- 'account','cash','tournaments','transfers','social'
reason_code  text not null                 -- from a fixed vocabulary, see below
reason_note  text
status       text not null default 'active'-- 'active','lifted','expired'
applied_by   uuid
applied_at   timestamptz not null default now()
expires_at   timestamptz                   -- null means indefinite, which is material
approval_id  uuid                          -- ca_operator_approvals.id when one gated it
lifted_by    uuid
lifted_at    timestamptz
lift_note    text
created_at   timestamptz not null default now()
```

- Partial unique index on `(user_id, scope) where status = 'active'`: one live
  restriction per scope per player, so "is this player restricted" has one
  answer and lifting is unambiguous.
- Check: `scope` in the five values; `status` in the three; `expires_at` is null
  or after `applied_at`.
- Index `(user_id) where status = 'active'` - this is the index the hot-path
  guard probes, and it is the reason the guard is cheap on a near-empty table.

`reason_code` vocabulary, fixed in SQL and mirrored in JavaScript, because a
free-text reason is a reason nobody can report on:
`collusion_suspected`, `chip_dumping_suspected`, `multi_accounting`,
`bot_or_rta_suspected`, `abuse_or_harassment`, `payment_dispute`,
`kyc_incomplete`, `responsible_gaming`, `self_requested`, `security_compromise`,
`terms_violation`, `other`. `other` REQUIRES a `reason_note` and the RPC refuses
it without one.

`ca_operator_player_notes` - `id, user_id, body, pinned bool default false,
author_id, created_at, updated_at, deleted_at, deleted_by`. Soft delete only.

**This is NOT `player_notes`.** That table already exists and belongs to the
players: it is a live-poker feature where one player records another's tells,
tendencies, real name and photo (`target_user_id`, `tells`, `tendencies`). An
operator note written into it would appear inside a player's own notebook. The
two must never be conflated, and a test asserts this phase never writes it.

`ca_operator_player_tags` - `(user_id, tag)` primary key, plus `added_by`,
`added_at`. Tag is lowercased, trimmed, `[a-z0-9-]{2,32}`.

`ca_restriction_observations` - the dry-run log, and the evidence Dan needs
before he flips the switch.

```
id           bigint generated always as identity primary key
user_id      uuid not null
scope        text not null
restriction_id uuid
observed_at  timestamptz not null default now()
table_name   text not null
op           text not null
would_refuse bool not null default true
detail       jsonb
```

Retained by age, not by count. Nothing reads it on a hot path.

`ca_operator_policy` gains ONE column: `restrictions_enforced boolean not null
default false`. Default false is the whole of rule 2.

### RPCs

All SECURITY DEFINER, `set search_path = public, pg_temp`, revoked from public /
anon / authenticated, granted to `service_role` only, with the ACL restated in
the migration so the file reads as self-contained. Reads write no audit row -
`fn_log_admin_action` refuses a null actor and a read has no actor worth the
row (the Phase 2 correction, `20260903121500`).

- `fn_ca_player_restricted(p_user_id uuid, p_scope text) returns boolean` -
  **STABLE**, the reader. True when an active, unexpired restriction covers this
  player for this scope OR for `account` (an account restriction implies all of
  them). Returns false on any ambiguity. This is the one function the guards
  call and the one function the rest of the platform will eventually call.
- `fn_ca_player_search(p_q text, p_include_horses bool default true, p_status text, p_limit int, p_offset int) returns jsonb` -
  by display name, username, email, player number or id. Email is matched but
  only RETURNED masked unless the caller holds `players.read` plus the route's
  own unmasking rule (Phase 1's `raw_email` discipline).
- `fn_ca_player_360(p_user_id uuid, p_money_visible bool) returns jsonb` -
  identity and horse badge, account standing, club memberships with role and
  wallet, play record from `player_stats`, restrictions, notes, tags, KYC
  events, RG limits, tickets, reports, anti-cheat flags, and the count of
  audit rows targeting them. `p_money_visible` false withholds balances and
  totals and says `moneyVisible: false`, exactly as `?section=horse` does.
- `fn_ca_player_restrict(...) returns jsonb` - validates, refuses a duplicate
  active scope, writes the row, audits with before and after.
- `fn_ca_player_lift_restriction(p_id uuid, p_actor uuid, p_note text) returns jsonb` -
  marks lifted, never deletes.
- `fn_ca_player_note_add / fn_ca_player_note_delete / fn_ca_player_tag_add /
  fn_ca_player_tag_remove`.
- `fn_ca_player_rg_set(p_user_id uuid, p_patch jsonb, p_actor uuid) returns jsonb` -
  applies rule 7. Every field is classified TIGHTEN or LOOSEN by direction, a
  patch that loosens anything before `limit_increase_available_at` is refused
  whole (never half-applied), and a tightening patch moves the hold forward the
  same 24 hours the player's own path would.
- `fn_ca_restriction_list(p_scope text, p_status text, p_include_horses bool default true, p_limit int, p_offset int) returns jsonb` -
  P10, the platform restriction list.
- `fn_ca_restriction_observations(p_hours int, p_limit int, p_offset int) returns jsonb` -
  what enforcement WOULD have refused, which is the case for turning it on.
- `fn_ca_restriction_observation_prune(p_days int default 30)` - the retention
  this section promised. **Scheduled through Open Claw, never the Claude
  scheduler** (World Hub CLAUDE.md 10.9). `fn_ca_restriction_expire_sweep`
  needs the same, and neither is registered yet: see section 7.

### The guards

`fn_ca_refuse_restricted_entry()` - one trigger function, attached twice:

| Trigger | Table | Event | Scope it checks |
| --- | --- | --- | --- |
| `zz_restriction_seat_guard` | `table_seats` | BEFORE INSERT | resolved per seat |
| `zz_restriction_seat_revive_guard` | `table_seats` | BEFORE UPDATE OF `user_id`, `left_at` | resolved per seat |
| `zz_restriction_tourney_guard` | `tournament_players` | BEFORE INSERT | `tournaments` |

**Post-build correction, 2026-09-04 (adversarial review, two blockers).** The
table above originally listed two triggers, both BEFORE INSERT, and the seat
one checked scope `cash` unconditionally. Both were wrong, and both were
checkable against production before a line was written:

1. **THE GUARD WAS UNREACHABLE.** Three of the five sanctioned seat creators
   REVIVE a vacated row (`SET left_at = NULL ... WHERE left_at IS NOT NULL`)
   and only INSERT as a fallback. 299,475 of 300,453 `table_seats` rows carry
   a non-null `left_at`, so on essentially every table anybody has ever left,
   a restricted player is seated by UPDATE and the guard never runs. Both
   precedents this contract cited already covered UPDATE: `zz_freeze_guard` is
   INSERT|UPDATE|DELETE and `trg_ca_guard_seat_creation` is INSERT|UPDATE.
   Fixed by `zz_restriction_seat_revive_guard`, a second trigger with a WHEN
   clause so an ordinary in-play write costs nothing.
2. **THE SCOPE WAS WRONG ON 97.8% OF SEATS.** `table_seats` carries cash AND
   tournament seats; 293,804 of 300,454 are tournament. So a `cash`
   restriction would have refused a tournament seat while the console said
   "Cannot Take A Seat At A Cash Table", and a `tournaments` restriction would
   have let one through. The guard now reads `tables.tournament_id` for the
   seat and resolves the scope from it.

Both are in `20260904183000` and `20260904183500`, and
`docs/horses/PHASE4-SIM.sql` proves each against production inside a
rolled-back transaction.

`zz_` so it fires after the freeze guards, which must keep their answer: a
platform freeze and a restriction are different refusals and the freeze is the
one in progress.

Behaviour, in order:

1. Read the player id from the row (`NEW.user_id`).
2. `fn_ca_player_restricted` for the scope. False - `RETURN NEW`, which is the
   answer for every insert on a platform with no restrictions, and is one index
   probe on a partial index over a near-empty table.
3. Restricted, and `restrictions_enforced` is false: write
   `ca_restriction_observations` and `RETURN NEW`. **The insert succeeds.**
4. Restricted, and enforcement is on: `RAISE EXCEPTION 'PLAYER_RESTRICTED: ...'`
   with `ERRCODE = '42501'` (`insufficient_privilege`), matching
   `fn_ca_guard_seat_creation`'s choice for the same shape of refusal.
5. Any failure inside the guard is caught and treated as NOT restricted
   (rule 3, fail open). The guard can log its own failure; it can never be the
   reason an insert fails.

Post-apply assertions in the migration itself, copied from
`20260903003000_engine_restart_phase6a_the_freeze_is_total.sql`: both triggers
exist, `restrictions_enforced` exists and is false, the partial unique index
exists, and `fn_ca_player_restricted` returns false for a random uuid. A
migration that cannot prove its own guard is attached is a guard that reads as
armed while being unreachable, which CLAUDE.md names as a trap three separate
times.

## 3. Approvals

Kind `sanction`, already in `APPROVAL_KINDS`. Required when either:

- the scope is `account` (everything, the heaviest thing an operator can do), or
- `expires_at` is null (indefinite - a restriction nobody has to revisit).

Anything narrower and time-boxed writes directly and is audited.

`sanction` is deliberately **NOT** added to `EXECUTABLE_APPROVAL_KINDS`.
Review B-1 in Phase 2 established that a queue which can approve a thing and
then cannot carry it out is a control with no exit, and `mint`, `burn`,
`fund_club` and `fleet_policy` are all executable for that reason. A sanction is
the case where that reasoning inverts: the second operator is approving a
JUDGEMENT about a person, and the moment it takes effect belongs to a human who
has read the case, not to a queue drain. The approvals panel therefore shows an
approved sanction with the action still to be taken, and the Players panel is
where it is taken. The route says this in its refusal text so nobody reads the
absence as an oversight.

## 4. Console

New route `/api/horses/player-admin`.

```
GET  ?section=search&q=&includeHorses=&restricted=&limit=&offset=
GET  ?section=player&userId=
GET  ?section=restrictions&scope=&status=&includeHorses=&limit=&offset=
GET  ?section=observations&hours=&limit=&offset=
GET  ?section=tickets&status=&priority=&assignedTo=&limit=&offset=
GET  ?section=reports&status=&limit=&offset=

POST { action: 'restrict',        userId, scope, reasonCode, note, expiresAt, opId }
POST { action: 'lift',            restrictionId, note }
POST { action: 'note_add',        userId, body }
POST { action: 'note_delete',     noteId }
POST { action: 'tag_add',         userId, tag }
POST { action: 'tag_remove',      userId, tag }
POST { action: 'rg_set',          userId, patch }
POST { action: 'ticket_assign',   ticketId, assignedTo, priority }
POST { action: 'report_review',   reportId, status, note }
```

Permissions. `spec.permission` is per method, not per action, so the route
enforces the finer rule itself and says which permission was missing:

| Action | Permission |
| --- | --- |
| every GET | `players.read` |
| `note_add`, `note_delete`, `tag_add`, `tag_remove` | `players.write` |
| `ticket_assign` | `support.write` |
| `report_review` | `moderation.write` |
| `restrict`, `lift`, `rg_set` | `moderation.write` |

`?section=player` withholds money figures without `money.read` and reports
`moneyVisible: false`, following the Phase 3 M-3 correction rather than
inventing a second convention.

New tab: id `players`, label "Players", permission `players.read`, code-split
like `fleet`, `staff` and `approvals`. Sections: Search, Player (the 360),
Restrictions, Observations, Tickets, Reports.

The panel must carry, above every control that creates a restriction, the
enforcement banner from rule 2, reading the live switch rather than a constant.
When enforcement is off it says so and says what will happen instead. When it is
on it says that too - an operator about to lock somebody out should be told they
are about to lock somebody out.

## 5. Tests

`node --test`, the existing four-file split: migration contract, server, client
models, and one law file.

The law file, `__tests__/horses-phase4-players-are-players.law.test.mjs`, pins
the things that must never be quietly changed:

- No SQL or route in this phase excludes horses. Any `is_horse` occurrence is
  either a SELECTED column (identification) or a parameter defaulting to true.
- Every `p_include_horses` defaults to true, in SQL and in the client's URL
  builders, and an omitted parameter never means false.
- The guards are attached to `table_seats` and `tournament_players` and to
  nothing else.
- `restrictions_enforced` defaults false, and the client's confirm copy is
  derived from the live value rather than hardcoded.
- This phase never writes `profiles.status` and never writes `player_notes`.
- The reader fails open: the trigger function contains an exception handler that
  returns NEW.

## 6. What must happen before enforcement is switched on

**This section is the one Dan will read before flipping the switch, so it
lists everything, not just the first thing that was noticed.**

### 6.1 The engine must learn the refusal

`HorseFleetManager.seatHorse` filters expected refusals from
`atomic_table_buyin` and reports everything else as an error
(`HorseFleetManager.ts:1934-1960`, list: `Insufficient balance`,
`Player already seated`, `duplicate key`, `TABLE_CAP_REACHED`,
`FOUR TABLE LIMIT`). A restriction refusal is not on that list, so with
enforcement ON and any horse restricted, every seeding cycle would
`reportError` once per attempt.

This is a genuine consequence of horses sharing the human path, which is the
same property that makes rule 4 true by construction. It is not a defect and
it is not a reason to give horses a different path. The refusal message is
prefixed `PLAYER_RESTRICTED:` precisely so the engine can recognise it in one
string compare.

### 6.2 The tournament seating paths refuse a player who has already paid

**Added 2026-09-04, after the scope correction, and it is bigger than 6.1.**

The guard originally checked every `table_seats` write against `cash`. That
was wrong (97.8% of those rows are tournament seats) and correcting it had a
consequence the first version of this section did not have: a `tournaments`
restriction now stands in front of the seat as well as the registration.

The engine seats tournament entrants through `table_seats` directly
(`TournamentManagerBase.ts:3644`), and through `fn_seat_late_registrant` and
`fn_seat_horse_in_seat_first_game`. With enforcement ON, a player restricted
from tournaments AFTER they registered and paid gets `PLAYER_RESTRICTED:` at
seating time. The engine logs it and moves on; the entrant stays on the
roster, unseated, blinding off, with their buy-in taken.

**That is a policy question, not only a wiring one, and it is Dan's:** should
a tournaments restriction applied after registration refuse the seat, or only
the next registration? Refusing the seat is the stricter reading and the one
the guard currently implements. Refunding and de-registering is a money
decision, which section 10.6 makes an agent's to make - but only with a clear
path, and there is not one until somebody decides which of the two behaviours
is wanted.

**Until it is decided, enforcement stays off.** The safe interim, if
enforcement is wanted sooner, is to restrict `cash` rather than `tournaments`
on any player who already holds a tournament entry.

### 6.3 The two scheduled jobs

`fn_ca_restriction_expire_sweep` and `fn_ca_restriction_observation_prune`
both exist and neither has a caller. Neither is needed for CORRECTNESS - the
reader treats `expires_at` as authoritative and `fn_ca_player_restrict`
retires a stale row itself - but with enforcement on, the observation log
stops being a dry run and starts being an audit surface, and an unbounded one
is a bad audit surface. Register both in Open Claw (CLAUDE.md 11.2), never the
Claude scheduler (10.9).

## 6b. Still open when Phase 4 shipped

Recorded here rather than left for the next agent to rediscover:

- **Neither scheduled job is registered.** `fn_ca_restriction_expire_sweep`
  (marks run-out restrictions `expired`) and
  `fn_ca_restriction_observation_prune` (retention on the observation log) both
  exist and both have zero callers. Nothing depends on the sweep for
  CORRECTNESS - the reader treats `expires_at` as authoritative over `status`
  and `fn_ca_player_restrict` retires a stale row itself - so the cost of the
  gap is a `status` column that reads stale in a list, and a log that grows.
  They go in `pages/api/cron/` and into
  `scripts/openclaw-cron-dispatcher.py` (CLAUDE.md 11.2).
- **`transfers` and `social` have no guard.** They record a decision and stop
  nothing, in either enforcement state. `SCOPE_META` says so on the control
  and the law test pins that it keeps saying so. They need a convergence point
  the way seats and registrations have one.
- **No browser has rendered this panel**, in common with every other panel in
  this programme. See D-10.

## 7. Verification before Phase 5

Migration dry-run inside a rolled-back transaction, applied, registered, and its
own assertions green. A rolled-back production simulation proving: the reader
answers false for an unrestricted player and true for a restricted one; an
account restriction implies every scope; the partial unique index refuses a
second active restriction on one scope; the guard OBSERVES with enforcement off
and RAISES with it on; the RG tighten-versus-loosen rule both ways; and that a
horse and a human are treated identically at every one of those steps. Console
tests green; lint, Title Case, UI text, silent-write, phantom-column and CHECK
18 green; build green; branch pushed. Then an adversarial review pass, and its
findings closed before Phase 4 is called done.
