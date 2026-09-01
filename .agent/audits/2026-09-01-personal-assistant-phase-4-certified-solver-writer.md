# Personal Assistant Phase 4 Of 8: Certified Solver Writer

**Date:** 2026-09-01  
**Scope:** The canonical Windows PioSOLVER launcher, orchestrator, harvester,
warehouse write contract, and the solver evidence boundary consumed by Training
and Personal Assistant corrective drills.

## Outcome

The in-repository producer path is now fail-closed at the artifact boundary.
A successful HTTP status, a well-shaped checksum, a stale solver release, or a
duplicate scenario hash can no longer make the canonical worker treat a row as
current certified output.

This phase does not relabel any historical strategy row. The published solver
manifest remains intentionally closed, and Personal Assistant continues to
serve sanitized practice-only drills until supervised Windows canaries produce
real provenance-complete rows.

## Defects Closed

- Certification previously accepted any 40-character pipeline commit and any
  64-character manifest checksum. It now requires the exact active solver
  version, binary checksum, pipeline commit, manifest version, and manifest
  checksum.
- Scenario-hash reads collapsed duplicate rows into one Boolean and a PATCH by
  scenario hash could update every duplicate. The worker now requires exactly
  one row, retains its immutable row ID, patches by both ID and hash, requests a
  representation, and verifies that exactly the intended row was returned.
- PostgREST could return success for a zero-row write. A write now counts only
  after the returned row matches its identity, artifact checksum, manifest, and
  pipeline.
- Range validation accepted non-finite values because comparisons against NaN
  are false. Every range must now contain exactly 1,326 finite weights in
  `[0,1]` and at least one live combo.
- The launcher could install verified files in its working directory while
  importing stale files beside the launcher. It now anchors installation and
  imports to the launcher's own directory.
- Downloaded Python was imported before the complete fetched bundle was
  authenticated. The launcher now verifies the pinned manifest bytes and its
  pipeline-bundle checksum before atomically installing any executable file.
- Board discovery previously stopped at 50,000 rows and had no canonical-card
  validation. It is now stably paged with a bounded ceiling and rejects malformed
  or duplicate-card boards.
- Manifest values could carry ambiguous roots, duplicate targets, invalid rake,
  unsafe tokens, or malformed self-test inputs. Those contracts now fail before
  a solve or write.
- Solver parsing accepted short vectors and treated missing exploitability as
  zero. Strategy and EV shapes are exact, infinite values fail, summary EVs are
  finite, and exploitability must be observed rather than invented.
- Local backup writes could be truncated by interruption. Artifacts now use a
  flushed, fsynced temporary file followed by atomic rename.
- The source artifact checksum is now calculated over both the scenario hash
  and `strategy_matrix_v2`, preventing a valid matrix digest from being assigned
  to a different scenario without changing its seal.

## Live Read-Only Evidence

The 2026-09-01T12:07:26Z contract audit passed all 107 Training game contracts
and reported the same upstream readiness boundary:

- M1 heartbeat was current, but `spots_done=0` and `rows_written=0`; it remained
  an active scanner with no compatible work.
- M2's last heartbeat remained 2026-08-16T00:38:44Z with zero solves and zero
  exports.
- The legacy database manifest covered 17 of 25 Training family/stack contracts.
- Eight missing contracts affected 43 Training games.
- All 529 legacy phases declared flop and turn; none declared river.

A renewed full-table provenance/duplicate aggregate was attempted inside a
read-only repeatable-read transaction and was canceled by the 30/60-second
statement ceilings. No result was inferred from that timeout. The prior fixed
snapshot remains the bounded evidence: zero provenance-complete cache rows and
1,235 duplicate defective imports. The new worker refuses ambiguous hashes
regardless of their current count.

## Verification

- Python compilation passed for launcher, orchestrator, and harvester.
- The solver contract suite passed 24/24, including functional exact-release,
  duplicate-row, returned-write, non-finite-range, river-path, corrupt-vector,
  exact-state, and legacy-fail-closed checks.
- The static and live Training solver contract audit passed all 107 games.
- The canonical Leak Engine gate passed 112/112.
- The expanded Personal Assistant source and integration matrix passed 133/133,
  including accessible Title Case and banned-long-bar policy checks.
