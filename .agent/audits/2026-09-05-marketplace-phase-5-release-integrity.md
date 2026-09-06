# Marketplace Phase 5 Of 8: Release Integrity

Date: 2026-09-05

## Outcome

Phase 5 reconciles the Marketplace verification contract with the commerce
paths that are actually deployed. The VIP storefront, its automated contracts,
and its compiled browser journeys now agree that monthly and yearly plans use
recurring card checkout, Lifetime uses one-time card checkout, and every plan
also offers Diamond settlement.

## Defects Found And Closed

- The canonical Marketplace suite still asserted that a retired Daily VIP
  product existed. It now verifies the rendered monthly, yearly, and Lifetime
  plans and both settlement methods.
- A VIP management contract expected the obsolete `annual` plan key even
  though the product and server contract use `yearly`. The assertion now uses
  the canonical key.
- The Lifetime purchase wiring test and compiled browser test claimed its card
  route was not built. The one-time Stripe checkout and webhook grant had
  already shipped, so both tests now prove that the browser emits
  `vip_lifetime`, the checkout API accepts it, and the webhook settles it.
- The Lifetime primary action used a generic subscription label. It now states
  the exact one-time card price while monthly and yearly actions identify their
  recurring interval.
- Two banned long separators survived in wallet source comments. They were
  removed, and the repository text gate now reports no banned long bar.
- The repaired repository lint runner generated `.cache/eslint` without an
  ignore rule. The generated cache is now excluded from source control.
- Production publication exposed fourteen broken symbolic links under the
  training image directory. Their timestamped targets had been removed in a
  public-asset cleanup, and Vercel failed after a successful compile while
  packaging the first dangling link. The unreferenced links are removed, and
  the public-asset budget gate now rejects every symbolic link before merge.

## Preserved Boundaries

No price, Stripe product, entitlement duration, Diamond grant, Diamond burn,
inventory mutation, database schema, or Club commission changed. Club sales
remain fully platform-owned. Automatic Printful connection remains deliberately
deferred.

## Verification Before Publication

- 218 of 218 canonical Marketplace contracts passed.
- The four focused VIP and text contracts passed 32 of 32 assertions.
- TypeScript completed with no error.
- ESLint passed all 3,928 source and test files. Targeted lint also passed every
  changed JavaScript, JSX, TypeScript, and test file.
- The exact `npm run build` release command passed all protected prebuild
  suites, the optimized Next.js webpack compilation, 403 of 403 static pages,
  and the postbuild Personal Assistant performance budget.
- The complete compiled-production Marketplace browser suite passed 62 of 62
  checks across desktop Chromium and the mobile Chrome profile.
- The repository Title Case gate passed every page.
- The UI text gate scanned 2,753 files and found no banned long separator.
- Marketplace source scans found no external-tab target, browser tab spawn,
  embedded secret, debug log, unfinished stub, or banned separator.
- `git diff --check` passed.

## Publication Evidence

Publication evidence is recorded after protected-main merge and exact-release
production verification.
