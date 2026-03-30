# Pattern: Supabase Lazy Initialization

**Type:** Infrastructure Pattern
**Used In:** All API routes and cron endpoints

## The Pattern

```javascript
import { createClient } from '../../../src/lib/supabaseServerClient';

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

## Usage

Replace any `const supabase = createClient(url, key)` at module scope with this pattern. Then use `getSupabase()` or `const supabase = getSupabase()` inside handler functions.

## Why This Exists

Vercel serverless may not have env vars ready at module parse time. The lazy getter defers client creation until the first request, when env vars are guaranteed to be injected. The singleton avoids re-creating the client on every call within the same function instance.

## Hardcoded Fallback URL

The URL `https://kuklfnapbkmacvwxktbh.supabase.co` is the smarter.poker Supabase project URL. It's hardcoded as a safety net — if NEXT_PUBLIC_SUPABASE_URL is somehow missing, the client still connects to the right project.

## Import Source

Always import `createClient` from `src/lib/supabaseServerClient` (the patched version with JWT fallback), NOT from `@supabase/supabase-js` directly.
