# The Mint owns every diamond, and the store APIs tell the truth (2026-09-05)

Companion to the Club Arena changelog
`docs/changelog/2026-09-05-the-wallet-is-a-vault-and-every-diamond-comes-from-the-mint.md`
(branch `agent/cw-wallet/fix/wallet-vault-audit`), which carries the wallet
rebuild and migration `20260905041033` (applied to production).

Dan, 2026-09-04: "All diamond wallets need to be connected to The Mint.
That's where all purchased diamonds come from, and all earned diamonds derive
and send from the Mint." And: "You can't actually buy anything with diamonds
anywhere, you get an error message from any and all pages."

## Database (applied, see the Club Arena migration)

`trg_ca_diamond_register_follows_journal` on `diamond_transactions` writes a
`ca_mint_ledger` row for every issuance (purchase / reward / promotion /
refund / adjustment / arena) and every retirement (spend / bridge /
adjustment). `fn_ca_mint_overview()` now returns a `diamonds` block:
register net, meter (player balances + house), difference, `balanced`, 24h
and since-baseline issuance / retirement, headroom, by origin. Register and
meter reconciled at 1,030,607 with an explicit, labelled opening correction.

## This repo

- `pages/horses/index.js` (The Mint): a second reconciliation card, "Every
  Diamond Is Accounted For", reading `totals.diamonds`; the ledger origin
  filter gains the diamond origins.
- `pages/api/horses/mint.js`: `ORIGINS` allowlist learns `purchase`,
  `reward`, `promotion`, `refund`, `adjustment`, `arena`, `spend`, `bridge`,
  `unclassified`, so the ledger filter accepts them.
- `pages/api/vip/check-status.js`: a profile READ error answers 503
  `{success:false, error}` instead of 200 `{diamonds: 0}`. The old shape
  made every purchase surface (Club Arena marketplace, Hub store) grey out
  every Buy button with "Insufficient Diamonds" and no visible error during
  any database hiccup. A missing profile row still returns the honest zero.
- `pages/api/club-arena/marketplace-items.js`: with no `clubId`, the
  storefront club is the membership with the most active `club_shop_items`,
  then any membership - not an unordered `.limit(1)` that put Dan on a club
  with zero items while another of his clubs had twelve.
- `__tests__/diamond-store-phase-21.test.mjs` re-pinned to the new
  resolution in the same commit.

## Verification

- `node --test`: phase-21 12/12; horses console/server/client suites 312/312.
- `eslint` on the four files: 0 errors (pre-existing warnings only).
