# Poker Near Me Phase 11 — Degraded-Mode Resilience and Accessibility

Date: 2026-08-30
Branch: `agent/codex-pnm11/feat/pnm-phase11-resilience-e2e`

## Why this phase

After Phase 10 deployed, production briefly returned Supabase's `JWT issued at future`
error from both `/api/health` and the optimized venue-directory read. The service
recovered without a key change; on the Phase 11 baseline, health was `200` with a
44 ms database check and the directory was live again. This established a transient
auth/clock disturbance, not evidence that the stored service-role credential was
permanently invalid.

The code audit still found a real availability hole: `view=directory` bypassed the
rich venue endpoint's checked-in JSON fallback, so the optimized public path returned
`500` during the disturbance. Discovery SSR caught the same error by removing the
server-rendered directory entirely. Location pages had a separate fallback
implementation, which could drift from the API projection.

## Route coverage

The shared Phase 11 read path now covers:

- 11 canonical dynamic discovery routes from `/hub/poker-near-me/[pnmTab]`.
- The location index, 41 state pages, and 376 city pages: 418 current location URLs.
- The public `/api/poker/venues?view=directory` endpoint.

That is 429 current directory-driven page URLs inheriting one resilience contract.
The lobby accessibility work separately upgrades `/hub/poker-near-me/lobby`.

## Shipped behavior

### Projected snapshot fallback

- Added one snapshot-directory builder with the same active/suppressed/canonical,
  state, city, type, featured, tournament, search, viewport, ordering, pagination,
  and location-integrity rules as the live public directory.
- The fallback projects only the public directory allowlist. Private contact fields
  such as `email` and internal fields such as `search_vector` cannot enter the
  response.
- The resilient wrapper is used only by public reads. Admin, mutation, auth,
  realtime, and operator paths continue to fail closed.
- Degraded API responses remain `200` for usable public data, set
  `Cache-Control: no-store`, and identify their provenance with
  `X-PNM-Data-Source: static_snapshot`, `degraded: true`, and
  `data_source: static_snapshot`.
- Invalid viewport/filter input remains a 400-class error; it is never hidden by
  snapshot mode.
- SSR discovery keeps its server-rendered venue rail during a database outage.
- Location pages now use the same fallback implementation and cache degraded
  results for only 60 seconds before retrying live data.

### Honest recovery UI

- Dynamic discovery shows a compact gold signal bar whenever the source is the
  checked-in snapshot, browser cache, or unavailable.
- The message explicitly says live refresh is unavailable and never labels cached
  data as live.
- A 44-pixel `Retry live registry` control is keyboard-visible and performs a
  fresh server request.

### Accessibility

- The cinematic lobby now has a named `main` landmark without swallowing the
  global header's banner landmark.
- A first-focus skip link moves keyboard users directly to the discovery choices.
- Lobby voice and GPS controls are now at least 44 by 44 CSS pixels.
- The shared dynamic discovery family now has a named main landmark.
- Existing reduced-motion behavior, focus-visible hotspot treatment, route links,
  and zero-overflow geometry were preserved.

## Verification

- Focused Phase 10–11 Node contracts: 9/9.
- Repository prebuild: 508/508.
- Production webpack path: platform binary prune, Next patch engine, and
  `NODE_OPTIONS='--max-old-space-size=7168' next build --webpack` completed.
- Production artifact generated 402 static pages and retained the known Edge,
  middleware, and localStorage warnings only.
- Phase 11 Playwright: 4/4 across desktop Chromium and mobile Chrome.
- Exact mobile target: 390 by 844, zero horizontal overflow.
- Forced no-database smoke:
  - directory API returned `200`, `Cache-Control: no-store`, and
    `X-PNM-Data-Source: static_snapshot`;
  - Nevada returned 42 projected fallback venues;
  - the first row contained no `email`;
  - SSR HTML retained the snapshot status and Featured Poker Rooms rail.
- Client bundle check: the dynamic Poker Near Me page remained 80 KB and the
  checked-in venue dataset did not enter the browser chunk.

## Deliberate non-changes

- No Supabase secret was rotated: the evidence showed recovery, and rotating a
  platform-wide credential is outside a Poker Near Me UI/read-resilience phase.
- No database migration was required.
- The intentionally disabled Bravo scraper remains disabled; estimated live table
  values keep their approximate label.
- No global header CSS was changed.

## Remaining product/data backlog

The Phase 10 operator snapshot still contains 333 actionable venue-quality signals:
3 boundary conflicts, 80 missing-coordinate records, 5 boundary-unavailable records,
204 incomplete profiles, and 255 stale sources (signals overlap). Those require
source-backed operator enrichment, not synthetic data or UI masking.
