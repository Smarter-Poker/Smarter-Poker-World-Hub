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

The currently submitted canonical candidate is
`672c582d3e9cdac3e19f8bd3ae522863cc56df71`. Full pinned-image qualification is
pending in the new Arena qualification run; this Hub submission does not claim
a pass.
Both pull requests remain subject to that actual result and their required
checks before protected merge. The schema-only snapshot records historical
source/ledger differences without replaying financial history. Its one exact
pending migration is applied only in the isolated qualification database after
independent baseline equality, followed by full catalog comparison.
