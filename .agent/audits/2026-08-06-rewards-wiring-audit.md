# Rewards & Diamonds Wiring Audit — 2026-08-06

Full re-check of the diamond economy after the easter-egg and VIP-gate work.
Everything below was verified against production (`kuklfnapbkmacvwxktbh`) or by
reading the code — nothing here is inferred.

---

## FIXED AND SHIPPED

### 1. Non-VIP players were locked out of every paid game (P0)
Commit `c39418ef`.

Migration `20260803140000` revoked EXECUTE on `deduct_diamonds`,
`add_diamonds_to_balance` and `award_diamonds` from `authenticated` — correct,
a browser-executable balance mutator is a mint. Nothing replaced it.
`src/services/DiamondEngine.js` still called those RPCs from the browser, so
from 2026-08-03:

- **Charges** returned 42501. `_deductDirect` fell back to
  `add_diamonds_to_balance`, also revoked, so `deduct()` ended at
  `{success:false}` and memory-games plus trivia endless / survival / mixed /
  time-attack / `[mode]` opened their "Out of Diamonds" modal and refused to
  start. **Every non-VIP player was locked out of every paid surface.** VIPs
  skip the charge, which is why the VIP test account never surfaced it.
- **Awards** failed the same way and fell through to `_awardLocal()`, which
  wrote a fabricated balance to `localStorage` and fired an earnings toast.
  Players were shown diamonds they never received.

Now: charges go to `POST /api/diamonds/spend` (service-role, bearer identity,
amount clamped, `source` allowlisted, VIP-plays-free decided from the profile
row). Deduction cannot mint, so that endpoint is safe in a way an award
endpoint would not be. Rewards go to `POST /api/rewards/claim` with a catalog
`actionKey` so the server prices them and applies caps, velocity and
idempotency — the client no longer names an amount. A source with no catalog
action pays nothing and logs once rather than faking it. `_deductDirect` and
`_awardDirect` are deleted: both called a revoked RPC and could never succeed.

### 2. Reward catalog had drifted from the config on five fields
Commit `755c13ad`, migration `20260805210000`.

`award_diamonds_v2` reads `diamond_reward_catalog`, not
`src/config/diamondRewards.js`, so where they disagreed the table won silently.

| field | was | now | impact |
|---|---|---|---|
| `easter_egg.counts_toward_daily_cap` | true | false | 500 ◆ legendary eggs were clamped to the 110/150 daily cap, the excess discarded, the ledger row still written and the `reference_id` burned — unrecoverable. The store page promises the opposite in three places. |
| `first_training_session.lifetime` | false | true | A once-ever 15 ◆ bonus was repayable daily. |
| `referral_vip_conversion.max_per_day` | NULL | 20 | 500 ◆, no step-5b rule, counts toward no cap, not lifetime. Only idempotency and the 60s velocity guard bounded it. |
| `referral_qualified.max_per_day` | NULL | 20 | |
| `easter_egg.max_per_day` | NULL | 3 | |

Also `c_egg_max_single` 250 → 1000 (sixteen eggs were priced above 250 and
truncated before the caps ran) and `c_egg_monthly_cap` 500 → 1000. Egg payouts
are now all-or-nothing: one that does not fit the remaining budget is deferred
whole rather than part-paid and burned.

**Evidence it was live:** `millionaire` (400 ◆) paid **105** and `beta_tester`
(250 ◆) paid **105** to real users before the fix. Both `reference_id`s are
burned; those two users cannot receive the difference without a manual
make-good. See OPEN ITEMS.

### 3. CI guard against catalog drift
Commit `755c13ad`. `scripts/check-reward-catalog-drift.mjs`, wired as CHECK 9
in the Build Safety Gate. The five drifts survived because nothing ever
compared the table to the config. Dependency-free, warns-and-passes without the
Supabase secret, fails loudly on an empty catalog. Failure paths tested with
stubbed responses: drift / missing row / empty catalog each exit 1.

### 4. Five bugs in the easter-egg work itself
Commit `c39418ef`.

