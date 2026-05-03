# Next.js Upgrade Runbook
**File:** `docs/runbooks/08-nextjs-upgrade.md`
**Owner:** Platform Team
**Last Updated:** May 2026

---

## Background

The May 2026 incident: upgrading Next.js from 14 → 16 caused **10+ consecutive Vercel deployment failures** because:

1. Next.js 15 changed the default bundler from Webpack → **Turbopack** (for both `next build` AND `next dev`)
2. Turbopack's strict named-export validation failed on 246 import mismatches webpack had silently ignored
3. The `vercel.json buildCommand` was calling `next build` without `--webpack` — Vercel ignores `package.json` build scripts entirely
4. The local build gate couldn't catch it because the private package auth blocked `npm install`

**Total time lost:** ~6 hours. **Root cause:** Missing upgrade checklist.

---

## Before Upgrading Next.js — Pre-Flight

### 1. Check Bundler Default Change

Open the Next.js release notes for the target version. Look for:
- Any mention of "Turbopack" becoming the default
- Any mention of `--webpack` flag changes
- Any mention of bundler configuration keys in `next.config.js`

```bash
# Check release notes
open https://nextjs.org/blog/next-$(TARGET_VERSION)
```

### 2. Check Peer Dependency Chain

All of these MUST be bumped together — they must share the same major version:

```bash
# What version are we on now?
node -p "require('./package.json').dependencies.next"

# What must change together:
# - next
# - @next/env
# - eslint-config-next
# These MUST all be the same major version
```

### 3. Check Sentry Compatibility

```bash
# Verify @sentry/nextjs peer dep includes the new Next.js version
node -p "require('./node_modules/@sentry/nextjs/package.json').peerDependencies"
```

If `next` isn't in the Sentry peer dep range, wait for a Sentry release before upgrading.

### 4. Check ESLint Peer Deps

```bash
# Does the new eslint-config-next require a different ESLint version?
curl -s "https://registry.npmjs.org/eslint-config-next/$(NEW_VERSION)" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('peerDependencies',{}))"
```

---

## During Upgrade — Required Changes

### The Critical Checklist (Every Upgrade)

Run this after changing the Next.js version in `package.json`:

```bash
# Find EVERY place next build or next dev is called
git grep -n "next build\|next dev" --include="*.sh" --include="*.yml" --include="*.yaml" --include="*.json"
```

Every result must either:
- Have `--webpack` appended (if the project uses webpack-specific config), OR
- Be verified as Turbopack-compatible

**Files that MUST all match the new Next.js major version:**
| File | What to change |
|---|---|
| `package.json` → `next` | Remove caret: `"next": "X.Y.Z"` |
| `package.json` → `@next/env` | Same exact version as next |
| `package.json` → `eslint-config-next` | Same exact version as next |
| `package.json` → `build` script | `next build --webpack` |
| `package.json` → `dev/clean:dev/nuke:dev` | `next dev --webpack` |
| `package-lock.json` root dep | Must match after `npm install` |
| `vercel.json` → `buildCommand` | `next build --webpack` |
| `scripts/git-safe-push.sh` (both) | `next build --webpack` |
| `scripts/dev-watchdog.sh` | `next dev --webpack` |
| `.github/workflows/e2e-tests.yml` | `npx next build --webpack` |

> 🚨 **The `--webpack` flag requirement will go away** once the 246 named-export mismatches are fixed and Turbopack is validated. See ticket: "Migrate to Turbopack (fix 246 named exports)"

### Optional: `next.config.js` Cleanup

After each major version, check for deprecated config keys:

```bash
# Keys that were deprecated/removed in Next.js 15+:
grep -n "swcMinify\|serverComponentsExternalPackages\|instrumentationHook\|appDir\|target" next.config.js
```

See [Next.js migration guide](https://nextjs.org/docs/app/building-your-application/upgrading) for the full list of deprecated keys.

---

## After Upgrade — Validation

### 1. Build Verification

```bash
# Local build (if npm install succeeds — needs NPM_TOKEN env var):
npm run build

# Or check Vercel build log for:
grep "▲ Next.js.*webpack\|▲ Next.js.*turbopack" vercel-build.log
# Should see: ▲ Next.js X.Y.Z (webpack) — NOT (Turbopack)
```

### 2. Smoke Test

```bash
npm run verify  # hits /api/health and checks SHA + DB
```

### 3. ESLint Validation

```bash
npm run lint 2>&1 | head -20
# Should exit 0, or only show pre-existing warnings
```

---

## Package Version Pinning Policy

**CRITICAL RULE:** Never use `^` (caret) on these packages — pin to exact version:

```json
// ✅ Correct — exact pins prevent silent bundler/behavior upgrades
"next": "16.2.4",
"@next/env": "16.2.4",
"eslint-config-next": "16.2.4",

// ❌ Wrong — caret allows npm to pull any 16.x which may change bundler defaults
"next": "^16.2.4"
```

Other packages where pinning is recommended:
- `react` / `react-dom` — major version changes break lifecycle APIs
- `@sentry/nextjs` — Sentry releases can change source map behavior

---

## Local Development Auth

The private `@smarter-poker/commander-shared` package requires a GitHub Packages token.

```bash
# Set up auth (only needed once per machine):
bash scripts/setup-npm-auth.sh ghp_yourTokenHere

# Verify it works:
npm install && echo "✅ Auth OK"
```

Without this, `npm install` fails with a 401, and the local build gate in `git-safe-push.sh` cannot run.

---

## Known Issues

### 246 Turbopack Named-Export Mismatches

The project has 246 import sites where a named export is imported but only a default export exists. Webpack silently ignores these; Turbopack treats them as hard errors.

**Current mitigation:** `--webpack` flag on all build/dev commands.

**Permanent fix:** See the "Migrate to Turbopack" ticket. Estimated 3-4 hours of systematic cleanup.

```bash
# To see all errors if you want to work on them:
NODE_OPTIONS='--max-old-space-size=7168' next build --turbopack 2>&1 | \
  grep "Export doesn't exist" | \
  sed "s/.*'\(.*\)' is not exported.*/\1/" | \
  sort -u
```

---

## Incident History

| Date | What Broke | Root Cause | Fix |
|---|---|---|---|
| May 2026 | 10+ Vercel failures | Next.js 16 Turbopack default, `vercel.json` had `next build` without `--webpack` | Added `--webpack` to all 13 build/dev invocations |
| March 2026 | 14 Vercel failures | ThreePillHeader import-never-called bug | Added Check 1 to pre-push-hook.sh |
| March 2026 | 7 Vercel failures | Dead-code cleanup removed needed import | Added Check 8 to pre-push-hook.sh |
| April 2026 | 17 Vercel failures | Automated agent collapsed try/catch blocks | Added Check 9 to pre-push-hook.sh |
