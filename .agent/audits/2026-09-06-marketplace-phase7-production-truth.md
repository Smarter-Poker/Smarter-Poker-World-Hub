# Marketplace Phase 7 Of 8: Production Truth And Certification

Date: 2026-09-06

Status: Production Schema Applied; Source Publication And Exact Deployment
Certification Pending

## Scope

Phase 7 makes the Marketplace release gate prove what production is actually
serving. It covers the Marketplace hub, Diamond Store, VIP Membership, Merch
Store, Smarter Rewards, Club Shop, all owned subpages, the five storefront hero
assets, private commerce APIs, readiness reporting, database-backed catalogs,
payment capability matrices, and the exact deployed commit.

This phase does not change Club revenue ownership. Club Shop Diamond purchases
remain platform-owned Diamond burns, and no club commission or revenue split is
created.

## Production-Truth Contract

- Every Marketplace page and subpage now emits an immutable
  `data-marketplace-route` identity. The deployment verifier requires the exact
  marker for all fifteen audited HTML routes instead of accepting a generic
  successful response.
- The five canonical storefront hero assets must return WebP content, contain
  valid RIFF/WEBP file signatures, and exceed the minimum non-placeholder byte
  size.
- Production-truth verification requires an exact forty-character
  `MARKETPLACE_EXPECTED_SHA`. `/api/health` must report healthy application and
  database state and the same commit. Preview and production deployment gates
  receive the deployment SHA directly from the GitHub deployment event.
- Verifier requests use manual redirect handling. Unexpected redirects fail
  instead of being followed, which also prevents the Vercel protection-bypass
  header from crossing an origin boundary.
- `/hub/marketplace` must retain its exact permanent redirect destination.
  Retired Chip and Daily VIP purchase surfaces must remain explicitly retired.
- Private API probes now verify exact anonymous and unsupported-method status
  codes, JSON response bodies, `private, no-store` caching, and
  `Vary: Authorization`. Probe concurrency is bounded to avoid manufacturing an
  outage while testing one.

## Catalog And Readiness Truth

- Strict merchandise catalog mode fails closed for a missing table, an empty
  active catalog, unavailable variant authority, or a variant-backed item with
  no active variants. It never presents fallback inventory as production
  commerce authority.
- Merchandise item and variant contracts expose explicit Card and Diamond
  checkout capability fields. Strict verification validates positive integer
  prices and both settlement methods for every purchasable physical item.
- The strict Club Arena catalog must be database-sourced, warning-free, free of
  retired Chip packages, and contain a nonempty set of unique, valid Diamond
  offers. Verification intentionally does not hardcode the current package
  count or identifiers, so valid database catalog changes do not create false
  deployment failures.
- VIP monthly and yearly plans explicitly support Card and Diamond checkout.
  Lifetime explicitly supports Diamond checkout and keeps Card checkout safely
  disabled. Diamond packages explicitly support Card and reject buying
  Diamonds with Diamonds.
- Stripe readiness now requires secret, publishable, and webhook keys whose
  modes agree. Vercel production requires live-mode keys. Readiness output
  exposes only booleans and a mode classification, never secret material.
- Printful token, store, webhook, and automatic-confirmation configuration are
  evaluated independently. No Printful configuration means deliberate manual
  fulfillment; partial configuration is misconfigured and fails readiness;
  healthy mixed inventory is reported as mixed; and automatic fulfillment is
  reported only when every active merchandise item is fully mapped.
- Catalog reads use deterministic ordering, reject empty merchandise authority,
  and avoid retrying timed-out database work while the original query may still
  be running.

## Payment And Entitlement Safety

- VIP storefronts now fail closed unless a Card capability is explicitly true.
  A missing capability can no longer route a non-Lifetime purchase into the
  Lifetime Diamond path.
- Diamond VIP purchase rejects monthly, yearly, and Lifetime settlement while
  the member has an active or unresolved recurring Card subscription. This
  prevents a later Card renewal from consuming or obscuring a Diamond-funded
  expiry extension. Subscription eligibility read failures return a retriable
  service-unavailable response instead of authorizing a purchase.
- Card and Diamond VIP acquisition now share the same per-member database row
  lock. Card checkout refuses an active Diamond-funded term; Diamond settlement
  refuses an unexpired Card checkout claim or blocking Card subscription; and
  completed Diamond requests replay durably before current eligibility checks.
- Subscription checkout claims remain in place across ambiguous Stripe create
  results and unconfirmed expiration attempts. A same-key retry reuses Stripe's
  idempotency key, reclaims a matching open session, finalizes the database
  fence, and only then returns the session URL. Deterministic pre-creation
  failures remain releasable.
