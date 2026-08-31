# Marketplace Completion Phase 1 Of 8 — Operator Reporting

Date: 2026-08-30

## Outcome

The Club Shop Manage surface now consumes one authenticated, server-owned
operator report. It no longer reads purchase rows in the browser or estimates
historical sales by multiplying the current item price by a row count.

## Completed Scope

- Historical volume is calculated exclusively from
  `club_shop_purchases.price_paid`.
- Refunded purchases are reported separately and subtracted from net sales and
  net Diamond burn volume.
- Current Diamond commerce and legacy chip history are separated. Unknown
  future currency values remain explicit instead of being guessed into either
  bucket.
- The ledger uses stable `created_at, id` paging with exact row-count metadata
  and a 50,000-row safety ceiling. If that ceiling is reached, the UI labels
  the report partial and names processed versus total rows.
- Database and membership read errors fail closed. The Manage surface renders
  a visible operator error and a 44-pixel retry control instead of showing
  believable zeroes.
- Item cards show net units, Diamond burns, and refund counts. The summary
  explicitly states that Club Shop sales are platform-owned Diamond burns and
  create no club, owner, agent, affiliate, or commission credit.
- Successful create, toggle, and delete mutations await both operator-report
  and shopper-inventory refreshes before clearing their busy state.
- The separate shop analytics endpoint now preserves the same currency and
  completeness contract.

## Risk Boundary

No purchase, refund, Stripe, Diamond-balance, entitlement, inventory-delivery,
commission, or atomic settlement function changed. No database migration was
required. Printful remains deferred.

## Verification

- 4 Phase 21 reporting contracts passed.
- 33 focused Club Shop, item-rule, Phase 20, and Phase 21 contracts passed.
- 118 complete marketplace contracts passed.
- JSX-aware Babel parsing passed for every changed runtime file.
- Strict undefined-identifier and React hook lint passed with zero errors.
- Repository TypeScript validation passed.
- The full repository prebuild and optimized Next.js webpack production build
  passed, generating 402 static pages.
- Post-merge browser certification exposed one stale Club Shop fixture that
  still mocked the retired browser-side purchase-table reads. The fixture now
  intercepts the authenticated `/api/club-arena/manage-shop` report, and the
  guarded operator-delete journey passes against production in desktop
  Chromium and mobile Chrome.
- The production marketplace verifier passed every storefront, detail route,
  account route, cinematic asset, readiness capability, and private purchase
  boundary. The live Club Shop returned 200 and both operator-report endpoints
  returned the expected 401 without authentication.

## Phase 1 Closure Audit — 2026-08-31

The original Phase 1 implementation was re-audited against the latest `main`
before Phase 2. The review followed the complete request path from the Club Shop
Manage control through browser authentication, report fetch, API authorization,
ledger paging, currency/refund aggregation, response validation, realtime
refresh, failure recovery, and desktop/mobile rendering.

### Defects Found And Closed

- A failed first report request could still render plausible zero sales and a
  false “No shop items yet” state. Verified totals and item emptiness are now
  withheld unless a structurally valid server report has loaded.
- A report request had no deadline and could remain busy indefinitely. It now
  has a 12-second abort deadline and a named retryable timeout state.
- Changing clubs or unmounting the page did not cancel an in-flight operator
  report. Requests are now aborted and their loading ownership is controller-
  scoped, preventing an older request from clearing a newer request's state.
- The operator report used a cached access token. It now requests a fresh token
  before loading the private ledger.
- Purchase realtime events refreshed the shopper catalog but not the open
  operator report. They now refresh both views when Manage has been loaded.
- A missing database exact-count response at the 50,000-row ceiling could be
  mislabeled complete. Completeness now carries `totalRowsExact`; an unknown
  upper bound remains partial and the UI says “At Least”.
- Ledger scans had stable ordering but no common upper snapshot. Both reporting
  APIs now bind their count and page reads to one `snapshotAt` timestamp.
- The Manage report accepted malformed club identifiers and could turn a client
  error into a database 500. It now rejects non-UUID identifiers with 400.
- Private operator responses did not explicitly prohibit caching. Both report
  endpoints now send `Cache-Control: private, no-store, max-age=0`.
- Corrupt `price_paid` values silently became zero revenue. Reporting now fails
  closed unless the historical paid amount is a non-negative safe integer.
- Analytics combined all-currency sale counts with Diamond-only revenue and
  seeded 31 points for a 30-day request. Primary counts are now Diamond-only,
  legacy/future currencies remain separate, refund/net values reconcile at
  day, item, buyer, and total boundaries, and the series contains exactly the
  requested number of UTC dates.

### Review Matrix

| Lens | Closure result |
|---|---|
| Architecture | One server-owned reporting path remains authoritative; no browser commerce-table scan or duplicate settlement logic was introduced. |
| Security | Owner/admin authorization remains mandatory; UUID validation, private no-store caching, fresh-token retrieval, and fail-closed malformed-ledger handling were added. |
| Quality | Loading ownership, abort cleanup, partial-count copy, and realtime refresh now have explicit deterministic states. No TODO, stub, placeholder, or silent fallback remains in the Phase 1 reporting path. |
| Testing | Functional corruption/completeness contracts, static wiring contracts, and a first-request-failure/retry browser journey cover the defects. |

### Closure Verification

- 6/6 Phase 21 operator-reporting contracts passed.
- 120/120 complete marketplace contracts passed after merging current `main`.
- Babel parsed every changed JavaScript/TypeScript runtime and browser-test file.
- `git diff --check` passed with no whitespace or conflict-marker defects.
- The full `npm run build` gate passed: repository prebuild checks, marketplace
  contracts, optimized Next.js webpack compilation, and all 402 static pages.
- The failure → withheld totals → retry → verified report → guarded delete
  journey passed against the compiled production server in desktop Chromium
  and mobile Chrome.
- No database migration, purchase settlement, Diamond burn, Stripe, inventory,
  entitlement, commission, or Printful behavior changed in this closure pass.
