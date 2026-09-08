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

---

# RESOLVED, same day - and it was far bigger than the two rewards above

Dan, 2026-09-08: "FIND THOSE AND ANY OTHER REWARDS THAT ARE SUPPOSED TO BE
GRANTED THAT AREN'T AND MAKE SURE THEY ARE ALL ENABLED AND USERS GET REWARDED
WHEN THEY DO IT (HORSES INCLUDED) MAKE SURE THE ANTI FRAMING LIMITATIONS ARE
ENABLED. (DO NOT BACK PAY, JUST FIX IT AND MAKE IT FUNCTIONAL FOR ALL OF THEM)"

That instruction settles the RULE 10.6 question this record was opened on, so
the work was done rather than filed.

## The real number: 21 of 26, not 2

A full sweep of every key in `src/config/diamondRewards.js` against
`diamond_transactions` across ALL time. Everything that has ever paid:

    daily_login       212 awards   17 players   6,448 diamonds
    easter_egg          7            5          1,310
    profile_pic         2            2             20
    profile_complete    1            1             50
    video_favorite      1            1              1

Every other standard reward: zero, for the life of the platform.

## The backend was never broken

`diamond_reward_catalog` holds every action_key with `active = true`, and
`award_diamonds_v2` pays correctly - a rolled-back probe returned reason `ok`,
awarded 1 for reaction and 10 for social_post and share_content, with
`daily_remaining` and `monthly_remaining` decrementing. It also already enforces
the whole anti-farming set: `action_limit`, `already_claimed`, `duplicate`,
`daily_cap`, `monthly_cap`, velocity, and a `diamond_issuance_frozen` switch.

The single cause was that nothing reachable called it. `SocialService.js` holds
the reaction/comment/follow claims and its nine importers are every one of them
unreachable. `follow.js` additionally read `social_connections` - 0 rows, no
writer, the data moved to `social_follows` in this very audit's backfill and the
endpoint was never updated.

## Fixed at the database, because of horses

Four write paths, only one a browser: the feed writing straight to the tables,
`/api/social/interactions`, the reels page, and `HorseSocialEngine`. A
client-side claim can never cover the last one, and RULE 10.5 says horses earn
exactly what a human earns. Seven AFTER INSERT triggers, on `social_posts`,
`social_comments`, `social_likes`, `social_interactions`, `social_follows`,
`share_events`, `daily_trivia_plays`.

Migrations `20260908180000_social_rewards_are_actually_awarded.sql` and
`20260908181000_share_and_trivia_rewards_are_awarded.sql`, both applied with
pre-flight and post-apply assertions passing, both registered in
`supabase_migrations.schema_migrations`.

## Nothing pays twice

Each trigger's reference id is byte-identical to the one its HTTP endpoint
already builds. Proved: an endpoint call after a trigger returns reason
`duplicate`, awarded 0.

## Anti-farming, and two guards the schema already had

In the triggers: 24h account age failing CLOSED on a profile that cannot be
found, no earning from your own post, no self-follow, content floors of 20 for a
post and 10 for a comment (the endpoints' own constants), and keys on
(user, target) so unlike-then-relike cannot be farmed. Two more turned out to be
enforced in the schema, which is stronger than any check I would have written:
`social_likes` is UNIQUE on `(post_id, user_id, reaction_type)` and
`daily_trivia_plays` on `(user_id, played_date)`.

## Horses, proved rather than assumed

All 1,000 horse profiles exist and are past the 24h gate; none is missing
`created_at`. A rolled-back probe: a horse earns for a like, a human earns for
the same like, and **the amounts are equal**; a horse earns for a post and for a
comment.

## Verification

22 rolled-back probes, all PASS, in three batches (social, share/trivia,
horse-vs-human). Table counts before and after are identical - nothing was
committed. `__tests__/an-advertised-reward-is-actually-payable.law.test.mjs`
is registered in CHECK 8 (1355 -> 1364) and was proved red five ways. One of
those five found a genuine hole in the law: it matched a trigger name INSIDE a
comment, so a commented-out trigger passed. It strips SQL comments now, with a
control that fails if the stripper stops working.

No back-pay. AFTER INSERT only; no historical row is revisited.

## Still not paying, and why - for a future pass

These are outside the social surface and were NOT changed here:

- `first_training_session`, `training_level_complete` - referenced only in
  tests. No award path exists anywhere in the codebase.
- `gto_chart_study` - a constant in `DiamondRewardService.ts`, no call site.
- `venue_review`, `video_watch`, `video_favorite` - endpoints ARE reachable and
  correct; their source tables (`venue_reviews`, `video_watch_history`,
  `video_favorites`) hold 0 rows, so there is nothing to pay yet. These will pay
  the first time somebody uses the feature.
- `hand_of_the_day`, `vip_stipend`, `email_verified`, `phone_verified`,
  `first_purchase`, `referral_*` - hooks exist (`pages/api/training/
  hand-of-the-day.js`, the `vip-stipend` cron, `claim.js`, `auth/callback.js`)
  and were not exercised in this pass.

The first three are the real gaps and belong to the training domain.
