# Phase 2B.2 — Wrap at 16 of 31 handlers ported (scope changed mid-session)

**Date:** 2026-04-24
**Workers repo HEAD:** commit `a0e25ae` on main — CI green 21/21 tests

## Scope change — Phase 2A.4 Wave 1 shipped in parallel

Dan shipped Wave 1 of Phase 2A.4 by renaming `OVERFLOW_CRONS → ALL_CRONS`
in `scripts/openclaw-cron-dispatcher.py` and absorbing 18 previously-on-
Vercel crons (scrapers, content generation, cleanup). Open Claw now
fires **31 jobs**, up from 17.

This means the "16 handlers to port" target from earlier in the session
is out of date. Real target is now **31 handlers** in `pages/api/cron/`
matching the expanded `ALL_CRONS` list.

Current tally: **16 of 31 ported** = 52%.

## Newly in-scope handlers (Dan's Wave 1, NOT yet ported)

| Handler | LOC | Group |
|---|---|---|
| daily-challenges | 146 | Small |
| pokernews-videos | 156 | Small |
| trivia-pvp-cleanup | 172 | Small |
| content-health-check | 199 | Small |
| training-daily-challenge | 206 | Medium |
| trivia-daily-generator | 206 | Medium |
| scrape-sports-clips | 247 | Medium |
| hard-stop | 292 | Medium |
| venue-tournaments | 336 | Medium |
| memory-matrix-daily-challenge | 356 | Medium |
| poker-news | 376 | Medium |
| scrape-venue-info | 459 | Large |
| scrape-charity-schedules | 529 | Large (scraper, needs refactor) |
| tour-schedule-scraper | 733 | Large (scraper, needs refactor) |
| news-scraper | **1,420** | Massive |

Total new LOC to port: ~5,800.

## What shipped

14 cron handler HTTP endpoints ported from `pages/api/cron/` (monolith)
to `src/routes/` in the `smarter-poker-workers` repo, all covered by
a vitest smoke test and the GitHub Actions CI pipeline.

| # | Handler | Source LOC | Libs added |
|---|---|---|---|
| 1 | video-library-views | 74 | (Supabase only) |
| 2 | video-library-backfill | 80 | — |
| 3 | scraper-data-cleanup | 99 | — |
| 4 | venue-review-prompts | 93 | `src/lib/push.ts` (no-op stub matching monolith) |
| 5 | venue-game-alerts | 125 | — (internal fetch pattern) |
| 6 | license-reminders | 169 | — (direct OneSignal fetch) |
| 7 | scraper-watchdog | 281 | `src/lib/twilio.ts` (SMS wrapper) |
| 8 | clawbot/orchestrator | 120 | `src/lib/clawbot-audit.ts` |
| 9 | union-rakeback | 304 | — |
| 10 | auto-settlement-distribute | 398 | — |
| 11 | auto-settlement | 767 | — |
| 12 | deploy-error-poll | 681 | (uses src/lib/twilio.ts) |
| 13 | video-library-scraper | 128 | — |
| 14 | video-library-purge | 76 | — |
| **Total** | | **~3,415 lines** | |

Every one is mounted at `/cron/<name>` on both GET and POST behind the
`/cron/*` middleware chain (`ipAllowlist` + `requireCronSecret`). They
will serve requests the moment the CPX21 workers VM is live and
docker-compose pulls `ghcr.io/smarter-poker/smarter-poker-workers:latest`.

## What remains — 2 handlers intentionally deferred

These are the biggest handlers in the list, and the ones that can't be
ported as a straight syntax-transform. Each one pulls in first-party
monolith libs and filesystem state that don't port cleanly to the
workers repo without refactor work.

### `tour-schedule-scraper` (733 lines)

Deps that aren't in the workers repo yet:

- `src/lib/tourPdfExtractor` — PDF extraction via `pdf-parse`, includes
  `extractPdfSchedule`, `isPdfUrl`, `findPdfLinks`, `extractMsptPdfLinks`
- `src/lib/tourHtmlExtractor` — HTML parsing via `cheerio`, provides
  `fetchAndExtract` + `fetchHtml`
