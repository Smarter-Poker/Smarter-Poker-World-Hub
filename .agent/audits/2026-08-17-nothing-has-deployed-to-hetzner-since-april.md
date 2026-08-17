# 2026-08-17 — Root cause: nothing has deployed to Hetzner since April

**This one finding explains the cron triage audit, the 14 never-fired jobs, and
`deploy-error-poll`. They are not three problems. They are one.**

## The finding

Separate deploy paths to Hetzner abort at a prerequisite check for an SSH key
that does not exist. Each fails silently — the script exits non-zero into
nothing, and no one watches the exit code.

| Deploy path | Required key | Status |
|---|---|---|
| `deploy-openclaw.sh` (dispatcher) | `~/.ssh/openclaw_ed25519` | CLAUDE.md §11.4 records it was never created, so it "aborted at its prereq check every run — no deploy had ever succeeded". Fixed 2026-08-16 |
| `deploy-workers.sh` (workers svc) | `~/.ssh/workers_ed25519` | `scripts/deploy-workers.sh:53` — `[ -f "$SSH_KEY" ] \|\| die "SSH key missing at $SSH_KEY (run Phase 2B.1-deploy AG prompt first)"`. **Unverified from a sandbox, but identical in structure and symptom** |
| engine deploy | `HETZNER_SSH_PRIVATE_KEY` (Actions) | separate path; key leaked via a log-masking bypass, see the 2026-08-16 handoff |

## Evidence the workers service is a late-April build

Route add-date versus live behaviour, measured against `cron_execution_log`:

```
2026-04-24  video-library-scraper     7/7   ok
2026-04-25  hard-stop               120/120 ok
2026-04-28  bbj-detect               24/24  ok
─────────────────────── deployed build ends somewhere in here
2026-05-05  trivia-pool-monitor       0/7   404
2026-05-05  trivia-quality-audit      0/7   404
repo HEAD   2026-07-26 (2d3071c)
```

`trivia-pool-monitor.ts` and `trivia-quality-audit.ts` exist, are imported, and
are registered for GET and POST in `src/index.ts`. They 404 because the running
container predates them.

**16 commits have landed on `smarter-poker-workers` main since 2026-04-28.
None is running.**

## What this reframes

`2026-08-17-cron-triage-seven-jobs-never-worked.md` concluded six trivia jobs
were "never implemented anywhere". That was reasoned from World Hub git history
— correctly as far as it went — but World Hub is the wrong repo to ask. With
`smarter-poker-workers` in hand, the real split is:

| Count | Jobs | Cause |
|---|---|---|
| 2 | `trivia-pool-monitor`, `trivia-quality-audit` | written, wired, **undeployed** |
| 1 | `video-library-reels` | genuinely unwritten — not registered in `index.ts` |
| 4 | `trivia-embed-backfill`, `trivia-theme-backfill`, `trivia-regression-tests`, `trivia-player-retag` | **written, wired, undeployed** — see correction below |
| 1 | `deploy-error-poll` | deployed and running; the 500 is real |

The 14 dispatcher jobs that have never fired are the same story with a
different script: `ALL_CRONS` in the repo lists them, the deployed dispatcher
does not.

## `deploy-error-poll`'s 500, specifically

`src/routes/deploy-error-poll.ts` returns 500 from exactly two places:

- line 250 — the Vercel deployments API returned non-OK
- line 671 — the outer fatal catch

Line 225 is the diagnostic lever: a **missing** `VERCEL_TOKEN` returns HTTP 200
with `{action:'skipped'}`. So a 500 means the token is **present and being
rejected** — a Vercel 403 surfacing as a 500 here.

Seven Vercel tokens were deleted during the 2026-08-15 incident response, but
this job's failures predate that by months, so a dead token is at most a second
cause layered on an older one. The response body carries the real status
(`Vercel API error: <code>`); `fire_cron()` logs it to the Open Claw log, but
`cron_execution_log` stores only `HTTP 500` — which is why the reason has never
been visible from the database.

## Fix, in order

1. **Create `~/.ssh/workers_ed25519`**, install the public half on
   `5.161.252.33`, run `scripts/deploy-workers.sh`. Converts
   `trivia-pool-monitor` and `trivia-quality-audit` from 404 to live, and lands
   16 commits of unrelated merged work everyone believes is already running.
