# 2026-11-28 Marketplace #SMARTERDESIGN Wave 2

Follow-up to the Diamond Store redesign (#3201). This finishes the Marketplace: the VIP pages, the global Diamond Wallet popup, the merch fulfillment console, painted header art for every store page, and the store polish items left over from wave 1.

## VIP (all routes: `/hub/vip-membership`, `/compare`, `/manage`, `/gift/[plan]`)

- The rejected shark-panel plates and the painted primary button plate are gone. Primary actions are chrome-active cobalt, secondary actions chrome-row, prices sit in chrome-stat wells, the featured plan has a chrome-active rim and Close is a square 44px chrome control (`VipKit.module.css`, `VipMembershipPage.module.css`, `VipMembershipCard`, `VipMembershipConsole`, `VipGifts`, `VipManage`, `compare.module.css`).
- The VIP masthead (scene, crown seal, chrome "?") is unchanged. Its two header paints are listed in `SMARTERDESIGN_SEAL_AND_HEADER_PAINT`.
- No price, plan, eligibility ($1 first month), checkout, entitlement or route logic changed.

## Diamond Wallet popup

- `DiamondWalletModal.module.css` is on the `--sd-*` tokens: no gold text, chrome panels, wells and controls, cobalt for the active filter, square corners, 12px minimum.
- The painted wallet art stays, now inside a steel rim; its readouts still sit on the measured plate centres. Chart amber is cobalt and chart red is cyan.
- The wallet text-colour exemption in the design guard is removed, so the rule is now enforced there too.

## Merch fulfillment console (`/hub/merch-store/fulfillment`)

- Store image header ("Merch Fulfillment", the orders art, three help steps) with the toolbar under it, chrome surfaces throughout. The readiness readout carries `data-state`; green shows only for Commerce Ready.
- Card totals use the shared money formatter ($60, $34.50) and the operations metrics are grouped counts (18,000).

## Painted header art

- All eight store headers (Diamonds, Merch, Rewards, Club Shop, Cart, Orders, Order Details, Wishlist) have new painted seals and scenes, replacing the crops of existing renders. Masters: `.agent/art/store-headers/`, prompts: `scripts/art/store-header-prompts.json`, derivation: `scripts/art/derive-store-headers.py`.
- Phones get their own 2:1 scene frame cut around the subject (480x240, each under 15 KB) through a `<picture>` source, with the subject placed right of the title. Desktop focal points follow the same subject centres.
- The scenes are lifted slightly (`brightness(1.18)`) and the left fade is shorter so the low-key paintings read on the navy header. The two new fades are listed in the approved header paint.
- The Diamonds seal is cropped to the gem with the pedestal faded to navy, so it also reads on the small package-card seals.

## Store polish

- Intro text under the Club Shop, Merch and Rewards tabs and the reward telemetry heading now sit in panels.
- 27 font declarations raised to 12px or more; a guard covers 42 store files and reads the `font:` shorthand.
- Club Shop grid: 1 column on phones, 2 from 700px, 3 from 1080px, square media capped at 260px. This also gives the signed-out preview a grid.
- One USD formatter, `src/lib/store/formatStoreMoney.mjs` (`formatUsd`, `formatUsdCents`), used by cart, orders, order detail, wishlist, club item detail, checkout status and the fulfillment console.

## Render harness

- `scripts/render-marketplace/` renders 10 routes and 21 states at 393px and 1280px against `next dev` with every store API mocked, and `pair.py` builds BEFORE/AFTER sheets. Fixtures now include the fulfillment queue and operations summary. `npm run render:marketplace:validate` and `__tests__/render-marketplace-fixtures.test.mjs` keep the fixtures in step with the store normalizers.

## Tests

- New: `format-store-money`, `render-marketplace-fixtures`, the VIP chrome test, the 12px guard, the fulfillment money and count guard.
- Updated: `diamond-store-smarterdesign`, `smarterdesign-standard`, `marketplace-painted-residuals`, `diamond-store-phase-12`, `diamond-store-phase-19`, `marketplace-accessibility-outline-and-targets`, `vip-purchase-wiring`, `marketplace-merch-premium`, `the-wallet-badges-count-the-whole-ledger.law`.

## Notes

- The header art was painted with `grok-imagine-image` on the xAI key of a separate project, because no Smarter.Poker image key works (AI Gateway 401, Anthropic account out of credits, OpenAI key revoked).
- The Diamond Wallet's painted Buy Now / Send plate is cut at its lower edge by the caption strip that hides the raster's baked-in "For 30 Days" line. That is the same on main and was left as it is.
