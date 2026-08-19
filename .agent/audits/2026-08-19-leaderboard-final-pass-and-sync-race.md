# 2026-08-19 — Leaderboard final pass + a second sync race worth fixing

## Vercel account
Confirmed operating on the right account throughout: the `VERCEL_TOKEN` in
`.env.local` belongs to `admin@smarter.poker`, its only team is
**smarter-poker** (`team_SVD8r7AOPH065G3usBxVvrBc`), and
`scripts/check-vercel-project-uniqueness.mjs` reports exactly one project
(`hub-vanguard`) linked to the repo — the duplicate disconnected earlier today
has stayed disconnected.

## Pipeline survived the day
Several agents landed migrations on the same tables after the leaderboard work.
Re-verified afterwards: the `hand_history_fold_stats` trigger, all leaderboard
RPCs and the fail-closed loss gate in `promo_apply_playthrough` are intact and
accruing (+267 seat-hands with matching win/loss deltas over a 25s sample).

A **third** trigger now exists on `hand_history`
(`trg_hand_history_club_member_stats`, the club dashboard work). Checked: it
writes `club_hand_daily` / `club_member_daily_stats` / `club_member_table_state`
and never touches `player_stats`, so there is no double-count.

`TablePage`'s in-table leaderboard calls `getClubLeaderboard('profit')` and maps
`entry.value`, so it inherited the real-profit fix with no change needed.

## Shipped in this pass
- Podium places lacked what the list rows already had: keyboard operability,
  hand-count context, unranked marker. Now `role=button` + `tabIndex` +
  Enter/Space with the same context line.
- Players ranked below the visible cut saw a rank number in the sticky card and
  no row to place it against. Their own row is now pinned under a "Your
  position" divider.
- CSV export carries a Hands column — an exported ROI board without volume is
  uninterpretable.
- Union board brought to parity: `fn_union_leaderboard_period_v2`
  (migration 20260819k). v1 still ordered ROI by profit and read the
  rakeback-owned `hands_played`. Unreferenced by the client today, so this is
  pre-emptive; `getUnionLeaderboard` now calls v2 and the dead client-side
  `union_clubs` query was removed.

Verified live on smarter.poker: served page chunk carries pinned-self / Your
position / entry-subline / rank-own-value / rank-offlist / unranked / Hands
column; served service chunk has `vpip*100` and all four RPCs. Exercised
through a real logged-in session: club ROI board strictly descending
(25.94 / 24.04 / 21.49) with real hand counts, union board returning rows, and
`fn_user_rank_period` returning rank 1 of 575.

## A SECOND sync race — this one loses correct output
Already documented: two CI `build-for-world-hub` runs can publish out of order.
This pass found a worse variant.

`b83e90ffc "chore(ca): sync build cf40c23d0..."` claims to be a sync of my CA
commit, but the `LeaderboardPage` chunk inside it does **not** contain that
commit's code. Note the message prefix: CI writes
`chore(club-arena): sync build <sha>`; this one is `chore(ca):`. It was a
**manual local `sync-club-arena.sh` run from a stale working copy**, labelled
with the current CA sha, which overwrote the CI's correct build for the same
sha. Production then served the stale bundle until the next sync replaced it.

So there are two distinct ways World Hub can end up with an arena bundle that
does not match the CA commit it claims:
1. two CI runs finishing out of order (last writer wins), and
2. a local sync from a working copy that is behind `origin/main`, which is
   indistinguishable from a good sync by commit message alone.

Suggested guard for `scripts/sync-club-arena.sh`: refuse to publish unless the
local CA HEAD equals `origin/main`, and stamp the built CA sha into a file in
`public/hub/club-arena/` so a bundle can be checked against the commit it
claims. Verifying "did my code actually ship" currently requires grepping the
built chunk, which is how both of these were caught.