- Configured Stripe VIP prices are validated as active USD prices with the exact
  server-owned amount, billing interval, interval count, licensed usage, and no
  conflicting namespaced `sp_vip_tier` metadata. Checkout and plan switching
  both fail closed on a mismatch.
- VIP entitlement grants are derived from the server plan contract rather than
  mutable Stripe Price metadata.
- Stripe webhook VIP activation and revocation profile-update failures now throw
  so Stripe retries delivery instead of acknowledging an entitlement mutation
  that was not stored.
- Reactivation-conflict compensation accepts only the exact latest paid invoice
  for the exact subscription and payment. It refreshes Stripe authority before
  refunding, refreshes it again before cancellation, and never refunds a
  historical invoice or an already-recorded subscription admission.

## Preserved Boundaries And Explicit High-Risk Exclusions

- Printful connection and automatic fulfillment remain deliberately deferred at
  the owner's request. Current merchandise fulfillment remains manual, and the
  verifier's automatic-fulfillment requirement is opt-in for the future
  Printful release.
- Lifetime Card checkout remains paused. Building its refund, dispute, and
  cross-method entitlement lifecycle without a durable acquisition ledger would
  risk double revocation or incorrect entitlement removal.
- Recurring VIP Card refund reconciliation remains excluded. Safe automation
  requires durable acquisition provenance before a refund can distinguish
  Card-funded time from Diamond-funded extensions.
- A full merchandise and recurring VIP dispute incident state machine remains
  excluded. Adding hold, won, lost, recovery, and entitlement actions is a
  schema and product-policy change with material settlement risk.
- The narrow `20260906213000_marketplace_phase7_vip_acquisition_mutex.sql`
  migration changes only VIP acquisition preconditions and admission
  projection: it adds the `admitting` claim state, constrains persisted Stripe
  subscription statuses, replaces the Card-claim and Diamond-v3 functions,
  installs service-only admission/projection/finalization/version RPCs, and
  removes the legacy destructive profile-projection trigger. It adds no table,
  column, index, settlement mutation, exchange-rate change, catalog price,
  entitlement duration, inventory grant, Club commission, or revenue split.

## Verification Evidence

Completed local, rollback-only, and production-schema evidence:

- Canonical Marketplace contract suite: 308 passed, 0 failed after the final
  Stripe Price, ambiguous-recovery, webhook-race, and readiness corrections.
- Focused Phase 7 suites: 24 passed, 0 failed, including execution of the real
  webhook admission, terminal reconciliation, historical-invoice rejection,
  compensation-race, and exact Checkout Session claim paths.
- Title Case and banned long-bar repository gates passed across 2,771 UI files.
- Full repository ESLint passed across 4,010 source and test files in 106
  bounded batches. Changed-source syntax checks and `git diff --check` passed.
- The complete optimized production build passed, including all prerequisite
  suites, 399 generated pages, Marketplace dynamic and SSG routes, and the
  Personal Assistant postbuild performance budget.
- PostgreSQL 17 executed the exact migration, its postcheck, its documented
  rollback, and the exact forward migration again. Behavioral probes covered
  exact-session admission, projection/finalization, valid Card reactivation,
  Diamond and Lifetime conflicts, permanent admitting barriers, durable replay,
  and both Card-first and Diamond-first concurrent acquisition races.
- The exact migration executed successfully against the linked production
  schema inside a forced rollback transaction. A post-probe query proved the
  version RPC remained absent, the original trigger remained present, and the
  original two-state claim constraint remained intact.
- The exact migration was then applied to production and migration version
  `20260906213000` was recorded. Its built-in postcheck and independent queries
  proved the v1 marker, the three-state claim constraint, the eight-state
  subscription constraint, legacy-trigger removal, unchanged zero claim and
  subscription row counts, and service-role-only access for all eight Phase 7
  RPCs.
- Supabase advisors remained unchanged across the migration: 681 security
  findings and 51 performance findings, with zero new findings introduced.

Still required before this phase can be declared complete:

- Sanctioned branch publication, protected checks, pull-request merge, and exact
  Vercel production deployment.
- Strict live production verifier with commerce, checkout, performance, and
  production-truth requirements enabled against the exact deployed SHA.
- Final live confirmation that current manual merchandise fulfillment is
  reported truthfully and Card and Diamond capability matrices match every
  production catalog.

## Publication Evidence

Pending. Commit, pull request, merge SHA, Vercel deployment, and strict live
verification results must be recorded here before Phase 7 is declared complete.
