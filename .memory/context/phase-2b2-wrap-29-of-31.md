# Phase 2B.2 — Wrap at 29 of 31 handlers ported (94% complete)

**Date:** 2026-04-25
**Workers repo HEAD:** commit `280ffe7` on main — CI green
**Repo:** github.com/Smarter-Poker/smarter-poker-workers

## Tally

- **Ported and CI-green: 29/31 (94%)**
- **Superseded (will not port — slated for deletion in Phase 2B.3): 1**
- **Deferred to dedicated AG dispatch session: 1**

## Ported in this session (handlers 23–29)

| # | Handler | LOC (JS) | LOC (TS) | Commit |
|---|---|---|---|---|
| 23 | hard-stop | 293 | 309 | `124864d` |
| 24 | scrape-sports-clips | 247 | 228 | `f9205f3` |
| 25 | memory-matrix-daily-challenge | 356 | 361 | `2f6f3d7` |
| 26 | poker-news | 376 | 299 | `c2aade1` |
| 27 | venue-tournaments | 336 | 349 | `f697219` |
| 28 | scrape-charity-schedules | 529 | 549 | `4f48751` |
| 29 | news-scraper | 1420 | 1143 | `280ffe7` |

All 7 commits CI-green on first push. No follow-up bug-fix commits needed.

## Cumulative tally (all 29 ports)

```
Earlier: 1-22 (training-daily-challenge through video-library-views)
This session: 23-29 (above table)
```

## Remaining handlers

### scrape-venue-info — SUPERSEDED (no port needed)

Per `.memory/context/cron-handler-orphans.md`:
> The `.js` handler approach has been replaced by Python-first scrapers
> that run via GitHub Actions workflows. This handler is a dead alternate
> path. **Safe to delete in Phase 2B.3.**

The dispatcher still references this path, but the handler will be
deleted from `pages/api/cron/` in Phase 2B.3 along with the dispatcher
entry. No workers-repo port required.

### tour-schedule-scraper — DEFERRED to dedicated AG session

**Why deferred:**
- 733-LOC handler
- Depends on 3 monolith libs not yet in workers, totaling **1329 LOC**:
  - `src/lib/tourPdfExtractor.js` (483 lines, PDF parsing)
  - `src/lib/tourHtmlExtractor.js` (597 lines, includes Grok LLM fallback)
  - `src/lib/scraperAlerts.js` (249 lines, SMS via Twilio)
- Reads/writes 2 disk JSON files that need migration to Supabase:
  - `data/tour-source-registry.json` (70 KB, read-write registry that
    the handler updates as new events are discovered)
  - `data/tour-scrape-sources.json` (18 KB, read-only config)

**Total port effort:** ~2200 LOC of TypeScript across 4 files plus a
schema-design pass for the registry-on-Supabase migration. This is too
large to do safely in a shared session — it warrants its own AG dispatch.

**Tracked as Task #40.**

## What CI verifies for each port

- `npm install --legacy-peer-deps` passes (no lockfile regressions)
- TypeScript strict (`noUncheckedIndexedAccess: true`) compiles clean
- esbuild bundles to ESM
- vitest test suite (where present) passes

## Phase 2B.2 status assessment

**Functionally complete.** 29 of 31 actually-needed handlers ported (the
30th is superseded; the 31st is correctly slated for follow-up). The
workers repo is ready for Phase 2B.1-deploy (CPX21 provisioning + GHCR
pull) once Dan dispatches that AG.

The deferred tour-schedule-scraper does NOT block Phase 2B.1-deploy or
Phase 2B.3. The monolith handler keeps firing via the existing dispatcher
entry until the workers port lands.

## Next steps in plan order

1. Phase 2A.2 — 48h burn-in (Dan AG dispatch — Task #24)
2. Phase 2A.3 — Mac LaunchAgent decommission (Task #25)
3. Phase 2B.1-deploy — CPX21 provision + GHCR pull (Task #32)
4. Phase 2B.3 — Monolith cleanup including:
   - Delete 29 ported handlers from `pages/api/cron/`
   - Delete `scrape-venue-info` (superseded orphan)
   - Switch dispatcher URLs from monolith → workers VM
5. Phase 2B.2-followup — Port tour-schedule-scraper (Task #40)
6. Phase 3.2 — Commander repo scaffold

