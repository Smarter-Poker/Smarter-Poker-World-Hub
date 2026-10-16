# 2026-10-16 - the Diamond Wallet ledger sits on the Cashier desk

Dan, 2026-10-16, on the World Hub header wallet: "the bottom needs to be
enhanced and optimized. it still has the flat boring buttons. and you can
remove the "diamonds in play" at the top."

- The "Diamonds In Play" line above the painted wallet card is gone, and
  `DiamondInPlayBalance.jsx`, which only that line used, is deleted. The
  painted card and its live figures are untouched.
- The bottom half now wears the desk Dan approved the same day on Club
  Arena's Cashier and wallets: a hairline search well (#05070a, 1px #27313c,
  no radius), the date range as a hairline box, the kind filters and Stats as
  lit words (muted at rest, the chosen one white with a blue glow, counts
  kept), hairline ledger rows on #080b0f with credits in blue and debits in
  red, muted date group labels, Retry, Load More, Copy Receipt and Show
  Everything as lit words, and a ruled footer.
- Words stay Title Case: the Marketplace typography law forbids uppercase
  transforms on this surface. No gradients, no hover, no green.

Only `DiamondWalletModal.module.css` rules changed for the bottom half; every
handler, query, filter, pagination and aria wire in the component is as it
was.
