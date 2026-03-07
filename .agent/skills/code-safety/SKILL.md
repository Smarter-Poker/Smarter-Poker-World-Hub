# Code Safety Skill — MANDATORY FOR ALL AGENTS

## Priority: CRITICAL — Read before ANY code changes

This skill exists because on March 7, 2026, a single coding mistake (an imported-but-uncalled React hook) caused 14 consecutive failed deployments and took down the entire smarter.poker website.

## The 7 Immutable Rules

### Rule 1: NEVER use `.single()` on Supabase queries
**Always use `.maybeSingle()` instead.**

`.single()` throws a PGRST116 error when 0 rows are returned. This crashes the API route with a 500 error. `.maybeSingle()` returns `null` gracefully.

```javascript
// WRONG — will crash when no row exists:
const { data } = await supabase.from('profiles').select('*').eq('id', id).single();

// CORRECT:
const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
```

### Rule 2: NEVER import a React hook without calling it
If you `import { useXxx }`, you MUST call `useXxx()` in the component body.

```javascript
// WRONG — ReferenceError during SSG, crashes ALL pages:
import { useState, useMyHook } from 'react';
// ... useMyHook is never called ...

// CORRECT:
import { useState, useMyHook } from 'react';
const hookData = useMyHook(); // MUST call it
```

### Rule 3: NEVER use `createClient()` at module scope
Module-scope code runs during SSG (Node.js, no browser). Guard with `typeof window`.

### Rule 4: NEVER use raw `@supabase/supabase-js` in API routes
Always use `import { createClient } from 'src/lib/supabaseServerClient'` — the patched client with JWT decode fallback for when GoTrue network calls fail on Vercel.

### Rule 5: NEVER trust `req.query.userId` or `req.body.userId`
All user identity must come from JWT: `supabase.auth.getUser(token)`.

### Rule 6: NEVER call `.limit()` on JavaScript arrays
`.limit()` is a Supabase query builder method, not a JS array method. Calling it on `.filter()` results throws TypeError.

### Rule 7: ALWAYS verify your changes
After ANY code modification:
1. `grep -rn '.single()' --include='*.js' pages/ src/` — confirm no `.single()` leaked
2. `npm run build` — verify compilation passes
3. After push: check Vercel deploy status within 5 minutes

## Enforcement

- **Local**: `.git/hooks/pre-push` blocks pushes violating rules 1-4
- **CI/CD**: `.github/workflows/build-safety-gate.yml` blocks deploys on ALL branches
- **Post-Deploy**: Automated 5-minute site health check after every main deploy

## If You Break the Build

1. `git revert HEAD && git push` — immediately
2. Investigate the root cause
3. Fix and push a clean commit
4. Verify the new deployment succeeds
