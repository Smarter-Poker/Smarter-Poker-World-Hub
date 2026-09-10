---
description: Pre-flight, dry-run, and post-apply protocol for Supabase migrations
---

# Migration Safety Protocol

This is the **mandatory** wrapper around every Supabase migration. The
workflow at `supabase-sql.md` covers the *mechanism* (how to run files);
this one covers the *discipline* (what to do before and after).

Why it exists: 2026-04-30/05-01 we shipped 6 migrations to live in one
day with no dry-run, no rollback path, and no shadow-db diff. They all
worked, but the next one might not. This protocol exists so the next
agent (or future-you) doesn't have to think about safety from scratch
every time.

## TL;DR — the four-step gate

For any migration that touches production tables, RLS, RPC functions,
or triggers:

1. **Write the migration** (with the template below).
2. **Pre-flight** — the agent runs the checklist; nothing skipped.
3. **Apply** — via `mcp_apply_migration` or
   `scripts/antigravity_sql_push.js`. Save the file under
   `supabase/migrations/`.
4. **Post-apply verify** — every migration ends with an assertion
   block; run it and confirm 0 surprises before declaring done.

**Tier 1** (no business risk: docs, comments, view-only adds):
steps 1, 3, 4. Pre-flight optional.

**Tier 2** (RLS adds, new columns, new indexes): all 4 steps.

**Tier 3** (DROP, ALTER COLUMN TYPE, RPC overload changes, FK adds):
all 4 steps + must include an explicit rollback section in the
migration body, executable via copy-paste.

## Migration template

Copy `supabase/migrations/.template.sql` for new files. Skeleton:

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- <YYYYMMDD>_<short_slug>.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        1 | 2 | 3
-- AUTHOR:      <agent or human>
-- AFFECTS:     <tables | functions | RLS | triggers>
-- IRREVERSIBLE: yes | no    (yes → MUST include rollback section below)
--
-- WHY:
--   <one paragraph: what's broken, what symptom this fixes, where the
--   incident/audit/log evidence lives>
--
-- HOW (high level):
--   <bulleted summary of what the SQL below does in plain English>
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS (fail-fast if assumptions wrong)
-- These DO blocks RAISE EXCEPTION if the table/column the migration
-- assumes exists doesn't exist, or already exists when it shouldn't.
DO $$
BEGIN
    -- Example assertion — keep these specific to the migration:
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = '<your_table>'
          AND column_name = '<your_column>'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: <your_table>.<your_column> not found';
    END IF;
END $$;

-- 2. THE ACTUAL CHANGES
-- ...

-- 3. POST-APPLY ASSERTIONS (must all return TRUE)
-- These don't change state; they verify the migration achieved its goal.
DO $$
DECLARE
    v_check boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM ...
    ) INTO v_check;
    IF NOT v_check THEN
        RAISE EXCEPTION 'post-apply assertion failed: <what was supposed to be true>';
    END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3 only — paste this and run as a new migration to undo)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- <reverse SQL here>
-- COMMIT;
```

## Pre-flight checklist (Tier 2+)

Run these via `mcp_execute_sql` BEFORE applying:

1. **Advisor scan** — `mcp_get_advisors(type=security)` and
   `mcp_get_advisors(type=performance)`. Save the count of new
   findings; the migration shouldn't introduce more.

2. **Function dependency check** — if the migration touches an RPC,
   list overloads first:
   ```sql
   SELECT pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '<your_fn>';
   ```
   Multiple overloads → ambiguity risk (see PHASE 29 incident:
   `add_diamonds_to_balance` daily-login 500s). Drop unused ones in
   the same migration.

3. **RLS scope check** — if changing RLS, confirm which rows the
   policy applies to:
   ```sql
   SELECT polname, polcmd, polroles, qual::text, with_check::text
   FROM pg_policy
   WHERE polrelid = '<schema>.<table>'::regclass;
   ```

4. **Row count sanity** — for ALTER TABLE on big tables, get the
   estimated row count to size the lock window:
   ```sql
   SELECT reltuples::bigint
   FROM pg_class
   WHERE oid = '<schema>.<table>'::regclass;
   ```
   > 1M rows → strongly prefer `CREATE INDEX CONCURRENTLY` and
   `ALTER TABLE ADD COLUMN ... DEFAULT NULL` (constant-time on PG 11+),
   never `ADD COLUMN ... DEFAULT <expr>` on a large table.

5. **Search-path on SECDEF** — if the migration creates or replaces a
   `SECURITY DEFINER` function, it MUST end with
   `SET search_path = public, extensions;` (advisor flags otherwise —
   see PHASE 29).

## Apply

```bash
# Preferred (via Supabase MCP, atomic with branch advice):
mcp_apply_migration --name <short_name> --query <SQL>

# Or via repo script:
node scripts/antigravity_sql_push.js supabase/migrations/<file>.sql
```

The MCP path is preferred because it logs to `supabase_migrations.schema_migrations` automatically. The script path also works but has slightly different audit visibility.

## Post-apply verify

After apply, before declaring done:

1. **Confirm the new migration is recorded** with a SELECT through `execute_sql`:
   `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5`.
   Not `list_migrations`: every MCP `list_migrations` call first runs no-op
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on the history table, which reloads
   PostgREST's schema cache (~28 s), and inside the hourly break window (:50-:03
   UTC) the database refuses it (CLAUDE.md section 1.2 item 2).
2. **Run the migration's own post-apply assertions** (the `DO $$ ... $$;`
   block at the bottom of the file should already do this).
3. **Re-run the advisor scan** — finding count should be ≤ pre-flight.
4. **For RPC changes** — verify the new signature replaces all
   overloads cleanly:
   ```sql
   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '<your_fn>';
   ```
   Should match the expected overload count.
5. **For trigger changes** — verify the trigger fires by inserting a
   test row and observing the side-effect (don't ship a trigger blind).

## Rollback discipline

Tier 3 migrations include a paste-able ROLLBACK section in the file
itself (commented out). To roll back: copy the rollback SQL into a
NEW migration file with a `_revert_` slug and apply normally. **Never
edit a migration file after it's been applied** — the
`schema_migrations` table records hashes and the next agent will
follow the wrong file.

## Anti-patterns to call out

- ❌ Running `mcp_execute_sql` for DDL (CLAUDE.md §2 forbids this).
- ❌ Migration file with no comment block. Future agents lose the
  "why".
- ❌ `DROP FUNCTION ... CASCADE` without first running a dependency
  check. Will silently drop downstream objects.
- ❌ `ALTER TYPE ... ADD VALUE` outside its own migration — Postgres
  forbids it inside a transaction with other DDL on the same enum.
- ❌ Shipping multiple migrations in one file. Each `_slug.sql` is
  one logical change; if you have two, make two files.
