# Bankroll Manager database migrations (2026-11-28)

**All installed on production on 2026-11-28.** The repo files in
`supabase/migrations/` carry the installed versions, and their SQL equals the
installed `statements` in `supabase_migrations.schema_migrations` (compared
by md5 with comment and blank lines ignored, 2026-11-28). Never edit them.

| Version | Name | What it does | Client |
|---|---|---|---|
| 20261128100327 | staking_sessions_update_delete_grant | Records UPDATE/DELETE for authenticated (no-op on production) | Staking Tracker replay rewrite and unlink |
| 20261128101635 | fn_profile_settings_set_key | One profiles.settings key merged in place, security invoker | `tokePrefs.mjs` saveTokePrefsToAccount |
| 20261128101707 | fn_bankroll_totals | Dashboard totals in integer cents, rules R1-R12 | `calculations.ts` getBankrollStats |
| 20261128101805 | bankroll_ledger_changes | Edit/delete history by trigger; players read and delete their own rows (coordinator amendment) | none yet |
| 20261128101825 | bankroll_ledger_entry_currency | Nullable per-entry currency columns; gross_* stay USD | none yet |
| 20261128101849 | staking_share_links | Backer links and SECURITY DEFINER fn_staking_statement | none yet |
| 20261128101901 | bankroll_ledger_external_ref | (coordinator) external reference column and partial unique index | see its header |
| 20261128102249 | bankroll_new_tables_explicit_boundary | Revokes service_role's implicit ALL on the two new tables and client use of the history id sequence | none |
| 20261128102637 | bankroll_new_tables_service_role_read | Grants service_role SELECT only on the two new tables (CHECK 17 reads the schema through the service key's OpenAPI) | none |
| 20261128103322 | fn_bankroll_totals_expense_rule | R5 follows #3289: expense = -\|gross_out - gross_in\| (an expense typed in gross_out is a cost, not a gain). Pinned by `__tests__/bankroll-totals-sql-matches-ledger-math.test.mjs`, which fails if ledgerMath's rule and the newest function migration disagree | `calculations.ts` getBankrollStats |

Client fallbacks: #3296 shipped the client before 2 and 3 existed, falling
back to the old paths on PGRST202. With both installed and verified (the
owner's dashboard tiles equal `fn_bankroll_totals`), the fallback and the two
`phantom_rpcs` allowlist entries were removed in the PR that added these
files. A failed call now surfaces as an error.

**DDL windows (both enforced by the database):**
- the hourly break, **:50 to :03 UTC** (event triggers
  `ca_break_window_refuses_ddl` / `ca_break_window_refuses_drops`);
- the nightly release schema freeze, **23:45 to 04:15 America/Chicago**
  (`smarter_private.fn_ca_release_freeze_ddl_guard`). The first attempt at
  fn_profile_settings_set_key was refused by it.
A refused migration applied nothing and wrote no history row: apply it ONCE
when the window is open, never in a retry loop. Check what is installed with
`execute_sql`, not `list_migrations`:
`SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10`.

## How they were checked

The throwaway-database harness is in `local-check/` (see its NOTES.md).

- All six were applied (original order 1, 2, 3, currency, history, links; each is independent) to a throwaway local PostgreSQL 16 built with
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
4. **ledger history**
   `SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='public.bankroll_ledger'::regclass AND NOT tgisinternal;`
   expect both `bankroll_ledger_changes_on_*` with `O`; `SELECT polname, polcmd FROM pg_policy WHERE polrelid='public.bankroll_ledger_changes'::regclass;`
   expect one SELECT policy. Edit one CI-account session note and read
   `bankroll_ledger_changes` as that account (one UPDATE row).
   Run `get_advisors(security)`: no new finding for the SECDEF function.
5. **entry currency**
   `SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='bankroll_ledger' AND column_name IN ('entry_currency','fx_rate_to_usd','original_gross_in','original_gross_out');`
   and `SELECT conname, convalidated FROM pg_constraint WHERE conrelid='public.bankroll_ledger'::regclass AND conname IN ('bankroll_ledger_entry_currency_check','bankroll_ledger_fx_rate_positive','bankroll_ledger_foreign_entry_complete');`
   expect three rows, all validated.
   Rerun the bankroll-live suite: unchanged.
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

(The numbers below follow the original draft order: 4 = history, 5 = currency, 6 = share links.)

- 5 (currency): entry form currency select, edit form, ledger display,
  export columns, revision copies, regenerated `src/types/supabase.ts`;
  details in the migration header.
- 4 (history): an Edit History panel and a Recently Deleted list with
  restore; staking links of a deleted session are not restored.
- 6 (share links): Share With Backer / Revoke in the Staking Tracker, and a
  rate-limited public backer page (Next API route calling the rpc
  server-side).
