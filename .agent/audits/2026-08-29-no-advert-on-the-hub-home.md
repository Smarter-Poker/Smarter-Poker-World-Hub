# No advert on the Hub home

2026-08-29, Cowork session `cowork-ads3`.

**Dan, verbatim: "DO NOT PUT ADS IN RANDOM PLACES OR OVERLAPPING IMAGES EVER."**

## What was wrong

`HubPromoStrip` was mounted on `pages/hub/index.js` on 2026-08-28, behind this
reasoning, which was mine and was wrong:

> It renders in normal flow right under the sticky header, which lands it in the
> empty band above the 3D carousel — the carousel is position:fixed, so nothing
> moves.

`position: fixed` is exactly why it failed. A fixed carousel is not in the flow,
so an element placed in the flow does not sit above it in an empty band — it
sits **on** it. In production the strip covered the featured cards, which are
the page. Dan's screenshot shows "SMARTER POKER | Tournaments Run All Day"
laid across the Poker Near Me card.

"Nothing moves" was the only thing I checked. Nothing moving and nothing being
covered are different claims, and I verified the wrong one.

## What changed

- The mount and its error boundary are gone from `pages/hub/index.js`, replaced
  by a comment saying why and telling the next reader not to re-add it.
- `src/components/ui/HubPromoStrip.js` is **deleted**. Nothing else mounted it,
  and an unused ad component is the estate's standard bug shape waiting to
  happen.
- Every rule the strip was pinned on — click logged before navigation, click
  logged only after the destination check, hard navigation for Club Arena
  destinations, dismissal not persisted, no VIP gate, no emoji — is now pinned
  on `HubPromoRail`, the surviving Hub surface. No guarantee was dropped with
  the file.
- New pin: **`no advert is mounted on the Hub home`**, which asserts the absence
  (comments stripped first, since the page now names the component in prose).

## What did not change

The `hub_promotions` slot still serves, on the promotions rail at
`/hub/promotions` — in-page, in-flow, owning its own space. All six placements
are untouched; no migration, no catalog edit. The rail is where the premium
dynamic creatives will land.

## Verification

- `node --test __tests__/house-ads-hub-promotions.test.mjs` — **34 passed**
  (33 before; one repointed test set, one new).
- esbuild parse of `pages/hub/index.js` — clean.
