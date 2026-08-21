# The last XP column

Date: 2026-08-21
Follows: `2026-08-21-club-roles-and-the-end-of-tipping.md`

Dan: *"WHY THE FUCK ARE WE TALKING ABOUT XP, WE REMOVED THAT LIKE 8 MONTHS AGO."*

Fair question. XP **was** removed. One column survived, and it was not inert.

---

## 1. What `club_members.reputation_xp` was doing

**It made the table undeployable.** The `xp_ban_guard` event trigger enforces
the zero-XP policy by rejecting any DDL against a table holding an XP-shaped
column. `club_members` held one. So no constraint, column or index on the
single most-edited table in the club system could be changed — and the error
message talked about XP whatever you were actually doing. Adding `co_owner` to
the role constraint earlier the same day had to disable the guard for one
statement to get past it.

**The platform's own health check had been failing.** `verify_home_games_health`
asserts *"zero XP columns + event trigger enforcing permanent ban"*. That count
was 1, so the check reported ✗ for months. Nobody was reading it. It now
reports ✓.

**It was sorting two screens.** `ClubsService` ordered club member lists by
`reputation_xp` in two places, one of them a "top 50". Ordering by a column
that is `0` on every one of 1,499 rows is not an order at all: Postgres returns
whatever it likes, and it can differ between two loads of the same page. So the
"top 50 members" was fifty arbitrary members. Both now order by chip balance,
then join date.

## 2. The live bug XP was hiding

`pages/api/trivia/submit.js` wrote `xp_earned` into `trivia_scores` on every
submission. **That column does not exist.** The table is `(id, user_id,
username, mode, score, correct_count, total_questions, time_spent,
diamonds_earned, play_date, created_at)`.

Both the insert and the update carried the field, so every submission failed
with 42703 and **no trivia score was ever saved**. The response then echoed
`row.xp_earned` back to the client as though it had been recorded.

## 3. Two verification scripts have been failing since XP was retired

`verify_training_flow.js` and `run-training-migration.js` both probe `xp_logs`
and report its absence as an error. The zero-XP policy forbids that table from
ever existing — so both scripts were reporting **the system working correctly**
as a failure. Eight `xp_logs` blocks between them, all removed.
`verify-training-tables.js` did the same and now says why the table is
deliberately absent.

## 4. A type file describing a system that does not exist

`src/types/supabase.ts` declared five XP tables — `social_xp_log`, `xp_ledger`,
`xp_security_alerts`, `xp_transactions`, `xp_logs` — plus `xp_vault` and three
XP functions. Every one verified absent from production before removal. 249
lines of fiction.

Regenerating the file from the live schema was the obvious fix and was
**rejected**: the generated output is 1.6 MB against the committed 150 KB. That
is a blast radius out of all proportion to deleting dead entries, on a repo
whose push gate runs `next build`.

## 5. What was removed

**Database** (`20260821164036`):
- `club_members.reputation_xp`
- `fn_award_social_xp` — body was `BEGIN RETURN; END`
- `get_user_total_xp` — body was `BEGIN RETURN 0; END`
- `fn_calculate_level(p_xp)` — body was `RETURN 1;`, no caller anywhere

**Club Arena:** the column from three select lists and two ORDER BYs, the
`reputation_xp` field from both type definitions still declaring it, and a doc
comment advertising an "XP progress ring" on `PlayerAvatar` (that ring is drawn
from VIP tier).

**World Hub:** `getUserTotalXP` from `useTrainingAccountant`; the
`xp:reputation_xp` alias from the agent dashboard's select; two leaderboards
falling back to `xp_earned` / `total_xp` fields no query returns; the trivia
write; and the XP blocks from the type file.

## 6. Sequencing, which mattered

The client shipped **first** and was verified live before the column was
dropped. Production served `ca_sha ae8a7ee94` (Club Arena bundle, no
`reputation_xp`) and World Hub `c06f4df0` (agent dashboard no longer aliases
it) before the migration ran.

Selecting a dropped column raises 42703 and takes the whole query with it.
Dropping first would have emptied the agent dashboard and two member lists
until the deploy caught up — which is exactly the failure the comment above
that select describes happening once already.

## 7. `xp_ban_guard` stays

It is the thing keeping XP out, not a thing to be removed along with it. With
the column gone it no longer blocks `club_members`, which is the entire point.

Verified afterwards by running real DDL against `club_members` with the guard
**fully enabled**, then rolling it back. It succeeded. The blocker is gone.

`tests/unit/noXp.test.ts` guards the client half: no XP-shaped field name, no
call to an XP rpc, and no query selecting or ordering by the column.

## 8. Verification

| Check | Result |
|---|---|
| XP columns anywhere in `public` | 0 |
| XP tables | 0 |
| XP functions | 0 |
| `xp_ban_guard` enabled | yes |
| DDL on `club_members` with guard on | succeeds |
| `verify_home_games_health` XP check | ✓ (was ✗) |
| World Hub `tsc --noEmit` | byte-identical to `origin/main` |
| Club Arena `tsc --noEmit` | clean |

## 9. Two unrelated failures in that health report

Surfaced while confirming the XP check flipped. Both pre-date this work and are
in Home Games, not the club system:

- **`home_members_host_sees_group policy non-recursive` — ✗**
- **`7 fn_home_* seat RPCs have defense-in-depth guard` — 0 / 7**, expected 7.

Named here rather than fixed, because they are a different subsystem and
guessing at seat-RPC auth in an XP cleanup is how unrelated things break.

## 10. An operational problem worth naming

**Work is being lost to force-pushes on Club Arena `main`.** The XP commit
`ae8a7ee94` was pushed, synced into a bundle, and then **overwritten** —
`reputation_xp` was back in three files and the guard test was gone. It had to
be cherry-picked onto the new head and pushed again.

Separately, the sync workflow was starved for over half an hour earlier today:
pushes land every 2–4 minutes and `cancel-in-progress: true` kills each ~6
minute run before it finishes. Another agent has since pushed a fix for the
concurrency half. The force-push half is still open.
