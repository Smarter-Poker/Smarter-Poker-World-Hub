# Problem: Cron 500 Error Cascade (~300/day)

**Date Discovered:** 2026-03-29
**Date Fixed:** 2026-03-29
**Phase:** 4

## Symptoms

Multiple cron endpoints returning HTTP 500 on every invocation:
- /api/cron/horses-social-all: 500 every 15 min (~96/day)
- /api/cron/trivia-pvp-cleanup: 500 every hour (~24/day)
- /api/cron/venue-game-alerts: 500 every 15 min (~96/day)
- /api/rewards/daily-login: 500 on user login
- /api/poker/peak-activity: 500 on request
- /api/poker/game-trends: 500 on request
- /api/poker/venue-dedup: 500 on request

Total: ~300+ failures per day

## Root Cause

Module-level Supabase client initialization:

```javascript
// BROKEN — env vars not available at module parse time on Vercel
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
// supabaseKey is undefined → "supabaseKey is required" error
```

Secondary cause for venue endpoints: Schema mismatch — querying columns (game_type, tables_count) that didn't exist on venue_live_history table.

## Solution

1. **Lazy init pattern** (commit dc75bcb5e): Replaced 84 bare supabase references across the codebase with getSupabase() lazy singleton
2. **HorseSocialEngine fix** (commit 411ff14): Specific fix for the content engine pipeline
3. **Schema alignment** (commit e7f1998fd): Fixed column names in venue endpoint queries

## Verification

- Deployed as commit c43293ee0 on hub-vanguard
- Checked Vercel runtime logs: 0 new 500s from 21:20 UTC onward
- horses-social-all: 200, 200 (consecutive checks)
- peak-activity: 200
- game-trends: 200
- venue-dedup: 200
- venue-game-alerts: 401 (expected — auth gate working)
- trivia-pvp-cleanup: 401 (expected — auth gate working)

## Prevention

- Always use getSupabase() pattern (see patterns/supabase-lazy-init.md)
- Import createClient from src/lib/supabaseServerClient, never from @supabase/supabase-js directly
- Phase 6 automated monitoring checks for regressions every 6 hours
