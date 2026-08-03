# REWARDS PAYOUT AUDIT — "does every way to earn actually pay?"

**Scope:** the 26 action keys in `REWARDS` and the 67 entries in `EASTER_EGGS`
(`src/config/diamondRewards.js`), the SQL seed in
`supabase/migrations/20260726120000_diamond_rewards_v2_security_and_caps.sql`,
every endpoint that can move a balance, and every frontend caller.

**Method:** static trace. For each key: catalog row -> SQL seed row -> awarding
endpoint -> frontend caller. Every claim below carries a `file:line`.

**Headline:** of the 26 catalog keys, **15 pay correctly**, **1 pays but can
double-pay**, **2 are gated behind a call that can never succeed**, **7 have no
awarding code path at all**, and **1 (`easter_egg`) pays exactly zero by
construction**. All **67 easter eggs are display-only** — nothing anywhere
detects one. The central endpoint `pages/api/rewards/claim.js` — documented as
"the only client-facing claim entrypoint" — has **zero callers in the repo**.

---

## 0. TL;DR — prioritised

| # | Severity | Finding | Smallest fix |
|---|----------|---------|--------------|
| 1 | **CRITICAL** | `claim.js` never sends `egg_diamonds`, so every easter-egg claim resolves to 0 and returns `not_eligible`. | `claim.js:341` — add `egg_diamonds: egg.diamonds` to the metadata passed to `safeAward`. |
| 2 | **CRITICAL** | `egg_diamonds` is **not** in `RESERVED_METADATA_KEYS`, so a browser CAN set it. Mint path, bounded at 250/egg, 500/mo. | `claim.js:75-86` — add `'egg_diamonds'` to `RESERVED_METADATA_KEYS`. Do this in the same edit as #1. |
| 3 | **CRITICAL** | All 67 easter eggs are display-only. No detector, no trigger, no call site. | Ship a detector, or stop advertising 67 achievements on `pages/hub/diamond-store.js:1297`. |
| 4 | **CRITICAL** | `pages/api/rewards/claim.js` has **no callers**. 5 keys are reachable only through it. | Wire callers, or add per-action endpoints like the other 16. |
| 5 | **HIGH** | 7 keys have no awarding code at all: `hand_of_the_day`, `first_training_session`, `training_level_complete`, `gto_chart_study`, `email_verified`, `first_purchase`, `referral_vip_conversion`. | See §1 per-key rows. |
| 6 | **HIGH** | Referral (500 + 100) can never pay: the only caller sends no `Authorization` header, and it fires at signup when the referee is 0 days old. | `pages/auth/signup.js:733` -> replace with a qualification cron / post-login re-check. |
| 7 | **HIGH** | `first_training_session` is `lifetime: true` in JS but `lifetime = false` in the SQL seed. SQL wins -> pays 15 ◆/day forever, not once. | Migration `:422` -> `true`. |
| 8 | **HIGH** | A whole shadow economy pays diamonds through legacy `add_diamonds_to_balance` with transaction types not in the catalog, so **none of it consumes the 110/150 daily cap**. | Migrate those 10 endpoints onto `award_diamonds_v2`. |
| 9 | **MEDIUM** | 16 eggs are worth 300-500 ◆ in JS but the SQL clamps a single egg to 250. | Align `c_egg_max_single` (migration `:575`) with the catalog, or lower the 16 eggs. |
| 10 | **MEDIUM** | `birthday` uses a 300-day lookback, not once-per-calendar-year. A user can be paid 100 ◆ twice in 13 months. | Migration `:836` -> `interval '300 days'` becomes a calendar-year check. |
| 11 | **LOW** | 5 category strings and 2 `maxPerDay` values disagree between JS and SQL (cosmetic today). | §3. |

---

## 1. The 26 action keys, one row each

