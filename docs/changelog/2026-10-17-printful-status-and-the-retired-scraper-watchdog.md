# Printful Status, And The Retired Scraper Watchdog

**Date:** 2026-10-17 (Dan: "go ahead and finish all of these up")

## Printful status (read only)

`/api/store/readiness` reports merch fulfillment `misconfigured` because
`PRINTFUL_WEBHOOK_PUBLIC_KEY` is missing, and 14 of 15 Printful catalog items
have no `sync_variant_id`. All four Printful variables in Vercel are
`sensitive` (write-only), so nobody can read the API token to ask Printful what
the store holds. `GET /api/horses/printful-status` (operator console read
permission, same wrapper as `merch-catalog-admin`) runs where the token lives
and returns:

- the v2 webhook configuration: URL, events, expiry, the public key (not a
  secret: Printful sends it in `x-pf-webhook-public-key` on every delivery),
  whether Printful's signing secret equals `PRINTFUL_WEBHOOK_SECRET`, and
  whether the env public key matches;
- every sync product and sync variant (sync variant id, catalog variant id,
  name, size, colour, SKU, external id).

It never returns the token or the secret, never writes to Printful and never
touches an order. `src/lib/store/printfulStatus.js`, pinned by
`__tests__/printful-status.test.mjs` (wired into `test:marketplace`).

## The scraper watchdog launchd job is retired

`com.smarter-poker.scraper-watchdog` on the Mac had failed every 5-minute run
since 2026-09-29: it pointed at
`~/.local/share/smarter-poker-scraper-runtime-20260906/scripts/scraper-watchdog.py`,
a runtime folder that no longer exists. It was unloaded (`launchctl bootout`)
and its two plists moved to `~/Library/LaunchAgents/_retired/2026-10-17/`.
Nothing is lost: the PokerAtlas daemon now kills a hung fetch after 240 seconds
and its supervisor restarts it, and the `ScraperDead` operational alert pages on
stale data. House rule: watchdogs are not revived. The admin scraper-health
list no longer shows it. `scripts/scraper-watchdog.py` stays in the repo (its
tests still cover it) and the Vercel `/api/cron/scraper-watchdog` route is a
separate scheduler, untouched.

## Registering the Printful webhook without anyone seeing its keys

The status route showed Printful had **no webhook registered at all**, so the
`PRINTFUL_WEBHOOK_SECRET` in production signed nothing and there was no public
key to fetch. Printful only issues a webhook's `secret_key`/`public_key` when it
is registered, and the token that can register it lives only in production.

`POST /api/horses/printful-webhook-setup` (`settings.write`, body
`{ confirm: "register-printful-webhook", recipientPublicKeyPem }`) registers
`https://smarter.poker/api/store/webhooks/printful` for `shipment_sent`,
`shipment_returned`, `order_failed` and `order_canceled`, and returns both keys
only as an envelope sealed to the caller's RSA (>= 3072-bit) public key
(AES-256-GCM, data key wrapped with RSA-OAEP-SHA256). The holder of the private
key opens it and writes both values into the host env; the plaintext never
reaches a browser, a log or a chat. It never replaces a webhook: one at our URL
is resealed from Printful's own record, one anywhere else is a 409. It never
touches an order. `src/lib/store/printfulWebhookSetup.js`, pinned by
`__tests__/printful-webhook-setup.test.mjs` (in `test:marketplace` and
re-included in `.vercelignore`).
