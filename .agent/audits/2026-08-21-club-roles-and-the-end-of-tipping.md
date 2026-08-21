# Club roles, and the end of dealer tipping

Date: 2026-08-21
Follows: `2026-08-21-the-horses-that-disappeared.md`

Two instructions from Dan. Both are done; this records what was found on the
way, because in each case the interesting part was not the thing asked for.

---

## 1. Dealer tipping

The in-game modal went on 2026-08-20. What was left:

- **A second tipping modal nobody knew about.** `components/feedback/TipPrompt`
  — "Nice Win! Would you like to tip the dealer?" with preset amounts. Dead,
  exported from the feedback barrel, one import away from being alive.
- **An orphan server handler**, `server/src/handlers/tipdealer.ts`, calling
  `engine.tipDealer()` — a method that no longer exists. Nothing routed to it.

Checked against production before removing anything: no tipping functions
remain in the database (`atomic_table_dealer_tip` and `deduct_table_chip_lock`
are both gone), no column is named for a tip, and `wallet_transactions` and
`chip_transactions` hold **zero rows** in any tip category. Nothing was ever
tipped, so nothing was lost.

`tests/tip-dealer-guards.test.tsx` now covers all three surfaces: no tipping
component in either directory, nothing importing or re-exporting one, and no
tipdealer route or handler on the server. Comments are stripped before
matching, so the notes explaining *why* this is gone do not trip the guard that
keeps it gone.

**Not touched, because it is a different thing:** the Toke Tracker orb in the
World Hub. That is a bankroll tool for real-life dealers to log their own shift
earnings, not a way to tip anyone inside our games.

## 2. Roles

> "ALL USERS IN CLUBS AND UNIONS NEED ROLES ASSIGNED TO THEM: OWNER, ADMIN,
> SUPER AGENT, AGENT, SUB AGENT AND PLAYER... OWNERS CAN UPGRADE A PLAYER TO
> ANY ROLE STATUS, INCLUDING CO OWNER. CO OWNERS AND ADMINS CAN PROMOTE ANY
> USER AS HIGH AS ADMIN STATUS. SUPER AGENTS CAN PROMOTE ANY PLAYER IN THEIR
> DOWNLINES TO BE AN AGENT TO WORK UNDER THEM, AGENTS CAN PROMOTE ANY PLAYER IN
> THEIR DOWNLINE TO BE A SUB AGENT UNDER THEM."

### There were four vocabularies, and no two agreed

| Where | Roles |
|---|---|
| `types/club.types.ts` | owner, super_agent, agent, manager, member, guest |
| `types/database.types.ts` | owner, admin, agent, member |
| `components/club/MemberList` | owner, admin, agent, member |
| the database | owner, admin, super_agent, agent, sub_agent, player |

`src/types/clubRoles.ts` is now the only one. `co_owner` joins it; `member`,
`manager` and `guest` map onto `player`, so a row still carrying an old word
renders as a player rather than a blank badge.

### The old rules were wrong in four ways

`promote_member` had no `co_owner` at all; let an **admin appoint a super
agent**; let a **super agent promote anyone**, not only their own downline, and
without placing the promoted agent under them; and let an **agent promote
nobody**.

`fn_club_grantable_roles` replaces it and is the single answer to "what may
this person set that person to". `fn_club_set_member_role` is the only writer.

### The bypass

`ClubMembersPage` fell back to `.from('club_members').update({ role })`
whenever the RPC errored — and the RLS policy lets **any club admin update any
member row to any value**. Every rule above was one failed request away from
being skipped, including *only the owner appoints a co-owner*.

The fallback is gone, and `trg_club_members_role_guard` refuses any role change
that does not come through the function, so it cannot return by accident.