Legend — **Seed?** = present in the `diamond_reward_catalog` INSERT
(migration `:415-465`); a key missing there returns `unknown_action` and pays
zero. **Amt** = JS `diamonds` vs SQL `diamonds`.

| Key | Awarding endpoint | Frontend caller | Seed? | Amt | Verdict |
|---|---|---|---|---|---|
| `daily_login` | `pages/api/rewards/daily-login.js:150` | `pages/hub/index.js:76` | yes `:417` | 5 = 5 | **PAYS** |
| `daily_trivia_challenge` | `pages/api/rewards/daily-trivia.js:157` | `pages/hub/memory-games.js:649` | yes `:418` | 15 = 15 | **PAYS** |
| `hand_of_the_day` | **NO CALLER FOUND** — no v2 endpoint exists | — | yes `:419` | 10 = 10 | **DEAD.** The feature ships (`pages/hub/training/daily-challenge.js:279`) but pays through the legacy path `pages/api/training/hand-of-the-day.js:275`, which credits **25 ◆** with `p_type: 'training_reward'` — a type that is not in the catalog, so it also escapes the daily cap. Catalog key is never used. |
| `first_training_session` | **NO CALLER FOUND** | — | yes `:422` | 15 = 15 | **DEAD** + seed says `lifetime=false` (see §3). |
| `training_level_complete` | **NO CALLER FOUND** | — | yes `:423` | 8 = 8 | **DEAD.** Levels do complete (`src/components/memory/MemoryGameClient.tsx:253`) but route into `DiamondRewardService.onLevelComplete` -> `track_training_action`, which is a no-op logger returning `{"rewards": []}` (`supabase/migrations/20260511220000_phantom_rpcs_real_impls_r5.sql:197-200`). |
| `gto_chart_study` | **NO CALLER FOUND** | — | yes `:424` | 5 = 5 | **DEAD.** The string exists at `src/services/DiamondRewardService.ts:109` but only as an id for the legacy `claim_reward` RPC, never for `award_diamonds_v2`. |
| `video_watch` | `pages/api/rewards/video-watch.js:159` | `src/services/videoWatchHistory.js:132` | yes `:434` | 3 = 3 | **PAYS** |
| `video_favorite` | `pages/api/rewards/video-favorite.js:143` | `src/services/videoFavorites.js:50` | yes `:435` | 1 = 1 | **PAYS** |
| `social_post` | `pages/api/rewards/social-post.js:150` | `src/components/social/PostCreator.jsx:97`, `EnhancedPostCreator.jsx:853`, `sandbox/SandboxComponents.jsx:1360` | yes `:428` | 10 = 10 | **PAYS** |
| `share_content` | `pages/api/rewards/share.js:146` | `EnhancedSpatialFeed.jsx:431`, `SpatialFeed.jsx:256` | yes `:429` | 10 = 10 | **PAYS** |
| `strategy_comment` | `pages/api/rewards/comment.js:148` | `src/services/SocialService.js:544` | yes `:430` | 3 = 3 | **PAYS** |
| `reaction` | `pages/api/rewards/reaction.js:144` | `src/services/SocialService.js:432` | yes `:431` | 1 = 1 | **PAYS** |
| `follow` | `pages/api/rewards/follow.js:144` | `src/services/SocialService.js:586` | yes `:432` | 2 = 2 | **PAYS** |
| `venue_review` | `pages/api/rewards/venue-review.js:158` | `pages/hub/venues/[id].js:1518` | yes `:440` | 25 = 25 | **PAYS** |
| `birthday` | `pages/api/rewards/birthday-reward.js:148` | `pages/hub/index.js:83` | yes `:441` | 100 = 100 | **PAYS, but see §4 — 300-day guard, not once-per-year.** |
| `profile_complete` | `pages/api/rewards/profile-complete.js:146` | `src/components/profile-edit/profileHandlers.js:564` | yes `:452` | 50 = 50 | **PAYS** |
| `profile_pic` | `pages/api/rewards/profile-pic.js:143` | `profileHandlers.js:247`, `:558` | yes `:453` | 10 = 10 | **PAYS** |
| `hendonmob_link` | `pages/api/rewards/hendonmob-link.js:143` | `profileHandlers.js:561` | yes `:454` | 25 = 25 | **PAYS** |
| `email_verified` | **NO CALLER FOUND** | — | yes `:455` | 10 = 10 | **DEAD.** Zero quoted references to the key anywhere outside the catalog. There is no email-confirmation callback that awards it. `serverOnly: true`, so `claim.js:253` would reject a browser claim anyway. |
| `phone_verified` | `pages/api/sms/verify-otp.js:351` | server-side, after OTP | yes `:456` | 25 = 25 | **PAYS** |
| `first_purchase` | **NO CALLER FOUND** | — | yes `:457` | 25 = 25 | **DEAD.** `pages/api/store/webhooks/stripe.js` credits purchased diamonds via `add_diamonds_to_balance:156` but never awards `first_purchase`. Zero quoted references in the repo. |
| `referral_qualified` | `pages/api/rewards/referral.js:334` | `pages/auth/signup.js:733` | yes `:460` | 500 = 500 | **UNREACHABLE — see §5.** |
| `referral_referee` | `pages/api/rewards/referral.js:368` | same | yes `:461` | 100 = 100 | **UNREACHABLE — see §5.** |
| `referral_vip_conversion` | **NO CALLER FOUND** | — | yes `:462` | 500 = 500 | **DEAD.** No code detects a referee converting to VIP. Zero quoted references. |
| `vip_stipend` | `pages/api/cron/vip-stipend.js:229` | cron, registered `vercel.json:498` | yes `:465` | 500 = 500 | **PAYS** |
| `easter_egg` | `pages/api/rewards/claim.js:274` | **NONE** | yes `:448` | 0 = 0 | **PAYS ZERO — see §2.** |

