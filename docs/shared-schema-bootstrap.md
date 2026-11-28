# Shared PokerIQ schema rebuild

The canonical complete schema bootstrap and isolated PostgreSQL qualification
are maintained in Club Arena under `supabase/bootstrap` and
`scripts/schema-rebuild`. Both repositories use the same PokerIQ database.
Historical applied SQL remains immutable; this is a fresh empty-schema route,
not a production replay or a replacement for restoring financial data backups.

The shared baseline fingerprints this repository's historical migration bytes.
New migration source requires a refreshed baseline or an exact, independently
qualified schema transition; hashes alone never admit unexecuted SQL. Full qualification requires the pinned real Supabase
PostgreSQL runtime and independent source-catalog comparison.

The directly triggered `Shared PokerIQ schema lineage` workflow checks this
candidate against the pinned canonical baseline. Club Arena's full native
rebuild workflow proves that exact canonical source using the real pinned
provider runtime; Hub's lineage check does not claim a second full restore.

For the three M1 authority repins dated October 23 and 24, the Hub workflow
first verifies every captured historical hash and refuses any other new SQL.
It then runs the existing disposable PostgreSQL 17 verifier, applying all three
exact migrations in order. Each transition must preserve schema, privileges,
M2 state, receipts and artifacts; install only its two declared targets;
reject invalid predecessors, changed guards, unexpected receipts and duplicate
execution; and prove transactional rollback and retirement-only recovery.
The new scopes retain their historical values after recovery, while retired
authority must deny requests. Recovery must never reactivate an older pin.

Only a successful native run can add those three path/hash identities to a
temporary inventory passed to the unchanged canonical checker. The captured
inventory and canonical forward list remain immutable. Unit tests and matching
hashes alone cannot admit any transition. This check supplies no production
database access, solver execution, M2 release authority or full-restore claim.

The pinned canonical source is
`672c582d3e9cdac3e19f8bd3ae522863cc56df71`. Its
[full shared schema rebuild](https://github.com/Smarter-Poker/Smarter-Poker-Club-Arena/actions/runs/39863332181)
passed using the pinned official PostgreSQL 17 platform runtime, with no
external network or production credentials during reconstruction. That result
qualifies the canonical source; each Hub candidate still requires its own
lineage and exact-DML checks before protected merge.

The schema-only snapshot records historical source/ledger differences without
replaying financial history. Its exact forward migration is applied only in
the isolated qualification database after independent baseline equality,
followed by full catalog comparison. Neither result certifies a production
installation or releases a solver machine.

The four exact daily-report migrations dated October 27 and 28 are separately
qualified by `verify-digest-player-report-postgres.mjs` on PostgreSQL 17. It
executes both real report functions against isolated financial fixtures and
checks currency, Central-day boundaries, human/horse scope, linked bonus and
card accounting, pending liabilities and service-only access. Only its fresh
successful path/hash/version receipt admits those four immutable SQL files;
missing proof, different bytes or additional migrations still fail. The M1
qualification and all historical checks remain mandatory and unchanged.

The exact November 1 whole-dollar marketplace migration is also admitted only
after the PostgreSQL 17 gift/price-transition test executes it against isolated
fixtures and emits its fresh path/hash receipt. It checks catalog normalization
and inherited variant prices, new gift offers, historical replay, old/new
lifetime settlement and price-bound refunds. Changed bytes, missing/duplicate
receipts or a different PostgreSQL major remain refused. This qualifies this
transition only; it does not claim a full provider restore or installation.

The baseline also predates the already-merged October 31 signup-audit trigger
name fix. The same native qualification applies its exact SQL to isolated
auth-trigger fixtures, proving all named audit checks, extra-trigger tolerance,
missing/disabled-trigger refusal, unknown-check refusal and browser-role denial.
It receives its own exact path/hash receipt; its source and production state
are unchanged by this admission repair.

## Migrations installed after the baseline (2026-11-28)

The pinned baseline has no refresh route. Its source is Club Arena commit
`672c582d`, which never reached that repository's main, and Club Arena main has
no `supabase/bootstrap` or `scripts/schema-rebuild` to refresh from. From
2026-11-12 every ordinary Hub migration failed this check as an unqualified
transition. Main stayed red for sixteen days, and a check that is always red
protects nothing.

`supabase/history/installed-after-baseline.json` is the refreshed baseline for
those files. It lists each migration merged after the pin that production's
`supabase_migrations.schema_migrations` records as installed. Each entry gives
the path, the exact sha256, the installed version and the installed name. The
installed version is the one production recorded. It differs from the file
prefix where the migration went in through a tool that assigns its own version.
Every entry is then held exactly like the pinned files: a deleted file or
changed bytes fail, and an entry cannot restate a pinned or qualified file.
A migration file that is not recorded is still refused, by name.

To admit a new migration, first install it through the migration-safety
workflow, then append its entry with the version production recorded. An entry
without an installed version is refused, so SQL that has not run is never
admitted. The qualified M1, digest and marketplace transitions above, and the
pinned inventory, are unchanged.

When this was added, one merged file had never been installed:
`20261114163409_digest_error_spike_counts_people_not_test_browsers.sql`.
Production's `fn_sp_digest_attention` does not contain its new block, and no
installed migration has its name. It is deliberately left unrecorded, so this
check names it until it is installed or retired.
