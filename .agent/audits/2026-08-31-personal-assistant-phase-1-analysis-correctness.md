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
7. Facing-wager detection inspected only the last action, so a second villain calling between a bet and the hero incorrectly reopened Check/Bet actions.
8. Action history accepted undealt streets and contradictory wager responses such as checking into an outstanding bet.
9. Client-controlled action labels, archetype names, archetype ids, and free-form range prose could reach the fallback-model prompt.
10. AI fallback output trusted arbitrary model action ids and labels, allowed duplicates, and could return frequencies that did not total 100.
11. The hard heuristic fallback could recommend Check/Bet when the hero was facing a wager.
12. Persisted result copy could disagree with `full_analysis`, and the truth seal omitted the decision fingerprint and node-lock provenance.
13. The hook exposed stale baseline EV/action fields after a modeled node-lock adjustment, despite the response being explicitly unpriced.
14. Three Insights command cards were split into browser chunks that could be starved behind slow account API connections; desktop and mobile could remain on loading skeletons past the interaction budget.

## Implementation

- Added `scenarioContract.mjs`, the shared, pure decision schema and canonical fingerprint contract.
- Added strict card, board, seat, stack, pot, mode, node-lock, street-order, duplicate-card, actor, and terminal-state validation.
- Added betting-round state validation across heads-up and multiway histories, including pending responders, folded seats, closed rounds, and undealt streets.
- Canonicalized every prompt-facing label, archetype, and range on the server; hostile prose is rejected before any model call.
- Added exact decision fingerprinting with unordered flop identity and ordered turn/river identity.
- Added complete-context verification and mismatch reasons to the Training cache adapter.
- Added a deterministic, explicitly low-confidence node-lock frequency model. It removes stale action EV, aggregate EV, ICM, and range-heatmap claims when a full downstream solver tree is unavailable.
- Normalized fallback-model actions through a server allowlist, merged duplicates, allocated integer frequencies to exactly 100, and made Bet/Raise labels depend on the actual wager state.
- Persisted the final response explanation plus its decision fingerprint, context-verification evidence, and node-lock model provenance in the result truth seal.
- Added provenance fields to the API and hook, and made the Sandbox badge/frequency labels/notification copy use those fields.
- Kept the small Leaderboard, Macro Leak Detector, and Position Leak Map command cards in the Leak Finder route bundle so Insights becomes immediately usable while their data requests remain mount-gated.
- Added adversarial contract tests to the existing leak-engine build entry point.

## Verification Evidence

- Focused analysis-correctness contract: 13 passed, 0 failed.
- Complete Leak Finder and Personal Assistant engine suite: 91 passed, 0 failed.
- Repository prebuild gate: 526 passed, 0 failed.
- TypeScript `--noEmit`: passed with no diagnostics.
- Production-equivalent Next.js webpack build: passed; 402 static pages generated and all Personal Assistant routes compiled.
- Authenticated local account flow: 19 leak records remained readable and a ten-question server-verified drill loaded with every answer key hidden.
- Authenticated local API contract: missing, future-street, hostile-archetype, and hostile-range states returned 422; a legal locked multiway scenario returned 200, `model_approx`, legal Call/Raise/Fold actions totaling 100, `nodeLockApplied: true`, unpriced EV, and no range-heatmap/baseline claim.
- Persistence readback confirmed the sandbox session id, final explanation, decision fingerprint, node-lock state, and node-lock model version were stored consistently.
- Authenticated desktop/mobile Personal Assistant browser matrix: 23 passed, 2 intentionally inapplicable desktop skips. The repaired Insights case renders in about 0.6 seconds in isolated desktop and mobile checks and passed inside the full concurrent matrix.
- `node --check` passed for the scenario contract, Training cache adapter, and analysis API.
- `git diff --check` passed.
- Full prebuild and production build are complete. Deployment and authenticated production verification are recorded below when complete.

## Deployment Evidence

Pending final build and release verification.
