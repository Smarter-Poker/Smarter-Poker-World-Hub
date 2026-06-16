---
description: MANDATORY end-of-task protocol — push to GitHub, deploy to Vercel, write SQL LAST
---

# Task Completion Protocol — MANDATORY FOR ALL AGENTS

> **ZERO EXCEPTIONS — Every agent MUST follow this protocol at the end of every task.**

## The Three Rules

### Rule 1: Production ONLY for Backend, Localhost for UI

- **BACKEND/API/DB:** **ONLY** test on `https://smarter.poker` (production).
- **UI/CSS/LAYOUT:** Agents **MAY** and **SHOULD** use `http://localhost:3000` to rapidly iterate visually via the dev server.
- **NEVER** test on `*.vercel.app` or any Vercel preview deployment.
- See `/browser-testing` workflow for full details.

### Rule 2: Push ALL Work to GitHub + Vercel

After you are **fully finished building and testing**, you MUST:

1. **Push World Hub to GitHub + Deploy:**
```bash
cd /Users/smarter.poker/Documents/Smarter-Poker-World-Hub
bash scripts/git-safe-push.sh --build-check "your commit message"
```

2. **Verify deployment on production (MANDATORY — NOT OPTIONAL):**
```bash
# Confirm local and remote SHA match
git log --oneline -1
git log --oneline origin/main -1

# Wait for Vercel to build and verify health
node scripts/verify-deploy.js --wait 60
```

3. **If verification fails — FIX IT BEFORE ENDING YOUR SESSION:**
   - Check build logs for errors
   - Fix the code
   - Push again with `--build-check`
   - Verify again
   - **DO NOT STOP until `DEPLOY_VERIFIED:true`**

> [!CAUTION]
> **CLAIMING SUCCESS WITHOUT VERIFICATION IS FORBIDDEN.** On 4/14/2026, unresolved merge conflicts in 4 files blocked ALL deployments because agents pushed without verifying. Every push MUST be verified to be healthy on production.

> [!WARNING]
> **Vercel Subfolder Ignore Trap:** If you are working in a repository where the Vercel Root Directory is set to a subfolder (e.g., `web/` for frontend, `engine/` for backend), Vercel will silently **IGNORE** any GitHub pushes that only contain backend files. If you only modify backend code, you **MUST** make a dummy commit to the frontend directory (e.g., `echo "<!-- trigger $(date) -->" >> web/README.md`) to force Vercel to auto-deploy, or run `npx vercel --prod` locally.

### Rule 3: Write SQL LAST — After Building and Testing

- **DO NOT** write SQL migrations until you are 100% done with code changes and testing
- SQL migrations are the FINAL step — they go to production immediately and cannot be undone
- Write SQL to `supabase/migrations/` with timestamped filenames
- Execute via the programmatic CLI: `npm run db:push`
- **NEVER** open the Supabase web dashboard to run SQL (Cloudflare Captcha will block you)

## Execution Order (SACRED)

You must follow the appropriate track based on the nature of your changes:

### Track A: Full Stack / Backend / DB (The Standard Path)
```text
1. WRITE CODE         — Make all changes
2. BUILD              — next build (verify it compiles)
3. PUSH TO GITHUB     — bash scripts/git-safe-push.sh --build-check "message"
4. VERIFY PUSH        — git log --oneline -1 && git log --oneline origin/main -1
5. VERIFY DEPLOY      — node scripts/verify-deploy.js --wait 60 (FREEZE AND WAIT)
6. FIX IF BROKEN      — If DEPLOY_VERIFIED:false, fix and repeat steps 2-5
7. TEST ON PROD       — Verify on https://smarter.poker
8. WRITE SQL (LAST)   — Only after everything else is confirmed working
9. EXECUTE SQL        — npm run db:push
```

### Track B: UI / Layout / Component Updates (`/gsd-fast` Path)
```text
1. WRITE CODE         — Make all changes
2. TEST ON LOCALHOST  — Rapidly verify visuals on http://localhost:3000 
3. PUSH TO GITHUB     — bash scripts/git-safe-push.sh "message" (Async push)
4. SKIP ARTIFACTS     — DO NOT generate `walkthrough.md` or `implementation_plan.md` artifacts.
5. MOVE ON            — No need to freeze agent workflow waiting for Vercel deploy script!
```

## DO NOT End a Session Without

- [ ] All code changes committed and pushed to GitHub
- [ ] `git log` confirms local SHA matches `origin/main` SHA (Track A ONLY)
- [ ] `verify-deploy.js` returns `DEPLOY_VERIFIED:true` (Track A ONLY)
- [ ] If SHA mismatch, waited for Vercel build and re-verified (Track A ONLY)
- [ ] SQL migrations written and executed (if any schema changes)

## HARD LAW: File Count Safety

Before committing bulk file additions (images, assets, data files):
```bash
git ls-files | wc -l  # Must stay under 12,000
```
If approaching 12,000, alert the user and move assets to Supabase Storage instead.
Vercel hard-fails at ~15,000 files. See `/deploy` workflow for full details.
