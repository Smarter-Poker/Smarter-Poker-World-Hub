---
description: MANDATORY end-of-task protocol — push to GitHub, deploy to Vercel, write SQL LAST
---

# Task Completion Protocol — MANDATORY FOR ALL AGENTS

> **ZERO EXCEPTIONS — Every agent MUST follow this protocol at the end of every task.**

## The Three Rules

### Rule 1: ALL Testing on smarter.poker ONLY

- **NEVER** test on `localhost`, `127.0.0.1`, or any local dev server
- **NEVER** test on `*.vercel.app` or any Vercel preview deployment
- **ONLY** test on `https://smarter.poker` (production)
- See `/browser-testing` workflow for full details

### Rule 2: Push ALL Work to GitHub + Vercel

After you are **fully finished building and testing**, you MUST:

1. **Push World Hub to GitHub + Deploy:**
```bash
cd /Users/smarter.poker/Documents/Smarter-Poker-World-Hub
bash scripts/git-safe-push.sh --build-check "your commit message"
```

2. **Verify deployment on production:**
```bash
open https://smarter.poker
```

### Rule 3: Write SQL LAST — After Building and Testing

- **DO NOT** write SQL migrations until you are 100% done with code changes and testing
- SQL migrations are the FINAL step — they go to production immediately and cannot be undone
- Write SQL to `supabase/migrations/` with timestamped filenames
- Execute via the programmatic CLI: `npm run db:push`
- **NEVER** open the Supabase web dashboard to run SQL (Cloudflare Captcha will block you)

## Execution Order (SACRED)

```
1. WRITE CODE         — Make all changes
2. BUILD              — next build (verify it compiles)
3. PUSH TO GITHUB     — bash scripts/git-safe-push.sh --build-check "message"
4. TEST ON PROD       — Verify on https://smarter.poker
5. WRITE SQL (LAST)   — Only after everything else is confirmed working
6. EXECUTE SQL        — npm run db:push
```

## DO NOT End a Session Without

- [ ] All code changes committed and pushed to GitHub
- [ ] Vercel deployment triggered and verified
- [ ] SQL migrations written and executed (if any schema changes)
