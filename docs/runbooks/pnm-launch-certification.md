# Poker Near Me launch certification and incident recovery

## Finite scope and ownership

This runbook covers representative Poker Near Me public route families, maps,
keyboard/list alternatives, degraded reads and the existing mobile budget.
Sitemap counts inventory reachable public URLs; they do not prove every URL was
rendered or every poker venue nationally exists in the catalog. Running cash
games remain observed, modelled or unavailable according to qualified evidence.
Bravo live remains intentionally disabled. Private persistence is qualified by
the separate unchanged Phase 3–5 receipts, not anonymous page rendering.

The assigned agent owns its branch, PR, provider result and exact live evidence.
Read [AGENTS.md](../../AGENTS.md), [PUBLISHING.md](../../PUBLISHING.md), the existing
task checkpoint and [collector ownership](pnm-local-collectors.md). Do not create
a watcher, scheduler, release repair loop, new infrastructure or publisher.

## Explicit public qualification

Run `scripts/ci/qualify-pnm-launch-phase6.mjs` only as a finite, directly invoked
operation after publication prerequisites are qualified. Supply
`PNM_LAUNCH_MODE=public-read-only`, `PNM_LAUNCH_EXPECTED_SHA=<full-serving-sha>`
and optionally `PNM_LAUNCH_OUTPUT=<owned-evidence-directory>`.
The maintained manual `pnm-launch-phase6-live` lane runs on protected main only.
Its browser portion needs no service key, test account, fixture creation or
production write. The separate hosted read-only freshness step requires the
configured canonical service key; it never gives that key to the browser.

The qualifier brackets its receipt with actual public commit/deployment/database
identity. Each sitemap-selected family runs at 1440×900 and 390×844:

| Family | Maintained public source |
| --- | --- |
| Lobby and nine discovery sections | `src/lib/poker-near-me/sitemapRoutes.js` |
| Root entry redirect | Actual `pages/hub/poker-near-me/index.js` server redirect to lobby; intentionally absent from sitemap |
| Shared daily/events directories | Actual `/hub/daily-tournaments` and `/hub/events-calendar` sitemap entries |
| Structured results and honest empty search | Existing venues route, query plus canonical Nevada planning filters, without mocked responses |
| Location root, state and city | Actual public sitemap |
| Venue detail | Actual `/hub/venues/<id>` sitemap URL |
| Series directory/detail | Actual `/hub/poker-series` and `/hub/series/<id>` |
| Tour directory/detail | Actual `/hub/poker-tours` and `/hub/tours/<code>` |
| Home Games directory, proximity, public detail and location families | Actual public sitemap |
| Saved/alerts anonymous boundaries | Existing private, noindex discovery routes |

The frozen manifest has 31 families and executes 62 desktop/mobile renders.
Missing representatives fail qualification; do not manufacture IDs or skip them.
One main, visible heading, zero document overflow, loaded-media correctness,
scoped 44px controls with only existing explicit exceptions, and uncaught error
checks are required. The receipt distinguishes inventory counts from the exact
representative routes actually rendered.
The scoped sitemap inventory includes the shared poker-series, poker-tours,
daily-tournaments and events-calendar roots as well as namespaced detail routes.
Completed finite steps atomically preserve an intermediate `result.json` with
`passed: false`; a browser termination or partial manifest is never certified.
Context cleanup failures remain visible and fail that observation instead of
discarding the already completed route observations.

Browser sessions are anonymous. GET/HEAD/OPTIONS only; other requests and all
WebSockets are blocked. Screenshots are public viewport captures, never auth
storage, private plans, request headers, network archives or session traces.
Errors redact JWT-like strings, email addresses and URL queries.

Map acceptance includes real keyboard expansion, Escape/focus restoration and
keyboard list navigation. Fault scenarios refuse external tiles, delay and hang
actual bounded area requests, go offline/reconnect, and refuse an actual local
Leaflet runtime chunk. Markers survive transient read failures; deadlines release
controls. Runtime failure exposes “Browse Venue List,” not a frozen spinner.
Runtime injection matches the actual canonical Next script pathname, including
production URLs carrying deployment query parameters. Only the response containing
both Leaflet's initialization error and `_leaflet_id` is refused; the receipt
records its public pathname and requires a positive actual abort count, handled
map failure and successful list navigation. An unmatched interceptor is a
qualification instrumentation failure, not evidence the map itself failed.

The separate 375px cold root sample uses existing load + 1500ms settlement +
300ms buffered LCP conditions without CPU/network throttling. The unchanged
`scripts/ci/mobile-budget.json` PNM limits are 850KiB JavaScript and 2500ms LCP.
Missing script sizes/LCP fail. This one sample is not p75 or field Core Web Vitals.

## Freshness and immutable installation receipts

Record each current installed freshness invariant as PASS, FAIL or UNKNOWN with
observed time, source, count, newest qualified scrape time, maintained threshold
and reason. PASS requires actual threshold satisfaction; FAIL requires an actual
violation; inaccessible interfaces, missing dates or unqualified source evidence
are UNKNOWN. Catalog timestamps never prove running games. Estimated history
stays labelled estimated; missing qualified history remains unavailable.

Use `scripts/check-pnm-directory-snapshot.mjs` for manifest/hash/age and public
parity. Read installed `pnm_freshness_invariants()` through configured read-only
access. Do not infer freshness solely from the older freshness script's exit 0:
missing credentials currently returns 0. Preserve installed migration ledger,
checksum, owner/ACL/search-path/RLS and postimage evidence. Never replay an
installed migration merely to generate a fresh receipt.

Cancelled, skipped, missing, superseded or UNKNOWN results are not passing.
Retain unchanged valid evidence and rerun only affected or required checks.
Publication, source proof, database installation and observed behavior remain
separate. A successful public qualifier alone is not the whole launch verdict.

## Incident triage and protected recovery

1. Record affected URL, expected/observed behavior and UTC time.
2. Read public health and canonical `hub-vanguard` READY identity.
3. Inspect the owning provider result and exact source, compare the last
   qualified equivalent, and classify UI/API, database, map provider or collector.
4. Preserve failing evidence; choose the smallest scoped source correction.
5. Use an owned SSD branch, ordinary hooks, required checks, protected squash
   merge and canonical publication under `PUBLISHING.md`.
6. Verify exact live inclusion and the original affected behavior before closing.

No direct push to main, shared internal checkout, manual alternate publisher or
undocumented Vercel promotion substitutes for this route. Independent deliveries
retain independence; never overwrite a newer protected release to force an old
SHA. Recover unknown operation acknowledgments before any possible duplicate.

## Rollback and durable state

A source rollback is a reviewed protected revert PR through `PUBLISHING.md`.
Inspect intervening changes and schema compatibility first. Reverting source
does not undo committed contribution approvals/reviews, private plans or installed
SQL. Database reversal needs a new qualified corrective migration and exact
readback, preserving maintenance-window and transaction safeguards. Never delete
user history or replay installed SQL. Do not remove registered production
collector roots, their credential stores, another task's work or durable state.

Retain the serving revision, operation owner, chosen correction, provider result,
installation limits and final observed behavior in the existing task checkpoint.
