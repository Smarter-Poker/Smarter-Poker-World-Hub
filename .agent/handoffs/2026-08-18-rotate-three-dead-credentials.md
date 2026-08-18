# Handoff — rotate three dead credentials

**Created:** 2026-08-18
**Why a handoff:** all three require minting credentials from accounts an agent
has no path to obtain (CLAUDE.md RULE 0 exception: *"Provide credentials the
agent has no path to obtain"*). Everything else in this area has already been
fixed in-session; these three are the only remaining blockers.

Each item below is independently verifiable — the "prove it" command tells you
whether it is still broken before and after.

---

## 1. `VERCEL_TOKEN` — deploy self-healing is dead (highest impact)

**Symptom:** `/cron/deploy-error-poll` runs every 2 minutes and has failed
**720 out of 720 times in the last 24 hours** with HTTP 500.

**Root cause:** the token exists in the workers container but is revoked.

    docker exec smarter-poker-workers printenv VERCEL_TOKEN   # present
    -> Vercel API responds:
       403 {"error":{"code":"forbidden","message":"Not authorized","invalidToken":true}}

**Impact:** CLAUDE.md §1.6 makes this route the deploy self-healing system —
it polls Vercel for failed builds and drives `/api/deploy-autofix`. With a dead
token, **failed production builds are not being auto-fixed at all**, and have
not been for as long as the token has been invalid.

**Prove it is still broken:**

    ssh -i ~/.ssh/workers_ed25519 root@178.104.180.220 \
      'S=$(docker exec smarter-poker-workers printenv CRON_SECRET); \
       curl -s -X POST -H "Authorization: Bearer $S" \
       http://127.0.0.1:8081/cron/deploy-error-poll'
    # broken -> {"error":"Vercel API error: 403", ... "invalidToken":true}

**Fix:** mint a new Vercel API token (Vercel dashboard → Settings → Tokens,
scoped to the `smarter-poker` team), then set it on the workers VM:

    ssh -i ~/.ssh/workers_ed25519 root@178.104.180.220
    #   edit VERCEL_TOKEN=... in /opt/workers/.env
    cd /opt/workers && docker compose up -d

**Verify fixed:** re-run the prove-it command — expect `action: "..."` rather
than a 403, and `/cron/deploy-error-poll` failures stop appearing in
`cron_execution_log`:

    select count(*) filter (where status not in ('completed','success')) as bad
    from cron_execution_log
    where job_name='/cron/deploy-error-poll' and started_at > now()-interval '1 hour';
    -- currently 30/hour, should become 0

Note the Vercel CLI's own token is also dead (`~/Library/Application
Support/com.vercel.cli/auth.json` → 403), so `vercel env pull` and
`vercel whoami` will fail until you `vercel login` again.

---

## 2. GHCR read token — workers cannot deploy the normal way

**Symptom:** `scripts/deploy-workers.sh` aborts at its pre-flight:

    [deploy-workers] ERROR: tag :v1.0.3 not found in GHCR — run with --release to build it

That message is misleading: the tag exists. The **check** cannot authenticate.

**Root cause — two separate dead credentials:**

    security find-generic-password -a smarter-poker -s github-pat-ghcr-read -w
    -> the stored PAT returns 401 {"message":"Bad credentials"}

    on the VM: docker pull ghcr.io/smarter-poker/smarter-poker-workers:latest
    -> Error response from daemon: error from registry: denied

**Consequence (already observed):** because the container could not be
redeployed, `main` drifted ahead of the running image and **every cron route
added since then returned 404 on schedule** — `trivia-theme-backfill`,
`trivia-embed-backfill`, `trivia-regression-tests`, `trivia-player-retag`,
`trivia-pool-monitor`, `trivia-quality-audit`, `video-library-reels`.

**Already worked around, not fixed:** deploys in this session used the
documented GHCR-free path, which builds HEAD's tree on the VM:

    bash scripts/deploy-workers.sh --build-on-server

That path works today and brought the container to HEAD (all seven routes above
verified returning 200 afterwards). The registry path stays broken until the
credentials are replaced.

**Fix:**
1. New GitHub PAT with `read:packages`, stored in the keychain under the name
   the script already reads:

       security add-generic-password -U -a smarter-poker -s github-pat-ghcr-read -w '<NEW_PAT>'

2. Re-login docker on the VM:

       ssh -i ~/.ssh/workers_ed25519 root@178.104.180.220
       echo '<NEW_PAT>' | docker login ghcr.io -u <github-username> --password-stdin

**Verify fixed:**

    bash scripts/deploy-workers.sh --tag v1.0.3     # should pass the pre-flight

---

## 3. Solver M2 — service-role key never updated after the rotation

**Symptom:** M2 has not reported since **2026-08-16 00:38** (`solver_status`).
M1 is healthy and reporting continuously.

**Note this is NOT why v2 stalled.** The v2 re-solve pass stopped
**2026-08-15 09:57**, about fifteen hours *before* M2 went quiet, and it is
stopped on **both** machines. Restarting M2 adds capacity; it does not by
itself restart v2. See Appendix H of
`.agent/audits/2026-08-16-three-cleanup-items-and-a-deploy-blocker.md`.

**Fix:** on the LAN solver box running Python 3.14.x, set
`SUPABASE_SERVICE_ROLE_KEY` to the current `sb_secret_...` value and restart the
solver process. Then restart the **v2 backfill** on both machines — 6,518,462
spots (77.5%) still have no `strategy_matrix_v2`, and the backlog grows as M1
keeps producing new v1 spots.

**Verify fixed — no guessing required, the watchdog answers it:**

    select last_status, error_message, metadata->>'v2_remaining'
    from cron_health_log where cron_name='solver-watchdog';

It runs hourly at :20 and flips from `error` to `success` on its own once both
machines report and v2 solves resume.

---

## Pattern worth fixing separately

Three credentials died and **nothing detected any of them**. Each was found
only by reading production data during this session. `deploy-error-poll` was
failing 720 times a day into a table nobody reads. Task #26's secret-consumer
drift detector is the right home for an automated check that every stored
credential still authenticates — currently it does not cover Vercel or GHCR.
