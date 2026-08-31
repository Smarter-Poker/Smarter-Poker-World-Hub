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

### Post-Publish Browser-Matrix Closure

The repository-wide browser matrix exposed two additional marketplace defects
after the first Phase 1 merge. Both were fixed before Phase 1 was closed:

- Merchandise pages could briefly assign the cart to `guest` before browser
  authentication resolved, clearing an owner-bound persisted cart on reload.
  Cart ownership now changes only after authentication reaches a terminal
  signed-in or signed-out state.
- The new exact-artwork global footer captured pointer input across its full
  transparent frame and could block purchase controls. The decorative nav and
  artwork stage now ignore pointer input; only the six explicit, 44-pixel-or-
  larger navigation hit zones remain interactive.
- Cart payment radios now expose stable `Pay With Card` and `Pay With Diamonds`
  accessible names, and the 320-pixel browser fixture uses the current owner-
  bound v2 persistence schema rather than the intentionally quarantined legacy
  schema.

The exact product-detail add-to-cart and reload journey passes with normal
pointer input in desktop Chromium and mobile Chrome. The complete optimized
build, all 120 marketplace contracts, the footer contract across all 14
worlds, and all 402 static pages pass after these fixes.

The authenticated CI matrix then proved that deferring the owner effect alone
was insufficient: a purchase control could become clickable before that effect
committed. The final implementation disables cart insertion until auth is
resolved and synchronously assigns the resolved owner in the same transaction
as `addItem`. The regression now installs a deterministic signed-in owner even
in focused local runs, so it cannot silently exercise only the guest path.

The same matrix found that the footer's near-integer-maximum stacking layer let
its six legitimate link zones cover an open VIP confirmation dialog. The
footer now occupies navigation layer 900, below the platform modal layer, and
the route audit dismisses page-owned onboarding before intentionally testing
footer links. Exact signed-in cart reload and VIP confirmation flows pass in
desktop Chromium and mobile Chrome after these final changes.

### Final Re-Certification — 2026-08-31

Phase 1 was reopened from the latest `main` before Phase 2. The audit found a
release-gate coverage gap: the mandatory Marketplace command included the
Phase 7–21 suites but omitted the foundational route, VIP, Phase 2–6, legacy
visual, and atomic Club Shop contracts. Three of those older assertions had
also become stale as the implementation grew stronger, so running them only by
hand produced false failures instead of protecting the release.

The foundational suites are now part of `npm run test:marketplace` and the
Vercel build context. Their assertions recognize the lifetime-VIP disable
condition, all three focus-trapped confirmation dialogs, and the distinction
between a harmless header-reservation comment and a selector that could style
the locked global header. The mandatory Marketplace gate therefore expanded
from 120 to 189 contracts without weakening the current implementation.

An authenticated production pass then found one real precision defect at the
320-pixel boundary: a quantity button declared as 44 CSS pixels rendered as
43.99998 pixels under mobile device scaling. Cart quantity controls now reserve
45 by 45 CSS pixels, including explicit minimum dimensions, so they remain
above the 44-pixel accessibility floor after subpixel rounding. The signed-in
cart, both payment choices, overflow checks, and every decrease, increase, and
remove target pass in desktop Chromium and mobile Chrome after the fix.

This pass did not change prices, Stripe or Diamond settlement, inventory,
commissions, entitlements, database objects, or Printful behavior. Automatic
Printful fulfillment remains deliberately deferred; card and Diamond checkout
remain enabled.

### Final Live Hydration Re-Certification — 2026-08-31

A fresh signed-in production audit before Phase 2 found one remaining shopper-
facing failure state. If the Club Shop membership or catalog request never
settled, the five-second safety timer cleared only its busy flag. Because the
load was still unverified, the render branch continued to show “Loading Club
Shop...” indefinitely and the abandoned request could later race a retry.

The shopper loader now owns a bounded request identity and timer for foreground
and silent refreshes. A timed-out foreground load terminates in a visible,
retryable error; a superseded request cannot overwrite a newer result; database
membership errors fail closed instead of masquerading as “No Club Found”; and
unmount cleanup invalidates pending work. The mandatory Marketplace gate now
contains 190 contracts, including this terminal-state and latest-request-wins
regression.

### Authenticated Club Shop Data-Path Closure — 2026-08-31

The first post-publication signed-in replay proved that the infinite loader was
gone, but it also showed that the browser's direct `club_members` read could
time out while authenticated server APIs (including the order ledger) remained
healthy. A retryable error is a safe terminal state, but it is not a usable
storefront, so Phase 1 remained open.

Membership resolution now runs inside the authenticated `marketplace-items`
API. The optional `clubId` remains membership-checked, while an omitted ID is
resolved from the signed-in user's server-owned membership record. A user with
no club receives an explicit successful empty-store response; an unauthorized
requested club still fails with 403. The browser now makes one bounded,
abortable request and receives the verified club ID with the catalog response.

Independent balance/catalog reads and catalog-count, per-user-count, and
purchase-history reads execute concurrently. Every result that affects balance
or limits is error-checked, preserving fail-closed commerce behavior while
removing avoidable database round trips. No purchase, Diamond burn, card
settlement, inventory, entitlement, commission, or Printful contract changed.

The first production invocation of the corrected API then exposed a distinct
serverless cold-start boundary: the response completed successfully, but just
after the original five-second browser deadline. A warmed retry immediately
loaded 11 items, the authenticated Diamond balance, purchase history, Manage
access, and both settlement choices. The loader now permits a bounded 12-second
cold start before aborting. It still terminates genuine hangs, invalidates stale
responses, and keeps the same visible retry path.
