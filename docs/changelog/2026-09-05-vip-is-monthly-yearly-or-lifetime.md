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

---

## Addendum, same day: Lifetime by card now works

The section above shipped Lifetime as diamonds-only because the card path did
not exist. It does now.

**The shape that was missing was a money-losing one.** `handleCheckoutCompleted`
had no VIP case at all under `mode === 'payment'` — it handled
`metadata.type === 'diamonds'` and `'merchandise'` and then fell off the end of
the chain. A paid one-time VIP session would have been charged, granted nothing,
and returned **200**, which tells Stripe never to retry. Money taken, membership
silently never issued.

What closes it:

- **`vip_lifetime_purchases`** (migration `20260905180000`) — a pending row per
  checkout, with `UNIQUE (stripe_checkout_session_id)`. Every other card path
  here settles through a pending row for the same reasons: the webhook can fire
  more than once, can fire before the browser returns, and can fire for a charge
  later refunded.
- **`settle_vip_lifetime_card_purchase_atomic`** — sets `is_vip`,
  `vip_tier = 'lifetime'` and a **NULL** `vip_expires_at`, and marks the row
  completed. Probed in a rolled-back transaction: first settle granted, a replay
  of the same session returned `duplicate: true`, and a *different* session on
  the same row was refused as `settlement_conflict` rather than granting twice.
  Revoked from PUBLIC/anon/authenticated — it grants a paid membership from a
  purchase id, so a browser that could reach it could grant itself Lifetime free.
- **`type: 'vip_lifetime'`** as its own checkout type, not a fourth plan under
  `subscription`, because Stripe's `mode` is derived from that string and a
  subscription mode would renew a membership that by definition never renews.
  The $499 lives on the server; the client sends only a plan key.
- **A one-time `price_data` with no `recurring` block**, which is what makes it
  a single payment.
- The webhook branch **throws** on a settlement failure rather than swallowing:
  a paid customer with no membership needs Stripe's retry.

So Lifetime is now buyable both ways, exactly as asked: **$499 by card or 49,900
diamonds.** `cardCheckoutReady` stays in the data as a tripwire for any future
term that arrives without a card path.
