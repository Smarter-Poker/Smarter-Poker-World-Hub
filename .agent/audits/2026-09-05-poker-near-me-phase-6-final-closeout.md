# Poker Near Me Phase 6 - Final Closeout

Date: 2026-09-05
Phase: 6 of 6 in the post-redesign hardening program

## Outcome

Phase 6 completes the Poker Near Me hardening program with authenticated venue
integrity refresh automation, explicit public and private indexation rules,
canonical legacy-route redirects, semantic landmark repairs, permanent
cross-engine regression coverage, unused rendered-asset retirement, and the
final production release gate.

The implementation preserves the existing route handlers, Supabase and
realtime ownership, venue data, maps, geolocation, filters, forms, permissions,
navigation, and responsive behavior.

## Page families covered

The shared system covers these representative families and every data-driven
instance rendered by their existing templates:

1. Lobby and national room registry.
2. Canonical discovery destinations, including venues, live games, map, tours,
   series, daily tournaments, event calendar, more tools, road trip, saved, and
   alerts.
3. Location index, state, and city directories.
4. Venue and poker-room details.
5. Home-game directory, near-me discovery, profiles, dashboards, and location
   pages.
6. Poker-series directories and series details.
7. Tour directories and tour details.
8. Shared navigation, search, filter, map, status, empty, loading, and error
   surfaces inherited across those routes.

The canonical discovery controller has 11 destinations. Nine public
destinations are included in the sitemap and two account-specific destinations
(`saved` and `alerts`) remain canonical but are explicitly `noindex`.

## Venue integrity automation

- Open Claw calls `GET /api/internal/pnm-integrity-refresh` every day at 05:20
  UTC.
- The endpoint requires the canonical cron bearer secret and rejects every
  other method or credential.
- A run is successful only when `ok` is true and `source_rows` exactly equals
  `synced_rows`.
- The response and cron-health telemetry include the source count, synchronized
  count, and actionable-anomaly count without exposing venue records or
  credentials.
- Open Claw treats two consecutive hard failures as critical and uses the
  existing alert and recovery cycle.

### Operator verification

1. Confirm `/api/health` reports a production revision containing the merged
   release commit.
2. Confirm `openclaw.service` is active, has zero crash-loop restarts, and logs
   `pnm-integrity-refresh` as registered.
3. From the canonical Open Claw host, source `/etc/openclaw.env` and call the
   production endpoint with the existing bearer credential. Never print or copy
   the credential into logs.
4. Require HTTP 200, `ok: true`, and exact equality between `source_rows` and
   `synced_rows`.
5. Confirm the `pnm-integrity-refresh` row appears in cron health with the same
   successful run and no open consecutive-failure alert.

### Recovery

- HTTP 401: validate the production `CRON_SECRET` with the no-side-effect auth
  probe, then repair the Open Claw host or GitHub secret only with a credential
  already accepted by production.
- HTTP 503 or unequal row counts: do not mark the run successful. Inspect the
  server log and Supabase query error, correct the partial source or write
  failure, and rerun until the counts match exactly.
- Service inactive or registration missing: run the repository Open Claw deploy
  workflow or `bash scripts/deploy-openclaw.sh`, then require active systemd
  state, at least one registration log, matching dispatcher SHA, and zero new
  error or traceback lines.
- Stale integrity values: rerun the authenticated endpoint. This recalculates
  elapsed-time states that cannot remain accurate in a static snapshot.

## SEO and canonical contract

- All nine public discovery destinations self-canonicalize and are emitted by
  the sitemap.
- Saved and alerts self-canonicalize but emit `noindex, nofollow` and never
  enter the sitemap.
- Legacy aliases and unknown discovery slugs redirect on the server to their
  canonical destination while preserving query parameters.
- The page shell owns the single main landmark. Inner cinematic content is a
  named region, preventing nested-main accessibility failures.

## Verification completed before publication

- Full prebuild suite: 603 passed.
- Poker Near Me focused suite: 109 passed.
- Marketplace release suite: 218 passed after synchronizing two stale tests
  with the current membership paths and removing two prohibited comment bars.
- TypeScript no-emit check: passed.
- Python dispatcher compilation: passed.
- Repository lint runner: 3,930 files passed.
- Exact production webpack build: passed, including all required prebuild and
  postbuild gates; 403 static pages emitted.
- Compiled four-engine Phase 17 matrix: 23 passed and 2 WebKit-only
  forced-colors checks skipped because WebKit does not expose that emulation.
- Exact 390 by 844 mobile command-menu audit: continuous contained borders,
  every descendant inside the viewport, and zero horizontal overflow.
- Desktop and mobile representative route audit: correct single-main
  semantics, readable navigation, preserved route state, and no overflow.
- Venue snapshot: 399 public venues, identical data and manifest hash, and no
  projection drift.
- Four unreferenced Poker Near Me render assets retired, removing about 1.12 MB
  without changing any runtime reference.

Production publication remains incomplete until the PR is merged, the live
health SHA includes the merge, the Open Claw dispatcher matches the merged
source, the authenticated refresh succeeds exactly, and representative live
desktop and 390 by 844 browser checks pass.
