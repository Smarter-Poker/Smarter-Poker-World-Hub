# HANDOFF — Ship MLB HR Tracker audit fixes (push + OpenClaw deploy)

**Created:** 2026-06-21
**Why a handoff:** all code/SQL work is done and verified, but the final
**push** (`git-safe-push.sh` runs `next build` + polls Vercel for minutes) and the
**OpenClaw deploy** (`deploy-openclaw.sh` needs the macOS Keychain +
`~/.ssh/openclaw_ed25519`) cannot run inside the Cowork Linux sandbox
(45s/command cap, no macOS `security`, no SSH key). Run these on Dan's Mac.

## What changed (already written to the working tree)
- `pages/api/cron/mlb-hr-cache-refresh.js` — real opponent HR/9 from engine
  `agg_pitcher`, real games-since-HR from the game log, venue-based park factor,
  constant-time auth, fail-loud partial writes, date-pinned ET schedule.
- `pages/api/mlb/hr-tracker.ts` — `stale` flag + freshest `refreshed_at`.
- `pages/hub/MLB-ANALYTICS/hr-tracker.tsx` — empty-state, keyboard a11y, stale
  badge, real-data guards, dynamic season, dead-import cleanup.
- `scripts/openclaw-cron-dispatcher.py` — registered
  `/api/cron/mlb-hr-cache-refresh` daily 11:00 UTC.

## Step 1 — Push code (deploys the app + cron handler to Vercel)
```bash
bash ~/Documents/Smarter-Poker-World-Hub/scripts/git-safe-push.sh "fix(mlb): HR tracker deep audit — real pitcher HR/9 + games-since-HR, venue park factor, register refresh cron, empty/stale states, a11y, fail-loud writes"
```
Wait for `DEPLOY_VERIFIED:true` + `SHA_MATCHED:true`.

> NOTE: the working tree also has 4 pre-existing unrelated modifications
> (`pages/hub/venues/[id].js`, `src/components/profile-edit/CardDeckPreferenceSection.js`,
> `src/world/components/Jarvis/JarvisMessengerWidget.tsx`, the standings audit `.md`,
> `tsconfig.tsbuildinfo`). `git-safe-push.sh` commits the whole tree. Confirm those
> are intended before running, or commit them separately first.

## Step 2 — Deploy the cron schedule to Hetzner OpenClaw
```bash
bash ~/Documents/Smarter-Poker-World-Hub/scripts/deploy-openclaw.sh
```
Confirm the log shows `mlb-hr-cache-refresh` registered and the service active.

## Step 3 — (Optional) Populate fresh data immediately, then verify
```bash
# Replace $CRON_SECRET with the real value (it's in .env.local / Vercel env)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://smarter.poker/api/cron/mlb-hr-cache-refresh | jq

# Expect ok:true with pitcher_hr9_loaded > 0, then check the cache is fresh
# and pitcher HR/9 is no longer a single constant:
```
```sql
select count(*) rows, max(refreshed_at) last_refresh,
       count(distinct opp_pitcher_hr9) distinct_hr9
from mlb_hr_cache;   -- distinct_hr9 should be > 1 after the run
```
Then load `https://smarter.poker/hub/MLB-ANALYTICS/hr-tracker` and confirm the
"Stale" badge is gone and pitcher HR/9 values vary per matchup.

## Verification already completed (no rework needed)
- `node --check` (cron) + TS `transpileModule` (api + page) → syntax clean.
- 8 Immutable Rules grep → clean. DB schema/PK/indexes/RLS → healthy, no migration.
- Dispatcher entry routes via `fire_cron` (authenticated HTTP GET) — verified.
