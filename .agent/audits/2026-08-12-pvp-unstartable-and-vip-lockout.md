# 2026-08-12 — 1v1 unstartable + 470 VIPs locked out (FIXED, verified live)

Dan reported: "nothing even happens when you click on the 1v1 or any of the
other games." He was right, and it was three separate defects stacked on top
of each other. All three are fixed and verified in a real signed-in browser on
production.

Clicking is fine, incidentally — all 13 lobby cards were real-clicked at 375px
and every one navigated correctly. Everything below is downstream of the click.

---

## Defect 1 — 470 of 473 VIP accounts read as NOT VIP

`/api/vip/check-status` is the single truth source for every VIP gate. It
requires `is_vip = true` **AND** (`vip_tier = 'lifetime'` OR `vip_expires_at >
now()`). That hardening was correct — it closed a hole where expired trials
kept VIP forever. But the Stripe webhook used to set `is_vip = true` without
writing tier or expiry (since fixed), so **470 of 473** VIP rows carried
`is_vip = true` with BOTH columns NULL and answered `isVip: false`.

Meanwhile `/api/user/get-header-stats` reads `profiles.is_vip` directly and
showed those same users a VIP badge. Two sources of truth, disagreeing.

Consequences, both reproduced on production:

- `/hub/trivia/pvp` rendered "Premium Feature — PvP Battle Mode is a premium
  feature" on stake selection and fired **no** PvP API call at all.
- `StrategyTrivia` took its `if (!isVip && entryCost > 0)` branch and charged
  10 diamonds per game while the Diamond Cost modal promises "VIP Members Play
  FREE — Unlimited Games, No Diamond Cost". Four such `game_cost` rows landed
  in `diamond_transactions`.

**Fix:** migration `20260812230000_backfill_lifetime_vip_for_legacy_grants`.
Owner decision (Dan, in-session): these 470 are early users, personal friends
and horses — grant them lifetime VIP. Prior state for every touched row is
preserved in `public.vip_backfill_20260812_backup` for exact rollback. The 3
accounts with a real tier/expiry were untouched; no non-VIP account was
granted anything.

Verified: `check-status` now returns `{"isVip":true,"vipTier":"lifetime"}`,
0 stranded rows remain, 470 backup rows written, paywall gone.

### Related, NOT fixed here
`useVIP` reported ready ~1s before the VIP answer landed (`initializing` went
false while `isVip` was still false), so a fast click could take the charge
branch even for a correctly-configured VIP. Fixed separately in commit
`4cdd9d26` by folding "signed in but VIP unknown" into the initializing flag
the hook reports. That is a genuine second defect but it was NOT the cause of
the lockout — the server really was answering `isVip: false`.

---

## Defect 2 — `trivia_pvp_matches` had no INSERT/UPDATE grant

With the paywall gone, stake selection failed with:

    [PVP] handleHorseMatch failed (nothing charged):
    {code: 42501, message: permission denied for table trivia_pvp_matches}

The table has RLS enabled with 5 policies, two of them written specifically
for client access — `"Users can insert matches"` (WITH CHECK `auth.uid() =
player1_id OR player2_id`) and `"Users can update their matches"`. But
`authenticated` held only `SELECT` at the table level, and an RLS policy is
dead weight without the underlying GRANT. Both policies were unreachable.

It was the only table in the PvP path in that state — `trivia_pvp_queue`,
`trivia_sessions` and `trivia_scores` all carry SELECT/INSERT/UPDATE/DELETE
for `authenticated`. Collateral damage from a blanket hardening pass, not a
deliberate lockdown.

**Fix:** migration
`20260812232000_restore_authenticated_insert_update_on_trivia_pvp_matches`.
INSERT + UPDATE to `authenticated` only; DELETE deliberately not granted;
`anon` gets nothing. Safe because settlement never trusts this table —
`pvp-settle-match.js` reads both players' graded correct-counts off their
`trivia_sessions` rows and moves diamonds with the service role.

