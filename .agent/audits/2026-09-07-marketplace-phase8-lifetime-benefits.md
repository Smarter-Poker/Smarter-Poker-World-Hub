# Marketplace Phase 8 Of 8: Lifetime VIP Digital Benefits Release Candidate

Date: 2026-09-07

Latest Integration Verification: 2026-09-13

Status: Verified And Ready For Publication For The Approved Non-High-Risk World Hub Scope

## World Hub Scope

The World Hub Marketplace now presents a plan-specific Lifetime VIP contract
instead of reusing the finite Monthly and Yearly allowance copy. Selecting
Lifetime VIP updates the main VIP storefront and comparison subpage in the same
browser surface and lists the digital benefits that Club Arena entitlement,
catalog, and gameplay paths expose.

The Lifetime contract includes:

- Unlimited Rabbit Hunts without consuming Hunt Pack credits or Diamonds.
- Unlimited standard 20-second Time Bank activations while retaining the
  two-per-street anti-stall limit.
- Unlimited Throwables without consuming pack credits or Diamonds.
- Every current and future cataloged digital table skin, felt, background, card
  back, and dealer button.
- Every VIP-only avatar, frame, and aura exposed by the catalog.
- Lifetime-only Emoji Packs and Player Tags.
- Stack Display, Offline Protection, and Automatic Time Bank behavior inherited
  from the ordinary VIP contract.

Monthly and Yearly VIP continue to show their finite monthly contracts: 100
Rabbit Hunts, 500 Throwables, 120 extra Time Bank seconds, and the existing 500
Diamond stipend. Plan selection is now the authority for the benefit list and
count shown on both Marketplace surfaces.

## Marketplace Integrity

- The VIP storefront derives its rendered benefits from the selected plan.
- The VIP comparison route derives each plan's count from the same canonical
  catalog helper and names every Lifetime-only digital benefit.
- Lifetime remains purchasable through the existing atomic Diamond settlement
  path. Lifetime Card checkout remains deliberately paused until its refund,
  dispute, and cross-method entitlement lifecycle is separately published.
- Marketplace navigation remains same-surface through Next.js links with no new
  tab or popup behavior.
- User-visible Lifetime copy is Title Cased and contains no banned long-bar
  character.
- The Vercel upload allowlist includes the Phase 8 Lifetime contract test so a
  direct build cannot omit the new release guard.

## Explicit Safe Boundaries

Lifetime VIP includes digital Club Arena gameplay and cosmetic entitlements. It
does not make physical merchandise, Diamond packages, another membership,
tournament buy-ins or chips, transferable assets, Club creation, or operator
inventory free. Club Shop sales remain 100 percent Smarter.Poker revenue; no
club commission or club credit is created. Printful remains deferred by owner
direction.

The requested 2,000-Diamond monthly Lifetime grant with 90-day expiry is not
advertised or issued in this safe phase. The current wallet is fungible and has
no lot-level provenance or expiry ordering, so expiring that balance could burn
purchased or normally earned Diamonds. That feature requires a separately
designed promotional-lot ledger, deterministic spending order, rollback-tested
expiry settlement, and liability reconciliation before it is safe to publish.

## Integrated Verification Evidence

- Integrated base: `origin/main` at `6d955dd8ad47`.
- Focused Lifetime contract: 7 passed, 0 failed.
- Canonical Marketplace suite: 361 passed, 0 failed.
- TypeScript `tsc --noEmit --pretty false`: passed with zero errors.
- Full repository ESLint: passed across 4,264 files in 108 bounded batches.
- Optimized Next.js production build: passed with all 390 pages generated.
- Postbuild Personal Assistant performance budget: passed for every measured
  route and server file.
- `git diff --check`: passed after adding this receipt.

## Publication Verification Contract

Release preparation and publication are separate facts. This source receipt
records the verified candidate scope and gates without claiming a deployment.
The coordinated release report must name the merged World Hub commit, confirm
that production `/api/health` serves that commit, and record the Marketplace
production smoke result before the release is described as published.
