# 2026-11-27 Diamond Store #SMARTERDESIGN

Owner order: the Diamond Store and all of its pages and sub pages get the complete #SMARTERDESIGN treatment.

## Shared image header
- New `src/components/diamond-store/StoreImageHeader.jsx`: the Club Arena Cashier header composition for every store page. One steel rim, a circular chrome seal, a live white italic title, a masked scene on the right, and the shared #SMARTERDESIGN header "?" (`.sd-header-help` with `SD_HEADER_HELP_ICON`, the Club Arena Cashier icon) in the upper-right corner. The "?" opens a native help dialog with steps and FAQs, a 44px close, Escape/backdrop dismissal and focus return. Back and route controls sit above the header, never inside it.
- Header art for Diamonds, Merch, Smarter Rewards, Club Shop, Cart, Orders, Order Details and Wishlist, cropped from the store's existing renders by `scripts/art/derive-store-headers.py`. VIP keeps its existing VIP art.

## Storefront (/hub/diamond-store, /hub/vip-membership, /hub/merch-store, /hub/smarter-rewards, /hub/club-shop)
- The slogan hero is gone. Each section opens on its image header; the old slogans moved into the help dialog.
- Tabs, section bar, meta pills, starter packs, package cards, rewards, club shop browse/manage/ledger/analytics, dialogs and admin tools use the nine-slice chrome rims (`chrome-readout`, `chrome-stat`, `chrome-row`, `chrome-active`), cobalt selected controls and ink-navy surfaces. Gold/amber/purple text, glass boxes, hairline frames, rounded corners, angular clip-paths and painted shark/bay/spade/console art were removed.
- Smarter Rewards VIP card uses the VIP kit seal and price plates with the real $1 first month eligibility logic.
- Duplicate "Club Shop" and "Smarter Rewards" headings under the image headers were removed.

## Account and detail pages
- Cart, Orders and Wishlist use the image header through `MarketplaceSubpageShell`; the route rail is a two-column chrome control grid on phones.
- Merch, Club Shop item, Smarter Rewards and Order detail pages render the image header through `MarketplaceDetailExperience`.

## Tests
- Store design-guard tests now enforce the #SMARTERDESIGN materials (four standard gradients, chrome rims, no :hover, no banned text colours, no rejected painted art). New `__tests__/diamond-store-smarterdesign.test.mjs`.