**That guard was itself broken on the first attempt, and the probe is what
caught it.** It was written `SECURITY DEFINER`, and inside a SECURITY DEFINER
function `current_user` is the function's *owner*, not the caller — so
`current_user NOT IN ('postgres', ...)` compared postgres against postgres and
trusted everyone. It only surfaced because the bypass was retried as a real
signed-in club owner instead of from a superuser session, where it had appeared
to pass. A trigger that inspects the caller must run as the caller; it reads
and writes nothing, so it needs no elevated rights.

### Fifteen hand-rolled permission checks

`role === 'owner' || role === 'admin'` appeared fifteen times. That is exactly
how `co_owner` would have shipped as a role that unlocked nothing. They now call
`isClubStaff()`, and eleven `.in('role', [...])` staff queries gained
`co_owner`.

### Demotion cannot orphan a downline

Stepping an agent down while players still report to them would leave those
players pointing at an upline who is no longer one. Refused, with the count, so
the fix is obvious: move them first.

### Two constraints had to learn the new words

- `club_members_role_check` listed six of the seven. Adding `co_owner` needed
  `ALTER TABLE`, which brings us to the blocker below.
- `audit_trail_actor_role_check` admitted a mix of two taxonomies and was
  missing `admin`, `super_agent` and `player`. A club admin promoting someone
  produced a constraint violation instead of an audit row, which failed the
  role change outright. Mapping `admin` onto `host` was the alternative and is
  worse: an audit trail that records a role the actor does not hold misleads
  exactly when someone is reading it to find out what happened.

## 3. A blocker worth knowing about

**`club_members.reputation_xp` makes the table undeployable.**

The `xp_ban_guard` event trigger enforces a zero-XP policy by rejecting any DDL
on a table that holds an XP-shaped column. `club_members` holds
`reputation_xp`. So **no constraint, column or index on the most-edited table
in the club system can be changed** — and the failure message talks about XP,
which is nothing to do with the work being attempted.

All 1,499 rows are zero. Two database functions still reference the column,
which is why it was not dropped here: that is its own change with its own blast
radius, and smuggling it into a roles migration would be the wrong way to do it.
For this one constraint the guard was disabled and re-enabled inside a single
transaction, so a failure anywhere would have rolled the disable back with
everything else.

**Recommended next:** drop `club_members.reputation_xp` after updating the two
functions. It is dead data enforcing a rule against itself.

## 4. Verification

Every rule was exercised **against production, under each role's own JWT**, and
rolled back:

| Case | Result |
|---|---|
| owner grants co_owner | allowed |
| owner grants `owner` | refused, `invalid role` |
| owner changes their own role | refused |
| co_owner grants admin | allowed |
| co_owner grants co_owner | refused |
| admin grants super_agent | allowed |
| admin demotes a co_owner | refused |
| super agent promotes own player to agent | allowed, and `reports_to` is the super agent |
| super agent promotes a player outside their downline | refused |
| super agent grants admin | refused, `allowed: [agent, player]` |
| agent promotes own player to sub_agent | allowed, reporting to the agent |
| agent grants agent | refused |
| agent promotes another agent's player | refused |
| demote an agent with 13 players | refused, naming the 13 |
| sub_agent or player grants anything | empty set |
| direct `UPDATE ... SET role` as a club owner | refused with 42501 |

Production role counts were unchanged afterwards and `audit_trail` recorded
nothing, because every probe rolled back.

Client: `tsc --noEmit` clean, `vite build` exit 0, full suite green at **202
files and 2,540 tests** — including 19 new ones pinning the client mirror to
the same matrix, one of which walks all 49 actor/target pairs and asserts
nothing is ever offered that the database does not have.

## 5. Deliberately not done

**Ownership transfer.** `fn_club_set_member_role` cannot grant `owner` and
cannot demote one. A club has one owner and handing it over is its own act,
with its own confirmation, not a dropdown on a members list.

**`super_agent` scope on the cashier** still shows the whole club rather than
their downline, unchanged from this morning's note. Whether a super agent sees
their downline or the club is a hierarchy decision, not a bug fix.