**Seed completeness:** all 26 JS keys are present in the SQL seed and no seed row
is orphaned. No key returns `unknown_action` for being missing. **Every amount
agrees** between the JS catalog and the SQL seed. The failures are all in the
*plumbing*, not the numbers.

### 1a. The one-door endpoint nobody knocks on

`pages/api/rewards/claim.js` documents itself at `:37` as *"the only
client-facing claim entrypoint"*. Grepping the whole repo for `rewards/claim`
outside that file returns **only two doc comments** in
`src/config/diamondRewards.js:33` and `:93`. No component, service, page, test
or e2e spec ever POSTs to it. Every reward that actually pays does so through
one of the 16 per-action endpoints in `pages/api/rewards/`, all of which are
called via `src/lib/claimReward.js` (which does correctly attach the Supabase
JWT, `src/lib/claimReward.js:59-65`).

Consequence: the 5 keys with no dedicated endpoint (`hand_of_the_day`,
`first_training_session`, `training_level_complete`, `gto_chart_study`,
`easter_egg`) have **no route to a payout at all**.

---

## 2. The 67 easter eggs: display-only. Confirmed.

**Nothing detects an egg. Nothing triggers an egg. Not one of the 67 can ever pay.**

Evidence:

1. **No trigger site.** I grepped all 67 egg keys (`gto_machine`, `speed_demon`,
   … `bankroll_builder`) across `pages/ src/ components/ lib/ app/ services/
   worker/ scripts/ supabase/ database/ sql/ utils/`. 117 hits, and after
   excluding `src/config/diamondRewards.js` **every single one is a coincidental
   substring collision** — `high_roller` as a tournament type
   (`pages/api/poker/tour-schedule.js:185`), `night_owl` as a horse personality
   (`src/content-engine/services/HorseBehaviorService.js:58`), `speed_demon` as
   an unrelated memory-game badge (`pages/hub/memory-games/achievements.js:39`),
   `polarizer` as a GodModeArena review tab
   (`src/components/training/GodModeArena.jsx:4238`), `new_year` as a content
   trend window (`src/content-engine/services/HorseTrendService.js:19`), and so
   on. Not one is an award call.

