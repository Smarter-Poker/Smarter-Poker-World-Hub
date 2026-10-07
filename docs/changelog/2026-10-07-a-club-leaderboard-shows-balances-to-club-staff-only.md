# 2026-10-07 - a club leaderboard shows members' balances to club staff only

Dan's 2026-09-30 item "public profile fields", World Hub side: a server route
never hands a stranger another person's private profile fields. Ruling 25
(Club Arena `docs/DIAMOND-RULINGS.md`): a stranger sees a username or display
name and an avatar - never a legal name, email, phone, Diamond or chip balance.

`pages/api/club-arena/club-leaderboard.js` runs as the service role, so the
`club_members` row policy (a member reads their own row; club staff read the
roster) never applied to it. It answered any member of a club with every
other member's chip balance (`chips`), 7-day chip volume (`volume`), chip
transaction count (`activity`) and net chip flow (`big_winners`). Nothing in
either repository calls it, but it was deployed and reachable.

It now asks the database the question the row policy asks,
`is_club_admin(p_club_id, p_user_id)` - the club owner, or an active
owner/co-owner/admin, never in a Diamond club - and refuses anything but a
true answer (403; 503 when the check itself fails). Decided by Claude on Dan's
delegation (2026-09-30, "these are all for you to decide not me").

Regression protection: rule 3 of
`__tests__/a-server-route-hands-a-stranger-no-private-field.law.test.mjs`.
Every route under `pages/api` or `src/lib/server` that reads
`club_members.chip_balance` must be listed in `WALLET_REVIEWED` with the
reason the balance never reaches a fellow member (17 routes reviewed: self,
club staff, agent downline, operator console, or a union's own wallet), and
the leaderboard must ask the staff rule before it reads a balance or a flow.

## Coverage of the 2026-10-07 sweep (current main)

- Every `profiles` read in `pages/api`, `src/lib/server`, server-rendered
  pages and service-role libraries, including foreign-key embeds spelled by
  column name, bare `select()`, `select(variable)`, hand-built REST URLs and
  `auth.admin` lookups: none returns another person's private column to
  anyone but that person or gated staff (PR #2148 and its follow-ups fixed
  the rest on 2026-10-06; the staff gates it relies on were re-read).
- All 320 RPCs those routes call: only staff-gated or self functions return
  a legal name, email or phone.
- `fn_hg_caller_display_name` is safe: `fn_arena_name` uses the legal name
  only to suppress a display name that copies it, and browser roles hold no
  grant on the legal-name columns. `get_visible_live_streams` is safe: its
  `broadcaster_full_name` column is always `NULL`. No migration was needed.
