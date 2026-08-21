# Nothing left open

Date: 2026-08-21
Follows: `2026-08-21-closing-the-open-items.md`

Dan, on the previous report's "Still open, deliberately not guessed at" section:
**"NONO."**

Fair. Leaving three things measured-but-unfixed is not finishing. All three are
done, and each turned out to be more interesting than the one-line summary
suggested.

---

## 1. Length caps: two real gaps, and two false alarms of my own making

The derived check read 8 / 12. Reading all four shortfalls rather than trusting
the number:

**Real.** `create_home_game_template` takes **six** free-text fields — name,
description, game_type, stakes, food_drinks, special_rules — and bounds none of
them. Every target column is unbounded `text`, so one call could store an
arbitrarily large template.

**Real.** `create_home_group_poll` rejects an empty question and caps the option
*count* at 20, but bounds neither the question's length nor the length of each
option. **Twenty options of unbounded size is the same hole with extra steps.**

**Not real.** `fn_home_assign_seat` already caps player_name at 60 and note at
500. It just doesn't use the word `TOO_LONG`.

**Not real.** `fn_home_set_seat_status` takes `p_status text` but validates it
against `('empty','reserved','seated','away')`. An enumerated argument needs a
membership test, not a length bound, and it has one.

So **the detector I wrote yesterday had the very disease it was written to
cure** — it tested for a *token* instead of the property. It now looks for an
actual upper-bound comparison on `length()`, and ignores enum-validated
arguments. `length(x) = 0` is an emptiness test and does not count; that was
the hole the two real ones slipped through.

**10 / 10, and this time it means something.**

## 2. Audit coverage: the denominator was the bug

The report read *"5 of 37 home RPCs"*. Both halves were misleading.

Of those 37, most have no business writing an audit row: **14 are trigger
functions** (`touch_updated_at`, `bump_activity`, `refresh_geog`,
`protect_row_identity`…), **4 are predicates**, one is a read, and several are
member-level content actions that are rate-limited and length-capped rather
than audited. Counting all 37 made a healthy module look two-thirds unaudited
forever.

The **real** gap was the staff actions: the seven seat RPCs plus the template
and invite-token creators mutate state on a host's authority and left no record
of who did it.

**A trigger, not nine edits.** Adding an INSERT to each of the nine means
rewriting nine production bodies — and a tenth function added next month simply
forgets. A trigger on the *table* captures every write: every existing RPC,
every future one, and any direct statement that gets past RLS. It also touches
no function body, which mattered today given I had already broken one by
editing it.

The audit write is wrapped so a failure can never take down the write it is
recording — **a host must still be able to seat a player.** Coverage is
reported by the health check instead: **3 / 3 tables**.

Verified by inserting a seat and watching `seat_insert` appear with the actor
and group resolved, then rolling back.

## 3. A super agent could send chips to the whole club — or to 26 of their 429

The two cashier screens disagreed with each other **and** with the role
hierarchy, in opposite directions.

`CashierPage` scoped only `agent` and `sub_agent`. A **super agent fell through
to the staff branch and saw the whole club** — every player of every other
agent — as a chip recipient.

`CashierTradePage` did scope super agents, but with `.eq('agent_id', user.id)`:
their **direct assignees only**. A super agent carries agents, and those agents
carry players, so direct assignment hides most of the people they are
responsible for.

Measured on SHARK CLUB: ruby carlsson has **26 direct assignees and a real
downline of 429**.

One too wide, one too narrow — and the role system already had the answer.
`ca_club_my_downline` walks `club_members.agent_id` downwards, the same walk
`fn_club_is_in_downline` uses for the promotion matrix, so both screens ask
instead of guessing.

Staff get `scoped: false` rather than a list. **"No restriction" and "an empty
downline" are different answers**, and a caller that can't tell them apart
shows an owner an empty cashier — so the client keeps `null` and `[]` apart
too, and an agent with nobody beneath them gets an empty list rather than the
whole club.

## 4. Verification

| Check | Result |
|---|---|
| Length caps on text-writing home RPCs | **10 / 10** |
| Staff-authority tables writing an audit row | **3 / 3** |
| Audit trigger fires with actor and group | verified, rolled back |
| Owner downline scope | `scoped: false` |
| Super agent downline scope | 429 ids vs 26 direct |
| `verify_home_games_health()` | 35 checks, **0 crosses** |
| Club Arena | `tsc` clean, `vite build` 0, **2,766 tests passing** |

## 5. Open

Nothing.
