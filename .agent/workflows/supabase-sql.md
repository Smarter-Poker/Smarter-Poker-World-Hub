---
description: How to execute SQL migrations on the Supabase database
---

# Supabase SQL Execution Workflow

// turbo-all

## Option A: Use the Built-in Push Script (Preferred)

Run a migration file:
```bash
node scripts/antigravity_sql_push.js supabase/migrations/YOUR_MIGRATION.sql
```

Check migration status:
```bash
npm run db:status
```

## Option B: Direct SQL Execution via API Route

For quick one-off SQL (no migration file needed):
```bash
node scripts/antigravity_sql_push.js --inline "ALTER TABLE clubs ADD COLUMN level integer DEFAULT 1;"
```

## Option C: Direct psql (Emergency Only)

Only use if Options A/B fail:
```bash
psql "postgresql://postgres:" + os.environ["SUPABASE_DB_PASSWORD"] + "@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres" -c "YOUR SQL HERE"
```
The password is in `.env.local` as `SUPABASE_DB_PASSWORD`.

## Creating a New Migration

1. Create the file:
```bash
touch supabase/migrations/$(date +%Y%m%d)_description.sql
```

2. Write your SQL in the file

3. Execute it:
```bash
node scripts/antigravity_sql_push.js supabase/migrations/YOUR_FILE.sql
```

## Rules

- ALWAYS create a migration file for schema changes (tables, columns, indexes, RLS policies)
- Use `IF NOT EXISTS` for all CREATE statements to prevent re-run failures
- Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for safety
- Test SELECT queries first before running DDL
- NEVER drop tables or columns without explicit user approval (Tier 3 task)
