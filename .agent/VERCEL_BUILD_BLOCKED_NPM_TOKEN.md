# 🚨 Vercel Production Builds Blocked — NPM_TOKEN Expired

**Found:** 2026-04-30  
**Severity:** SHIP-STOPPER — every push to `main` since the token expired
has produced an **ERROR** deploy. Production is frozen at a stale build.

## Symptom

Last 4 deployments to `main` are all `state: "ERROR"` with build logs:

```
npm error code E401
npm error 401 Unauthorized - GET
  https://npm.pkg.github.com/download/@smarter-poker/commander-shared/0.1.1/...
  - unauthenticated: User cannot be authenticated with the token provided.
Error: Command "npm install" exited with 1
```

Failed deployment IDs (most recent first):
- `dpl_FF7ruBqN8SgSwg2s1bYz74eYr8hz` — sha 858560ba06 (audit-12 social-media autoplay revert)
- `dpl_9oDoZwZhk3BnMwHLMshySRAB9fJ6` — sha 894a4864b5 (PageErrorBoundary surface)
- `dpl_7smDnjfhP3U2aKomhZnN3jRkBABE` — sha cb08a79407 (mobile scroll regression)
- `dpl_8GGYD6xrjXdtnuVXULjME5gpuCkU` — sha 45e5bd6002 (reels timer leaks)

## Root cause

`.npmrc`:
```
@smarter-poker:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

`package.json`:
```
"@smarter-poker/commander-shared": "^0.1.1"
```

The Vercel build needs `NPM_TOKEN` env var set to a GitHub PAT with
`read:packages` scope. The current token has expired or been revoked.

History (`git log --grep "NPM_TOKEN"`) shows past iterations of this:
- `aacc1b9b9d` handoff: fix GitHub Actions npm 401 for @smarter-poker/commander-shared
- `7bba65210a` ci(safety-gate): authenticate npm for @smarter-poker GitHub Packages
- `887af4a1b2` ci(safety-gate): use NPM_AUTH_TOKEN PAT for user-scoped private packages
- `5c7bda70af` fix(ci): set NPM_TOKEN env alongside NODE_AUTH_TOKEN

So this is a recurring pain point — the GitHub PAT keeps expiring on
Vercel.

## What's blocked

Every commit since the token broke is sitting in Vercel as `ERROR`,
including all of today's fixes from this session:

- `68555ec2ba` — diamonds overload consolidation + caller fixes + link-preview timeout
- `85baa83827` — supabase.ts type fix
- `a321d5b0c0` — DB migrations (search_path lockdown + FK indexes)

The DB migrations are already applied to the live Supabase, so the
daily-login 500 fix is partially in effect. But the **API route
fixes** (link-preview timeout, referral reversal namespacing,
follow/reaction/etc reference_id namespacing) are NOT yet live in
production. They're in `main` but not built.

## Recovery — exact steps

The user (Dan) must do this from a browser since I can't set Vercel
env vars from this MCP:

1. **Generate a fresh GitHub Personal Access Token (classic)**:
   - https://github.com/settings/tokens/new
   - Note: `Vercel — Smarter-Poker-World-Hub commander-shared`
   - Scopes: `read:packages` (only this is needed)
   - Expiration: 1 year (or "no expiration" if you want to stop revisiting this)
   - Click **Generate token** and copy the `ghp_...` value immediately.

2. **Update Vercel env var**:
   - https://vercel.com/smarter-poker/smarter-poker-world-hub/settings/environment-variables
   - Find the existing `NPM_TOKEN` variable
   - Click the `…` menu → **Edit**
   - Paste the new token value
   - Make sure **Production**, **Preview**, **Development** are all checked
   - Click **Save**

3. **Trigger a redeploy**:
   - Either: push any new commit to `main` (the next session's commit
     will work)
   - Or: Vercel dashboard → Deployments → find a recent failed
     deployment → `…` → **Redeploy**

4. **Verify**:
   - Wait for the new deployment to reach `state: "READY"`
   - Spot-check `/api/link-preview` (should return JSON with timeouts now)
   - Spot-check `/api/rewards/daily-login` (should no longer 500
     intermittently — DB migration already deployed but app code
     improvement lands here)

## Longer-term fix (consider if this keeps happening)

Two options:

**Option A — long-lived deploy key.** Create a fine-grained PAT scoped
just to the `commander-shared` repo with `read:packages`, no
expiration, owned by an admin@smarter.poker GitHub account. Store as
a Vercel env var. This is the conventional fix.

**Option B — vendor commander-shared into this monorepo.** Move
`commander-shared/` into `packages/commander-shared` of THIS repo,
change `package.json` to `"@smarter-poker/commander-shared":
"file:packages/commander-shared"`. Eliminates the GitHub Packages
auth requirement entirely. Trade-off: undermines Phase 3.3's "single
source of truth across repos" goal — Commander would still need to
pull the published package, and any future code change to
commander-shared would have to be applied in two places again. Only
do this if Commander is also being merged into this repo.

The current setup (Option A's pattern but with an expiring token) is
the worst of both worlds — accepts the maintenance overhead of a
shared package without the reliability of a long-lived token.
