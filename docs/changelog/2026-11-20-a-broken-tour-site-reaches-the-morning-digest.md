# A broken tour site reaches the morning digest (2026-11-20)

## Why

World Hub #2900 stopped one failing tour site from failing the whole tour collector run (`scripts/tour_stealth_scraper.py`), which had paged `LocalScraperRuntimeFailure` as critical. The failure is now recorded only on that tour's `public.tour_source_registry` row: `scrape_status` becomes `error` and `last_successful_scrape` keeps the last good run. Nothing read that row, so a tour site could stay broken for weeks without anyone being told.

## What changed

The daily digest is now the reader.

- `src/lib/dailyDigest/assemble.mjs`: `loadTourSourceHealth` reads the active registry rows once per digest; `selectStaleTourSources` applies the rule; `addTourSourceAttention` adds one Needs Your Attention item (`tour_sources_stale`, warning, not dispatched to the alert fleet) and counts it in `attention_status.not_picked_up`. The email subject `[N Need Attention]`, the header count and the bell notification ("N items need attention. The full digest is in your email.") all count `digest.attention`, so the item is counted everywhere.
- `src/lib/dailyDigest/render.mjs`: a Tour Schedule Sources card (email, online view) and text section list each stale source with tour code, tour name, scrape status and days since its last successful scrape. The card appears only when there is something to report.

## The rule

- Only active rows (`is_active`), and manual sources are skipped exactly as `load_tours` skips them (`scrape_method` is `manual`, case and spaces ignored).
- Stale means `last_successful_scrape` is null or more than 7 days old.
- A `pending` tour (between seasons, dates not yet published) is not a failure: the collector reached and verified its page and deliberately does not stamp success. It is listed only if the collector has not checked it for more than 7 days, because then the pending answer is itself out of date.
- If the registry cannot be read, the digest says so as its own item (`tour_sources_unreadable`) instead of reporting no stale sources.

## Live check

Read-only query on 2026-11-20: 26 active rows, 5 manual (CPPT, FPN, LODGE, NAPT, TPO), 21 scraped. AUPT is pending with its last success on 2026-11-07 (13 days) and was checked today, so it is correctly not listed. WTP is pending and checked today. Every other scraped source succeeded today. The digest would list no tour source today.

## Tests

`__tests__/daily-digest-tour-sources.test.mjs` (added to Digest Report Regression): the selection rule (healthy, pending, manual, inactive, exactly 7 days, 8 days, never succeeded, active status with no recent success, pending but unchecked), the scraper's manual and active filters it mirrors, the loader's query and its unknown result on a failed read, the item and its count, the card and text, and the wiring through `loadDigestData`, the cron's notification and the online view. One existing funding test now gives its fake client a healthy registry so its count stays the funding items only.