2. **The only consumers are renderers.** `EASTER_EGGS` is imported by exactly
   three places, all display: `pages/hub/diamond-store.js:43` (renders the six
   category grids at `:1307-1407`),
   `src/components/diamonds/DiamondRewardTracker.tsx:25` (via `listEasterEggs`),
   and `src/data/diamondStoreData.js:6` (re-projects them for the store UI).

3. **The only server handler is unreachable.** `claim.js:274-287` is the sole
   place that understands `actionKey === 'easter_egg'`, and §1a proves nothing
   calls `claim.js`.

4. **The look-alike system is a different, also-dead, key space.**
   `src/services/DiamondRewardService.ts:113-211` defines a "5-pillar easter egg
   system" with keys like `pillar1_searcher`, `pillar2_squad_goals`,
   `pillar3_perfectionist`. Those are **disjoint** from the 67 catalog keys, they
   route to the legacy `claim_reward` / `track_training_action` RPCs, and
   `track_training_action` is a no-op that always returns `{"rewards": []}`
   (`supabase/migrations/20260511220000_phantom_rpcs_real_impls_r5.sql:197-200`).
   Its only live consumer is `src/components/memory/MemoryGameClient.tsx:253`.

**Eggs actually wired: 0 of 67.** The store advertises "67 Hidden Achievements"
at `pages/hub/diamond-store.js:1297`.

### 2a. Even if an egg were triggered, it would pay ZERO

This is the more dangerous half, because it survives any detector you bolt on.

`award_diamonds_v2` resolves the egg amount from the metadata:

```
-- migration :931-938
IF p_action_key = 'easter_egg' THEN
    v_egg_request := COALESCE((p_metadata ->> 'egg_diamonds')::int, 0);
    v_egg_request := LEAST(GREATEST(v_egg_request, 0), c_egg_max_single);
```

and the catalog row for `easter_egg` carries `diamonds = 0` (migration `:448`).
`claim.js` looks the egg up at `:275` and validates `verifiable` at `:279` — and
then **throws the egg object away**. The metadata it actually sends is:

```js
// pages/api/rewards/claim.js:341-346
p_metadata: {
    ...meta.value,
    _source: 'api/rewards/claim',
    _catalog_version: CATALOG_VERSION,
    _claimed_at: new Date().toISOString(),
},
```

No `egg_diamonds`. So `v_egg_request = 0`, `v_requested = 0`, and the function
short-circuits at migration `:962` returning `not_eligible`, `awarded: 0`.
**Every egg claim pays nothing, silently, with a plausible-looking reason
string.**

### 2b. …and the client can set the egg amount

Answering audit item 4 directly: **the egg amount does NOT come from
`EASTER_EGGS` server-side, and the client CAN supply it.**

`RESERVED_METADATA_KEYS` (`claim.js:75-86`) strips `amount`, `diamonds`,
`awarded`, `multiplier`, `user_id`, `userId`, `action_key`, `actionKey`,
`reference_id`, `balance`. It does **not** strip `egg_diamonds`.
`sanitizeMetadata` (`:149-165`) passes through any other string/number/boolean.
The spread at `:342` then hands it straight to SQL, which reads exactly that key.

So `POST /api/rewards/claim` with

```json
{ "actionKey": "easter_egg", "targetId": "first_blood", "metadata": { "egg_diamonds": 250 } }
```

pays 250 ◆ for a 10 ◆ common egg. The blast radius is bounded — clamped to 250
per egg by `c_egg_max_single` (migration `:575`) and 500 ◆/month by
`c_egg_monthly_cap` — so it is $5/user/month, not unlimited. And it is currently
unexploitable only because nothing has shipped a caller. It is still a direct
violation of the file's own Rule 1 (`src/config/diamondRewards.js:12-15`).

