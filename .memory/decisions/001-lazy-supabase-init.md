# Decision: Lazy Supabase Initialization Pattern

**Date:** 2026-03-29
**Phase:** 4
**Status:** IMPLEMENTED

## Context

Multiple cron endpoints and API routes were failing with "supabaseKey is required" errors, causing ~300 failures per day across the platform. The root cause was module-level `createClient()` calls that executed before Vercel injected environment variables.

## Decision

Replace all module-level `const supabase = createClient(url, key)` with a lazy singleton pattern:

```javascript
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}
```

## Rationale

- Vercel serverless functions may not have env vars available at module parse time
- The content-engine pipeline files used `dotenv.config({ path: '../../../.env.local' })` which is a no-op on Vercel
- Lazy init defers client creation to first request, when env vars are guaranteed available
- Singleton pattern avoids creating multiple clients per function instance

## Impact

- Fixed 7 distinct failing endpoints
- Eliminated ~300 daily 500 errors
- Commit dc75bcb5e patched 84 bare supabase references
- Commit 411ff14 fixed HorseSocialEngine.js specifically
- All fixes verified live via Vercel runtime logs

## Alternatives Considered

1. **Shared client module**: Would still fail at module scope
2. **Environment variable verification at deploy**: Doesn't solve timing issue
3. **Dynamic import**: More complex, same effect as lazy init
