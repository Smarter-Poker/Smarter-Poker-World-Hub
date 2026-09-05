# VIP is Monthly, Yearly or Lifetime

2026-09-05

Dan, verbatim: **"We don't sell bronze silver or gold, just vip, monthly,
yearly or lifetime, add lifetime for $499."**

## The lineup

| term | card | diamonds | access |
| --- | --- | --- | --- |
| Monthly | $19.99 | 1,999 | 30 days, extends what you have |
| Yearly | $199.99 | 19,999 | 365 days, extends what you have |
| **Lifetime** | **$499** | **49,900** | never expires, never renews |

100 diamonds per dollar throughout, the rate the diamond packs already use (the
Whale pack is 50,000 for $500). Monthly and Yearly keep their prices; only the
word "Annual" changes. Lifetime is new.

## Four vocabularies, none of them agreeing

Before this change the platform used four different words for the same thing:

```
profiles.vip_tier              'lifetime' | 'monthly' | null      the truth
purchase_vip_with_diamonds_..  'daily' | 'monthly' | 'annual'     the seller
vip_subscriptions.tier CHECK   'monthly' | 'annual'               the Stripe row
vip_pricing.tier               'bronze' | 'silver' | 'gold'       nine dead rows
```

Migration `20260905153833` (Club Arena repo) settles all four on monthly /
yearly / lifetime, and rewrites `vip_pricing` so it stops describing a ladder
that never existed. It was probed inside a rolled-back transaction first: all
three terms bought correctly, lifetime came back with `expires_at: null`, and
both retired words returned `invalid_arguments`.

## The Daily Pass is retired

A 24-hour, 150-diamond pass is not one of the terms Dan named. Measured before
removing anything:

```
diamond_transactions with transaction_type 'vip_daily'      0
diamond_purchases carrying a 'vip_daily' redemption intent  0
profiles.vip_tier = 'daily' or 'annual'                     0
vip_subscriptions rows, any plan                            0
```

**Not one VIP membership has ever been sold, on any plan, by card or diamonds.**
The 21 human lifetime members and 11 active monthly ones were granted. So this
changes only what a future buyer is offered.

Gone: `pages/api/store/purchase-daily-vip.js`, `runDailyPassPurchase`,
`handleDailyVipCardCheckout`, and the `vip_daily` redemption intent (the
card-funded version, which bought the smallest sufficient diamond package and
auto-redeemed 150 of them). `order-ledger.js` and `diamond-liability.js` still
recognise the `vip_daily` transaction type on purpose: they read history, and
history does not change because a product was retired.

## Lifetime is diamonds-only for now, and the page says so

`create-checkout-session.js` builds `mode` as
`type === 'subscription' ? 'subscription' : 'payment'`, `prepareCheckout`
refuses a price with no `.recurring`, and `handleCheckoutCompleted` in
`webhooks/stripe.js` has **no VIP branch at all** under `mode === 'payment'`. A
one-time lifetime session would be paid and grant nothing, silently, returning
200 so Stripe never retries.

So Lifetime is not in `VIP_SUBSCRIPTION_PLANS`, and the storefront offers no
card button for it. The primary button routes it to the diamond purchase, which
works today, and the label reads "Lifetime VIP Is Bought With Diamonds: 49,900"
rather than a price that would 400. **The card path is the next change**: a
third checkout branch, a webhook branch, and an idempotent settlement.

## Two bugs found while renaming

- `webhooks/stripe.js` ranked tiers `{ daily: 1, monthly: 2, annual: 3,
  lifetime: 4 }`. A `'yearly'` renewal would have scored `undefined || 0` and
  lost every comparison, so it could have been downgraded by a prepaid monthly
  extension. Now `{ monthly: 1, yearly: 2, lifetime: 3 }`.
- `store-catalog.js`'s drift check compared prices with
  `if (actual !== undefined && ...)`, so a plan that **disappeared** from
  `diamondStoreData` made the check go silent instead of firing - exactly what
  retiring the Daily Pass and renaming Annual would have done. Presence is part
  of the check now, and a retired plan reappearing is itself a warning.

Also fixed on the way past: `VIPCard` rendered `/{plan.interval}`, which for a
term with no interval would have printed "/undefined"; it reads "One Payment"
for lifetime and shows the diamond price on every card.

## Verified

60 store tests pass (`vip-purchase-wiring`, `diamond-store-phase-12/15/16/17/
23/24`, `store-commerce-hardening`). All eleven changed files parse.
`diamond-store-phase-14` fails identically on `origin/main` - it imports
`SourceTextModule` from `node:vm` and needs `--experimental-vm-modules`.
