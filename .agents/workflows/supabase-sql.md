---
description: How to execute SQL migrations on the Supabase database
---

# Supabase SQL Execution Workflow

> **CRITICAL RULE**: NEVER attempt to open the Supabase web dashboard in a browser to run SQL. You will be blocked by Cloudflare Captcha instantly.

Always use the local, programmatic CLI tools to interact with the database.

## 1. Check pending migrations

Check which SQL files in `supabase/migrations/` have not yet been applied to the database:

// turbo
```bash
npm run db:status
```

## 2. Execute SQL migrations

Run all pending `.sql` files in `supabase/migrations/` against the production database:

// turbo
```bash
npm run db:push
```

*Note: This script uses a migration ledger table (`supabase_migrations.schema_migrations`) to automatically skip files that have already been applied.*

## 3. Force re-run a specific file

If you need to re-run a specific file regardless of the ledger:

// turbo
```bash
npm run db:push -- --force supabase/migrations/YOUR_FILE.sql
```

## 4. Test SQL syntax (Dry Run)

To see what would run without actually executing the SQL:

// turbo
```bash
npm run db:push -- --dry-run supabase/migrations/
```
