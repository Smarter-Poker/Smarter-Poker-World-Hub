# The horses that disappeared, and the audit that followed

Date: 2026-08-21
Follows: `2026-08-21-club-data-union-board-and-cleanup.md`

Dan: *"all the horses that were 'assigned to me' as their agent disappeared and
regressed."*

They had not. This records what actually happened, because the wrong conclusion
was available and expensive: it looked like data loss, and the instinct is to
start restoring rows.

---

## 1. The data was never damaged

Checked before anything was changed:

| Question | Answer |
|---|---|
| Memberships assigned to Dan | 10, all in SHARK CLUB |
| Their status | all `active` |
| Their chip balance | 25,000 each, one at 25,029 |
| Last updated | that afternoon — they were playing |
| `agents.total_players` for Dan | 10, matching exactly |
| `audit_trail` rows for `assign_player_to_agent` | **zero, ever** |
| Assignments with a non-user-id shape | 0 of 1,160 |
| Orphaned `agent_id` values | 0 |

Nothing was lost, reassigned, or corrupted. Every horse Dan had was still his,
still funded, still seated. The disappearance was entirely in the read paths —
and there were four of them.

## 2. Membership status is two words, and one screen only asked for one

`club_members.status` carries two words for the same idea. Everything created
before 2026-07-22 says `approved`; everything since says `active`. In production
**1,480 of 1,499 rows say `approved`**.

Every query in this codebase asks for both — except the Trade cashier, which
asked for `active` alone, in two places:

```
                     old filter    both words
Club JAQK                     5           582
SHARK CLUB                   10           587
Midway Union                  1           327
```

A 588-member club rendered eleven people. The same filter was on the club
switcher, so an owner whose own membership said `approved` would have seen no
clubs at all.

**Normalising the 1,480 rows was considered and rejected.** 108 database
functions reference `approved`; sweeping live data to fix a client query is the
wrong end of the problem. `tests/unit/clubMemberStatus.test.ts` now fails the
build if any membership read narrows to one word.

That guard is scoped to the chain beginning at `.from('club_members')`. A
whole-file scan was tried first and produced four false positives, because
`HorseOrchestrator` correctly filters `tables` and `table_seats` on
`status='active'`. **Guards that cry wolf get deleted**, so this one only looks
where it means to, and it proves its own detector against a known bad, good and
unrelated snippet before it trusts itself.

## 3. The `/cashier` agent filter could never match a row

```js
const { data: agentRecord } = await supabase.from('agents').select('id')...
if (agentRecord?.id) query = query.eq('agent_id', agentRecord.id);
```

`club_members.agent_id` holds the agent's **user** id and carries a foreign key
to `users`. `agents.id` is the agent record's own primary key — a different
value entirely. Verified against production: all 1,160 assigned memberships are
user-id shaped and **none matches any `agents.id`**.

So every agent and sub_agent opened the cashier to an empty recipient list, and
had done since the line was written. The lookup was also redundant: `userRole`
had already established the caller is an agent in that club.

This was the **second** instance of the same mistake. The first was
`AgentService.assignPlayer()`, which took an `agentMembershipId` and wrote it
*into* that column — an assignment that would either violate the constraint or
land an id `getAgentPlayers()` could never match. It had no callers, which is
the only reason no data was harmed. Both are gone.

## 4. An unordered cap silently dropped the newest members

`.limit(500)` with no `ORDER BY` on a 588-member club returns an arbitrary 500
and discards 88 people — and *which* 88 can differ between two loads of the same
page. The rows most likely to fall off the end are the most recently added,
which is exactly what ten horses seeded on 2026-08-21 were.

Four other membership reads had the same shape: `AgentAssignmentPanel` (2,000),
`ClubDetailPage` (500, on that same 588-member club), `ClubMembersPage` (5,000),
`FriendSuggestionService` (100). All five now order before they cap, and the
guard test has a second rule for it. Reads ending in `.maybeSingle()` are
exempt, since one row is the point.

