# The social diamond rewards have never paid

**Date:** 2026-09-08
**Status:** REPORTED, NOT FIXED. The fix issues currency going forward, which
section 10.6 reserves for Dan. Everything below is read from production rows.

---

## The finding

The diamond store shows every reward in `src/config/diamondRewards.js`, and
`/api/rewards/progress` builds its tracker from the same catalog. So a player
is shown, today:

| reward | copy shown to the player | value |
|---|---|---|
| `social_post` | "Post a hand, a result, or a thought to the feed. Two posts per day pay out." | 10 diamonds x 2/day |
| `share_content` | "Share a post, score card, or hand outside the app. Two shares per day pay out." | 10 diamonds x 2/day |

Neither has ever paid. Not once.

```
diamond_transactions, last 180 days, grouped by transaction_type:
  social_post      0 rows
  share_content    0 rows
  reaction         0 rows
  strategy_comment 0 rows
  follow_player    0 rows
```

`award_diamonds_v2` writes `p_action_key` into both `transaction_type` and
`type`, so those zeros are the real thing and not a labelling mismatch.

Against that, the same 30 days of activity:

```
posts     471  by   1 actor
likes    3832  by 560 actors
comments 2418  by 540 actors
follows   432  by 432 actors
```

6,682 reward-eligible social actions, and not one diamond issued for any of
them.

## Why - two separate causes

**1. `social_post` and `share_content` have no reachable caller.**

`/api/rewards/share` is called from exactly two places, and both are
unreachable from any page:

```
src/components/social/EnhancedSpatialFeed.jsx:431   unreachable
src/components/social/SpatialFeed.jsx:256           unreachable
```

`/api/rewards/social-post` is called from three, of which two are unreachable
and the third is the sandbox:

```
src/components/social/EnhancedPostCreator.jsx:856   unreachable
src/components/social/PostCreator.jsx:97            unreachable
src/components/sandbox/SandboxComponents.jsx:1202   /hub/personal-assistant/sandbox only
```

The live feed page, `pages/hub/social-media/index.js`, calls neither. It
contains no `claimReward` at all. So publishing a post from the real composer
awards nothing, and sharing awards nothing.

`REWARDS-PAYOUT-AUDIT.md` lines 54-55 cite exactly these call sites as the
emitters and mark both rewards **PAYS**. The citation was accurate when it was
written and the endpoints do work; what is missing is anything reachable that
calls them.

**2. `reaction` is gated on the wrong table.**

`pages/api/rewards/reaction.js:200` checks eligibility against
`social_interactions`, and returns `not_eligible` when it finds no row:

```sql
social_interactions      788 rows total,     520 in the last 30 days
social_likes          31,885 rows total,   3,832 in the last 30 days
```

Likes are written to `social_likes`. The reward endpoint looks in
`social_interactions`. `SocialService.js:432` does call the endpoint after a
like, so this path is wired - it just cannot find the row it needs.

That accounts for the like reward. It does **not** explain why the 520 rows
that *are* in `social_interactions` still paid nothing, nor why comment and
follow paid nothing. Those need a trace with logging that I have not done, and
I would rather say so than guess.

## Why this was not fixed here

Section 10.6 grants agents authority to settle **what a past event owes**. It
reserves to Dan "anything that sets what players are owed in FUTURE events".
Wiring these emitters is the second kind: it starts issuing currency at a rate
that is currently zero.

The size is not small. At the observed actor count, `social_post` plus
`share_content` alone is up to 20 + 20 diamonds per player per day; across the
~560 actors seen in 30 days that is a ceiling near 22,000 diamonds a day, drawn
against `issuance_class = 'promo_budget'`. Section 10.5 also binds: horses are
players, so horses earn on exactly the same terms, and horses are the bulk of
this activity.

Back-pay is a separate question and is not clean: the per-day caps mean there is
no way to reconstruct what any individual would have earned, only what they
could have.

## What Dan needs to decide

1. Turn the two emitters on, or retire the two rewards from the catalog so the
   store stops advertising them. Today's state - advertised, tracked, never
   paid - is the one option that is wrong either way.
2. If on: accept the issuance rate above, for humans and horses alike.
3. Whether anything is owed for the past.

## What can be fixed without that decision

The `reaction.js` table mismatch is a defect with no policy content: the
endpoint should read the table likes are actually written to. It still pays
nothing until item 1 is settled for the wider category, so it was left with
this record rather than changed in isolation.

## Method

- Reachability by import closure from every file under `pages/`, following
  static imports, `require`, and `import()` literals, with two known-live
  controls (`Reels.jsx`, `ReelsFeedCarousel.jsx`) asserted to classify live.
- The one non-literal dynamic import in the repo is in `src/lib/scrapers/`
  and is unrelated, so the closure is not defeated.
- All counts above are `select` only. Nothing was written.
