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
