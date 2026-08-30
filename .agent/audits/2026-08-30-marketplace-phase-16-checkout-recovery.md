# Marketplace Phase 16 — Checkout Recovery Audit

## TL;DR

Marketplace settlement was already idempotent on the server, but most browser
flows created a new request identifier after a reload or lost response. Phase
16 binds one opaque request identifier to the authenticated user and normalized
purchase intent for 24 hours, reuses it after browser recovery, and removes
only the exact verified/completed intent.

## Root cause

The card and Diamond handlers generated request IDs inside click handlers or
stored them only in React state. A rapid second click was blocked, but a reload,
tab crash, or response lost after settlement erased the client identity. The
next click could therefore reach the server as a distinct valid purchase.

Two financial routes also validated malformed payloads before authentication,
so anonymous callers could receive a purchase-contract error instead of the
consistent private-route response.

## Resolution

- Added a bounded, versioned, user-scoped browser recovery registry. It stores
  no token, card data, shipping address, or price authority.
- Wired merchandise cards, cart checkout, Diamond packages, daily/monthly/
  annual VIP, Club Shop, and Club Shop detail purchases to reuse the same
  request ID for the same intent.
- Successful Diamond settlement clears that exact intent. Verified Stripe
  status returns its opaque request ID so only that checkout is cleared; an
  unrelated checkout in another tab remains recoverable.
- Corrupt, expired, future-dated, oversized, and unavailable browser storage
  fail safely. Records expire after 24 hours and are capped at 48.
- Merchandise and Club Shop Diamond mutations now authenticate before payload
  and idempotency validation.

## Verification

- Phase 16 executable recovery tests cover reload reuse, user/payment/intent
  isolation, exact completion cleanup, cross-tab preservation, corrupt and
  stale storage, complete surface wiring, authentication order, and private
  Stripe return cleanup.
- The complete marketplace suite, repository TypeScript validation, Babel JSX
  parsing, and the full production build must pass before publication.
- No database migration was required; the durable server settlement contracts
  from Phase 15 remain unchanged.
