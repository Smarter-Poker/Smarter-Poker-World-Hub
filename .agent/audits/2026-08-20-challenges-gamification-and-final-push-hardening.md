# Challenges: gamification build-out + final push hardening

**Date:** 2026-08-20
**Repos:** `Smarter-Poker-Club-Arena` (challenges), `Smarter-Poker-World-Hub` (push)
**Status:** applied to production and verified live

Covers the work that no other audit records: the hot-path RPC, streak insurance,
skill challenges, the push endpoint-takeover fix, the dead-code removal, and the
migration replay hazard. The digest/funnel work is written up separately in
`2026-08-19-webpush-vapid-clone.md` (Round 6).

---

## 1. Hot path: one RPC per hand instead of ~11 round trips

`onHandComplete` fired up to three `updateProgress()` calls (hands_played,
hands_won, showdowns). **Each** did its own
`SELECT ... WHERE user_id = ? AND assigned_date IN (3 keys)` and then one
`increment_challenge_progress` RPC **per matching row** — roughly 3 selects and
8 RPCs, per player, per hand, at table speed.

`bump_challenge_progress(p_user_id, p_amounts jsonb, p_daily_key, p_weekly_key,
p_monthly_key)` does the whole thing in one statement: it joins the user's live
rows for the three period keys against `daily_challenge_catalog`, increments
everything matching the supplied `{type: amount}` map, clamps at the
requirement, and returns **only** the challenges that crossed into completion —
so the client can fire its toast without a follow-up read.

Requirements always come from the catalog, never the caller. Post-apply
assertions cover: partial progress, a non-matching type not moving the counter,
overshoot clamping, completion reported exactly once, and a completed row not
being reported again (which would produce repeat toasts and repeat claims).

## 2. Streak insurance

A streak that resets to zero the first day someone is ill, travelling or simply
busy is a punishment mechanic: the player who cared most loses the most, and the
usual response is to stop trying rather than start again.

- Freezes are **earned**, not bought — one per 7 days of streak, capped at 3.
- A freeze covers exactly **one** missed day, and only once the streak is worth
  protecting (≥ 3 days). A two-day gap always breaks.
- The covered day **counts** toward the streak. Telling someone their streak was
  protected and then showing a smaller number reads as the protection failing.
- Consumption is recorded per **date** in `frozen_dates`, so a day can never be
  covered twice and repeat reads are idempotent.

The streak stays **derived** from `user_daily_challenges`; `challenge_streak_state`
records only the exceptions, so there is no second source of truth to drift.
Freezes are currency, so the table is readable but **not writable** by clients —
a client that can UPDATE it mints infinite streak protection.

**The assertions earned their keep here.** Two real bugs were caught before
shipping: a freeze being spent when no day had actually been missed, and the
covered day not counting toward the total. Both were mine.

## 3. Skill challenges

Every challenge until now measured VOLUME — play N hands, win N, N showdowns,
N tournaments. That rewards sitting at a table rather than playing well, and it
reads identically every day; only the number changed.

Two new types, both driven by data `onHandComplete` **already received and was
discarding**, so nothing in the engine needed instrumenting:

| type | qualifies when | note |
|---|---|---|
| `big_pots` | a pot of `BIG_POT_MIN` (500) or more, **won** | being in a big pot you lost is not an achievement |
| `strong_hands` | a straight or better | rewards the hand itself, so a cold run on volume can still finish a day |

`handRank` arrives free-form from the engine — `'Full House'`, `'full_house'`
and `'FULL HOUSE'` have all appeared — so `isStrongHand` matches a normalised
form. An exact-equality check would have shipped a challenge whose bar could
never move, which is worse than not shipping it.

`scripts/verify-challenge-hand-qualifiers.mjs` covers 37 cases including the
`'Trips'` / `'Set'` false-positive traps (three of a kind must NOT qualify) and
the lost-big-pot case. Simulating 14 days of the seeded rotation, a skill
challenge appears on 13 of them.

The qualifying threshold lives in the **type**, not the requirement, because
progress is counted per type: "win 3 pots of 500+" is expressible; a separate
5000+ tier would need its own type.

## 4. Push: endpoint takeover (security)

