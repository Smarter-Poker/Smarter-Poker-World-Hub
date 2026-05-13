# Handoff: Deploy smarter-poker-workers (P50)

**Date:** 2026-05-13  
**Priority:** HIGH — stops 192 daily 404 failures in cron_execution_log  
**Authored by:** Claude (Cowork session, P50 phase)

---

## What was done

`src/routes/trivia-quality-tools.ts` was created and pushed to the
`smarter-poker-workers` repo (commit `18c0420447df936d7e25a7f1c3581a900534c451`).

This file exports the four handlers that `src/index.ts` has imported since
Phase 49 but that never existed:
- `triviaEmbedBackfill` → GET/POST `/cron/trivia-embed-backfill`
- `triviaThemeBackfill` → GET/POST `/cron/trivia-theme-backfill`
- `triviaPlayerRetag`   → GET/POST `/cron/trivia-player-retag`
- `triviaRegressionTests` → GET/POST `/cron/trivia-regression-tests`

Their absence caused every request to those routes to return HTTP 404.
The embed and theme backfill crons fire every 2 hours (at :15 and :45),
producing ~192 failed entries/day in `cron_execution_log`.

---

## What you need to do

Run the deploy script from Dan's Mac (requires Keychain + SSH key):

```bash
cd ~/Documents/smarter-poker-workers
bash scripts/deploy-workers.sh --release
```

The `--release` flag:
1. Triggers `release.yml` workflow on GitHub Actions (builds + pushes the
   Docker image to GHCR with `:latest` tag)
2. Waits for the build to complete (~4-8 min)
3. SSHes into the Hetzner VM and runs `docker compose pull && docker compose up -d`
4. Probes `/health` to confirm the new container is live

Expected output ends with:
```
[deploy-workers] ✓ Deploy complete.
```

---

## Verification after deploy

Wait for the next scheduled tick of either cron (embed at :15, theme at :45
on even hours) and then check `cron_execution_log` in Supabase:

```sql
SELECT job_name, status, started_at, result, error
FROM cron_execution_log
WHERE job_name IN (
  '/cron/trivia-embed-backfill',
  '/cron/trivia-theme-backfill',
  '/cron/trivia-player-retag',
  '/cron/trivia-regression-tests'
)
ORDER BY started_at DESC
LIMIT 20;
```

Success = `status = 'success'`, `error IS NULL`.

---

## Prerequisites (should already be in place)

- `~/.ssh/workers_ed25519` — SSH key for Hetzner workers VM
- Keychain entry `smarter-poker / workers-server-ip`
- Keychain entry `smarter-poker / workers-server-id`
- Keychain entry `smarter-poker / github-pat-ghcr-read` (PAT with `read:packages` + `workflow` scopes)

If any of these are missing, the script will exit with a clear error message.

---

## No SQL needed

`trivia_questions.embedding` (vector(384)), `trivia_questions.theme` (text),
`trivia_questions.retagged_difficulty` (text), and `trivia_regression_runs`
all already exist in the production Supabase schema. No migrations required.
