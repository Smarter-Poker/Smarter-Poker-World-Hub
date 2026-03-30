# Context: Cron System

## Overview

45 cron jobs configured in vercel.json, executing on Vercel's cron infrastructure. All cron endpoints require `Authorization: Bearer {CRON_SECRET}` header — requests without it return 401.

## Frequency Tiers

| Tier | Count | Examples |
|---|---|---|
| Every 1 min | 1 | hard-stop |
| Every 5 min | 2 | scheduled-table-opener, scraper-watchdog |
| Every 15 min | 3 | horses-social-all, venue-game-alerts |
| Hourly | 2 | trivia-tournament-rounds, trivia-pvp-cleanup |
| Every 2-6 hours | 4 | news-scraper, pokernews-videos, freeroll-qual-sync |
| Daily | 25 | horse-batch/0-9, training, trivia, venue scrapes |
| Weekly | 3 | auto-settlement, settlement-distribute, union-rakeback |
| Monthly | 1 | vip-diamond-stipend |

## Auth Pattern

```javascript
const authHeader = req.headers.authorization;
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
}
```

CRON_SECRET is set in Vercel environment variables. Vercel automatically sends this header when invoking cron jobs.

## Known Failure Modes

1. **Module-scope supabase init** (FIXED Phase 4): createClient at module level before env vars ready
2. **Schema mismatch**: Querying columns that don't exist in the table (e.g., game_type on venue_live_history)
3. **GoTrue timeout**: auth.getUser network call failing on Vercel cold starts (mitigated by JWT fallback)
4. **Missing env vars**: SUPABASE_SERVICE_ROLE_KEY not set in some Vercel project environments

## Phase 4 Fix Summary

~300 daily failures eliminated by:
- getSupabase() lazy init pattern (commit dc75bcb5e — 84 bare supabase refs patched)
- HorseSocialEngine.js specific fix (commit 411ff14)
- Schema alignment for venue endpoints (commit e7f1998fd)
- All verified live with 0 new 500s after deploy c43293ee0

## Monitoring

- Phase 6 scheduled task: `smarter-poker-cron-health` runs every 6 hours
- Phase 6 dashboard: `smarter-poker-cron-monitor.jsx` — interactive React monitor for all 45 endpoints
- Phase 3 dashboard: `smarter-poker-monitor.jsx` — original production monitor
