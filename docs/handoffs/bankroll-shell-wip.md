# Bankroll shell (wave 2) - WIP handoff

Branch for shipping: fix/bankroll-shell-wiring (off origin/main 6f0b657d). Bookmark: bookmark/bankroll-shell-wip.
Brief: /home/claude/swarm-brief.md. This notes file must NOT ship in the final PR (delete it on the fix branch).

## Done (uncommitted logic pieces now committed as WIP)
- src/lib/bankroll/dashboardFilters.mjs: sanitizeTimeFilter/ChartType/GameTypes, toggleGameType, nextMenuIndex.
- src/components/bankroll/BankrollFilterMenu.jsx: accessible disclosure dropdown (aria-expanded, Escape, arrows, outside pointerdown, blur close, right-align).
- src/components/bankroll/LeakAnalysisView.jsx: Leaks view loads its own analysis, loading/failed/empty states, recommendations.

## Defects found (pages/hub/bankroll-manager.js line numbers at 6f0b657d)
1. pages/_app.js ~1004 pageErrorBoundaryKey = asPath: every ?view switch REMOUNTS the whole page -> full refetch, location/game-type filters reset, prefs flash USD. Fix: add '/hub/bankroll-manager' to stable-key list.
2. 193 resolveBankrollView: ?view=leaks and ?view=pro silently fall back to dashboard; 2258 Leaks + 2458 Pro blocks dead; SessionHandReview only mounted in dead Pro view. Plan: sidebar adds 'leaks' (Leak Analysis) + 'hand-review' (Hand Review); remove Pro block; header art leaks->jarvis, hand-review->reports; BankrollHelp guides for both. e2e/029 sidebar count 14 -> 16 (3 places).
3. 591 runLeakAnalysis (~dozen queries) runs on every dashboard loadData only for the dead view -> moved into LeakAnalysisView.
4. 1430 outside-click handler never closes chart-type dropdown; dropdowns have no aria-expanded/Escape/keyboard -> BankrollFilterMenu.
5. 347 persisted timeFilter/chartType not validated (bad stored/URL value shows bogus label, silently All Time). gameTypeFilter not persisted.
6. 670 handleLogSubmit awaits loadData although LogEntryModal already dispatched bankroll-updated -> double load per save. Remove direct call.
7. 730 ?view=log-session: if gate refuses (upgrade popup, starting bankroll, offline) URL stays, footer LOG becomes dead button. handleLogClick returns bool; clear view when not opened.
8. 618 loadData failure: dashboard shows '-' and empty chart, no error. Add role=alert + Retry. Locations read non-fatal.
9. Settings 2323: no Display EUR toggle; Auto-Save toggle does nothing anywhere (remove here and in src/config/hamburgerMenus.js 632); Notifications toggle not wired -> gate geofence venue alerts (page 653) on it.
10. 1408 updatePreference: failure keeps UI toggled though not saved -> revert + toast; stale closure.
11. CategoryOverview.jsx: signed-out = "Loading Entries..." forever (loadData returns early, isLoading stays true); its own LogEntryModal bypasses page gates + Bankroll Rules check; no bankroll-updated listener. Plan: onAddEntry/onEditEntry props to page handlers, page LogEntryModal defaultCategory falls back to categoryFilter.
12. showAllEntries modal reappears when returning to dashboard after leaving (once remount fix lands) -> close on section change.
13. Section content needs HubErrorBoundary keyed by view (page-level boundary no longer resets per view).
14. Trip/series banners hardcode '$' ignoring EUR.

## Quick Log decision
REMOVE src/components/bankroll/QuickLogWidget.jsx and its export in src/components/bankroll/index.js. It duplicates LOG (Add +, footer Log, trip banner Add Entry already exist) and writes rows with no location, times or trip that venue/hourly analytics need, and it would bypass the starting-bankroll/Pro gates.

## Status (latest)
All 14 items implemented, tests in __tests__/bankroll-shell-wiring.test.mjs (12 pass), e2e/029 nav count 14->16, funnel law test relaxed to allow no reload in handleLogSubmit. Rendered at 375 and 1100 in /tmp/rh/shell (build.mjs, shot.cjs, server on :8765). Now squashing onto fix/bankroll-shell-wiring and shipping.

## Left (original plan)
Page edits for items 1-14, tests (__tests__/bankroll-shell-wiring.test.mjs + import in __tests__/_test-guards-exist.test.mjs), render at 375px (/tmp/rh/shell, reuse /tmp/rh/ledger/build.mjs + fakeSupabase), recompute sha256 of page in docs/business-hub-guide-review.json, commit with Smarter-Poker author, push fix branch, PR via REST, checks, merge, Vercel READY + /api/health.

## Next exact command
cd /home/claude/wt-shell && git checkout fix/bankroll-shell-wiring && (edit pages/hub/bankroll-manager.js per list)
PR 3256 opened by automation; body set

## Shipping
Squashed clean commit 08426008 on fix/bankroll-shell-wiring, PR #3256 (body set). Next: poll check-runs for that sha, fix failures on the same branch, wait for merge, then Vercel prj_op66GkZyZcygXQKm76iyycfVFAQx READY + https://smarter.poker/api/health.
