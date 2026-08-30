# Marketplace Phase 17 — Safe Hardening

Date: 2026-08-30

## Decision implemented

Club Shop sales are platform-owned. A purchase consumes the buyer's Diamonds,
delivers the purchased inventory, and does not credit a club, club owner,
agent, affiliate, or commission ledger. The purchase audit now records the
settlement model as `platform_owned_diamond_burn`, and the Phase 17 contract
test guards the authoritative RPC against commission or payout wiring.

## Changes

- Marketplace readiness no longer requests exact full-table counts. It reads
  only the bounded catalog plus one sentinel row, retries one transient
  provider/database failure, and uses a six-second per-attempt timeout.
- Public readiness cache persistence was reduced from 60 seconds plus 120
  seconds stale to 30 seconds plus 30 seconds stale.
- Checkout-status authentication now occurs before opaque Stripe reference
  validation so anonymous callers cannot use validation differences as an
  endpoint oracle.
- The deployment verifier now covers cart, order history, wishlist,
  fulfillment operations, public catalog contents, private checkout status,
  and every Diamond-funded purchase authorization boundary. An opt-in
  `--require-performance` gate enforces the configured response-time budget.
- Marketplace detail pages now offer an in-page, keyboard-dismissible image
  inspection viewer. Catalog `metadata.gallery_images` is supported without a
  schema migration; the original image remains the safe fallback.

## Deliberately excluded as high risk

- No worker was added that retries or mutates already-settled card-funded
  redemption records. That path can move balances and entitlements and needs a
  separately reviewed reconciliation design.
- No live card charge or live Diamond debit was generated during verification.
- No large refactor of the multi-thousand-line store checkout components was
  attempted.
- Printful provider mapping remains deferred by product decision.

## Verification

- `node --experimental-vm-modules --test __tests__/diamond-store-phase-17.test.mjs`
- Focused Phase 10, 13, and 16 marketplace contracts
- Full `npm run test:marketplace`
- TypeScript and production Next.js build gates
- Playwright marketplace product-inspection flow
- Production deployment verifier with checkout and performance requirements

The final command counts and live production SHA are recorded in the shipping
output for this change.