2. **Confirm the dispatcher deploy actually ran** after the 2026-08-16
   `deploy-openclaw.sh` fix. 13 jobs still have zero rows in
   `cron_execution_log` for all time, so either it did not run, or it ran
   before those jobs were added.
3. **Read `docker logs smarter-poker-workers`** for the `deploy-error-poll`
   Vercel status code, then reissue `VERCEL_TOKEN` in `/opt/workers/.env`.
4. **Write the 5 missing routes.** `video-library-reels` first — its
   implementation already exists as `scripts/video_library_to_reels.py` (481
   lines) and four sibling `video-library-*` routes exist to model on.
5. **Backfill** once the jobs run: 11,197 trivia embeddings, 11,197 retags,
   8,728 themes.

## Verify with, not instead of

`node scripts/ci/check-cron-liveness.mjs` (added today) reads the dispatcher and
counts real outcomes, so it cannot be satisfied by a green deploy log. A
successful fix moves jobs out of both the FAIL and the WARN lists.

## UPDATE — the dispatcher deploy failure is now pinned exactly

Read from the GitHub Actions UI, run `32036850836` / job `95408953931`,
step **"Trust Hetzner host key"**:

```
openclaw@***: Permission denied (publickey).
Error: Process completed with exit code 255.
```

`deploy-openclaw.yml` connects as `${{ secrets.HETZNER_SSH_USER || 'openclaw' }}`.
The key in `HETZNER_SSH_PRIVATE_KEY` is not authorised for that user on that
host. **All 18 runs of this workflow, #1 through #18, have failed.** The
dispatcher has never once deployed through it.

### The A/B that isolates the variable

`deploy-yt-worker.yml` uses the **same three secrets** — `HETZNER_HOST`,
`HETZNER_SSH_PRIVATE_KEY`, `HETZNER_SSH_USER`:

```
Run 27   completed successfully
Run 38   failed
Run 39   failed
```

It used to work and now does not. Same credentials, same host secret. So the
break is in the shared secret, not in either workflow's logic.

### Most probable cause, and the thing to check first

The 2026-08-16 incident response updated `HETZNER_HOST` and
`HETZNER_SSH_PRIVATE_KEY` to point at the **rebuilt engine box**
(`5.161.252.33`, root login). But `deploy-openclaw.yml` and
`deploy-yt-worker.yml` target a **different machine** — the CX22 that runs Open
Claw and the YT transcode worker, with an `openclaw` user. Repointing the
shared secrets at the engine box therefore broke both.

Check in this order:

1. What does `HETZNER_HOST` currently resolve to — the engine box or the
   Open Claw CX22? If the engine box, that is the bug.
2. Does an `openclaw` user exist on the target, and is the public half of
   `HETZNER_SSH_PRIVATE_KEY` in its `~/.ssh/authorized_keys`?
3. If the two roles genuinely live on one box now, set `HETZNER_SSH_USER` to
   `root`; if they are separate machines, give these workflows their own
   `OPENCLAW_HOST` secret rather than sharing `HETZNER_HOST`.

Sharing one host secret across workflows that target different machines is the
underlying design fault. Splitting it is the durable fix; changing the username
is the fast one.

Note that runs #1–#16 also failed, before the incident — so a longer-standing
cause sits underneath this one. Fixing the secret will surface it rather than
finish the job. Re-run and read the next error rather than assuming.

## UPDATE 2 — almost nothing is unwritten, and a fresh image is now waiting

### 6 of the 7 are pure deploy debt

`src/routes/trivia-quality-tools.ts` exists and implements **all four**
remaining trivia handlers — `triviaEmbedBackfill`, `triviaThemeBackfill`,
`triviaPlayerRetag`, `triviaRegressionTests`. It is imported at `index.ts:39-43`
and registered for GET and POST at `index.ts:220-227`. Added `86a03f8`,
**2026-05-05** — days after the deployed build.

Its own header already recorded the bug it fixed: *"index.ts imported these four
handlers but this file did not exist, causing the workers process to 404 every
request to these routes (~192 failures/day)."* Somebody diagnosed this in May
and fixed it correctly. The fix has never run.

Revised again, and this is the accurate count:

