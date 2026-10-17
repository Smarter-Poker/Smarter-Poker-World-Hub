# Merch With No Fulfilment Path Is Not For Sale

**Date:** 2026-10-17
**Migration:** `supabase/migrations/20261017123820_merch_with_no_fulfilment_path_is_not_for_sale.sql` (installed 12:38 UTC)
**Test:** `__tests__/merch-with-no-fulfilment-path-is-not-for-sale.test.mjs`

## Why

Dan's rule: the store never takes money for something it cannot fulfil, and
Dan does not hand-fulfil orders. After the unmapped Printful rows went off sale
(20261017122737), ten active rows still had no fulfilment provider: the five
`provider_pending` made-to-order items (Circuit Breaker Playing Cards, Final
Table Mirror Sunglasses, Neural Steel Card Protector, Range Grid Desk Mat,
River Read Polarized Sunglasses) and the five original static-catalog items
with no provider at all (100-Chip Travel Set, 500-Chip Pro Set, Gold Card
Protector, Stealth Card Protector, Premium Playing Cards). Every sale path sells
a non-Printful row into the manual fulfilment queue, which only a person can
work, and `merchandise_orders` has never recorded a fulfilled order.

## What Changed

All ten are `is_active = false` with `sale_paused_reason: no_fulfilment_provider`;
names, art and prices are kept. The store now sells only the two mapped Printful
products (Diamond Altitude Hoodie, Royal Circuit Tee Black S-2XL), and
`/api/store/readiness` reports `ready`, `fulfillmentMode: automatic`,
`manualItems: 0`. The one existing order is unchanged (same row fingerprint
before and after).

A row comes back on sale when it has a real provider: a Printful product with
its `sync_variant_id` mapped, or another integrated supplier.

## The reservation tests keep running

CHECK 10 (`scripts/check-economy-invariants.mjs`) needs at least seven
`test_merch_reservation()` results. That function took its fixture from the
first ACTIVE plain item with finite stock. With every such item off sale, it
returned one `fixtures_available = false` row, and CHECK 10 failed on every PR.
Migration `20261017131129` (applied 13:11 UTC) falls back to an off-sale item.
It sets `is_active = true` only inside each probe, and that probe's
`rollback_probe` exception undoes it. Production after a run: all 7 tests pass,
2 items active, `card-protector-black` still off sale with stock 100.