**Smallest fix (one edit, fixes 2a and 2b together):** in `claim.js`, hoist the
egg lookup out of the `if` block and inject the amount server-side, and add the
key to the reserved list:

```js
// :75  RESERVED_METADATA_KEYS — add:
'egg_diamonds',

// :274  keep the egg object in scope
let eggDiamonds = null;
if (actionKey === 'easter_egg') {
    const egg = getEasterEgg(target.value);
    ...existing checks...
    eggDiamonds = egg.diamonds;
}

// :341
p_metadata: {
    ...meta.value,
    ...(eggDiamonds !== null ? { egg_diamonds: eggDiamonds } : {}),
    _source: 'api/rewards/claim',
    ...
}
```

### 2c. 16 eggs are worth more than the SQL will ever pay

`c_egg_max_single = 250` (migration `:575`), but the catalog runs to 500.
These 16 eggs will underpay once #1 is fixed:

`dead_reckoning` 300, `preflop_bot` 300, `the_ghost` 500, `old_guard` 300,
`the_centurion` 300, `daily_legend` 300, `wall_of_fame` 300, `the_ambassador`
300, `retweet_royalty` 300, `ghost_writer` 300, `millionaire` 400, `to_infinity`
500, `the_finisher` 400, `zero_leak` 350, `the_whale` 500, `level_100_boss` 300.

(Rarity spread across the 67: 3 common, 12 uncommon, 17 rare, 19 epic, 16
legendary; min 10 ◆, max 500 ◆. Three eggs are `verifiable: false` and correctly
rejected at `claim.js:279`: `retweet_royalty`, `feedback_loop`, `ghost_writer`.)

Note the monthly egg cap is applied to the **pre-multiplier** number
(migration `:959`) and the share-streak multiplier is applied after
(migration `:976`), so a 2.00x user can bank up to 1,000 ◆ of eggs in a month
against a documented 500 ◆ ceiling. Worth tightening when you fix the clamp.

---

## 3. Cap-accounting coherence (JS vs SQL seed)

Programmatic diff of `REWARDS` against the seed rows.

**`countsTowardDailyCap` vs `counts_toward_daily_cap`: ZERO disagreements
across all 26 keys.** Your `easter_egg` fix landed and nothing else drifted.
For the record, the 15 capped keys are `daily_login`, `daily_trivia_challenge`,
`hand_of_the_day`, `first_training_session`, `training_level_complete`,
`gto_chart_study`, `social_post`, `share_content`, `strategy_comment`,
`reaction`, `follow`, `video_watch`, `video_favorite`, `venue_review`,
`birthday`; the 11 uncapped are `easter_egg`, the six `profile`/lifetime keys,
the three `referral_*` keys and `vip_stipend`.

**All other disagreements found (8 total):**

| Key | Field | JS | SQL | Impact |
|---|---|---|---|---|
| `first_training_session` | `lifetime` | `true` (`src/config/diamondRewards.js:183`) | `false` (migration `:422`) | **REAL.** SQL wins. `max_per_day = 1` is the only brake, so this pays 15 ◆ **every day forever** instead of once, and the "once, ever" branch at migration `:806` never runs. |
| `referral_qualified` | `maxPerDay` | 20 | `NULL` (`:460`) | Cosmetic today — the real brake is `c_referral_max_month = 20` (migration `:577`, checked `:847-857`). Note the seed's own comment at `:459` says "10 QUALIFIED referrals per calendar month", which contradicts the constant it is describing. Fix the comment. |
| `referral_vip_conversion` | `maxPerDay` | 20 | `NULL` (`:462`) | **REAL if ever wired.** There is no per-month guard for this key in `award_diamonds_v2` at all — `:847` only special-cases `referral_qualified`. With `max_per_day = NULL` and `counts_toward_daily_cap = false`, an unbounded 500 ◆/award key. |
| `video_watch` | `category` | `content` | `video` | Cosmetic. |
| `video_favorite` | `category` | `content` | `video` | Cosmetic. |
| `venue_review` | `category` | `engagement` | `community` | Cosmetic. |
| `birthday` | `category` | `engagement` | `community` | Cosmetic. |
| `easter_egg` | `category` | `secret` | `easter_egg` | Cosmetic. |