"One account per device" deactivated every OTHER user's row for an endpoint on
the caller's word alone. Any authenticated user who learned someone's endpoint
could therefore **silence that device**, and the victim would appear on
`/admin/push-health` as `subscription_dead` as though they had broken it
themselves.

The browser only ever hands the `auth` secret to the origin that owns a
subscription, so it now has to **match** (constant-time) before an incumbent is
displaced; a mismatch returns 409 and the incumbent is left alone. The displaced
account also receives an in-app notice, because being silently unsubscribed is
indistinguishable from push being broken — which is the exact confusion this
stack exists to eliminate.

## 5. Migration replay hazard (the most dangerous find)

`supabase/migrations` still contained the **older, vulnerable** bodies:

- `20260312005_lucky_wheel_and_missions.sql` — a `claim_daily_challenge` with no
  catalog validation and no `auth.uid()` check.
- `20260322_atomic_challenge_progress.sql` — an `increment_challenge_progress`
  that **trusts the caller's `p_requirement`**, so passing `1` completes any
  challenge instantly.

Replaying the directory onto a fresh branch DB therefore ended with the
exploitable versions installed, silently undoing the 2026-08-19 chip-minting
lockdown. Nothing would have reported it.

Migrations replay in filename order, so
`20260820010000_challenge_rpcs_current_state.sql` — dated after them — captures
the current production definitions (read out with `pg_get_functiondef`, not
retyped) and wins on replay. It asserts that the catalog lookup is present, that
the atomic credit path is used, and that `user_daily_challenges` still has no
write grants for `authenticated`.

## 6. Dead code

- `MissionsPanel`, `DailyChallengesWidget` and the presentational
  `DailyChallenges` it wrapped: orphaned when `/challenges` became the single
  surface. ~900 lines of near-duplicate load and claim logic sitting in the
  bundle waiting for someone to wire it back up and reintroduce the three-way
  divergence. Verified zero real importers before deleting — the only remaining
  textual matches are the comments explaining what used to be there.
- `src/lib/pushAlerts.sendPushNotification` was `async () => {}`. A stub that
  looks like a feature is worse than a missing one: `pages/api/venues` called it
  for the geofence check-in prompt, and every one of those was discarded with no
  outbox row, no log and no error.
- `NotificationPrompt.jsx` — never mounted; `GlobalNotificationPrompt` is live.
- Redundant `trg_sync_notification_read` on `notifications`. The surviving
  trigger is a strict superset (handles INSERT, and owns `read_at`). Two
  triggers writing the same columns is the shape that produces a bug nobody can
  reproduce after someone edits one of them. Assertions verified all four
  propagation paths still settle: insert, `read`, `is_read`, `read_at`.

## 7. A bug of mine caught by another agent

The first digest implementation ran **before** the preference gate and marked
absorbed rows `digested_into:<carrier>` immediately. If the carrier was then
suppressed — quiet hours, opt-out, daily cap — the absorbed rows were already
retired, so the whole burst was lost rather than one push being sent. A
concurrent agent restructured it into an eligibility pre-pass (recipient,
staleness, gate) followed by a digest over survivors only. Verified in
`origin/main`: `gateDecision` now runs at line ~244, digest grouping at ~280.

Worth recording because it is the failure mode this stack is supposed to
prevent — a notification that silently never arrives — reintroduced by an
optimisation intended to reduce noise.

---

## Verification performed

- Post-apply assertions inside every migration (they caught 3 real bugs).
- `scripts/verify-challenge-hand-qualifiers.mjs` — 37 cases, passing.
- `scripts/verify-push-digest.mjs` — 15 cases, passing.
- `scripts/verify-push-endpoint-guard.mjs` — 22 cases, passing.
- `npx tsc --noEmit` clean in Club Arena; `npx next build` clean in World Hub.
- Live production: fetched the deployed arena bundle and confirmed it contains
  `Big Score` and `get_challenge_streak`.
- `push-health` reports `ok: true, problems: []`; dispatch cron firing every minute.

## Still not verifiable without hardware

`push_subscriptions` remains **0 rows**. Everything past "look up the user's
subscriptions" — the encrypted send, the service-worker display, the receipt
beacon — needs a real browser to grant permission and enrol. On iPhone that must
be the Home Screen PWA; iOS does not expose the Push API in a Safari tab.
