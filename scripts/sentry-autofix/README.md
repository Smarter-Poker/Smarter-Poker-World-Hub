# Sentry Autofix Runner — Smarter-Poker-World-Hub

Phase 5.2.1 mirror of the Club Arena autofix pipeline. When Sentry
fires an issue webhook for the `world-hub` project, the unified
receiver on engine-01 routes a `repository_dispatch` event here. The
GH Action in `.github/workflows/sentry-autofix.yml` checks out WH,
fetches the Sentry issue + latest event, asks Claude for a patch, and
opens a draft PR (`sentry-autofix-draft` label).

## Layout

| File | Purpose |
|---|---|
| `run.mjs` | orchestrator — runs in GH Action |
| `fetch-issue.mjs` | Sentry REST client + stack extraction |
| `claude.mjs` | Anthropic Messages API wrapper |
| `prompt.mjs` | system prompt + user message builder |
| `patch.mjs` | parses `<patch>` XML → applies unified diff via `git apply` |
| `policy.mjs` | WH-specific denylist + allowlist for file paths |
| `pr.mjs` | opens draft PR with labels + Sentry link |
| `mark-errored.mjs` | flips `autofix_attempts.status = 'errored'` on failure |

## WH-specific file resolution

`run.mjs::resolveFiles()` tries these candidates for each Sentry
in-app filename (in order):

1. `<root>/<file>` — verbatim (absolute-looking)
2. `<root>/pages/<file>`
3. `<root>/lib/<file>`
4. `<root>/components/<file>`
5. `<root>/src/<file>`
6. `<root>/src/{pages,components,lib}/<file>`

## WH-specific denylist highlights

- All `pages/api/{admin,debug,emergency,auth,webhooks,cron,crons}/`
- The 7 destructive poker routes middleware protects
- Money substrings: `/ledger/ /wallet/ /rake/ /purchase/ /diamonds/ /payouts/ /kyc/ /mfa/ /step-up/`
- `middleware.ts`, `supabase/migrations/`, `vercel.json`, `next.config.*`
- `lib/supabaseAdmin`, `lib/stripe`, `lib/serviceRole`, `lib/auth/`, `lib/security/`, `lib/rateLimit`
- Manifests + env files
- `.github/workflows/` — autofix cannot rewrite its own workflow
- `services/sentry-autofix/` + `scripts/sentry-autofix/` — no self-modify

## Allowlist (Phase 5.2.2 auto-merge targets)

Hub pages (`pages/hub/`), safe commander subpages (docs/reports/displays),
landing / support / FAQ / blog, `components/`, `styles/`, `docs/`,
`public/hub/club-arena/`, `public/images/`.

## Required GH Actions secrets

| Name | Why |
|---|---|
| `ANTHROPIC_API_KEY` | call Claude |
| `SENTRY_AUTH_TOKEN` | fetch issue + latest event |
| `SUPABASE_URL` | update `autofix_attempts` row |
| `SUPABASE_SERVICE_ROLE_KEY` | (same) |
| `AUTOFIX_GITHUB_TOKEN` | optional — falls back to `GITHUB_TOKEN` |

## Local dev

```bash
cd scripts/sentry-autofix
npm ci
node --test policy.test.mjs patch.test.mjs
```

## Dispatching manually

`gh workflow run sentry-autofix --field issue_id=12345 --field sentry_project=world-hub`
