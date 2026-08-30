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