- `lifetimeEarned` summed **every** positive row, so `millionaire` ("earn
  100,000 over your lifetime") fired for an account whose total was a 454,229 ◆
  untyped legacy row plus a 45,205 ◆ admin `adjustment`. Now counts only
  catalog reward actions — purchases, adjustments, gifts and transfers are
  money that arrived, not money that was earned.
- `the_ghost` and the sweep's owned-egg filter read `diamond_reward_claims`.
  `award_diamonds_v2` never writes that table (verified against `prosrc`); it
  holds only legacy v1 rows and stopped growing 2026-07-25. `the_ghost` could
  never have fired for an active user. Both now read `diamond_transactions`.
- `weekend_warrior` / `daily_legend` counted cap-exempt actions toward "you hit
  your daily cap". After eggs left the cap, that would have paid `daily_legend`
  (300 ◆) to anyone unlocking eggs on 30 consecutive days.
- The sweep only stopped on `daily_cap`/`monthly_cap`; `action_limit`,
  `velocity` and `budget_exhausted` all mean the next egg fails identically.

33 verifier tests, with a regression test for each.

### 5. Two dormant DDL landmines + a bonus paid into a dead column
Commit `1d9b3871`.

`src/pages/api/hotfix_rpc.js` contained `CREATE OR REPLACE FUNCTION
add_diamonds_to_balance ... SECURITY DEFINER` with **no** REVOKE — Postgres
grants EXECUTE to PUBLIC by default, so running it would have recreated the
unlimited-mint hole `20260726120000` closed. `src/pages/api/patch-db.js` held a
second, conflicting definition. Neither was reachable (Next ignores
`src/pages/` when a root `pages/` exists) — dormant, one rename from live.
Both bodies replaced with 410 stubs. **Follow-up:** `git rm` both from a normal
checkout; the GitHub MCP has no delete operation.

`pages/api/training/save-session.js` had a speed-bonus fallback that wrote
`profiles.diamond_balance` — the vestigial column — wrote no ledger row, and
then reported success to the player. Writing only one of the two balance
columns is what put them ~508k diamonds apart historically. Removed.

---

## OPEN ITEMS — need Dan's decision

### A. Legacy award paths bypass every cap
`award_diamonds_v2` computes spend from
`diamond_transactions t JOIN diamond_reward_catalog c ON c.action_key =
t.transaction_type`. **Any `transaction_type` not in the catalog is invisible
to the 110/150 daily cap, the 3,300/4,500 monthly cap and the 2,500,000 ◆
platform circuit breaker.**

These server routes all use uncatalogued types and therefore pay outside every
ceiling:

| route | type | ceiling |
|---|---|---|
| `pages/api/training/streak.js:293` | `streak_reward` | up to **10,000 ◆** ($100) at the 365-day milestone |
| `pages/api/training/daily-bonus.js:193` | `daily_bonus` | up to **125 ◆/day**, against a 110 ◆/day cap |
| `pages/api/training/hand-of-the-day.js:273` | `training_reward` | 25 ◆ — the catalog says `hand_of_the_day` is 10 ◆ |
| `pages/api/training/save-progress.js:262,338` | `training_reward` | variable |
| `pages/api/training/save-session.js:236` | `speed_bonus` | variable |
| `pages/api/training/achievements.js:200` | `achievement` | DB-driven |
| `pages/api/training/challenges.js:448` | `challenge` | variable |
| `pages/api/trivia/tournament-lifecycle.js:222` | `tournament_prize` | variable |

Actual spend through uncapped types in the last 60 days: **5,630 ◆ ($56)** —
`tournament_prize` 4,600, `bonus` 1,000, `trivia_run` 20, `training_reward` 10.
Modest today; the exposure is the ceiling, not the current burn.

**Why this was not fixed here:** naively adding catalog rows makes these count
toward the 110/day cap, which would clamp a 10,000 ◆ streak milestone to 110
and burn it — the exact bug just fixed for eggs.

**Recommended design for whoever picks this up.** Do not try to force these
into the daily cap. Copy the pattern that now works for eggs:

1. Give each family its own budget line — `counts_toward_daily_cap = false`
   plus a per-family monthly ceiling, the way `easter_egg` and the referral
   actions already work. Milestone payouts stay intact.
2. Make the awards **all-or-nothing** against that ceiling, as
   `20260805210000` did for eggs, so a big milestone is deferred whole rather
   than part-paid and its `reference_id` burned.
3. Route the eight routes through `award_diamonds_v2` rather than
   `add_diamonds_to_balance`, passing the variable amount in metadata exactly
   as eggs pass `egg_diamonds`. That is what brings them inside the 2,500,000 ◆
   platform circuit breaker, which today they neither respect nor increment.

Step 3 is the one that matters most: right now a runaway loop in any of these
routes cannot trip the breaker, because the breaker only counts what
`award_diamonds_v2` writes.

The per-family ceilings are pricing, so they are Dan's. Everything else is
mechanical.

### B. Two users were shortchanged by the egg bug
`47965354…` got 105 ◆ for `millionaire` (400 ◆) and `3bb71bfe…` got 105 ◆ for
`beta_tester` (250 ◆). Their `reference_id`s are burned so a re-sweep pays
nothing. A make-good would be a manual service-role award. Total owed: 440 ◆
($4.40). Say the word.

Note `millionaire` should not have fired at all for that account under the
corrected `lifetimeEarned` — that award was the bug, not just underpaid.

### C. Seven catalog actions can never be earned
No caller anywhere: `hand_of_the_day` (paid via the legacy path at a different
price), `first_training_session`, `training_level_complete`, `gto_chart_study`,
`email_verified`, `first_purchase`, `referral_vip_conversion`. All seven are
advertised on `/hub/diamond-store`. Wiring them is straightforward once the
prices are confirmed.

### D. Store copy advertises 67 eggs — RESOLVED 2026-08-06 (`6b7c0d95`)
Three more verifiers shipped, taking earnable eggs from 25 to **28**:
`road_tripper` (`venue_reviews` → `poker_venues.state`, three distinct states),
`the_collector` (distinct `table_id` in `user_theme_settings`) and
`the_optimizer` (a leak with `resolved_at` that `leak_review_state` closed in
one attempt — possible only because migration `20260805000000` created that
table today).

The store now states both numbers: 67 across 6 categories, 28 unlockable today.
The count comes from `src/lib/rewards/eggCoverage.js`, a list-only module so
printing it does not drag 28 database queries into the client bundle, and a
test asserts the list and the registry agree in both directions — adding a
verifier without updating the list fails the suite rather than quietly making
the copy wrong again.

Remaining 39 are still documented in `UNVERIFIABLE_EGGS` with the telemetry
each needs. `data_miner` (hand-history export logging) and `zero_leak`
(hands-since-last-leak counter) are the next cheapest.

### E. `/api/rewards/progress.js` is orphaned
430 lines, zero callers. Read-only, no money at risk. Wire or delete.

---

## Verification performed

- `node node_modules/typescript/bin/tsc --noEmit` — exit 0
- `node ./_chk.cjs <every changed file>` — 0 parse failures
- `node --test src/lib/rewards/__tests__/eggVerifiers.test.mjs` — 37/37
- `node --test src/lib/rewards/__tests__/transferMath.test.mjs` — 63/63
- Catalog drift script against production — 26 actions, no drift
- Migration post-apply assertions incl. that `authenticated`/`anon` still
  cannot EXECUTE `award_diamonds_v2` and `service_role` still can
- Every push verified by comparing remote git blob SHAs to local `git
  hash-object` output, byte-exact

**Not verified:** Vercel deployment. Pushes went through the GitHub MCP, which
bypasses `git-safe-push.sh` Phase 2.5 (local build gate) and Phase 4
(`/api/health` SHA poll). Per section 1.5 of the agent rules these commits are
pushed, not deployed, until production serves them.