---

## Defect 3 — a legacy trigger clobbered the repurposed session-link columns

The real one. Match creation then succeeded, but `session-start` returned
`409 session_link_invalid` **every time**.

Two designs collided on the same two columns:

- `fn_trivia_pvp_match_sync_columns` treated `challenger_id` / `opponent_id`
  as legacy **aliases** of `player1_id` / `player2_id` and mirrored them:
  `NEW.challenger_id := COALESCE(NEW.challenger_id, NEW.player1_id)`.
- `session-start` **repurposed** those columns as **session links** —
  `challenger_id` holds player1's `trivia_sessions.id` (`SESSION_LINK_COLUMNS`)
  — and branches on `if (match[linkCol]) return servePvpSession(...)`.

So the trigger stamped a *user* id into the session-link column on every
INSERT, `session-start` saw a non-null link, took the RESUME path, looked for
a `trivia_sessions` row whose id was a user id, found nothing, and 409'd.
**No ordering of events avoided this. PvP was structurally unstartable for
every user, always.**

The UPDATE half was worse and had simply never been reached: when
`session-start` writes the real session uuid into `challenger_id`, the trigger
mirrored it straight back into `player1_id`, replacing a participant with a
session uuid and corrupting settlement.

`pvp-settle-match.js` already documents these columns as session links ("a
random session uuid never equals a user id"), so the API layer was the
authority and the trigger was the stale half.

**Fix:** migration
`20260812234500_stop_pvp_trigger_clobbering_repurposed_session_link_columns`.
The trigger now mirrors only the *score* aliases, which are still genuine
aliases, and never reads or writes the link columns. Existing rows whose link
columns still held a user id were nulled so previously stuck matches can start.

---

## Verification — live, production

    POST /api/trivia/session-start -> 200
    {"success":true,"sessionId":"fff6e915-...","matchId":"50e99d74-...",
     "mode":"pvp","resumed":false,"stake":10,...}

Battle screen renders: `kingfish 0 VS diamond dan ? — THINKING — 37s —
Question 1 — "In what year did Full Tilt Poker launch..."` with four options.
Balance moved 495477 -> 495467, i.e. the 10-diamond **stake** was taken, which
is correct: a PvP stake is a wager, not an entry fee, and VIP does not waive it.

This is the first time a PvP match has ever started on this platform.

---

## Still open

- **`Question 1 of 200`** on the PvP battle screen. Should almost certainly be
  20. Cosmetic but confusing; not fixed here.
- **`object-fit: fill` on the lobby cards.** Currently renders correctly
  (stretch measured 1.000 at every width 320-1440) because Antigravity replaced
  the artwork at 22:50 UTC with correctly-proportioned 896x1200 files. Before
  that the art was 1024x1024 square in 3:4 boxes — a 33% vertical stretch,
  which is what Dan was seeing. `fill` will distort again the moment art or box
  ratio changes; it should be `cover`. Note the PWA service worker caches
  images `CacheFirst` for 30 days, so anyone who loaded the old art keeps
  seeing it until that entry expires or the cache is busted.
- **React error #425** (hydration mismatch) fires on every trivia page
  navigation. Earlier audits dismissed this as "known noise"; it is not — a
  mismatch makes React discard the server HTML and re-render, which is a real
  source of flashing and layout jank.
- **18 profiles have `is_vip = false` but a non-null `vip_tier`.** Pre-existing,
  not touched by any migration here. Worth a look.
- **PvP matchmaking race** — simultaneous joins can still create two match
  rows. Needs the pairing RPC under a unique constraint.
- **Abandoned sessions never expire.** 19 `trivia_sessions` rows sit `open`
  indefinitely, 7 of them created by this session's test runs. No escrow is
  held so there is no diamond leak, but "abandoned" and "in progress" are
  indistinguishable in the data.
