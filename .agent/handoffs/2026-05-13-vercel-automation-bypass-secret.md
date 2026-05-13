# RULE 0 Handoff: Provision VERCEL_AUTOMATION_BYPASS_SECRET

**Created:** 2026-05-13  
**Priority:** HIGH — preview-signup-gate.yml workflow will pass curl/Playwright steps but fail silently on 401 until this secret is set  
**Blocking:** Preview deploy gate for all PRs with Vercel deployment protection enabled

---

## What was done (already shipped, commit 2dbf1471)

- `.github/workflows/preview-signup-gate.yml` — updated both steps to read `VERCEL_AUTOMATION_BYPASS_SECRET` from GitHub secrets and pass it as `x-vercel-protection-bypass` header on curl health probe and Playwright test runner
- `playwright.preview.config.ts` — added `extraHTTPHeaders` block so every Playwright page navigation carries the bypass header

## What still needs to be done (requires dashboard access)

The secret value itself must be provisioned in two places:

### Step 1: Generate the secret in Vercel (2 min)

1. Go to: https://vercel.com/smarter-poker/hub-vanguard/settings
2. Click **Deployment Protection** in the left sidebar
3. Find the section **"Protection Bypass for Automation"**
4. Click **"Generate Secret"** (or copy an existing one if already present)
5. **Copy the secret value** — you will not see it again

### Step 2: Add the secret to GitHub repo (2 min)

1. Go to: https://github.com/smarter-poker/Smarter-Poker-World-Hub/settings/secrets/actions
2. Click **"New repository secret"**
3. Name: `VERCEL_AUTOMATION_BYPASS_SECRET`
4. Value: (paste the secret from Step 1)
5. Click **"Add secret"**

### Step 3: Verify (1 min)

Trigger a new preview deploy (push any minor change to a PR branch, or re-run the workflow manually from the Actions tab on a recent preview deploy). The gate workflow should now:
- Pass the curl health probe without 401/403
- Allow Playwright to navigate to `/auth/signup` on the preview URL

---

## Why this exists

Vercel's deployment protection blocks unauthenticated requests to preview URLs. The `preview-signup-gate.yml` workflow was failing to hit `/api/health/signup` and `/auth/signup` on protected preview URLs. The bypass secret is Vercel's official mechanism for CI/CD tools to access protected deployments.

See: https://vercel.com/docs/security/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation

---

## If the Vercel project has no deployment protection enabled

If preview URLs are already publicly accessible (deployment protection is off), this secret is not needed and the workflow will work without it — the header is silently ignored when protection is disabled. Confirm by checking Vercel → Project Settings → Deployment Protection.
