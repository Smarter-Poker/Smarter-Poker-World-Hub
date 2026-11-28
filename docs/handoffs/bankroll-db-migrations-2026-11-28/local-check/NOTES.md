# Local check harness (throwaway PostgreSQL only)

Used on 2026-11-28 to apply the six drafts and exercise them. Never point
these at production.

1. Start a scratch cluster (PostgreSQL 16+), e.g. on port 55432, socket /tmp/pgw4.
2. `createdb w4`; `psql -d w4 -f stub.sql` (production shapes, stub auth.uid()).
3. Apply the ten 20261128 migrations named in ../README.md in version order with `-v ON_ERROR_STOP=1`.
4. `psql -d w4 -f behave.sql` (RLS, grants, history, links, currency, cascade).
5. `node parity-local.mjs` (3,000 generated rows: fn_bankroll_totals vs totalsFromRows, five windows).
