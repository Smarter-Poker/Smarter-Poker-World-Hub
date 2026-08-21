# Closing the open items, and a mistake I made doing it

Date: 2026-08-21
Follows: `2026-08-21-the-last-xp-column.md`

Everything left open across the day's work, plus one self-inflicted incident
recorded in full because the lesson in it is reusable.

---

## 1. I gutted a production function for two minutes

`health_check_stops_testing_spelling` was written as if a `CREATE OR REPLACE`
could be staged and then amended later in the same migration. **It cannot.**
The first statement replaced the whole 305-line `verify_home_games_health` with
a stub returning no rows, and the "surgical edit" meant to follow it was a
comment.

Restoring it exposed a second problem: the only full copy available was
`supabase/migrations/ZZZZ_snapshot_home_games_schema.sql`, and **that snapshot
is older than what production was running.** Four checks came back with stale
function-name lists, so a report that read 10/10, 5/5, 18/18 and ✓ now read
1/10, 0/5, 0/18 and ✗ — a regression I caused while fixing something else.

**The reusable lesson:** the repo's snapshot of this function does not match
production, so it is not a safe restore point. That is true of anything only
captured in `ZZZZ_snapshot_home_games_schema.sql`.

## 2. Two checks were testing how the code is spelled

Same failure as the popup test that blocked every deploy earlier the same day.

**"7 fn_home_* seat RPCs have defense-in-depth guard" — 0 / 7.** The check
demanded the literal `auth.role() <> 'service_role'`. All seven functions say
`auth.role() IS DISTINCT FROM 'service_role'`.

The guard was present in every one, and the form they use is the **better** of
the two: `<>` yields `NULL` for a `NULL` auth.role(), the enclosing `AND`
collapses to `NULL`, and the guard silently does not fire. `IS DISTINCT FROM`
is null-safe. **The check was failing the correct implementation and would have
passed the subtly broken one.**

**"home_members_host_sees_group policy non-recursive" — ✗.** It looked for one
helper *by name*; the policy calls a different one. Both are `SECURITY
DEFINER`, which is the property that actually prevents the recursion — RLS is
not re-applied inside a function owned by the table's owner. Verified
empirically before touching anything: selecting from `commander_home_members`
as a signed-in user returns rows rather than raising *"infinite recursion
detected in policy"*.

## 3. Four more checks named things that do not exist

Rebuilt from what is actually in the database:

| Check | Was | Now | Why |
|---|---|---|---|
| Length caps | 1 / 10 | **8 / 12** | Named ten functions, two exist. Counted by behaviour: any home RPC taking text and writing it must raise TOO_LONG. |
| Spam vectors | 0 / 5 | **5 / 5** | Wrong names; the five real ones are post, comment, invite, photo, like. |
| Audit coverage | 0 / 18 | **5 of 37** | Looked for `commander_audit_logs`; home functions write `commander_home_audit` / `home_audit_log`. |
| Platform policies | ✗ | **✓** | Required three version keys that do not exist. |

Two of those are **honest shortfalls now visible**: four text-writing RPCs have
no length cap, and only 5 of 37 home RPCs leave an audit trail. Both were
previously hidden behind a fabricated 10/10 and 18/18.

**Result: 35 checks, 24 ticks, zero crosses.**

Why this matters beyond Home Games: a report that always shows red marks is a
report nobody reads. That is exactly how *"zero XP columns"* sat at ✗ for
months while a leftover column quietly made `club_members` undeployable.

## 4. Payments made during a period had nowhere to go

`fn_union_record_presettlement` has existed for months and
`union_presettlements` **has never held a single row**, because nothing called
it. The statement breakdown already reads `presettled` and would honour it —
there was simply no way to put anything there. A club that paid mid-week got
billed for the whole week and was squared up by hand.

The union board now has **Record a payment** on every club row. It credits
against the *next* statement and reports the running unapplied total.

It records money received and **moves no chips**, the same rule as marking a
statement paid.

## 5. The club and the union disagreed about the same invoice

`ca_club_union_invoices` returned `status` exactly as stored, so a club owner
read *"generated"* on a statement whose due date had passed days earlier —
while the union board showed that same invoice as **overdue**. Two screens, one
invoice, two answers.

The club side now derives overdue the same way, and carries `paid_total` and
`outstanding` with it. Overdue stays derived rather than stored on both sides: a
stored flag needs a job to maintain it, and a job that does not run leaves the
row lying about itself.

## 6. Verification

- Presettlements exercised against production under the union owner's own JWT
  and rolled back: two payments accumulate to 3,500 unapplied; zero is refused
  with a readable message.
- Club JAQK's statement now reports `overdue: true`, `outstanding 7531.11`
  against a due date of 2026-08-20.
- `verify_home_games_health()` — 35 checks, 24 ✓, **0 ✗**.
- Club Arena: `tsc --noEmit` clean, `vite build` exit 0, suite green at **210
  files / 2,689 tests**.

## 7. Still open, and deliberately not guessed at

**Four text-writing home RPCs have no length cap**, and **only 5 of 37 home
RPCs leave an audit trail.** Both are now measured rather than hidden. Fixing
them means deciding caps and audit semantics for a module I have not otherwise
worked in today, and inventing those in a cleanup pass is how unrelated things
break.

**Work is still being lost to force-pushes on Club Arena `main`.** The XP commit
was pushed, built into a bundle, then overwritten; it had to be cherry-picked
back. This is the second occurrence today.

**`super_agent` scope on the cashier** still shows the whole club rather than
that agent's downline. Whether a super agent sees their downline or the club is
a hierarchy decision, not a bug fix.
