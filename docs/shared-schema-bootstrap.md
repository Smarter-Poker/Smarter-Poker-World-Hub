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

For the two M1 authority repins dated October 23 and 24, the Hub workflow
first verifies every captured historical hash and refuses any other new SQL.
It then runs the existing disposable PostgreSQL 17 verifier, applying both
exact migrations in order. Each transition must preserve schema, privileges,
M2 state, receipts and artifacts; install only its two declared targets;
reject invalid predecessors, changed guards, unexpected receipts and duplicate
execution; and prove transactional rollback and retirement-only recovery.
The new scopes retain their historical values after recovery, while retired
authority must deny requests. Recovery must never reactivate an older pin.

Only a successful native run can add those two path/hash identities to a
temporary inventory passed to the unchanged canonical checker. The captured
inventory and canonical forward list remain immutable. Unit tests and matching
hashes alone cannot admit either transition. This check supplies no production
database access, solver execution, M2 release authority or full-restore claim.

The currently submitted canonical candidate is
`672c582d3e9cdac3e19f8bd3ae522863cc56df71`. Full pinned-image qualification is
pending in the new Arena qualification run; this Hub submission does not claim
a pass.
Both pull requests remain subject to that actual result and their required
checks before protected merge. The schema-only snapshot records historical
source/ledger differences without replaying financial history. Its one exact
pending migration is applied only in the isolated qualification database after
independent baseline equality, followed by full catalog comparison.
