---
description: How to push code to Git safely with pre-push checks
---

# Git Push Workflow

## Push code to GitHub

// turbo
```bash
npm run push -- "your commit message here"
```

This runs `git-safe-push.sh v4.1` which automatically:
1. Checks for `.env` files in staging
2. Stages and commits all changes
3. Pulls with rebase to avoid merge conflicts
4. Runs the Pre-Push Safety Gate (5 checks)
5. Pushes to origin/main
6. Logs the deployment to `deploy-log.js`

## Full deploy (SQL + Git + Vercel)

```bash
npm run deploy -- "your commit message here"
```

## View deploy history

// turbo
```bash
npm run deploy:log
```

## Verify production deployment

// turbo
```bash
npm run verify
```
