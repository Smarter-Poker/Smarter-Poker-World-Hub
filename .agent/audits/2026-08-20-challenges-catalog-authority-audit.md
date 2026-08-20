# Daily Challenges: line-by-line audit, catalog authority, visible progress

**Date:** 2026-08-20
**Repo:** `Smarter-Poker-Club-Arena` (+ two migrations applied to production Supabase)
**Status:** applied to production and verified live
**Commit:** `11409fff0` on `main`

A full line-by-line pass over `DailyChallengesPage.tsx`, `DailyChallengeService.ts`,
`AchievementTriggerService.ts`, the page CSS, every challenge RPC body read out of
the live database, and the wiring between them (routes, tiles, bus events,
progress writers). Everything below is a defect confirmed against production or a
gap the feature genuinely had — not a style preference.

---

## 1. The client and the server each had their own copy of the numbers

The most important find, because it is a *class* of bug rather than one instance.

Every card was rendered from `CHALLENGE_POOL` in the client bundle — name,
description, requirement, chip reward, diamond reward. `claim_daily_challenge`
pays from `daily_challenge_catalog` and deliberately ignores anything the client
sends. Two copies of the same numbers, no mechanism keeping them equal.

The failure mode is not cosmetic. It is a card that promises 7 diamonds sitting
next to a balance that received 3 — which reads as the game cheating, and is the
single fastest way to lose trust in a rewards system. It had **already happened
once**: challenge ids were added to the client pool that the catalog had never
heard of, so the claim RPC rejected every one of them and those challenges were
unclaimable by construction. That was caught by luck, before any row was
assigned.

Fixed by making the catalog authoritative for everything displayed:

- `daily_challenge_catalog` gained `name` and `description`, populated for all
  34 rows **generated from the TypeScript source**, not retyped, then set
  `NOT NULL`.
- New `get_or_assign_challenges(daily_key, ids, weekly_key, ids, monthly_key, ids)`
  assigns any missing period and returns all three tiers **joined to the
  catalog**. The displayed reward is now by construction the one the claim RPC
  will honour.
- The join is an INNER join on purpose: a row whose `challenge_id` the catalog
  does not know is now *hidden* rather than rendered as a blank card the player
  can never claim.
- It reuses `assign_user_challenges` rather than reimplementing its catalog and
  period-key validation, because a second copy of those checks is the same bug
  again one level down.

Side benefit: painting the page went from **up to six round trips** (a SELECT
plus a possible assign RPC per tier) to **one**.

The local pools survive only to *choose* which ids to assign. The old per-tier
path is kept as a fallback for a database without the RPC, and is marked as the
degraded mode it is.

## 2. Progress was invisible until it was finished

`bump_challenge_progress` advanced progress correctly but its final
`WHERE up.completed = true` discarded every row that moved without finishing.
Everything downstream keys off that return, so:

- A challenges tab open beside the table **never ticked**. Bars sat still for an
  entire session and only jumped on remount. That reads as "this feature is
  broken", not as "you are three hands away" — the exact opposite of what a
  progress bar is for.
- The caller could not distinguish "matched nothing" from "moved but not done",
  so there was no signal to refresh on.

The declared return type already had `newly_completed`; the filter threw it
away. Now every moved row is returned and callers filter. The old contract is a
strict subset of the new one, so a client mid-rollout over-refreshes rather than
mis-celebrating.

## 3. Finishing a challenge was completely silent

If `/challenges` was not open, completing one produced **no feedback at all** —
no toast, no badge, nothing. The reward landed in a list the player had no
reason to visit. A daily loop that never announces its own payoff does not loop.

Completions now emit `SHOW_TOAST`, which `BusToastBridge` (already mounted at the
app root) routes to the live toast provider — so it works from a table, the
lobby or a tournament screen without any of them knowing challenges exist. The
message names what was won and that it is **waiting to be claimed**; "challenge
complete" alone gives the player nothing to act on. Several finishing at once
(common on the hand that completes a daily and its weekly parent) collapse into
one line rather than stacking toasts over the table.

