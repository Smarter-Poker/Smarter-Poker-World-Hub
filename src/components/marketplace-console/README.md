# Marketplace Console V1

This package is the shared painted-hardware foundation for Marketplace routes.
It does not own a route, product catalog, checkout, account view, or fulfillment
flow.

## Composition Rules

- Use one `MarketplacePageConsole` as the outer page chassis.
- Use either both painted footer actions or no footer actions. A single empty
  painted plate is rejected at runtime.
- Preserve each Marketplace page's existing layout, information architecture,
  route labels, and behavior unless a separate redesign explicitly changes it.
- Upgrade the real controls and content already in that layout. Apply painted
  hardware to its existing cards, buttons, frames, and status surfaces instead
  of adding standalone destination objects or another navigation display.
- Share the console's materials, lighting, and control language without making
  every page a one-to-one clone. Each existing surface keeps its own purpose and
  composition.
- Use `MarketplaceConsoleNavigationPlate` only for one standalone back or
  continue action. Do not repeat it into a navigation list.
- Do not repeat `MarketplaceConsoleUtilityCard` or
  `MarketplaceConsoleMediaCard` as a generic grid on one surface. Prefer one
  outer console with engraved rows or a purpose-built singular surface. These
  components are for a singular utility or media emphasis.
- Keep internal destinations as root-relative paths. The components route them
  through Next Link in the current app surface.
- Supply live labels in Title Case. Components preserve supplied casing and do
  not apply text transformation.
- The only page-console crest is the approved spade already painted into the
  head asset. Do not add an icon prop or place another emblem over it.

## Assets

All runtime artwork lives under
`public/images/marketplace-console-v1`. The adjacent `manifest.json` records
the source path, source hash, packaged hash, native size, and family for every
file. Fixed hardware stays in those images. Dynamic labels and values remain
live DOM text fitted to measured zones.

VIP plan choices keep the existing approved gold VIP artwork. Only their live
typography, spacing, focus treatment, and selection state may be refined. Do
not replace them with ornamental empty card masters. No standalone Marketplace
destination objects are part of this package.
