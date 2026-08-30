# Training Hub Full-System Audit — 2026-08-29

## TL;DR

The Training Hub was audited from catalog data through production-source
queries, route wiring, authenticated persistence, database policy boundaries,
responsive presentation, and deployment gates. The audit covered all 107
canonical games at all 12 levels (1,284 runtime cells), every fixed Training
route, and the shared secondary-page and Club Arena gameplay paths.

The work removed simulated performance data and inaccessible legacy tool
surfaces, enforced the four-answer question contract, made feedback require an
explicit Next action, added durable question reporting/community/tool records,
and closed the database race and privilege bypass in Study Group creation and
joining.

## Scope

- 107 canonical game cards and their responsive artwork variants.
- 12 levels per game, including live cache compatibility and engine fallback.
- Training Hub, setup flow, arena, review, category, analysis, and Phase 11
  secondary surfaces.
- Canonical auth, session saving, daily challenges, Study Groups, tool records,
  offline packs, reports, and solver provenance.
- Global header ownership and Club Arena table/avatar/hero-card presentation.
- Desktop and mobile layout behavior.

## Defects Found And Resolved

### Runtime And Content Integrity

- Session preferences could be misclassified as a custom cash-game request.
- Several question/cache paths could cross-contaminate incompatible game
  families. Cache rows now pass the same compatibility contract as runtime
  questions.
- Some question paths did not consistently expose four meaningful options.
  Literal Yes/No and Push/Fold remain the only two-choice exceptions.
- A live C-Bet Academy browser session exposed overlapping sizing vocabulary:
  an exact choice such as “Bet 33% Pot” could appear beside the “Small Bet”
  band that contains it. Exact sizing and grouped sizing are now mutually
  exclusive, every grouped label states its numerical boundary, and sparse
  exact-overbet trees remain in exact vocabulary when padded to four choices.
- A second exact-revision production browser pass exposed an expired-token
  failure while C-Bet Academy preloaded questions. The trainer hook was still
  attaching a synchronously read token to raw `fetch` calls, bypassing the
  platform's silent refresh and one-time retry. Every trainer API call now uses
  the canonical authenticated fetcher, including preload, fallback, answer
  evidence, next street, progress, and spaced-repetition writes.
- Feedback could advance before a player had time to read it. Correct/Incorrect
  state is now explicit and persists until the player clicks Next.
- The signed-out Training Hub primary CTA was disabled when no recommendation
  existed. It now starts the first canonical drill and uses the canonical
  `/auth/login?redirect=/hub/training` contract.
- The signed-out headline incorrectly said “Welcome Back.” It now renders a
  neutral first-session message.

### Truthfulness And Provenance

- Position Mastery manufactured per-seat performance by distributing an
  overall score with a “realistic variance.” That behavior was removed; the
  page renders an honest empty state until position-tagged decisions exist.
- Study Groups exposed a fake demo hand and a fabricated solver verdict. Both
  were removed and replaced with a route to the authenticated Hand History
  Upload flow.
- Non-graded utilities no longer manufacture perfect Training sessions.
- Solver reports distinguish exact `solved_spots_gold` results from modeled
  baselines and do not create a fictional solver queue.
- Retired heuristic trainers and simulated report surfaces now route to their
  canonical authored Club Arena game or verified-data tool.

### Database And Authorization

The following migrations were applied to the linked production Supabase
project and recorded under their exact repository versions:

- `20260829113000_training_question_reports.sql`
- `20260829114500_training_daily_challenge_selected_action.sql`
- `20260829120000_training_study_groups.sql`
- `20260829121500_training_tool_records.sql`
- `20260829234000_training_study_group_atomic_writes.sql`

The migrations include transaction boundaries, preflight/postflight
assertions, RLS, indexes, grants, and explicit function search paths.

Study Group create and join operations are now atomic RPCs. Join locks the
target group row before checking capacity. Authenticated clients cannot bypass
capacity or self-assign ownership by inserting directly into the membership
table; only the service role can execute the mutation RPCs.

The repository migration runner could not authenticate because its stored
database password was stale, and the Supabase MCP connector was unauthenticated.
Each exact migration file was therefore applied atomically with the already
linked authenticated Supabase CLI, then only that exact new version was marked
applied. No historical migration row was repaired or rewritten.

## Verification Evidence

### Catalog And Question Contract

- Static authored/generated audit: 107 games, 1,284 level cells, 8,520
  questions, 116,776 assertions passed, zero failed.
- Live production-source audit: 1,029 cache-backed cells, 255 engine-backed
  cells, 25,918 cache rows checked, 1,020 generated questions checked, 1,179
  incompatible rows rejected, zero failures.
- Every standard poker decision has four choices; only literal Yes/No and
  Push/Fold decisions can have two.
- Answer labels are checked for grading hints.
- Exact sizing choices cannot overlap grouped sizing bands in the same answer
  set; the exhaustive live rerun completed with zero contract failures.
- The active trainer contains no raw API `fetch` path; a source guard requires
  the canonical refresh-capable authenticated fetcher.

### Application And Routes

- Focused Training regression suites: 44 passed, zero failed after the final
  auth/CTA, retired-XP, and fabricated-fixture corrections.