| Count | Jobs | Cause |
|---|---|---|
| 6 | the 4 above + `trivia-pool-monitor` + `trivia-quality-audit` | written, wired, **undeployed** |
| 1 | `video-library-reels` | genuinely unwritten — no route, not registered |
| 1 | `deploy-error-poll` | deployed; real 500 |

So 11,197 trivia questions have no embeddings not because the backfill was never
built, but because a container has not been replaced since April.

### A current image is now published

`release.yml` run **41** completed successfully on 2026-08-17 — the first image
built since **run 40 on 2026-05-05**. `ghcr.io/smarter-poker/smarter-poker-workers:latest`
now points at the 2026-07-26 HEAD instead of a May build.

Note what that means: the *image pipeline* had also been frozen at the same
point. Code merged through July, image built in May, container running from
April — three stages of one pipeline, each stale, each independently invisible.

### There is no deploy webhook — the comment is false

`release.yml:5` claims *"The Hetzner VM then pulls 'latest' via a
webhook-triggered docker compose pull/up."* The workers repo has **zero
webhooks configured** (Settings → Webhooks, verified 2026-08-17). That mechanism
does not exist and, on this evidence, never has. The workflow's own closing
Summary step is the accurate one: *"Next: trigger deploy on Hetzner workers VM —
run `bash scripts/deploy-workers.sh` from Dan's Mac."*

Delete or fix that header comment. It is the third instance in this codebase of
documentation asserting a mechanism that was never built — alongside CODEOWNERS
claiming branch protection that does not exist, and CLAUDE.md §1.6 describing a
self-healing deploy monitor with a 0.4% success rate.

### The one remaining step

```
ssh <workers-vm> 'cd /opt/workers && docker compose pull && docker compose up -d'
```

or `bash scripts/deploy-workers.sh` once `~/.ssh/workers_ed25519` exists. The
image is built and waiting; this is a pull and a restart. It converts six of the
eight failing jobs in one action and starts the embedding backfill that has been
dead since May.

Verify with `node scripts/ci/check-cron-liveness.mjs` — not with the deploy log.

## The pattern worth naming

Every deploy path here fails by aborting early and quietly. `deploy-openclaw.sh`
died at a prereq check for months. `deploy-workers.sh` has the identical shape.
`deploy-error-poll` — the thing meant to notice failed deploys — is itself down,
alongside an expired `GH_PAT` behind `deploy-autofix`. The mechanism and its
monitoring failed together, which is how three months passed without anyone
noticing that shipping had stopped.

A deploy script that exits non-zero into nothing is indistinguishable from one
that never ran. Whatever replaces these should assert the *result* — container
SHA, route reachable, hand count moving — rather than trusting an exit code.

---

## CORRECTION — 2026-08-17, later the same day (verified from the host, not a sandbox)

The core insight of this audit is right and it was the finding of the day: deploy
paths that abort at a prerequisite check for a key that does not exist, failing
silently because nothing watches the exit code. `deploy-openclaw.sh` was fixed on
exactly that basis.

**But the workers-specific conclusion no longer holds.** This audit flagged its
own workers claim as *"unverified from a sandbox"*, and that caution was
warranted. Measured directly on `workers-dispatcher` (178.104.180.220):

| claim | measured |
|---|---|
| `~/.ssh/workers_ed25519` missing | **present** — used repeatedly today to SSH to the box |
| running a late-April build | image **created 2026-08-17T23:17:25**, container started 23:17:26 |
| `trivia-pool-monitor` 404s | **HTTP 200** authenticated |
| `trivia-quality-audit` 404s | route exists — 401 unauthenticated, then a long-running 200 (it exceeded a 20 s curl timeout, which is duration, not absence) |
| 16 commits unshipped | local HEAD and `origin/main` both `e4a3784`, and that build is live |

A trap worth recording: bare `/trivia-pool-monitor` really does 404, because every
job is registered under a **`/cron/` prefix** (`src/index.ts:173+`). Probing
without the prefix reproduces the exact symptom this audit describes and
"confirms" a deployment gap that is not there. I made that mistake first and only
caught it by reading the route table.

So the workers service is current. What remains true, and is the durable lesson:
a prereq check that dies into an unwatched exit code is indistinguishable from a
deploy that succeeded, and this codebase had at least two of them.