The category column is read into `v_category` (migration `:718`) and only echoed
back in the response (`:1066`) — it gates nothing in SQL. The one place category
*is* load-bearing is `AGE_GATED_CATEGORIES = ['social']` in
`claim.js:292`, which reads the **JS** category. Since `claim.js` has no
callers, this is currently inert; the per-action endpoints each re-implement a
24h age check locally (`social-post.js:187`, `share.js:179`, `comment.js:185`,
`reaction.js:180`, `follow.js:183`) but **none of them check email verification**,
which `claim.js:315-324` does. Divergent gates.

### 3a. The cap has a hole the size of the training product

`v_daily_used` and `v_monthly_used` are computed with an **inner join to the
catalog** (migration `:692-711`):

```sql
FROM public.diamond_transactions t
JOIN public.diamond_reward_catalog c ON c.action_key = t.transaction_type
WHERE ... AND c.counts_toward_daily_cap
```

Any ledger row whose `transaction_type` is not one of the 26 catalog keys is
invisible to the ceiling. These endpoints all write exactly such rows, via the
legacy `add_diamonds_to_balance`:

| Endpoint | Amount | `p_type` written | In catalog? |
|---|---|---|---|
| `pages/api/training/hand-of-the-day.js:275` | 25 | `training_reward` | no |
| `pages/api/training/save-progress.js:264`, `:340` | variable | `training_reward` | no |
| `pages/api/training/save-session.js:238` | variable | `speed_bonus` | no |
| `pages/api/training/daily-bonus.js:195` | variable | `daily_bonus` | no |
| `pages/api/training/streak.js:295` | milestone | `streak_reward` | no |
| `pages/api/training/achievements.js:202` | `def.diamond_reward` | `achievement` | no |
| `pages/api/training/challenges.js:450` | `reward` | `challenge` | no |
| `pages/api/social/referral.js:218`, `:235` | 100 / 50 | `referral_bonus` | no |
| `pages/api/trivia/tournament-enter.js:175` | variable | (spend/refund) | no |
| `pages/api/trivia/tournament-lifecycle.js:222` | prize | — | no |

So the "110 free / 150 VIP" ceiling bounds only the 15 capped v2 keys. Everything
above is uncapped headroom on top of it, and `pages/api/social/referral.js:25-26`
runs a **second, contradictory referral economy** at 100/50 diamonds versus the
catalog's 500/100.

---

## 4. `birthday` can pay twice in 13 months

Catalog says `oncePerYear: true`. SQL implements it as a 300-day lookback
(migration `:830-836`):

```sql
AND t.created_at >= v_now - interval '300 days'
```

Claim on 1 Jan 2026, claim again on 28 Oct 2026 (day 301), claim again in
Jan 2027 — 300 ◆ in ~12.5 months against a 100 ◆/year design. The endpoint does
gate on the profile's birthday date, so exploiting it needs a birthday edit, but
`profiles.date_of_birth` is not in the trigger's locked column list
(migration `:217-222`). Fix: replace with a calendar-year check
(`date_trunc('year', v_now AT TIME ZONE 'America/Chicago')`).

---

## 5. Referral: 600 ◆ of advertised value that cannot be claimed

`pages/api/rewards/referral.js` is correct code. Its problem is entirely who
calls it, and when.

