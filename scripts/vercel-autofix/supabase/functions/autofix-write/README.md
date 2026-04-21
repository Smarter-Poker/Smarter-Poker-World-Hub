# autofix-write edge function

Narrow write-only proxy over `autofix_attempts`. Lets cron-01 and GitHub
Actions mutate the table without carrying the full
`SUPABASE_SERVICE_ROLE_KEY`. Each caller (poller, runner, verify job) gets
its own `AUTOFIX_WRITE_TOKEN` that can be rotated independently.

## Why

The service role key currently sits on cron-01 (`.env`) and in every repo's
GH Actions secrets. If any one of those leaks, the attacker gets full
schema-wide DML on the project. This function constrains the blast radius
to a handful of columns on one table.

## Deploy

```bash
# Install the Supabase CLI once
npm i -g supabase

# One-time link (run from repo root)
supabase link --project-ref <ref>

# Deploy
supabase functions deploy autofix-write \
  --project-ref <ref> \
  --no-verify-jwt   # this fn uses its own bearer token, not Supabase JWTs

# Set secrets (service role remains on the server, never in callers)
openssl rand -hex 32 > /tmp/token
supabase secrets set \
  AUTOFIX_WRITE_TOKEN="$(cat /tmp/token)" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  --project-ref <ref>
rm /tmp/token
```

Distribute the token:

```bash
# cron-01 .env
echo "AUTOFIX_WRITE_URL=https://<ref>.supabase.co/functions/v1/autofix-write" \
  | sudo tee -a /opt/vercel-autofix-poller/.env
echo "AUTOFIX_WRITE_TOKEN=$TOKEN" \
  | sudo tee -a /opt/vercel-autofix-poller/.env

# GH Actions (once per repo)
gh secret set AUTOFIX_WRITE_URL --body "https://<ref>.supabase.co/functions/v1/autofix-write"
gh secret set AUTOFIX_WRITE_TOKEN --body "$TOKEN"
```

## Actions

All requests POST `application/json` to the function URL with
`Authorization: Bearer <AUTOFIX_WRITE_TOKEN>`.

| action          | body fields                                                    | purpose                                 |
|-----------------|----------------------------------------------------------------|-----------------------------------------|
| `insert`        | `row: {...}`                                                   | Create a new attempt (poller)           |
| `update`        | `id`, `patch: {...}`                                           | Generic column update                   |
| `mark_pr`       | `id`, `pr_number?`, `pr_url?`, `branch_name?`                  | Runner opened a PR                      |
| `mark_merged`   | `id`, `merged_at?`                                             | Human merged the PR                     |
| `mark_verified` | `id`, `deployment_id?`, `verified_at?`                         | Phase B: post-merge deploy READY        |
| `mark_reverted` | `id`, `reason`, `revert_pr_number?`                            | Phase B: opened revert PR               |

## Security model

- Writable columns are allowlisted server-side (`WRITABLE_COLUMNS`).
- `claude_tokens_in/out` are insert-only — a compromised runner token
  can't retroactively forge spend.
- Tokens never touch client browsers; they live only in systemd EnvironmentFile
  and GH Actions secrets.
- Bearer compare is constant-time to avoid timing oracles.
- The function is deployed with `--no-verify-jwt` — Supabase anon/user JWTs
  are NOT accepted; only the shared bearer.

## Rotating the token

```bash
openssl rand -hex 32 > /tmp/token
supabase secrets set AUTOFIX_WRITE_TOKEN="$(cat /tmp/token)" --project-ref <ref>
# Update callers (cron-01 .env + GH Actions secrets), then:
rm /tmp/token
```

Callers with the old token will get `401 unauthorized` on next call. They
retry on the next tick once the new token is in place.

## Migration path

Phase 1 (current): pollers still use service role key, this function is
deployed but unused.

Phase 2: swap `poll.mjs` / `run.mjs` / `phase-b-verify.mjs` from
`sb.from('autofix_attempts').update(...)` to
`fetch(AUTOFIX_WRITE_URL, { ... })` one call site at a time, gated on
feature flag `AUTOFIX_USE_WRITE_FN=1`.

Phase 3: remove `SUPABASE_SERVICE_ROLE_KEY` from cron-01 and GH Actions
secrets. Autofix loops run with only the narrow write token.