## 5. An owner could not ask "which of these are mine"

The agent scope was applied only when `isAgent && !isStaff`, so an owner saw the
whole club with nothing on any row saying whose it was — while `agent_id` was
already being selected and thrown away. There is now an **Assigned To Me (n)**
toggle. Agents keep their hard server-side scope, because they must not see
anyone else's players; for staff it is a filter, not a wall.

## 6. `admin` was in none of the role branches

A club admin fell through to the `else` and was told regular members cannot send
chips — two lines below a comment stating that admins see everyone.

## 7. What the audit of the same three pages found

A full read of `CashierTradePage`, `ClubDataPage` and `UnionStatementsPage`
produced 35 findings. The ones that could produce a wrong outcome:

**Chips could go to players who were not on screen.** The selection was never
pruned against the visible list. Select three players, type a search, select a
fourth, press Send Out — chips went to all four, three of them invisible.
`runTransfers` read the unfiltered `downline` while the user had been looking at
the filtered `list`.

**Stale rows stayed live through a club switch.** The list was gated on nothing,
so a player could be selected from the club you had just left and the transfer
submitted against the club you had switched to.

**A slower read could land last.** All three pages guarded on an unmount ref,
which cannot distinguish a stale response from a fresh one. Club Data reloads on
six inputs plus a 60-second poll plus every `visibilitychange`. Each page now
carries a version per request.

**The poll pulled the skeleton out from under a real load**, leaving stale rows
looking settled.

**The previous club's money under the new club's name.** No per-club state was
reset on a club change, and the skeleton is gated on `!snapshot`, so there was
not even a spinner to suggest otherwise.

**A null RPC payload rendered a permanently blank page** — stored as success,
which leaves `loading` false, no error and no board, and every empty state
requires one of those three.

**A failed load looked like an empty club.** No error state existed at all, so
the owner of a 588-member club was told they had no downline. An errored role
query separately demoted an owner to `player` with a 0.00 balance.

**The CSV button could do nothing at all.** Three copies of the same download,
each with the same two faults: the anchor was never added to the document, which
Firefox will not act on, and the object URL was revoked in the same tick as the
click, which Safari often has not read by then. No file, no error, no clue — on
exports used to settle money. One utility now, which also writes a UTF-8 BOM so
Excel stops guessing at club names, and returns false when there is no DOM.

**The modal could become a trap.** `setBusy(true)` had no `try/finally`, and
both Confirm and Cancel are disabled on `busy`.

Also fixed: issuing statements fired two reads bound to two different periods; a
period chip gave no feedback; the per-player rake caveat compared a value typed
`string` against a date, so a timestamp would have suppressed the warning
exactly when it mattered; rows advertised `role="checkbox"` with no key handler;
and the Trade Record tab said "No trades recorded yet" while loading, after an
error, and after an unlanded club switch.

**Mobile.** `CashierTradePage.module.css` had no media queries at all. The
balance strip was three non-wrapping cells with no `min-width: 0`, so a real
balance pushed the page into horizontal scroll; four tabs at ~87px wrapped
inside their own pills; the "get more chips" control was an 18px square. Every
tap target on all three pages is now at least 44px.

## 8. Verification

- `tsc --noEmit` exit 0 and `vite build` exit 0 on every commit.
- Every `styles.*` reference on the changed pages resolves to a real class.
- 15 guard tests pass, including the two new membership rules.
- The status and id-shape claims were measured against **production**, under
  Dan's own JWT where authorization mattered — not inferred from the code.

## 9. Deliberately not done

**The 1,480 `approved` rows were not rewritten.** See section 2.

**`super_agent` still sees the whole club** rather than their own downline. The
comment says agents and sub-agents are scoped; whether a super agent should be
is a hierarchy decision, not a bug fix, and guessing at it in an audit pass
would be the wrong way to change who can send whom money.
