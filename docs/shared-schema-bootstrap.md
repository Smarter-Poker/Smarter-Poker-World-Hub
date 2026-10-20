# Shared PokerIQ schema rebuild

The canonical complete schema bootstrap and isolated PostgreSQL qualification
are maintained in Club Arena under `supabase/bootstrap` and
`scripts/schema-rebuild`. Both repositories use the same PokerIQ database.
Historical applied SQL remains immutable; this is a fresh empty-schema route,
not a production replay or a replacement for restoring financial data backups.

The shared baseline fingerprints this repository's historical migration bytes.
Any new migration requires a refreshed qualified baseline rather than silently
admitting unexecuted SQL. Full qualification requires the pinned real Supabase
PostgreSQL runtime and independent source-catalog comparison.

The directly triggered `Shared PokerIQ schema lineage` workflow checks this
candidate against the pinned canonical baseline. Club Arena's full native
rebuild workflow proves that exact canonical source using the real pinned
provider runtime; Hub's lineage check does not claim a second full restore.
