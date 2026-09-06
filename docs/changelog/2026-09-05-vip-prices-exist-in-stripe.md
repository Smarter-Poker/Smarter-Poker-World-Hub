# The three VIP prices exist in Stripe now

**2026-09-05.** Dan: *"I HAVE DECIDED, AND TOLD YOU WHAT TO DO WITH THIS: the
Stripe price IDs ... are set in no environment. FINISH IT UP."*

## What was true before

The live Stripe account had **zero active prices**. Not "the wrong ones" -
none, ever. Every VIP sale went through the inline `price_data` fallback added
when the two subscription terms were found unbuyable, which sells correctly but
means the amounts live only in server code. Repricing meant a deploy.

Lifetime was worse: it had **no environment variable at all**. Monthly and
yearly each had one that was simply unset; lifetime had nothing to set.

## What now exists

One product, `Smarter.Poker VIP` (`prod_VCnhSUZq1FIIhO`), with three prices:

| term | price | billing | lookup key |
| --- | --- | --- | --- |
| Monthly | $19.99 | every month | `vip_monthly` |
| Yearly | $199.99 | every year | `vip_yearly` |
| Lifetime | $499.00 | **one-time** | `vip_lifetime` |

Each carries `metadata.sp_vip_tier`, and each has a `lookup_key`, so they can
be found again without hardcoding an id. The creation script is idempotent -
it looks up by `lookup_key` and skips anything that already exists.

Wired into `hub-vanguard` (production + preview):

```
STRIPE_VIP_MONTHLY_PRICE_ID   price_1UCO6LQMAlYoh8I4MobgIIHP
STRIPE_VIP_YEARLY_PRICE_ID    price_1UCO6LQMAlYoh8I4ES8zGOmd
STRIPE_VIP_LIFETIME_PRICE_ID  price_1UCO6LQMAlYoh8I474BVFvB7
```

## The code change

`STRIPE_VIP_LIFETIME_PRICE_ID` did not exist, so this adds it, giving lifetime
the same deal the two subscription terms already had:

- **When set**, the Stripe price object is the source of truth. Checkout
  retrieves it, and `line_items` charges the price by id, so the dashboard is
  where the amount changes. The `unitAmount` written to the pending
  `vip_lifetime_purchases` row comes from that same retrieved price, so the
  record and the charge cannot disagree.
- **When unset**, the $499 server-side constant still sells the term. A missing
  env var is a deployment gap, not a reason to refuse a sale.
- **A recurring price is refused.** `!stripePrice.active || stripePrice.recurring`
  answers 503 rather than selling it. A lifetime term is a price, not a rate -
  a recurring price here would bill a player again every interval for something
  the store sold as permanent, which is the single worst thing this path could
  do. The inline fallback has no `recurring` block for the same reason.

`switch-vip-plan.js` is deliberately untouched: it switches between the two
subscription terms, and lifetime is a one-time purchase, not a plan you
switch onto.

## What this does not change

The amounts. Monthly $19.99, Yearly $199.99, Lifetime $499 are Dan's, decided
on 2026-09-05, and the Stripe prices were created to match the numbers already
in the code - not the other way round. Prices for what players are sold in
future are his call (CLAUDE.md 10.9); this only moves the dial into the room
where he can turn it.
