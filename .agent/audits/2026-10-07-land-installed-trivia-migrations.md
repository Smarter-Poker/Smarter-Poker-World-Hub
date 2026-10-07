# Land the four installed Trivia migrations on main (2026-10-07)

## Finding

Club Arena's `Installed and merged migrations agree`
(`migration-ledger-reconciled.yml`, `scripts/ci/check-applied-migrations-are-recorded.mjs`)
was red on four versions installed in production on 2026-10-06 by
`antigravity_sql_push:v4` with no file on either repository's `main`:

| version | name | bytes | md5 |
| --- | --- | --- | --- |
| 20261006053300 | trivia_p11_payout_control_authority | 63420 | acfad20f9640ecc541bf11b744e55fcd |
| 20261006061400 | trivia_phase9_retire_generic_lifeline_spend | 13016 | 9493551def8ecad1968f4f1b53e00051 |
| 20261006061500 | trivia_phase9_paid_skip_and_endless_score_authority | 128160 | 0e50eab453b76ad4d2817e76dcd37d1d |
| 20261006143500 | trivia_phase9_fk_advisor_hardening | 19052 | 33bebc9a3739f5559c45f800bf6d1e18 |

Their files exist only on PR #2183 (`agent/codex/trivia-p9-12-certification-20261006`,
head `e0e913e9`, last updated 2026-10-06T14:46Z).

## Why only the four files

PR #2183 is 53 files of Trivia application, API, service-worker and
diamond-spend changes with `Pre-Deploy Safety Checks` failing and no activity
for about 23 hours. Landing it would ship unrelated, unreviewed runtime
behaviour to fix a ledger record, so only the migration files land here. The
PR keeps its own application changes; once this merges, its four migration
files are identical to `main` and merge cleanly.

## Proof the files are what production ran

For each version, `supabase_migrations.schema_migrations.statements` has one
element, and `octet_length(statements[1])` and `md5(statements[1])` equal the
file's byte length and md5 in the table above (read 2026-10-07, read-only
`execute_sql`). The bytes were copied with `git show` from the PR head straight
to disk; no newline was added and no editor or JSON boundary touched them.

Nothing is re-applied: the versions are already installed, and this change
only records their source on `main`.
