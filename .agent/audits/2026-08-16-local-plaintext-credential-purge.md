# Local Plaintext Credential Purge Audit

**Date:** 2026-08-16
**Scope:** Dan's Mac Local Environment
**Auditor:** Antigravity Agent

## 1. File → Key → Consumer Map

Before redaction, the following `ghp_` prefixed GitHub PATs were present in plaintext across these files. We mapped them against the codebase to determine consumers.

| File | Key Name | Consumer |
|---|---|---|
| `~/Documents/.env` | `CLAUDE_NEW_TOKEN` | *unused* |
| `~/Documents/Smarter-Poker-World-Hub/.env.local` | `NPM_TOKEN` | *unused* |
| `~/Documents/Smarter-Poker-World-Hub/.env.local.prepatch-205235` | `AUTOFIX_GITHUB_TOKEN`<br>`GH_PAT`<br>`NPM_TOKEN` | *unused*<br>`pages/api/deploy-autofix.js`, `deploy-monitor.js`<br>*unused* |
| `~/Documents/Smarter-Poker-World-Hub/.env.production.local` | `AUTOFIX_GITHUB_TOKEN`<br>`GH_PAT`<br>`NPM_TOKEN` | *unused*<br>`pages/api/deploy-autofix.js`, `deploy-monitor.js`<br>*unused* |
| `~/Documents/Smarter-Poker-World-Hub/.env.vercel` | `NPM_TOKEN` | *unused* |
| `~/Documents/Smarter-Poker-World-Hub/.env.vercel.local` | `NPM_TOKEN` | *unused* |
| `~/Documents/Smarter-Poker-World-Hub/.env.vercel.prod` | `AUTOFIX_GITHUB_TOKEN`<br>`GH_PAT`<br>`NPM_TOKEN` | *unused*<br>`pages/api/deploy-autofix.js`, `deploy-monitor.js`<br>*unused* |
| `~/Documents/Smarter-Poker-World-Hub/.env.vercel.prod.local` | `AUTOFIX_GITHUB_TOKEN`<br>`GH_PAT`<br>`NPM_TOKEN` | *unused*<br>`pages/api/deploy-autofix.js`, `deploy-monitor.js`<br>*unused* |
| `~/Documents/Smarter-Poker-World-Hub/.env.vercel.prod.new` | `NPM_TOKEN` | *unused* |
| `~/Documents/Smarter-Poker-World-Hub/.env.vercel.test.json` | `AUTOFIX_GITHUB_TOKEN`<br>`GH_PAT`<br>`NPM_TOKEN` | *unused*<br>`pages/api/deploy-autofix.js`, `deploy-monitor.js`<br>*unused* |

*Note: `GH_TOKEN` was found to be consumed by `Smarter-Poker-Club-Arena/scripts/sentry-autofix/pr.mjs`, but it did not exist in any local plaintext `.env` files.*

## 2. Redaction & Deletion (T2)

1. **Redacted:** Replaced all `gh[pousr]_[A-Za-z0-9]+` occurrences with `<ROTATED-2026-08-16>` in the aforementioned files so key names survive.
2. **Deleted:** `~/.env.local.bak.before-auth-smarter` and `~/.env.local.bak.20260816T093322` were completely deleted since they were stale copies.

## 3. Credential Store Retirement (T3)

The global `credential.helper` config was successfully unset, and the `~/.git-credentials` file was deleted. The system now fully relies on the macOS keychain.

## 4. Verification (T4)

The credential changes did not break the active keychain sessions or repository access:
```
$ gh auth status
  ✓ Logged in to github.com account Smarter-Poker (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: ghp_************************************

$ git -C ~/Documents/Smarter-Poker-World-Hub ls-remote origin main
b7043b3bd720f7690fe46ec74f309c4f3e112e96	refs/heads/main

$ git -C ~/Documents/Smarter-Poker-Club-Arena ls-remote origin main
83139ed10cd1d360d5ad0749328a83becd2b8b5f	refs/heads/main

$ curl -s -o /dev/null -w '%{http_code}\n' https://engine.smarter.poker/health
200
```

## 5. Sweep for Other Secret Classes (T5)

During the credential sweep, several other critical tokens were found in plaintext in `.env.local`, `.env.vercel.test.json`, and related environment files. Crucially, **`CRON_SECRET`** and others are likely still unrotated since the original engine compromise. These are exposed locally in plaintext:

- `ANTHROPIC_API_KEY`
- `CRON_SECRET`
- `MLB_SUPABASE_SERVICE_KEY`
- `MLB_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `SENTRY_AUTH_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VERCEL_OIDC_TOKEN`
- `VERCEL_TOKEN`
- `VITE_SUPABASE_URL`
