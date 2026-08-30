# Marketplace Phase 18 — Recovery And Accessibility

Date: 2026-08-30

## Safe scope

- Card-funded Club Shop returns now wait until authentication and the verified
  club context have loaded before polling Stripe.
- Stripe checkout identifiers are normalized before use, and restored Club
  Shop URLs retain an encoded club identifier instead of risking `clubId=null`.
- Successful card-funded redemption now leaves an explicit completion message.
  A `needs_review` result still preserves the credited Diamonds and directs the
  member to the existing Diamond purchase path without charging their card
  again.
- Canceled verification sleeps are explicitly released during effect cleanup,
  preventing an abandoned async loop.
- The same-page media inspector now locks background scrolling, restores the
  prior page state, and exposes `aria-controls` / `aria-expanded` state.

## Economics boundary

This phase does not change prices, balances, Stripe settlement, the atomic
Club Shop RPC, poker-rake commissions, union settlement, or agent commissions.
Club Shop sales remain platform-owned with no sales commission or payout.

## High-risk exclusions

- No live card charge or Diamond debit is used for testing.
- No financial invariant is bypassed or rewritten.
- No profile balance is reconciled by application code.
- No broad Club Arena settlement or marketplace-core refactor is included.
