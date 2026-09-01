# Marketplace Phase 4 Of 8: VIP Lifecycle Integrity

Date: 2026-09-01

## Outcome

Phase 4 closes the remaining split path between the legacy Settings VIP card
and the verified Marketplace VIP Command Center. Every member now reaches one
same-surface lifecycle experience. Card plan changes and cancellations have a
bounded browser request, a stable replay identity, private response caching,
and truthful recovery after a partial local synchronization failure.

## Defects Found And Closed

- The legacy Settings cancellation modal advertised a 50 percent retention
  discount, performed no Stripe coupon mutation, and then claimed the discount
  had been applied. The unwired offer and the entire obsolete modal are gone.
- Settings now opens the canonical VIP Command Center in the same browser
  surface. It does not open a new tab, duplicate billing controls, or maintain
  a second cancellation state machine.
- Settings order receipts now open the private owner-scoped Marketplace
  receipt route in the same surface instead of spawning an external tab.
- VIP plan changes and cancellations could wait without a browser deadline.
  Both actions now terminate after 20 seconds and report that no result was
  assumed.
- A timed-out action could be retried with a new external identity. The browser
  now preserves one request key for the exact action until the server confirms
  success. Stripe receives a user-scoped idempotency key for both mutations.
- Repeating a plan switch while the local webhook projection lagged could
  submit the already-active interval again. The route now reads the live Stripe
  subscription interval and returns an idempotent success without repricing it.
- Stripe could accept a cancellation while the immediate local projection
  update failed, causing the API to claim the entire cancellation failed. The
  response now truthfully confirms the billing result and marks membership
  telemetry as reconciling while the existing Stripe webhook refreshes it.
- Cancellation reasons and lifecycle request bodies were unbounded. Both APIs
  now reject unknown fields, oversized bodies, invalid request keys, invalid
  reason codes, and overlong cancellation details.
- Private lifecycle responses now explicitly use private no-store caching and
  vary on authorization.

## Preserved Boundaries

No VIP price, Stripe product, invoice policy, Diamond grant, Diamond burn,
entitlement duration, inventory rule, database schema, Club commission, or
Printful behavior changed. Club sales remain fully platform-owned. Automatic
Printful connection remains deliberately deferred.

## Verification Before Publication

- 217 of 217 canonical Marketplace contracts passed.
- Five new Phase 24 contracts cover canonical routing, removal of the deceptive
  offer, terminal browser requests, stable replay identity, Stripe
  idempotency, live same-plan detection, strict request shapes, private cache
  headers, and post-Stripe reconciliation truth.
- The exact `npm run build` gate passed all protected prebuild suites, the
  optimized Next.js webpack compilation, 403 of 403 static pages, and the
  postbuild performance budget.
- The complete compiled-production Marketplace browser suite passed 62 of 62
  desktop and mobile checks.
- The VIP browser journey verified distinct valid idempotency keys for plan and
  cancellation requests while remaining on `/hub/vip-membership/manage`.
- The repository Title Case gate passed every page.
- The UI text gate scanned 3,301 files and found no banned long separator.
- `git diff --check` passed.

## Publication Evidence

Publication commit, pull request, deployment, and live production probes are
recorded after the protected release reaches the public domain.
