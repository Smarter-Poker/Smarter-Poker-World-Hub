# HANDOFF: Stop reverting the audited MLB Players / HR-betting fixes

**Date:** 2026-06-22
**To:** Any agent editing the MLB-ANALYTICS players surface (esp. the Antigravity
auto-sync agent committing as `Smarter-Poker`).
**Why:** Several intentional, audited fixes on the MLB Players pages keep getting
reverted by automated regeneration of these files (observed reverting the same
edits 3+ times across audit rounds, sometimes within minutes). This is pure churn —
the fixes below are correct and verified. **Do not revert them.**

## DO-NOT-REVERT list (these are correct; leave them in place)

1. **`pages/api/mlb/hr-bets.ts` line 2 MUST be:**
   ```ts
   import { createClient } from '../../../src/lib/supabaseServerClient';
   ```
   NOT `from '@supabase/supabase-js'`. This is binding **RULE 4** (no raw
   `@supabase/supabase-js` in API routes — use the patched server client, which
   adds the GoTrue-failure JWT-decode fallback for 401 resilience). **343 other API
   routes in this repo import `createClient` from `src/lib/supabaseServerClient`
   and build fine** — the patched import is NOT a bug and does NOT break the build.
   The commit `303a08e` ("fix: ... hr-bets createClient import") that changed this
   back to the raw import is the regression. Do not repeat it.

2. **`pages/api/mlb/hr-bets.ts` POST/PATCH hardening — keep:** stake rounded to 2dp
   and clamped to `<= 99999999.99` (matches `numeric(10,2)`); `team_id` validated
   with an explicit `Number.isNaN` check (not `parseInt(...) || null`); per-user row
   cap (`>= 2000` -> 429). These prevent silent numeric overflow/rounding mismatch
   and unbounded growth.

3. **`src/components/mlb/HrBetTracker.tsx` — keep:** `res.ok` checks in BOTH
   `setResult` and `removeBet` (so failed PATCH/DELETE aren't swallowed); the
   `Number.isFinite(playerId)` load guard; numeric coercion of `stake`/`american_odds`
   when setting `bets`.

4. **`src/components/mlb/HrTodayLeaders.tsx` — keep:** the `setInterval`
   auto-refresh (every 5 min — board must stay live as HR probabilities reprice
   intraday); the composite React key; the `res.ok` check with the explicit error
   notice (do not collapse back to a silent `return null`).

5. **`pages/api/mlb/hr-today.ts` — keep:** the per-`player_id` dedupe (fetch
   `limit*4`, Set-collapse, slice) so doubleheaders don't duplicate leaderboard rows
   / React keys.

6. **`src/components/mlb/HrMatchupConditions.tsx` — keep the component AND its render
   in `pages/hub/MLB-ANALYTICS/players/[id].tsx`** (`{matchup && <HrMatchupConditions matchup={matchup} type={type} />}`).
   It renders today's weather (HR-favorability summary) + the hitter's posted lineup
   status ("Confirmed/Projected Starter — Batting Nth"). The API
   (`pages/api/mlb/players/[id].ts`) already populates `matchup.weather` + `matchup.lineup`;
   removing the render leaves that enrichment dead.

## DB (already applied to MAIN kuklfnapbkmacvwxktbh — do not undo)
- `mlb_hr_bets` RLS policies use `(select auth.uid())` (initplan-optimized).
- `revoke all on public.mlb_hr_bets from anon;` (RLS already blocks anon; defense-in-depth).

## Verification status (2026-06-22)
- Full live end-to-end CRUD test PASSED against production (POST/GET/PATCH/DELETE,
  JWT-scoped, correct P&L). The feature works; these are correctness/resilience/UX
  hardening fixes that must persist.
