# Bankroll API routes (wave 2, group "api") - work in progress

Branch to ship from: fix/bankroll-api-routes (this bookmark is a WIP copy only).
Worktree: /home/claude/wt-api. Local babel harness for route tests: NODE_PATH=/tmp/api-babel/node_modules
(@babel/core@7, @babel/runtime@7, next@16 installed there; recreate with npm i in /tmp/api-babel if gone).

## Done
- src/lib/bankroll/apiGuard.mjs (new): guardBankrollRequest (method->405+Allow, bearer->401,
  verify->503 on session-service outage, Cache-Control private no-store), ledgerDay, clientDay,
  exportRequest, pdfExportRequest, taxReportRequest, geofenceVisitRequest, nearbyPoint.
- export.js, projection.js, export-pdf.js, tax-report.js, scan-receipt.js, scan-dealer-document.js,
  linked-venues.js, geofence-visit.js switched to the guard + validators.

## Defects found
- pages/hub/bankroll-manager.js:649 calls /api/bankroll/linked-venues?userId= with NO token -> always 401,
  geofence never starts. (client fix pending: helper src/lib/bankroll/geofenceVenues.mjs)
- pages/api/bankroll/linked-venues.js: `public, s-maxage=120` on a per-player answer; linked venues used
  bankroll_locations coords not directory coords; fallback = first 500 venues nationwide; fallback error ignored.
- src/lib/geofencePush.js:42 posts /api/notifications/geofence-alert with no token -> always 401.
- export-pdf.js: no rate limit; dates/category unvalidated (bad date -> 500); one-sided range printed "All Time".
- tax-report.js: LIMITS.ai (5/min) on a ledger read -> 429 after 5 year switches; parseInt('2025abc') accepted;
  unknown format -> pdf; trips / w2g read errors silently printed as 0 trips / no forms; Generated date server locale.
- export.js: method checked after auth; dateRange unvalidated; format other than csv/json -> json.
- scan-receipt.js / scan-dealer-document.js: 500 responses leaked error.message as `detail`.
- geofence-visit.js: venueId unvalidated (uuid column) -> 500; dup-check error ignored; newVisit null crash.
  geofence_visits.venue_id is uuid but poker_venues.id is integer: needs a migration (report, not fixed).
- All routes: serverAuth status 503 (session check unavailable) answered as 401 "sign in".
- jarvis/dealer-reference.js: LIMITS.write (30/min) on a paid AI call; history unvalidated/unbounded.
- bankrollSelectors.ts createRevisionEntry marks the NEW row is_revision=true while every reader excludes
  is_revision rows (keeps the stale original). Dead code (no caller, 0 revision rows live). Report only.

## Left
- dealer-reference fixes; client callers (bankroll-manager geofence via helper, geofencePush token,
  TaxReportPanel 429/503 + today param, DealerVault status messages, ReceiptScanner detail log,
  DealerReference json catch, exportDownload 429).
- tests: __tests__/bankroll-api-routes.test.mjs (+ import in _test-guards-exist), run, push fix/ branch, PR,
  checks, merge, Vercel READY, curl live 401/405.

## Next command
cd /home/claude/wt-api && git status