## 4. A declined claim celebrated a reward of nothing

`claimChallenge` swallowed an "already claimed" *raise* from older server
versions and returned `data: null`, so every field fell back to `0`/`false`. The
page took the "something was paid" branch and rendered the full celebration
overlay announcing an empty reward — then marked the card claimed locally,
hiding the Claim button for a reward the player never received.

Now: celebrate only on `claimed`, report a duplicate as a duplicate, and on a
decline re-read the truth from the server instead of guessing.

## 5. `bump_challenge_progress` existed only in the live database

No migration anywhere in the repo. It carries **all five** hand-driven challenge
types. A fresh environment provisioned from `supabase/migrations` would have had
`hands_played`, `hands_won`, `showdowns`, `big_pots` and `strong_hands` silently
no-op — the client reports the error and swallows it, so challenges would simply
never move and nothing would say why. Now recorded, with assertions.

## 6. Two challenge types nothing could ever increment

`login_streak` and `rakeback_earned` were in the `ChallengeType` union with **no
writer anywhere in the app**. No pool used them yet, so nothing was broken — but
any challenge declared with either would have been assigned, displayed, and then
sat at 0/N forever, with nothing to tell the player it was impossible rather
than merely hard. Removed; add the type back in the same change that adds its
writer.

## 7. The test that should have caught #6 had itself gone stale

`should have valid challenge types` hand-copied the type list. `big_pots` and
`strong_hands` shipped to production while that copy still predated them — so the
suite was **red on correct code**, and would have passed a type nobody could
increment. A test asserting the wrong thing is worse than no test, because it is
trusted.

`ChallengeType` is now derived from a single exported `CHALLENGE_TYPES` const, and
a new test fails if any pool type — or any declared type — has no writer in the
app.

## 8. Smaller confirmed defects

- Card-flash timers were cleared in the **bus-subscription** cleanup, which
  re-runs whenever `userId` settles. A claim made around that moment had its
  flash cancelled and its id stranded in `celebratingIds`. Separated into an
  unmount-only effect.
- The "ready to claim" bar counted **chips only** — it undersold every unclaimed
  reward on a page whose headline currency is diamonds. There was also no
  lifetime diamond figure anywhere.
- Celebration overlay had no `aria-modal`, no Escape, no focus, and announced
  "you earned 0 diamonds" for chip-only rewards. Tabs had no `role`/`aria-selected`.
- Dead code: unused `WalletService` import, `simpleHash` (superseded by
  `mixedHash`, zero call sites).

## 9. Added

- **Claim All.** Sequential rather than `Promise.all` — each claim credits a
  wallet, and five concurrent writes contend on the same `profiles` row for no
  user-visible gain. Shows one combined celebration and reports partial failure
  honestly instead of letting a silent skip look like a reward never owed.
- Diamonds surfaced where they were missing (lifetime tile, claim bar).
- Summary goes 2x2 at 375px; four tiles across a phone truncates both the labels
  and any six-figure total.

---

## Verification

- `tsc --noEmit` clean; 24 unit tests pass (one was failing **before** this work).
- Both migrations carry post-apply assertions that abort on their own
  assumptions. They earned it again here: the partial-progress and
  clamp-at-requirement assertions are what proved #2 was actually fixed rather
  than merely edited.
- `get_or_assign_challenges` exercised against **production** as a real
  authenticated user (JWT claims set, role `authenticated`): 10 rows across three
  tiers, every one consistent with the catalog on name, requirement, chip reward
  and diamond reward.
- Push verified by content — grepping `origin/main` for each new symbol — not by
  assuming the commit contained the edits.

## Not done, and why

**No physical device push test.** `push_subscriptions` still has 0 rows, so
encrypted send, service-worker display and the receipt beacon remain unexercised
on real hardware. Deferred at Dan's request. This is the one part of the
notification stack that no amount of server-side verification can stand in for.
