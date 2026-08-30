# Personal Assistant Verified Drill Telemetry Audit

## TL;DR

Leak Finder corrective drills now use signed, server-graded question batches and
private immutable answer and attempt ledgers. The browser no longer receives
answer keys before locking an answer, and completing a drill cannot directly
resolve an empirical leak. The Optimizer diamond award is fail-closed until
Club Arena recovery can be proven with immutable recorder-attested evidence.

## Context And Root Causes

The previous review flow accepted browser-calculated totals and could not prove
which canonical solver questions produced a result. It also coupled drill
mastery too closely to leak lifecycle and reward semantics. Retry responses
could make the visible drill result diverge from the first answer already
accepted by the server.

Club Arena `hand_history` rows are currently user-writable. Detector-owned
resolution fields therefore cannot safely authorize an economic reward, even
when the detector and corrective drill themselves are deterministic.

## Resolution

- Added HMAC-signed, expiring, user/leak/question-bound drill batches.
- Added private service-role-only sessions, immutable answers, and attempt
  records through migration `20260830193000_verified_leak_drill_telemetry`.
- Deferred attempt reservation until the first answer is locked, so loading or
  abandoning a drill consumes no attempt.
- Re-read and grade every answer from `training_question_cache` on the server
  using the same canonical solver classifier used by training and Leak Finder.
- Made completion derive totals exclusively from the private answer ledger.
- Preserved empirical leak ownership in the detector; drill completion records
  remediation mastery but does not mark a leak resolved.
- Normalized source-less explicitly verified solver provenance to
  `SOLVER_PROVENANCE_VERIFIED` so every issued question is persistable.
- Made retry UI state follow the immutable ledger response for choice-to-timeout
  and timeout-to-choice response-loss cases.
- Removed The Optimizer verifier, coverage entry, review response, and UI award
  path. It remains documented as unavailable until recorder-attested Club Arena
  recovery evidence exists.

## Production Verification

Applied the migration to Supabase project `kuklfnapbkmacvwxktbh` through the
linked Management API on 2026-08-30. Verified:

- `leak_drill_sessions`, `leak_drill_answers`, and `leak_drill_attempts` exist.
- `authenticated` cannot execute `record_verified_leak_drill_answer`.
- `authenticated` cannot select from `training_question_cache`.
- Focused Leak Finder tests pass 69/69.
- Reward verifier tests pass 37/37.
- The complete Next.js production build passes.

## Forward Checks

- Keep `tests/personal-assistant-phase-five.test.mjs` in `test:leak-engine`.
- Do not re-enable The Optimizer until Club Arena writes produce immutable,
  service-owned recorder receipts and recovery requires evidence newer than the
  corrective drill.
- Keep reward verification fail-closed when any proof source is unavailable.
- Preserve the signed-batch and private-ledger boundary if drill clients change.

## Continuation, Canonical Identity, And Account Verification

The subsequent authenticated audit found two production-scale wiring gaps:

- Accounts above 500 Club Arena hands could not finish the signed continuation
  sequence because the generic AI rate limit allowed fewer calls than the
  deterministic hand window required.
- Verified training answers were server-graded, but their position/street/spot
  metadata could still fall back to browser values. That created durable leak
  group identities which no canonical corrective drill could reproduce.

The follow-up build now:

- Processes 200-hand / 500-decision pages and automatically follows signed
  continuation cursors from one player action.
- Uses a dedicated authenticated 12-request audit budget, a 60-second route
  ceiling, one bounded `Retry-After` retry for rate limits, and one retry for
  explicitly transient 502/503/504 evidence failures.
- Persists each Club Arena page before advancing and performs the expensive
  aggregate/persistence pass only after the snapshot is complete.
- Preserves a resumable signed cursor on cancellation, infrastructure failure,
  or the client-side batch ceiling.
- Reads the two leak-history stores concurrently and reports private no-store
  timing metadata.
- Builds verified training position, street, and spot identity exclusively
  from the canonical solver question. New answer rows persist those same
  server-owned fields.
- Reconciles legacy browser-derived group keys only when an exact canonical
  alias and a complete, trustworthy solver scope prove the replacement.
- Resolves historical hyphen/underscore game-id storage aliases before applying
  the unchanged exact solver group check.

Protected account verification (with credentials and all hand/question data
redacted) confirmed:

- Real Club Arena evidence can be paged and persisted through the rebuilt
  deterministic route.
- Canonical solver findings are written and stale legacy identities reconcile.
- An active finding opens a 10-question server-verified corrective drill from
  the same canonical Training Arena cache.
- Initial question payloads expose no answer keys or explanations.
- Ten answers were immutably locked; a changed replay returned the original
  locked result.
- Review completion persisted, and replaying the same review operation was
  idempotent.
- Focused engine tests pass 78/78, the account-flow continuation tests pass
  7/7, desktop/mobile Playwright cursor-flow checks pass, and the full Next.js
  production build passes.
