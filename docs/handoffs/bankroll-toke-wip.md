# Bankroll toke wave 2 handoff (toke group: pages/hub/toke-tracker/**)

Worktree: /home/claude/wt-toke, ship branch `fix/bankroll-toke-pages` (off origin/main 6f0b657d).
This bookmark = ship branch WIP commits + this notes commit. Do NOT ship this notes file.

## Done (committed)
- src/lib/bankroll/tokePrefs.mjs + src/components/bankroll/toke/useTokePrefs.js: one prefs hook for all 5 pages.
  Defect: pages/hub/toke-tracker/{shift,analytics,vault,venues}.js read prefs only from localStorage (index read the account),
  so Down Timer Alerts off on one device still fired on another device's Shift Tracker. Also no real cross-tab sync.
- src/lib/bankroll/dealerTax.mjs: 1099-NEC threshold ($600 <=2025, $2,000 from 2026, OBBBA s.70433); per-event IRS mileage
  via tokeReport irsMileageRate (TaxSummaryModal had 2026 = $0.67, wrong); tax year options/default; vaultFileType (empty-type
  pickers), vaultCanPreview (HEIC skipped cropper); licenseExpiry (calendar-day badge; old ms floor said "0d" for tomorrow).
- TaxSummaryModal.jsx: year no longer pinned on first render (?tab=tax before gigs loaded = empty selector); loading/error/signed-out states.
- pages/hub/toke-tracker/vault.js: gig load error/loading tracked (was "No Completed Events" on failure).
- DealerVault.jsx: orphaned storage object removed when DB insert fails; jumps to uploaded doc's year; amount 0 rendered stray "0";
  delete busy guard; HEIC thumbnails not drawn as <img>.
- TokeCalendar.jsx + calendarSelectors.ts: delete verifies a row was deleted (RLS 0 rows looked like success); delete busy;
  detail dialog lists other events that day + Add Event (a booked day could not get a second event from the grid); day aria-labels.
- src/lib/bankroll/tokeVenueStats.mjs written (paid hours like tokeReport, venue name normalisation, dealing-only game types,
  bracket by lower bound).

## Status
Shipped as PR #3250 (head 66876369). Remaining: watch checks, merge, verify Vercel prod.

## Left (historical)
1. Wire VenueIntelligence.jsx to tokeVenueStats.mjs (label "Paid Hours").
2. Tests: __tests__/toke-tracker-pages.test.mjs (import it in __tests__/_test-guards-exist.test.mjs).
3. Render at 375 in /tmp/rh/toke (venues, vault, tax summary, calendar).
4. Push fix/bankroll-toke-pages, open PR via REST, watch checks, verify Vercel prod READY.

Next command: edit src/components/bankroll/VenueIntelligence.jsx
