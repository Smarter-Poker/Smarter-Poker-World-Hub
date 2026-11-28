# Bankroll Manager database drafts (2026-11-28)

**Nothing in this folder is installed.** These are drafts, parked on the
`bookmark/bankroll-db-migrations-2026-11-28` branch (never auto-merged) and kept
out of `supabase/migrations/` so nothing looks installed when it is not. The
session that wrote them was not allowed to change the production database.

Installing one means: copy it to `supabase/migrations/<UTC stamp>_<slug>.sql`
(the "Install as" line in each header), apply it once through the normal
migration path, and commit the copy in the same PR.
For 2 and 3, the same PR must also delete the function's entry from
`phantom_rpcs` in `scripts/ci/supabase-invariants.allowlist.json` (added by
PR #3296 so CI accepts the call before the function exists; the phantom-rpc
check fails on a stale entry once it is installed). Follow
`.agent/workflows/migration-safety.md` (advisor scan before and after,
overload check, readback).

**Break window:** the database refuses DDL from **:50 to :03 UTC every hour**.
Run `date -u` first. A refused migration applied nothing and wrote no history
row: apply it ONCE after :03, never in a retry loop. Check what is installed
with `execute_sql`, not `list_migrations`:
`SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10`.

## Apply order

Each is independent of the others except where noted; this order applies the
ones the shipped client already uses first.

| # | File | Tier | Client today | Depends on |
|---|------|------|--------------|------------|
| 1 | `01_staking_sessions_update_delete_grant.sql` | 2 | Already used (no-op on production) | - |
| 2 | `02_fn_profile_settings_set_key.sql` | 2 | Shipped, falls back until installed | - |
| 3 | `03_fn_bankroll_totals.sql` | 2 | Shipped, falls back until installed | - |
| 4 | `04_bankroll_ledger_entry_currency.sql` | 2 | Nothing reads it yet | - |
| 5 | `05_bankroll_ledger_changes.sql` | 2 | Nothing reads it yet | - (after 4 the history images include the currency columns automatically) |
| 6 | `06_staking_share_links.sql` | 2 | Nothing reads it yet | - |

"Falls back" means the client (`src/lib/bankroll/rpcFallback.mjs`) calls the
function first and uses its old path ONLY when PostgREST answers PGRST202 /
404. Any other error is surfaced. So 2 and 3 can be installed at any time
after the client PR, and dropped again without breaking anything.

## How they were checked

- All six were applied in order to a throwaway local PostgreSQL 16 built with
  the production shapes of `bankroll_ledger`, `bankroll_segments`,
  `staking_*`, `profiles` (column grants included), stub `auth.uid()`,
  `anon` and `authenticated` roles, and the same RLS policies (read from
  production `pg_policies`/grants on 2026-11-28, metadata only). Each
  migration's own pre-flight and post-apply blocks passed; re-running 2-6
  is refused by their pre-flight; 1 is idempotent.
- Behaviour, run as `authenticated` / `anon` on that database: totals for
  all time, a month and a venue; settings key merge keeps other keys, bad
  key refused (22023); staking update as owner; history logs real updates,
  skips no-op updates, logs deletes, refuses a client insert, hides other
  users' rows, and a deleted row restores from `old_row`; share links:
  other users cannot see or create links for a deal they do not own, anon
  cannot read the table, a valid token returns only the seven statement
  columns in played order, revoked / expired / unknown tokens return zero
  rows; a EUR row without rate and originals is refused; deleting an
  `auth.users` row cascades through ledger and history without error.
- `fn_bankroll_totals` against `totalsFromRows` (the client rules) on 3,000
  generated rows (every category, millisecond timestamps, overnight and
  zero-length sessions, negative buy-ins, two venues): identical in every
  field for five windows. The golden answer for a small fixture is pinned in
  `__tests__/bankroll-db-rpc-fallback.test.mjs`.

## Verify each after applying

Run as the migration user via `execute_sql` unless noted. All read-only.

1. **staking grants**
   `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='staking_sessions' AND grantee='authenticated' ORDER BY 1;`
   expect DELETE, INSERT, SELECT, UPDATE. Then open a staking deal in the
   Staking Tracker as the CI account: no "could not sync" notice.
2. **fn_profile_settings_set_key**
   `SELECT p.prosecdef, has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_exec FROM pg_proc p WHERE p.proname='fn_profile_settings_set_key';`
   expect false / false / true. Then, signed in as the CI account, toggle a
   Toke Tracker preference: the network tab shows
   `POST /rest/v1/rpc/fn_profile_settings_set_key` 200 and no
   `PATCH /rest/v1/profiles`. Reload: the toggle persisted.
3. **fn_bankroll_totals**
   Same `prosecdef` / grants query (expect false / false / true). Then run the
   parity check below; it must print MATCH for every window and exit 0.
   Open the Bankroll Manager dashboard: one
   `POST /rest/v1/rpc/fn_bankroll_totals` 200 and no paged
   `GET /rest/v1/bankroll_ledger?select=id,category,gross_in,...` for the
   stats tiles.
4. **entry currency**
   `SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='bankroll_ledger' AND column_name IN ('entry_currency','fx_rate_to_usd','original_gross_in','original_gross_out');`
   and `SELECT conname, convalidated FROM pg_constraint WHERE conrelid='public.bankroll_ledger'::regclass AND conname IN ('bankroll_ledger_entry_currency_check','bankroll_ledger_fx_rate_positive','bankroll_ledger_foreign_entry_complete');`
   expect three rows, all validated.
   Rerun the bankroll-live suite: unchanged.
5. **ledger history**
   `SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='public.bankroll_ledger'::regclass AND NOT tgisinternal;`
   expect both `bankroll_ledger_changes_on_*` with `O`; `SELECT polname, polcmd FROM pg_policy WHERE polrelid='public.bankroll_ledger_changes'::regclass;`
   expect one SELECT policy. Edit one CI-account session note and read
   `bankroll_ledger_changes` as that account (one UPDATE row).
   Run `get_advisors(security)`: no new finding for the SECDEF function.
6. **share links**
   `SELECT count(*) FROM public.fn_staking_statement(gen_random_uuid());`
   expect 0; `get_advisors(security)` shows no new finding (search_path is
   pinned). As the CI account create a link for its own deal, call the rpc
   with the anon key: rows returned; set `revoked_at`: zero rows.

## Production parity check for fn_bankroll_totals

`scripts/bankroll-totals-parity.mjs` (shipped with the client PR) signs in as
the CI service account, reads that account's own ledger and segments through
RLS (paged), computes the totals with the client rules, calls
`fn_bankroll_totals` for all time, the last 30 days, this year and one venue,
and compares every figure in cents. Read-only: one POST signs in, the other
calls the STABLE rpc.

```
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
node scripts/bankroll-totals-parity.mjs
```

Exit 0 = every window matches, 1 = a difference (printed field by field),
2 = the function is not installed yet, 3 = setup error. It refuses to run
without `TEST_USER_EMAIL` rather than guess an account. Run it by hand or as a
step in the proof lane's write-live workflow (which already holds those
secrets); it must never be scheduled.

## Client changes still needed (not shipped)

- 4 (currency): entry form currency select, edit form, ledger display,
  export columns, revision copies, regenerated `src/types/supabase.ts`;
  details in the migration header.
- 5 (history): an Edit History panel and a Recently Deleted list with
  restore; staking links of a deleted session are not restored.
- 6 (share links): Share With Backer / Revoke in the Staking Tracker, and a
  rate-limited public backer page (Next API route calling the rpc
  server-side).
