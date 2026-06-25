# 2026-06-25 Frontend Audit

## Findings & Fixes

1. **UI Stubs (Hardcoded Fallbacks)**
   - **Location:** `pages/hub/MLB-ANALYTICS/players.tsx`
   - **Issue:** The component had hardcoded constants `MLB_STRUCTURE` and `MLB_TEAMS` to define team data before fetching standings data. This introduced hardcoded fallback data into the app.
   - **Fix:** Removed both hardcoded constants. Updated the component to dynamically generate the `MLB_STRUCTURE` based solely on the `standingsData` API response. All team name fallbacks fallback to the API-returned names instead of the hardcoded `MLB_TEAMS`. 

2. **API-Level Bias Inflating 'Under' Edges**
   - **Location:** `pages/api/mlb/props.ts`
   - **Issue:** The logic for selecting prices was flawed for "Under" bets when a direct price wasn't available. It used `fairAmericanFromProb`, which creates a "vig-free" or "fair" price. By comparing the model's win probability against a no-vig price for Unders (while using standard real prices with vig for Overs), the expected value (EV) for Unders was artificially inflated, making them look better than they should be.
   - **Fix:** Implemented `vigAmericanFromProb`, which adds standard book vig (~4.76% juice per side) to simulate a real-world American odds line. This provides an honest, price-shop-free number reflecting the true model-vs-market edge without a systemic bias toward Unders.

3. **Unhandled Edge Cases / Error Handling**
   - **Location:** `pages/api/mlb/*` (general)
   - **Findings:** Reviewed primary endpoints (`hitters.ts`, `pitchers.ts`, `props.ts`, `best-bets.ts`). Most operations are well guarded with try/catch blocks and proper fallback logging. Minor enhancements to error messages could be done in the future, but no critical unhandled edge cases were detected that break the frontend.
