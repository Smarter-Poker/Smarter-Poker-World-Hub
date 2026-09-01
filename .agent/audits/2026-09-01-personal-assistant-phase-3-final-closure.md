# Personal Assistant Phase 3 Final Closure Audit

**Date:** 2026-09-01  
**Scope:** Personal Assistant hub, Virtual Sandbox, Leak Finder, shared scenario route, assistant APIs, deterministic audit worker, solver/training adapters, and desktop/mobile browser flows.

## TL;DR

The Phase 3 feature set was already published, but its final closure audit found four gaps in the permanent proof:

1. The copy policy visually capitalized body copy with CSS while leaving some underlying text nodes sentence-cased. This was inaccessible to copied text and assistive technology.
2. Two solver fallback values could still emit the banned long dash as user-visible EV copy.
3. A legacy leak without a canonical game identifier could force a broad JSON query over the complete training cache and hit the PostgreSQL statement timeout.
4. Later Training security hardening correctly rejected historical solver rows that had source labels but no machine, manifest, artifact, and audit provenance. The previous protected-account claim of a verified corrective drill was therefore no longer valid.

The copy policy now normalizes actual text nodes and accessible attributes, solver fallbacks render `Not Available`, the source guard recursively scans all owned Personal Assistant UI/API sources, and the browser gate checks the real DOM on every primary and secondary route. Legacy leaks now resolve to bounded canonical training games. Unsealed solver archive rows remain usable only through a visibly disclosed practice mode that cannot sign a batch, change mastery, or unlock rewards. The verified path remains fail-closed until real solver infrastructure writes complete provenance.

## Audited Surface

- `/hub/personal-assistant`
- `/hub/personal-assistant/sandbox`
- `/hub/personal-assistant/leaks`
- `/sandbox/[id]`
- `pages/api/assistant/**`
- `app/api/assistant/leaks/audit-worker/route.js`
- `pages/api/sandbox/[...path].js` and its routed handlers
- `src/components/personal-assistant/**`
- `src/components/sandbox/**`
- `src/lib/personal-assistant/**`
- Solver, training-cache, leak-detection, durable-audit, review, and push-deduplication contracts

## Root Causes And Repairs

### Accessible Copy Did Not Match The Visual Copy

`text-transform: capitalize` satisfied the visual rule but did not change the DOM text. `applyPersonalAssistantCopyPolicy` previously normalized separators in text nodes while only title-casing attributes. It now runs the complete normalizer over both initial and dynamically inserted text nodes. Script, style, textarea, and template data stay untouched.

### Banned Long-Dash Fallbacks Survived Below The Page Layer

The node-lock and training-cache solver adapters used a long dash for an unavailable EV. Both now return `Not Available`. The regression guard recursively inventories the complete owned surface instead of checking a short hand-maintained file list.

### Club Arena Audit Fixtures Claimed Verification Without Proof

Security hardening correctly requires complete solver provenance for `DETERMINISTIC_SOLVER` questions. The older audit fixtures used only the source label, so four audit assertions no longer represented production-valid evidence. The fixtures now include the checksum, manifest, pipeline, machine, quality, and audit-time fields required by the real boundary.

### Legacy Corrective Drills Could Time Out

Known Coach Law and statistical leaks did not preserve a canonical Training Library game. Their corrective drill query filtered JSON across the full cache and the live `three_bet_too_loose` route reached PostgreSQL statement timeout `57014`. The handoff now maps Position Is Power to `cash-006`, Defend Your Blind to `cash-001`, Bet For Value to `cash-004`, and 3-bet frequency leaks to `cash-001`. The route also reads the existing leak name when the situation class is absent.

### Historical Solver Rows Are Not Provenance-Sealed

Production inspection found zero provenance-complete rows for the active postflop solver leak scopes. The route does not relabel or invent that evidence. It first attempts the exact verified scope and signs only a minimum-size verified batch. When the archive lacks that proof, it sanitizes unsupported solver claims, returns an unsigned practice pool, and displays an evidence disclosure. Rewards and corrective mastery remain locked.

## Wiring Proof

- Every literal Personal Assistant fetch target resolves to a generated Next.js route.
- Sandbox endpoints are intentionally dispatched through `pages/api/sandbox/[...path].js` to the matching `_routes` handler.
- The durable audit worker is generated from the App Router route and remains protected by the signed worker token and middleware boundary.
- No TODO, FIXME, HACK, `not implemented`, stub, or `coming soon` marker remains in the audited runtime scope.

## Verification

- Leak Engine release gate: **112/112 passed**.
- Focused repaired contracts: **38/38 passed**.
- Exact optimized webpack production build: **passed**, **403/403 static pages generated**.
- Compiled production desktop/mobile Personal Assistant matrix: **25 passed**, **2 expected viewport skips**.
- Protected account drill coverage: **14/14 active leaks returned 10 usable spots**, with **0** empty, unmapped, missing, error, or timeout results.
- Verified corrective batches currently available: **0**. This is an explicit solver-infrastructure readiness limit, not a browser or API fallback claim.
- Copy audit covers title case, accessible attributes, actual text nodes, banned long bars, overflow, control names, touch geometry, image alternatives, and duplicate IDs on all four route families.

## Publication Evidence

Pending the final branch push, pull-request merge, production health SHA match, and repeated live production browser/account verification. This section must be updated with exact identifiers before the phase is reported complete.

## Forward Checks

- Keep `tests/personal-assistant-copy-policy.test.mjs` in the release gate whenever a new Personal Assistant component, API projection, or solver adapter is added.
- Keep `e2e/021-personal-assistant.spec.ts` running in both desktop Chromium and mobile Chrome.
- Do not infer verified solver evidence from `source` labels; the sealed provenance object is the boundary.
- Do not claim a verified corrective drill until the production cache contains at least five exact, provenance-complete rows for that leak scope.
- Do not use CSS capitalization as the sole accessibility implementation for a hard copy requirement.
