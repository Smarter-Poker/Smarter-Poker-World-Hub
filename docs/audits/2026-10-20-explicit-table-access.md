# Supabase table-access readiness: first qualified correction

Supabase removes automatic new-public-table grants from existing projects on
October 30, 2026. Existing tables retain their grants. GRANT and RLS are
independent; an RLS policy does not supply SQL privileges. Sequence USAGE can
also be required by bigserial defaults.

The original `20260819_client_crash_log.sql` revokes browser access but relies
on implicit service-role grants. Both `pages/api/client-crash.js` and
`pages/api/auth/log-client-error.js` use service-role INSERT without returning
rows. The additive `20261020162929_explicit_service_crash_log_access.sql`
grants exactly INSERT and sequence USAGE. It preserves existing production
ACLs, RLS, policies and data and refuses unexpected browser access/policies.
The immutable historical migration is unchanged.

`test-explicit-crash-log-access.py` uses a private socket-only PostgreSQL
cluster, creates roles with no table/sequence defaults, applies the actual
original migration and proves both missing-table-grant and missing-sequence-
grant failures. After the exact correction, service INSERT succeeds; service
read/update/delete and browser table/sequence access remain denied on the
fresh database. Existing broad service ACLs remain byte-identical through the
compatibility transition. No production records are used.

The existing required policy-function-grants CI job and normal pre-push hook
now also check changed migrations for explicit table access boundaries.
Static public CREATE TABLE statements, including executable statements inside
anonymous DO bodies, require RLS plus explicit revocation from PUBLIC, anon,
authenticated and service_role before any narrowly scoped grants. RPC-only
tables may remain fully revoked. This declaration check does not infer correct
business permissions, interpret arbitrary dynamically constructed SQL, or
replace a migration's native permission tests. Dynamic provisioning paths need
separate native qualification and remain part of the wider audit.

## Audit boundary

This is the first qualified correction, not certification of every table or
fresh database reset. Read-only production inventory found 1,642 public base
tables with RLS in PokerIQ-Production and 180 in PepNationLab. Source discovery
covers World Hub and Club Arena; Commander shares PokerIQ. Many historical
files use dynamic ACL loops, include previously recorded source formats, or
rely on later migrations. A missing textual GRANT alone is not proof of a bug,
and a policy alone is not permission to add a grant. Column-level grants must
be preserved; blindly adding table SELECT can expose protected columns.

Remaining work includes cumulative per-table role/operation and column/sequence
review, Workers/Commander/PepNation provisioning paths, isolated fresh/reset
qualification and production readback of any qualified installation. No global
ALTER DEFAULT PRIVILEGES, blanket GRANT, financial write or engine replacement
is part of this correction.