1. **The only caller sends no auth.** `pages/auth/signup.js:733-741` does a raw
   `fetch('/api/rewards/referral', ...)` with `headers: { 'Content-Type':
   'application/json' }` and nothing else. The endpoint requires a bearer token
   at `pages/api/rewards/referral.js:253-254` and returns **401** without one.
   Contrast with every working reward, which goes through
   `src/lib/claimReward.js:59-65` and does attach the JWT.

2. **It fires at the one moment qualification is impossible.** Even with a token,
   the endpoint requires (`:296-306`) `email_verified` **and** `phone_verified`
   **and** `accountAgeDays >= 7` (`MIN_REFEREE_AGE_DAYS`, `:164`) **and**
   `loginDays >= 5` (`MIN_LOGIN_DAYS`, `:165`). At signup all four are false.

3. **Nothing ever re-checks.** No cron in `pages/api/cron/` re-evaluates pending
   referrals, and `vercel.json:444-500` registers no referral job. The other two
   callers of anything referral-shaped
   (`src/components/social/ReferralCrewCard.js:38`,
   `ViralGrowthModule.js:19`) hit `/api/social/referral`, which is the **legacy**
   100/50 path, not this one.

Net: `referral_qualified` (500 ◆) and `referral_referee` (100 ◆) have never paid
and cannot pay. Smallest fix: a daily cron that finds referrals whose referee now
meets the four conditions and calls `award_diamonds_v2` server-side — same shape
as `pages/api/cron/vip-stipend.js`.

Also note `MIN_REFEREE_AGE_DAYS = 7` is a requirement the economy spec does not
mention (spec: verified email + phone + 5 separate login days). Decide which is
canonical.

---

## 6. What is genuinely healthy

Worth stating plainly, because most of this file is bad news:

- **Every amount matches** between `src/config/diamondRewards.js` and the SQL
  seed, for all 26 keys. No key pays the wrong number through the v2 path.
- **No key is missing from the seed.** Nothing returns `unknown_action`.
- **`counts_toward_daily_cap` is fully coherent** across all 26 keys.
- The 15 endpoints that are wired are wired **correctly**: request body field
  names match their callers exactly (`videoId`, `postId`, `commentId`,
  `followingId`, `shareType`/`contentId`, `venueId`), all resolve amounts
  server-side, all use `safeAward` so an unapplied migration degrades to HTTP 200
  rather than 500.
- `pages/api/cron/vip-stipend.js` and `pages/api/sms/verify-otp.js` call
  `award_diamonds_v2` directly with the service role and wrap it in try/catch, so
  a missing migration is non-fatal — though neither uses `safeAward`, so they
  will log noise rather than a clean `migrationMissing`.
- The `daily_login` streak is derived from the ledger, not from
  `profiles.login_streak` (migration `:906-925`), which is the right call.

---

## 7. Fix order

1. `claim.js` — inject `egg_diamonds` server-side **and** add it to
   `RESERVED_METADATA_KEYS`. One edit, closes the zero-pay bug and the mint.
2. Wire *something* to `claim.js`, or the fix in step 1 changes nothing
   observable.
3. Migration `:422` — `first_training_session` `lifetime` -> `true`. This is a
   live overpay the moment the key is wired.
4. Referral qualification cron. 600 ◆ of the funnel currently pays 0.
5. Decide the easter-egg story: build detectors for the 67, or stop advertising
   them at `pages/hub/diamond-store.js:1297`.
6. Reconcile `c_egg_max_single` (250) with the 16 eggs worth 300-500.
7. Migrate the legacy `add_diamonds_to_balance` endpoints onto
   `award_diamonds_v2` so the daily cap means what it says.
8. `birthday` 300-day -> calendar-year.
9. Retire or re-key `src/services/DiamondRewardService.ts` and
   `pages/api/social/referral.js` — two dead parallel economies with
   contradictory numbers are how the next audit finds the same bugs again.

---

*Generated by the earn-and-eggs-audit pass. Every line reference above was read
from the working tree at audit time; no code outside this file was modified.*
