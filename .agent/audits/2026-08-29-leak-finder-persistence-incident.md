# Leak Finder Persistence Incident

## Summary

The deterministic Leak Finder completed its audit but could not save the six
leaks it found. Production then showed a generic save error and three older
training records as `Unknown Leak`.

## Evidence And Root Cause

The live PostgREST schema reports `user_leaks.confidence` as numeric and
requires the legacy `leak_name`, `error_rate`, `total_samples`, and
`mistake_count` fields. The deterministic detector instead sent text confidence
tiers (`low`, `medium`, `high`) and omitted `leak_name`. Its atomic upsert
therefore failed after detection. Existing training-accountant rows used only
the legacy fields, leaving `leak_type` null; the Personal Assistant UI derived
its title only from `leak_type`, producing `Unknown Leak`.

This was a shared-table compatibility failure between two valid writers, not a
failure of the deterministic solver audit. The audit had already returned six
results before the database rejected the row shape.

## Resolution

- Added one compatibility boundary that translates confidence tiers to the
  live numeric scale and supplies the required legacy evidence fields without
  changing the deterministic response model.
- Normalized legacy rows at the API boundary so their names, counts, status,
  timestamps, and confidence render in the current Leak Finder.
- Upgraded the training accountant to dual-write both schema generations for
  all new and updated records.
- Changed a failed atomic upsert to fail closed with HTTP 503 before resolving
  old leaks or updating summary statistics.
- Added regression coverage for the exact live schema contract and legacy-row
  hydration.

## Forward Checks

The compatibility tests must remain in the Leak Finder build gate. Any future
`user_leaks` writer must use the shared compatibility boundary or explicitly
write both generations of required fields. The live schema remains the source
of truth; an archived migration is not a safe runtime contract.

## Production Acceptance And Club Arena Follow-Up

Production version `2a780ae1` was exercised through the authenticated Leak
Finder page. The deterministic audit completed, saved six new leaks, expanded
the active queue from three to nine, and rendered the audit receipt instead of
the prior save failure. The receipt then exposed a separate Club Arena read
failure that had been hidden behind the persistence incident.

The Club Arena hand query passed an array of objects directly to
`postgrest-js.contains`. With the installed client generation this becomes an
invalid JSON operand and production returns PostgreSQL `22P02` for both the
modern and legacy player-key queries. The query also excluded `source =
'manual'`, which is the source used by the live Hetzner Club Arena recorder.
Finally, the normalizer understood the older API-engine shape but not the live
recorder's `stage`, `community_cards`, `hole_cards`, or `button_seat` fields.

The follow-up repair serializes every player containment operand with
`JSON.stringify`, includes the live `manual` source, and normalizes both live
and legacy row generations. The same invalid containment pattern was corrected
in My Hands and the shared hand-history readers. A read-only audit against live
data found 100 recent Club Arena hands, normalized the nine with revealed hero
cards, extracted 37 decision points, and found five candidate solver nodes.
None were promoted to verified evidence because none had an exact board/node
match; those decisions correctly remain unpriced rather than being presented
as solver-certified leaks.

The production persistence check then found one historical non-exact candidate
whose `solver_verified` flag was false but whose tentative classification had
still been stored. Although every Leak Finder aggregate already filters on
`solver_verified = true`, the row itself overstated what was known. The audit
writer now nulls every solver conclusion and EV field unless the match is exact,
stores `classification = 'unpriced'`, and immediately retries older rows that
carry this inconsistent provenance instead of waiting for the normal refresh
window.

## Phase Two Deterministic Evidence And Lifecycle Audit

An independent engine, API, and UI review found that the first exact-matcher
generation was still too permissive. It sorted the complete board, could grade
Omaha against Hold'em ranges, reduced postflop holdings to rank notation, and
could map an action to a sized solver option without knowing the recorded
pot-relative size. It also treated forced blind postings as hero decisions and
made a transient question-cache failure indistinguishable from a complete
unpriced audit.

Matcher v2 now preserves turn/river order, requires Hold'em and the concrete
postflop combo, validates available table/stack identity, excludes forced
actions, and refuses ambiguous sized bets or raises. Legacy PIO cache prompts
are admitted only when their server-owned action prompt unambiguously identifies
one of the two supported postflop node classes. Verified decisions are stamped
with `hand-audit-v2`; Leak Finder excludes every legacy verification until the
idempotent Club Arena sync re-audits its hand. Lookup and persistence failures
are explicit incomplete/partial receipts rather than clean evidence.

The lifecycle review also found two generations of status state. Modern rows
used `status`/`resolved_at`, while legacy readers used `is_active`; Memory Matrix
cards lived in `user_training_leaks` and could not be resolved through the
combined page. Status transitions now update the modern fields atomically,
keep `is_active` synchronized, support the owned training record store, and
recount both sources without replacing valid cached totals when a read fails.
Automatic solver-leak resolution now requires both evidence sources to be
available. Review scheduling refuses to overwrite an unreadable prior state,
and its server interval cap once again matches the shared scheduler.

The UI now routes the exact derived drill street, hero position, and bounded
length into the sandbox. Frequency-only evidence and Memory Matrix repetition
signals remain visibly unpriced and no longer manufacture `0.00 BB`, pseudo
frequencies, or total-loss claims. Regression coverage exercises reordered
boards, Omaha, blockers/suits, ambiguous sizing, forced actions, lookup
failures, provenance, lifecycle transitions, and both persistence stores.

Authenticated production acceptance found one final backward-compatibility
case: solver leaks saved before matcher v2 retained `avg_ev_loss_bb = 0` as an
unmeasured sentinel. New writes correctly use null, but those historical rows
still rendered `-0.00 BB`. The display contract now treats an unmeasured zero
from `solver_engine` or `training_solver` as unpriced, while leaving genuinely
priced live-stat leaks unchanged.
