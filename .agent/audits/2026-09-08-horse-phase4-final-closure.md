# Phase 4 final closure audit - World Hub solver ingress

Date: 2026-09-08 America/Chicago
Branch: `agent/codex-horse-phase4-final/fix/horse-phase4-final-closure`
Scope: signed V31 ingress parsing and licensed solver-worker checkpoint reuse.

## A. Repository truth

- Work was performed in the dedicated World Hub worktree, not the shared checkout.
- The starting branch commit was `24477df273d369abcbe553210ff45c569ecd7b1c`.
- This correction changes no poker range, threshold, sizing, payout, or money path.
- No HMAC secret value was read or recorded. The production environment previously lacked the three required V31 principal names, so no corpus run is claimed.

## B. Defects reproduced

1. The gateway verified exact raw bytes but then used ordinary `JSON.parse`, which silently accepts duplicate object keys and keeps the last value. A signed body could therefore contain two textual meanings for a security-sensitive field.
2. Worker checkpoints used ordinary `json.loads`, which also accepted duplicate keys and Python-only nonfinite constants such as `NaN`.
3. Checkpoint reuse dereferenced the first node before proving it was an object and did not rebind the cached node to the approved combo-order and range-bundle checksums.
4. Oversized checkpoint files were read before the gateway's four-megabyte transport limit was enforced.

## C. Corrections

- The gateway scans signed JSON before parsing, decodes escaped key aliases, rejects duplicate keys at every object depth, rejects nonfinite numbers, accepts only JSON whitespace and grammar, bounds nesting at 128, and retains linear behavior on large arrays.
- The worker rejects duplicate keys, `NaN` and other non-JSON constants, overflowed floating-point values, malformed UTF-8, excessive recursion, unreadable files, non-object roots, and files larger than the gateway limit.
- Checkpoint reuse proves exact top-level and matrix key sets, schema, combo-order declaration, one object node, target node identity, manifest checksum, source combo-order checksum, and range-bundle checksum before skipping a solve.
- Invalid checkpoint evidence increments the invalid counter and terminates the worker rather than being silently regenerated or accepted.

## D. Verification completed on the current-main candidate

- Python pipeline: 16 tests passed.
- Node ingress and pipeline contract: 13 tests passed.
- Python byte compilation passed.
- The complete Next.js production build passed: prebuild policy and bankroll gates passed, 394 static pages were generated, and the postbuild Personal Assistant performance budget passed.
- Complete ESLint passed all 4,268 source and test files.
- `git diff --check`, conflict-marker scans, and Phase 4 TODO/stub scans were clean after the audit hard-break whitespace was removed.

## E. Release boundary

Current-main reconciliation and the complete production build are complete on this candidate. Protected PR merge and live gateway fail-closed probes are still required before this correction may be called published. Final protected-release receipts are recorded in the external Phase 4 build plan so this reviewed repository audit remains an immutable pre-release record.

Phase 4 remains externally blocked on human approval of a licensed immutable input bundle, three securely provisioned unique HMAC keys, and two independent licensed Pio solve hosts plus the compactor. No software test can fabricate those prerequisites.