- Full application build after merging the latest `origin/main`: 454 prebuild
  tests, 39 Training build tests, 17 leak-engine tests, 63 marketplace tests,
  and 7 trivia-authority tests passed; Next generated 402 of 402 static pages.
- Route wiring audit: 94 Training page files, zero missing default exports,
  page routes, or API routes.
- Built-server HTTP crawl: 95 Training routes, all HTTP 200, no Next error or
  application-exception markers.
- Source parser sweep covered modified JavaScript, JSX, TypeScript, and TSX.

### Database

- Live schema checks confirmed all five migration versions, expected tables,
  columns, indexes, policies, grants, and RPC execution boundaries.
- A rollback-only production transaction audit created a temporary Study
  Group, joined a second account, confirmed a third account was rejected at
  capacity, and rolled the transaction back. Zero audit groups leaked.
- Supabase advisors reported no new findings for the added Training objects.

## Deliberate Honest Empty States

- PvP/live HUD surfaces remain unavailable when their real-time backend is not
  configured; they say so and route to verified practice instead of simulating
  players or activity.
- GTO News can use a clearly labeled static editorial library when live
  editorial data is unavailable. It never presents the fallback as live news
  or player performance.
- Reports, position analytics, and community rooms show empty states until real
  authenticated records exist.

## Forward Guards

- `scripts/training-live-catalog-audit.js` replays all 1,284 live runtime cells
  without writes.
- `scripts/training-route-wiring-audit.js` detects missing Training page/API
  targets.
- `scripts/training-http-route-audit.js` crawls the built Training surface for
  status and framework failure markers.
- `scripts/training-study-group-transaction-audit.sql` exercises atomic
  capacity enforcement and always rolls back.
- Training regression tests enforce question count, no answer hints, manual
  feedback progression, canonical authentication, honest analytics, durable
  storage, Club Arena visual contracts, and shared secondary-page wiring.

## Phase 2 Advanced Audit

The second-pass audit re-ran Round 1 from a hostile runtime perspective and
added hydrated, dual-viewport coverage for every Training route.

### Additional Defects Resolved

- Training sessions could receive a new ID when the parent rendered again.
  Hub and direct-arena sessions now keep one stable identity for the complete
  run.
- Saved setup preferences were not reloaded when the player opened a different
  game. Preferences are now sanitized and restored per game.
- Explicit “No Timer” and zero-second values could be replaced by defaults
  because the arena used truthiness instead of nullish fallback.
- Several secondary analytics, history, leaderboard, report, save, and replay
  requests could retain an expired bearer token. Typed and JavaScript callers
  now share refresh-and-retry behavior.
- Offline queued saves persisted the bearer token that existed when a mutation
  was queued. The queue now stores no credential and resolves authenticated
  transport only when it drains.
- Setup and advanced configuration dialogs did not fully trap or restore
  keyboard focus. Both now implement dialog semantics, Escape, wrapping Tab,
  opener restoration, and mobile-safe metallic layouts.
- Analytical grids, cards, expandable rows, heatmaps, checklist items, range
  cells, and replay controls contained mouse-only interactions. The complete
  Training component/page tree now has a parser-backed guard requiring keyboard
  activation for clickable non-semantic elements.
- The legacy universal table allowed feedback to disappear from a tap anywhere.
  It now presents an unmistakable Correct/Incorrect dialog with an explicit
  metallic Next button.
- Route-local Google font stylesheets produced Next.js rendering warnings and
  duplicated the global `next/font` installation. They were removed without
  changing the approved global header.
- The shared page transition produced server/client style mismatches for users
  who prefer reduced motion. Its first frame is now hydration-stable and uses a
  short non-spatial fade.
- The shared card image placed an HTML `draggable` attribute in its CSS style
  object, causing another hydration mismatch. The invalid style was removed and
  clickable cards gained keyboard button behavior.

### Phase 2 Verification

- Focused Training integrity/runtime/adversarial suite: 46 passed, zero failed.
- TypeScript no-emit compile and patch whitespace validation: passed.
- Production build: 454 prebuild tests, 46 Training tests, 17 leak-engine tests,
  63 marketplace tests, 7 trivia-authority tests, and 402/402 static pages.
- Built-server HTTP audit: 95/95 routes returned HTTP 200.
- Built-server hydrated browser audit: 95 routes at desktop and mobile widths,
  190/190 checks passed with zero runtime exceptions, broken visible media,
  unnamed controls, missing image alternatives, header regressions, or document
  overflow.
- Full catalog visual/click audit: 107/107 semantic card destinations, 107
  unique decoded artwork sets, straight unclipped card frames, all five
  categories at mobile width, zero unexpected console errors.
- Live data audit: 107 games × 12 levels = 1,284 cells; 25,918 cache rows and
  1,020 generated questions checked with zero failures.
- `scripts/training-browser-route-audit.mjs` now preserves the hydrated
  two-viewport route audit as a repeatable release gate.

Production deployment is not considered verified by this document. The release
must separately prove that `origin/main`, `/api/health`, the Build Safety Gate,
and a real browser session all reference the same merged revision.
