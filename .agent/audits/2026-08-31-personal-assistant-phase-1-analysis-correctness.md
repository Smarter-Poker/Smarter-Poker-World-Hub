# Personal Assistant Phase 1 Of 8 — Analysis Correctness

Date: 2026-08-31
Scope: Virtual Sandbox request validation, decision identity, Training Solver cache provenance, node-lock behavior, and result provenance in the Sandbox UI.

## Acceptance Boundary

- The analysis API must reject malformed or incomplete poker states rather than invent cards, stacks, pots, positions, modes, or action lines.
- Two materially different decision nodes must never share an in-memory analysis cache entry.
- A Training Solver result may be labeled `solver_verified` only when the concrete hand, board, positions, stacks, pot, opponent count, range, and complete sized action history match.
- Missing canonical context must downgrade to `solver_approx` and remain visible as an approximation.
- Node locks must change the returned recommendation deterministically, must not be represented as a solver re-solve, and must not reuse unmeasured baseline EV or range claims.
- The API provenance must survive the analysis hook and control the user-facing source badge.

## Defects Found And Closed

1. The request accepted incomplete direct API payloads and silently substituted a default hand and several default scenario values in the Grok prompt.
2. The cache key omitted exact villain stacks, the complete sized action line, multiway context, and per-seat node locks.
3. Canonical Training cache rows could be displayed as verified based on a matching hand and board even when decision-defining metadata was absent.
4. Node-lock state reached the request but neither isolated the cache nor changed the result; the UI nevertheless described the response as re-solved.
5. The analysis hook discarded truth-level and node-lock provenance, allowing UI badges to infer trust from weaker fields.
6. The first validation draft treated any villain fold as terminal, which incorrectly rejected legal multiway action lines. The final contract terminates only after the hero folds or all villains fold.

## Implementation

- Added `scenarioContract.mjs`, the shared, pure decision schema and canonical fingerprint contract.
- Added strict card, board, seat, stack, pot, mode, node-lock, street-order, duplicate-card, actor, and terminal-state validation.
- Added exact decision fingerprinting with unordered flop identity and ordered turn/river identity.
- Added complete-context verification and mismatch reasons to the Training cache adapter.
- Added a deterministic, explicitly low-confidence node-lock frequency model. It removes stale action EV, aggregate EV, ICM, and range-heatmap claims when a full downstream solver tree is unavailable.
- Added provenance fields to the API and hook, and made the Sandbox badge/frequency labels/notification copy use those fields.
- Added adversarial contract tests to the existing leak-engine build entry point.

## Verification Evidence

- Focused API, contract, completion, and Phase 4 suite: 40 passed, 0 failed.
- Complete Leak Finder and Personal Assistant engine suite: 88 passed, 0 failed.
- Repository prebuild gate: 526 passed, 0 failed.
- TypeScript `--noEmit`: passed with no diagnostics.
- Production-equivalent Next.js webpack build: passed; 402 static pages generated and all Personal Assistant routes compiled.
- Authenticated local API contract: malformed state returned 422; valid locked scenario returned 200, `model_approx`, `nodeLockApplied: true`, unpriced EV, and no range-heatmap claim.
- Authenticated desktop/mobile Personal Assistant browser matrix: 22 passed, 2 intentionally inapplicable desktop skips; one concurrent desktop timing miss passed immediately in isolated rerun.
- `node --check` passed for the scenario contract, Training cache adapter, and analysis API.
- `git diff --check` passed.
- Full prebuild, production build, deployment, and authenticated production verification are recorded below when complete.

## Deployment Evidence

Pending final build and release verification.
