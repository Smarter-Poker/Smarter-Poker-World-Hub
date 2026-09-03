# Phase 1 review record (2026-09-02/03)

Dan's order before Phase 2: review everything built in Phase 1 for bugs, gaps, stubs, errors, regressions and wiring issues; confirm it was pushed and published; confirm it was fully built.

## Method
Four independent adversarial reviewers (routes group A, routes group B plus the audit wiring in five outside routes, the client index.js plus components, the sub-pages plus the tests themselves) compared the rewritten code against the pre-Phase-1 originals and against every caller. 163 findings: 6 blockers, 15 high, 44 medium, the rest low. Four fixer agents then worked to a contract addendum (PHASE1-CONTRACTS.md items 10-20), followed by a fifth pass that re-verified every client/route pair after the fixes.

## Blockers found and fixed
1. Deep links were destroyed on load: the URL write effect ran before the read effect's state had applied, so /horses?tab=mint landed on Social Horses and rewrote the URL. Fixed with a hydration ref; behaviour unit-tested in src/components/horses/urlState.js.
2. The audit CSV export was never wired: the button ran a page-only export without details/before/after. Wired to exportAuditLog (full walk).
3. Fleet Status read the retired launch_all response names; every KPI rendered "-". Route now returns new names plus legacy aliases; client reads the new names.
4. Row caps had silently shrunk to 50 on eight lists the console renders without a pager (clubs, unions, cashouts, members, agents, tables, ledger, grinder roster) while the client summed and counted the page as if it were the set ("Chips On Books"). Caps restored and made explicit, totals computed server-side (memberChipTotal, memberCount, whole-fleet grinder totals via chunked reads), "Showing N Of Total" wherever truncated.
5. hg-reports / hg-appeals fabricated a total from offset + rows, which disabled Next on every full page. Routes return total null plus hasMore; the Pager treats an unknown total honestly.
6. generate-avatars turned a roster-read failure into a 200 "No Horses Were Eligible". Now a 503.

## High and medium (all fixed)
Un-chunked 500-id .in() in bulk actions (chunked at 200); raw Supabase errors thrown into the wrapper (mapped through src/lib/horses/dbErrors.js: duplicate -> 409, not found -> 404, permission -> 403); failedSources leaking database text (generic per-source messages plus request id); count exact on huge tables (planned counts); audit vocabulary rename splitting the Audit tab filters (filters are now arrays of prefixes, new plus legacy, sent as actionPrefixes); auditOperatorAction able to throw on a bad action name (never throws; files unknown.action with the rejected name); execute-sql writing two audit rows per commit with a fabricated role (one row, real role); union-application hard-coded role; client IP resolution inconsistent with extractClientIP; Mint onClick passing the event as an offset; Mint opId able to outlive a changed payload; ?section= deep links spinning forever; audit filter inputs never rendered; toCsv exporting negative numbers as text; GDPR erase rendering nothing on a null receipt; unknown grinder status folded into Idle; ledger circulation total missing.

## Test hardening
Tautological file-text tests replaced or backed by behaviour tests: urlState, auditFilters, pagerModel, toCsv, dbErrors, listShape, hgOperator wrapper end-to-end, chunking (assert .in() never exceeds 200 ids), single audit row per SQL commit, route-total contract for the hg routes, tokenScope on every root branch, var() declarations harvested only from the scoped block. Fake query builders now record AND apply filters/ranges so a wrong column or an off-by-one range fails. Suite: 227 tests across 6 files.

## Evidence
node --test on the Mac (Node 26): foundation 24, routes A 53, routes B 42, sub-pages 42, console 53, libs 13, merch 4; ESLint 0 errors; check-title-case OK; npm run build exit 0; CI on PR #1255 (see the PR checks).
