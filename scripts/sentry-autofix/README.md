# Sentry Autofix Runner — Smarter Poker World Hub

This directory contains the **GitHub Action runner** for the Phase 5.2.1
autofix loop. It receives a `repository_dispatch` event from the unified
webhook receiver on engine-01 (see `services/sentry-autofix/` in the
Smarter-Poker-Club-Arena repo for that receiver), fetches the Sentry
issue, asks Claude for a unified diff, applies it, and opens a draft PR
labeled `sentry-autofix-draft`.

Phase 5.2.1 is **dry-run**: every fix results in a draft PR that a human
reviews and merges. Phase 5.2.2 will flip the auto-merge switch for
allowlisted paths (`pages/hub/**`, `components/**`, safe commander docs,
etc. — see `policy.mjs`).

## File Resolution (WH layout)

World Hub is a Next.js 14 Pages Router monolith. Sentry filenames land
with inconsistent prefixes (`webpack-internal:///`, `(app-pages)/`,
relative, absolute). `run.mjs` tries each of:

- `<root>/<path>`
- `<root>/pages/<path>`
- `<root>/lib/<path>`
- `<root>/components/<path>`
- `<root>/src/<path>`, `src/pages/<path>`, `src/components/<path>`, `src/lib/<path>`

The first hit that exists and is under 200 KB is shown to Claude.

## Denylist Highlights

Never-touch files in `policy.mjs`:

- `middleware.ts`, `pages/api/{admin,debug,emergency,auth,webhooks,cron}/**`
- Any path containing `/ledger/`, `/wallet/`, `/rake/`, `/purchase/`,
  `/diamonds/`, `/payouts/`, `/kyc/`, `/mfa/`, `/step-up/`
- The 7 destructive poker routes (game/create, game/delete, game/reset,
  tournament/create, tournament/delete, table/*, buyin)
- `supabase/migrations/**`, `lib/supabaseAdmin*`, `lib/serviceRole*`, `lib/stripe*`
- `vercel.json`, `next.config.*`, `.github/workflows/**`, `.husky/**`
- `package.json`, `package-lock.json`, `.env*`
- `pages/commander/{admin,td}/**`
- Autofix pipeline itself (`services/sentry-autofix/**`, `scripts/sentry-autofix/**`)

## Allowlist (Phase 5.2.2 auto-merge targets)

Currently allowlisted for future auto-merge when confidence=high and all
CI checks pass:

- `pages/{hub,landing,play,training,social,poker-near-me,blog}/**`
- `pages/commander/{docs,reports,displays}/**`
- `components/**`, `styles/**`, `src/{components,hooks,lib,styles}/**`
- `public/{hub/club-arena,images}/**`
- `docs/**`

## Required GH Actions Secrets

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude Opus 4.6 Messages API |
| `SENTRY_AUTH_TOKEN` | Read issue + event detail via Sentry REST |
| `SUPABASE_URL` | Autofix dedup + audit table |
| `SUPABASE_SERVICE_ROLE_KEY` | Write to `autofix_attempts` |
| `AUTOFIX_GITHUB_TOKEN` | (optional) PR creation; falls back to `GITHUB_TOKEN` |

## Local dev

```bash
# Install deps
npm ci

# Run tests
node --test *.test.mjs

# Manual dispatch (from GH UI):
# Actions → Sentry Autofix → Run workflow
#   issue_id: 123456
#   sentry_project: world-hub
#   short_id: WORLD-HUB-42
```

## Architecture

```
Sentry webhook → engine-01 receiver (services/sentry-autofix/)
                       │
                       │ HMAC verify → policy gate → Supabase reserve
                       ▼
                 GitHub repository_dispatch (sentry-autofix event)
                       │
                       ▼
    .github/workflows/sentry-autofix.yml guards on sentry_project == 'world-hub'
                       │
                       ▼
              node run.mjs (this directory)
                       │
                       │ Sentry REST → Claude → git apply → gh pulls
                       ▼
              draft PR with sentry-autofix-draft label
                       │
                       ▼
                Human review + merge
```

See `../../services/sentry-autofix/README.md` in the Club Arena repo for
the receiver side.