- The optimized webpack production build passed with 403/403 static pages.
- Compiled-production desktop Chromium and mobile Chrome passed 25 Personal
  Assistant journeys with two expected viewport-specific skips.
- The protected account verifier covered all 14 active corrective candidates
  with 10 usable questions each and zero empty, unmapped, missing, or error
  results. All 14 remained correctly practice-only; verified count remained
  zero because real producer provenance is still unavailable.

## Honest Activation Boundary

The code path is ready for supervised deployment, but the solver farm is not
authorized to run this manifest. Opening the gate still requires repository-
backed approved 1,326-combo range artifacts, exact game-state inputs, an
ICM-aware engine and payout model for ICM contracts, administrator maintenance
on both Windows hosts, and one successful canary export per host. Until those
external inputs exist, verified corrective batches correctly remain at zero.

## Publication Evidence

- Pull request #1182 passed the required protected checks and squash-merged as
  `9c78f1fc0ca61a42bc222e8d3f6c8259b7396cdd`.
- `smarter.poker/api/health` reported healthy production version `741f4aee` on
  2026-09-01. That main revision descends from the Phase 4 merge.
- Live production desktop Chromium and mobile Chrome passed all 25 applicable
  Personal Assistant journeys with two expected viewport-specific skips.
- The authenticated production verifier preserved all 24 leak-history rows and
  covered 19 corrective-drill candidates with zero empty, unmapped, missing, or
  other failures. Sixteen remained correctly practice-only, three were backed
  by verified sources, and the independently selected verified drill returned
  eight questions with every answer key hidden.
- Build Safety, Global Footer E2E, No Conflict Markers, Audit Marker Guard,
  Agent Autopilot, Silent Write Guard, Undefined Identifier Guard, and Supabase
  Invariants all completed successfully for the release branch.

## Closure Audit Correction

A fresh protected-account audit on 2026-09-01 followed seven signed
continuation batches and scanned 1,347 Club Arena records. It recovered 787
private-card facts, persisted 18 deterministic findings, retained complete
corrective-drill coverage, and exposed a receipt-labeling defect: the audit
engine counted every hand rejected before normalization as `Missing Private
Cards`, even when the real reason was an unsupported game variant or a missing
trusted hero identity.

The closeout correction now classifies missing private cards independently
from unsupported or incomplete hand data. That distinction is carried through
the durable job accumulator, visible audit receipt, and protected production
verifier. The verifier also reports eligible hands, already-current hands,
hands without hero decisions, newly verified decisions, and unpriced decisions
so an idempotent rerun cannot be mistaken for an audit that did no useful work.

The broad Playwright run also revealed three Personal Assistant assertions that
used the framework's five-second default for asynchronous detail, drill, and
checkpoint panels. The same complete surface passed under focused four-worker
production load, so the product path was not failing. Those assertions now use
the existing 15-second bounded async contract rather than becoming false
negatives when the 700-plus-test job saturates its runner.

The first deployed protected-account rerun received two consecutive retryable
`club_arena_audit_partial` responses. The durable in-app worker already permits
three bounded transient retries, while the standalone verifier permitted only
one. The verifier now follows the same three-retry contract with bounded delay,
so a normal identity-source or gateway recovery is tested as the product
handles it rather than being reported as an immediate audit failure.

Closeout verification passed the 24-test solver-writer suite, the 113-test Leak
Engine suite, focused rejection and durable-job contracts, the complete
desktop/mobile Personal Assistant matrix with 25 passes and two intentional
viewport skips, and the exact optimized production build with 403 static
pages.

The corrected protected-account verifier then completed against production in
seven batches. It scanned 1,347 Club Arena records, recovered 787 private-card
facts, classified 298 records as missing private cards and 626 as unsupported
or incomplete, and confirmed all 422 eligible hands were already current. It
detected 19 leaks, persisted the audit, and advanced leak history from 36 to
37. All 32 corrective candidates resolved to verified or practice drills with
zero empty, unmapped, missing, or other failures. The verified drill returned
five questions and did not expose answer keys.
