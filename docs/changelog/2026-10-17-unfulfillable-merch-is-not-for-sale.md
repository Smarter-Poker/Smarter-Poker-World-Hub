# Unfulfillable Merch Is Not For Sale

**Date:** 2026-10-17
**Migration:** `supabase/migrations/20261017122737_unfulfillable_printful_merch_is_not_for_sale.sql`
**Test:** `__tests__/unfulfillable-merch-is-not-for-sale.test.mjs`

## Why

Dan's rule: the store never takes money for something it cannot fulfil. With
the Printful webhook registered (#2475, #2476), Printful holds exactly two
products, Diamond Altitude Hoodie and Royal Circuit Tee (Black, S-2XL). The
other thirteen Printful catalog items, and the Royal Circuit Tee's four White
sizes, have no Printful product, so a paid order for any of them could never be
submitted, and `/api/store/readiness` reported `fulfillmentMode: misconfigured`.

## What Changed

They are taken off sale with `is_active = false`, the mechanism checkout, the
merch catalog, Diamond purchase and the readiness probe all filter on.
`provider_pending` was not used: those rows still sell as manual made-to-order
goods. Each row keeps its name, art and price and carries
`sale_paused_reason: no_printful_product`; it comes back on sale by creating its
Printful product, mapping `sync_variant_id`, and setting `is_active = true`.

Off sale: All In After Dark Tee, Cold Four-Bet Hoodie, Dead Money Detector Tee,
Final Table Voltage Hoodie, Ice Orbit Snapback, Midnight Circuit Beanie, Neural
Steel Diamond Hat (Black, Navy), No Free Cards Tee, Range Architect Tee, River
Signal Trucker Hat, Stack Pressure Zip Hoodie, Tournament Wire Insulated
Tumbler, Vault Cut Poker Towel, and Royal Circuit Tee White S-XL.

## Local Collectors (same day, no code change)

- `com.smarter-poker.tour-scraper` exited 1 because its runtime root had lost
  `runner.py`, `releases/` and `state/`. Reinstalled per
  `docs/runbooks/pnm-local-collectors.md` at the current protected revision;
  `check` passes and the run is writing `tour_stop_events`.
- Retired to `~/Library/LaunchAgents/_retired/2026-10-17/`:
  - `pnm-freshness-watchdog`: its script lived in a deleted runtime; a Mac-side
    watchdog shares the failure domain it watches, and `publish-watchdog.yml`
    already asks Supabase whether the scraper fleet is still writing.
  - `pokeratlas-tournaments-daemon`: a legacy one-shot from the old checkout,
    superseded by `tournament-schedule-daemon` (PokerAtlas is its first source);
    running both would be a second writer.
  - `yt-cookie-refresh`: its credentials are gone, and the script still targets
    host 5.161.49.206, which was compromised in August and replaced (#2173).
    It must not ship Google session cookies there.
