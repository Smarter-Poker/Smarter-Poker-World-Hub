# Task #160 — Vercel Autofix Close-Out Handoff

**Status:** code complete; awaits push + cron-01 deploy + real-ERROR observation.
**Owner after this handoff:** Dan (SSH + git push access).

## What's already done on prod

| Piece                                  | Where                                                                                | State        |
|----------------------------------------|--------------------------------------------------------------------------------------|--------------|
| SQL migration (cols + budget + config) | Supabase `kuklfnapbkmacvwxktbh` → migration `20260420_vercel_autofix_columns`        | LIVE         |
| Phase B test + Makefile fixes          | origin/main commit `edd5475ef`                                                       | LIVE         |
| Poll.mjs + phase-b-verify.mjs tests    | `node --test poll.test.mjs phase-b-verify.test.mjs` → 15/15                          | GREEN        |
| `autofix_projects.hub-vanguard`        | dry_run=false, enabled=true                                                          | LIVE         |
| `autofix_projects.club-arena`          | dry_run=true (canary), enabled=true                                                  | LIVE         |

## Remaining steps (human-only)

1. **Push the local commit** — `e6963bd10 feat(vercel-autofix): wire club-arena into Phase A+B pipeline`.
   The commit is on local `main` but the local git PAT returns `401 Bad credentials` (task #117).
   After rotating the PAT:  
   `cd ~/Documents/Smarter-Poker-World-Hub && git push origin main`

2. **Deploy to cron-01.**
   ```
   ssh cron-01
   cd /opt/vercel-autofix-poller
   make deploy         # rsync poll.mjs + phase-b-verify.mjs + strategies/, npm ci, restart timers
   make deploy-units   # install + enable vercel-autofix-{poll,verify}.service + .timer
   ```
   Then confirm both timers are active:
   ```
   make status
   make logs N=200           # poll service
   make logs-verify N=200    # verify service
   ```

3. **Bake the canary.** Let `club-arena` sit in `dry_run=true` for ~24h and watch
   `autofix_attempts` for rows with `source='vercel'`, `project_name='club-arena'`,
   and `error_message='dry_run_mode'`. Once you've seen at least one legitimate
   build failure classified correctly without a false positive, flip the flag:
   ```
   update autofix_projects set dry_run = false, updated_at = now()
    where id = 'prj_oaCq8RYhExLRUYizLG93li0uX468';
   ```

4. **Observe a real close-out.** Task #160 cannot be marked done until the pipeline
   takes a real Vercel `ERROR` deploy (either hub-vanguard or club-arena after the
   canary flips) all the way through:  
   `ERROR deploy detected → PR opened → PR merged → Phase B deploy verified green`.
   Watch the Grafana dashboard + `make last N=20` for the first full-cycle row.

## club-commander-desktop

Not wired in. Commander still lives inside the World Hub monolith under
`pages/commander/*` and deploys with hub-vanguard. When/if it's spun out into
its own Vercel project, add a new entry to both `PROJECTS` arrays AND insert a
matching `autofix_projects` canary row.

## Kill-switches

- **Global pause (both loops):** `make pause REASON="..."` from
  `scripts/vercel-autofix/` (needs SUPABASE_URL + SERVICE_ROLE_KEY).
- **Per-project pause:** `update autofix_projects set enabled = false where id = 'prj_...'`.
- **Force dry-run globally via env:** `DRY_RUN=1` on the systemd unit.
