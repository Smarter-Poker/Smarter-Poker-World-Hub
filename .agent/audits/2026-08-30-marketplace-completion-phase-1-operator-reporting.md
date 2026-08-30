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
