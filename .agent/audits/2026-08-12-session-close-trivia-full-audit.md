# 2026-08-12 — Session close: full trivia audit

Six defects found and fixed, all verified against production, not against a
commit hash. Detail for the big three is in
`2026-08-12-pvp-unstartable-and-vip-lockout.md` and
`2026-08-12-profile-updated-request-storm.md`.

## Shipped

| # | Defect | Fix | Verified by |
|---|---|---|---|
| 1 | `useCurrentUser` dispatched and listened for the same `profile-updated` event — an unbounded fetch loop hammering `/api/user/get-header-stats` at 5.6–8.5 req/s on every hub page, each up to ~8 DB round-trips | `63f5380d` | 8.5/s → 0.10/s, zero 429s |
| 2 | Achievements page threw `supabase.select is not a function` on line 1 (`.from()` missing) and had **never** rendered an achievement for anyone | `fcc6ae4c` | page now shows 6/30, progress bars, rewards |
| 3 | `useVIP` reported ready ~1s before the VIP answer landed, so a fast click took the charge branch | `4cdd9d26` | timing trace |
| 4 | 470 of 473 VIP accounts read as NOT VIP — `is_vip = true` with NULL tier/expiry. Locked them out of 1v1 entirely and charged them 10 diamonds/game | migration `20260812230000` | `check-status` → `{"isVip":true,"vipTier":"lifetime"}` |
| 5 | `trivia_pvp_matches` had no INSERT/UPDATE grant for `authenticated`, so its own RLS policies were unreachable — every match creation died with 42501 | migration `20260812232000` | match rows now create |
| 6 | A legacy trigger mirrored `player1_id → challenger_id`, but `session-start` had repurposed that column to hold a **session id**. Every match was born with a garbage link, so `session-start` 409'd forever. **PvP was structurally unstartable for every user.** | migration `20260812234500` | first PvP match ever started |
| 7 | PvP roster seeded with 200 questions (`filterAndShuffle`'s 3rd arg is a floor, not a cap) — battle screen read "Question 1 of 200" | `8981ab66` | now "Question 1 of 20" |
| 8 | Abandoned `trivia_sessions` never expired; rows sat `open` for 6+ days | migration `20260813035500` | 0 stale open rows |

## Final verified state

    stale_open      0        lifetime_vips    470
    stranded_vips   0        corrupted_links  0
    pvp_grants      INSERT,SELECT,UPDATE

- **1v1:** `session-start` 200, battle screen renders, "Question 1 of 20".
- **Solo (MTT):** 20 served, 20 graded, submit 200, `trivia_scores` row written,
  **no entry charge** (VIP now correctly free).
- **Answer key:** `session-start` ships no `correct_index` / `explanation` in
  either path. Re-checked after every change.

## Investigated and closed as NOT bugs

- **18 profiles with `is_vip = false` but `vip_tier = 'monthly'`** — all 18 have
  `vip_expires_at` set and **zero** are in the future. These are correctly
  lapsed monthly subscribers; the lapse cron did its job. No action.
- **Lobby card distortion** — the cards carry `height: auto`, so aspect ratio is
  preserved intrinsically and the `object-fit: fill` default never applies.
  Measured stretch = 1.000 at every width from 320 to 1440. The distortion Dan
  saw was real but pre-dated 22:50 UTC on 2026-08-12, when the artwork was
  replaced with correctly-proportioned 896×1200 files (it had been 1024×1024
  square in 3:4 boxes — a 33% vertical stretch).
- **`/api/pwa/prompt-status` 429s** — an artifact of a rapid automated sweep
  tripping the rate limiter, not a production loop. Zero calls in steady state.
- **PvP `413`s** — Sentry's ingest rejecting oversized envelopes, not a
  smarter.poker response.

## Still open

1. **Service-worker image cache.** `sw.js` caches all images `CacheFirst` with
   `maxAgeSeconds: 2592000` (30 days). Anyone who loaded the old square artwork
   keeps seeing it, stretched, regardless of the HTTP headers. Needs a cache
   version bump or a bust of the `static-assets` cache. **This is the most
   likely reason the images still look wrong on any given user's screen.**
2. **React error #425** (hydration mismatch) on every trivia page navigation.
   Prior audits wrote this off as "known noise"; it is not — a mismatch makes
   React discard the server HTML and re-render, which is a real source of
   flashing and layout jank. Not investigated.
3. **Recurring session sweep.** Migration `20260813035500` was a one-off
   backfill. The recurring job belongs in `pages/api/cron/` scheduled through
   Open Claw on Hetzner (CLAUDE.md §11) — needs Hetzner access this session did
   not have. Abandoned rows will accumulate again without it.
4. **PvP matchmaking race** — simultaneous joins can still create two match
   rows. Needs the pairing RPC under a unique constraint.
5. **Question pool duplication** — 987 duplicate rows, entirely inside the five
   AI-generated categories (`icm_chip_ev`, `cash_game_situations`,
   `mtt_situations`, `gto_theory`, `gto_scenarios`). The five hand-written
   categories have zero. `generate-trivia` is not de-duping. Also a 4× pool
   imbalance: ~1,600 per generated category vs ~420–480 per factual one.
6. **Achievement rewards are cosmetic.** No `trivia_achievements` table, nothing
   server-side grants the diamonds, unlocks live in `localStorage`. The page now
   says "125 Diamonds Earned From Achievements" — those were never paid.
7. **Build Safety Gate red on every commit** at `CHECK 8` (3 auth cron probes
   missing `deleteUser`). 44 pass / 3 fail. A permanently-red gate provides no
   signal.
8. **`diamondsAwarded: 0`** at 25% accuracy looks right but the payout tiers
   were never verified against the spec.
9. **Live two-human PvP** still untested — needs a second real account.
