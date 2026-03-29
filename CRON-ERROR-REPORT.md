# Smarter.Poker — Cron Error Report

**Date:** 2026-03-29
**Audited by:** Antigravity Agents (Claude Opus 4.6)
**Source:** Vercel Runtime Logs (last 6 hours)

---

## CRITICAL: supabaseKey Missing in Horse/Content Crons

### Affected Endpoints

| Endpoint | Schedule | Status | Impact |
|---|---|---|---|
| `/api/cron/horses-social-all` | Every 15 min | **500** | 96 failures/day |
| `/api/cron/horses-social-friends` | Every 15 min | **500** | 96 failures/day |
| `/api/cron/pokernews-videos` | Every 2 hours | **500** | 12 failures/day |
| `/api/cron/news-scraper` | Every 2 hours | 200 (FATAL log) | Silent failure |
| `/api/cron/horse-batch/[N]` | Every 2.5 hours | 200 (FATAL log) | Silent failure |

### Root Cause

The content-engine pipeline files create Supabase clients at **module scope** before env vars may be injected:

```javascript
// src/content-engine/pipeline/HorseSocialEngine.js (line 16-24)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '../../../.env.local' });  // NO-OP in Vercel

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);  // KEY IS UNDEFINED
```

**Why it fails:**
1. `dotenv.config({ path: '../../../.env.local' })` is a no-op in Vercel (no .env.local file exists)
2. `SUPABASE_SERVICE_ROLE_KEY` may not be set in the Vercel project environment
3. `NEXT_PUBLIC_SUPABASE_ANON_KEY` may also not be set
4. The Supabase `createClient` throws "supabaseKey is required" when key is null/undefined

**Why `/api/health` works:** The health endpoint uses lazy initialization (creates client only when request comes in) and the same env var pattern — but it works, meaning the env vars ARE available in the Vercel runtime. The issue is likely that the Horse pipeline files import `createClient` from `@supabase/supabase-js` directly (ESM) rather than from `src/lib/supabaseServerClient` (which has the patched resilient client).

### Affected Files (all use same broken pattern)

| File | Pattern |
|---|---|
| `src/content-engine/pipeline/HorseSocialEngine.js` | Module-level createClient |
| `src/content-engine/pipeline/HorseMessengerEngine.js` | Module-level createClient |
| `src/content-engine/pipeline/HorseStable.js` | Module-level createClient (in constructor) |
| `src/content-engine/pipeline/HorsePersonalityService.js` | Constructor createClient |
| `src/content-engine/pipeline/ContentModerationAgent.js` | Constructor createClient |

### Recommended Fixes

**Option A: Lazy initialization (minimal change)**
```javascript
// Replace module-level client with lazy getter
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY
            || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!key) throw new Error('No Supabase key — check Vercel env vars');
        _supabase = createClient(url, key);
    }
    return _supabase;
}
// Then replace all `supabase.` calls with `getSupabase().`
```

**Option B: Use shared server client (best practice)**
```javascript
// Use the patched client from src/lib/supabaseServerClient
import { createClient } from '../../../src/lib/supabaseServerClient';
```

**Option C: Verify Vercel env vars (quickest)**
1. Go to Vercel Dashboard → smarter-poker project → Settings → Environment Variables
2. Confirm `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set for Production
3. Redeploy

---

## Other Observations

### Working Crons (confirmed healthy)
- `/api/health` — 200, DB latency 132ms, status: ok
- All recent deployments: READY state
- Middleware security: properly blocking `/api/admin/*`, `/api/debug/*`, `/api/emergency/*`

### Club Arena — Clean
Zero errors in Vercel runtime logs over last 6 hours. Recent deploys include FIX 119-146 (V8 Bible compliance series) all deploying successfully.

### Silent Failures (200 status but FATAL in logs)
`news-scraper` and `horse-batch/*` return HTTP 200 but log `[FATAL] No Supabase key available`. These crons silently fail — they don't crash but they don't do any work. This is worse than a 500 because monitoring tools think they're healthy.

---

## Estimated Daily Impact

| Metric | Value |
|---|---|
| Failed cron invocations/day | **~216** (horses-social: 192 + pokernews: 12 + friends: 12) |
| Silently broken invocations/day | **~24** (news-scraper: 12 + horse-batch: 12) |
| Compute waste | ~216 cold starts at 60s maxDuration each |
| Content not posted | All Horse social interactions (likes, comments, replies, DMs) |
| News not scraped | PokerNews videos, 6-box news scraper |