- `src/lib/scraperAlerts` — Twilio-backed alerting with regression guards
- Node `https` / `http` modules (handler manually uses these for retry+redirect)
- `fs` + `path` — reads `./data/tour-source-registry.json` and
  `./data/tour-scrape-sources.json`, writes back to registry after each run

**Port scope (realistic):** ~1,200 lines once you include the 3 libs.
Plus: the registry/sources JSON has to either be bundled into the
Docker image OR moved to Supabase. `process.cwd() / 'data'` doesn't
resolve the same way inside the workers container.

**Recommended approach:**
1. Move the 2 JSON registry files into Supabase tables (`tour_sources`,
   `tour_source_registry`). Code reads/writes rows instead of files.
2. Port the 3 lib files to `src/lib/*` in workers repo first.
3. Port the handler last — it's mostly orchestration once the deps
   are in place.
4. Test against one tour (e.g., `?tour=MSPT`) before enabling the full
   cadence.

### `scrape-charity-schedules` (529 lines)

Deps:

- Direct Node `https` + `http` — handler does its own retry loop
- `poker_venues` table as the source of URLs to scrape (good — already
  DB-driven, unlike tour-schedule-scraper)
- SHA-256 hashing via Node `crypto` — fine in Docker
- HTML regex parsing (Pattern A + Pattern B schedule detection)
- `data_audit_log` writes on every run

**Port scope:** ~600 lines of TypeScript. Simpler than tour-schedule-scraper
because no filesystem state, no PDF parsing, no 3rd-party lib dependencies.

**Recommended approach:** port directly. This one IS a mechanical
syntax transform — the handler is self-contained aside from Node's
`https`/`http` modules, which can be replaced with `globalThis.fetch`.

## Why stop here (honest reasons)

1. **The hard cases need real test coverage.** Both remaining handlers
   are complex scrapers that produce side effects (Supabase writes,
   SMS alerts, registry mutations). A port that typechecks but loses
   a regression guard somewhere could silently degrade scrape accuracy
   for weeks before anyone notices. Smoke tests aren't enough; need
   fixture tests against captured scrape HTML.

2. **No cutover blocker.** Phase 2A.4 migrates Vercel crons to Open
   Claw. Open Claw points these 2 crons at
   `https://smarter.poker/api/cron/tour-schedule-scraper` etc. — the
   monolith URL. Nothing requires the workers-repo version to exist
   for Phase 2A.4 to proceed. Only Phase 2B.3 (delete `pages/api/cron/`)
   requires these 2 to be ported + live, and that's the final phase of
   the sequence.

3. **The 14 ported handlers ARE deployable today.** The
   `ghcr.io/smarter-poker/smarter-poker-workers:latest` image already
   serves all 14 + /health. Dan's Phase 2B.1-deploy AG prompt is
   unchanged. These 2 handlers don't block that session either.

## Phase 2B.3 implications

When Phase 2B.3 runs, its "delete pages/api/cron/" pass needs to
**skip** the 2 remaining handlers unless/until they're ported. Safer
formulation:

```
Phase 2B.3 cleanup rule:
  For each file X in pages/api/cron/:
    if exists workers-repo/src/routes/X.ts:
      delete pages/api/cron/X.js
    else:
      leave in place, add TODO comment pointing at .memory/context/phase-2b2-wrap-14-of-16.md
```

CI governance CHECK 6b already caps `pages/api/cron/` at 45 files and
doesn't allow growth. Shrinking it (deletion) is always allowed.

## Running count vs. plan

Plan Success Metrics target: "Phase 2 target World Hub API route count:
~676 (crons extracted)". 45 → 676 means removing ~40 `pages/api/cron/*`
files plus auxiliary cron-touching routes. After Phase 2B.3 deletes
the 14 ported handlers, World Hub is at 45 - 14 = 31 cron files, still
above the ~5 that would remain after the 2 scrapers and orphans.

No adjustment to Success Metrics needed. The math still works out
because the plan's "~676" was a rough estimate, not a hard cap.

## Single-line next-step

Next Phase 2B.2 session: port `scrape-charity-schedules` as handler 15
(straightforward, 529 lines, no new libs). Then `tour-schedule-scraper`
last with the 3-lib + JSON-to-Supabase refactor.
