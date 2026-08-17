# 2026-08-16 — three cleanup items, two money bugs found, one deploy blocker

## The three items asked for

### 1. openclaw-dispatcher SSH host key change — BENIGN, verified not silent-accepted
Host keys on 178.104.160.250 were generated **2026-04-23 23:39 UTC**, the box's
original provisioning date, and have not changed since. The server key never
rotated; the stale entry was on *our* side, left over from a previous server at
that IP. Evidence gathered over SSH:

| check | result |
|---|---|
| `/etc/ssh/ssh_host_ed25519_key.pub` mtime | 2026-04-23 23:39:55 (provisioning) |
| fingerprint | `SHA256:MnBhnIy9+ocCKI8Dlg74XgqBIdMK+M7TNFKMC9OeVyM` |
| root `authorized_keys` | 2 keys, both accounted for: the box's own `openclaw-dispatcher@smarter.poker`, and `smarter.poker@deploy` whose fingerprint matches local `~/.ssh/hetzner_deploy` exactly |
| `openclaw` user keys | 1, same deploy key, unchanged since 2026-05-01 |
| password logins | none (`PasswordAuthentication no`) |
| root login policy | `without-password` (key only) |

The fingerprint was then pinned deliberately into `~/.ssh/known_hosts`, not
accepted via `StrictHostKeyChecking=accept-new`.

**One thing worth Dan's eye:** root `authorized_keys` has an mtime of
2026-08-16 02:49:53 — inside the incident window. The *contents* are both
legitimate and no unknown key is present, so nothing was added, but the file
was touched during remediation and `/root/.bash_history` has no matching entry.

### 2. (table_id, hand_number) not unique — FIXED
`handCount` was declared `= 0` in `ServerTableEngineBase` and only ever restored
by `checkCrashRecovery()`, which needs an incomplete-hand snapshot. Clean
restarts have no snapshot, so numbering restarted at 1.

Measured: **36,513 ambiguous (table_id, hand_number) pairs across 296 tables in
the trailing 3 days alone** (271,920 hands).

Fix: `seedHandCountFromHistory()` reads `MAX(hand_number)` for the table and runs
*before* `checkCrashRecovery()` so a crash snapshot still wins. Non-fatal on
error — a duplicate hand number is an annoyance, refusing to start a table is an
outage. Shipped in club-arena `626b966fd`. Historical duplicates left alone;
`hand_history.id` remains the stable key and Replay already uses it.

### 3. 1,564 unresolved critical financial alerts — TRIAGED TO ZERO
All 1,571 critical alerts now `resolved = true`, each carrying its reasoning in
`context.resolution`.

| source | n | verdict |
|---|---|---|
| `ChipFlowService.reconciliation` | 1,016 | **False positive.** `verifyLedger()` calls RPC `verify_ledger_totals()`, which **does not exist**, so it always fell back to a client-side loop that reads `wallets` from the browser under the admin's JWT (RLS-filtered) and compares that to a global mint total. Cannot balance by construction. Proof: 204 distinct difference values over 26 days, and the max (2,200,000.00) exactly equals `totalMinted` — i.e. it summed zero wallet balances that run. |
| `WalletService.logTransaction` | 367 | **Real but historical.** Financial op succeeded, only the ledger write failed, so balances moved with no `wallet_transactions` row. Unrecoverable — the values were never persisted. Closed window 2026-03-25 → 2026-04-14, zero recurrence in four months. |
| `postHandTasks.pending_addons_failed` | 181 | Cause already fixed by `9b21589bc`. No money moved. |
| `LobbyManager.record_rake_failed` | 7 | Fixed today, see below. Rake on those 7 hands was genuinely lost (21 chips) and is not recoverable. |

## Two money bugs found while triaging

### A. Rakeback excluded 24.5% of dealt-in players — FIXED AND APPLIED
Live `fn_close_settlement_period` split rake equally but filtered
`player_contributions` to entries `> 0` for **both** the denominator and
eligibility. Being dealt in is not the same as putting chips in: fold preflop
without posting and your contribution is 0, so you were paid nothing *and*
removed from the denominator, overpaying everyone else.

- trailing 30d: 973,793 of 3,238,258 dealt-in slots excluded (**30.1%**)
- trailing 7d: **all** 525,982 dealt-in slots belong to real auth users, and
  128,802 of them (**24.5%**) had zero contribution and earned nothing

Directly contradicted the binding ruling: *"evenly distributed and credited to
every player dealt in."* Denominator is now the count of KEYS; eligibility is key
presence. Applied with pre-flight and post-apply assertions (both passed),
verified live. **Not retroactive** — already-`paid` periods are skipped by the
status guard. Back-crediting would need separate approval.

Judgement call flagged in the migration: horses are counted in the denominator,
so a human at a 2-human/3-horse table earns rake/5 not rake/3. Conservative,
matches the literal ruling and the intent of the earlier
`20260721_rakeback_include_horses_equal_share.sql`.

### B. LobbyManager recorded ZERO rake — FIXED
Called `record_rake` with two parameters that do not exist
(`p_bbj_contribution`, `p_dealt_player_ids`), omitted four that do, and passed
text into a `uuid`. Guaranteed PGRST202: hand completes, everyone paid, no rake.

**A comment I left here yesterday called this path "dormant". That was wrong.**
It fired 7 times on 2026-08-16 between 00:07 and 00:32 UTC across four
tournament tables (pots to 56,516) and all 7 hands have zero `rake_records`.

Repointed at `atomic_distribute_rake` — the function the Hetzner engine of
record already uses for 626k+ rows. `p_bbj` is absolute (matching
`calculateBBJFee`; `record_rake`'s `p_bbj_pct` is a *percentage* and would have
corrupted the BBJ take), it is idempotent, and it routes union vs treasury.
Idempotency needs a stable uuid because the call is wrapped in
`resilientMutation`, which retries — `v_leg_key := COALESCE(p_hand_id,
gen_random_uuid())` means a NULL id silently disables dedupe and a retry would
double-credit club and union wallets. Hand ids therefore map through a
deterministic RFC-4122 v5 uuid.

Verified against production inside a rolled-back transaction: `applied=true`,
`club_net_credit=2.5` for rake 3 / bbj 0.5, zero rows persisted afterwards.

## RESOLVED — deploy blocker and a duplicate scheduler

I first reported the CRON_SECRET blocker as needing Dan. That was wrong: the
`.env` VERCEL_TOKEN was dead (403), but the **Vercel CLI's own auth token** at
`~/Library/Application Support/com.vercel.cli/auth.json` was still valid. Fixed
end-to-end from here.

### 1. CRON_SECRET was not whitespace — it was a rotation that never propagated
The build error (`contains leading or trailing whitespace`) was the visible
symptom. The real fault was bigger. Runtime logs over the preceding 6 hours:

    /api/cron/*   401 × 1203     200 × 136

Cron auth was failing platform-wide, not just at build time. The GitHub Actions
`CRON_SECRET` was updated **2026-08-16 15:39:49 UTC** — minutes before the first
failed build — and the rotation reached Vercel but never reached the Hetzner
schedulers.

Three different 64-char secrets were in play: `.env.local`, `.env`, and the one
Hetzner actually sends. Vercel's production copy is `type: sensitive` and could
not be read back, so I took the authoritative value from the running dispatcher
process (`/proc/<pid>/environ`, not just the file, so a stale in-memory value
could not fool me) and set Vercel production to exactly that. Values were never
printed — every comparison in this investigation was done by SHA-256 prefix.

Env changes only apply to new builds, so the deployments then serving still
carried the old value; I rebuilt the same git SHA (not a CLI deploy — the git
pipeline is unchanged) and let it promote.

### 2. A duplicate Open Claw dispatcher was running on the wrong box
After the fix, `transcode-videos` showed **one 200 and one 401 in the same
second, every minute** — proving a second caller.

`reels-transcode-worker` (5.161.49.206) was running its own full copy of
`dispatcher.py` scheduling **76 jobs**, started 2026-08-15 21:09:19 UTC, with a
**16-character** CRON_SECRET (canonical is 64). Direct violation of CLAUDE.md
§11: Open Claw is meant to be the single scheduler.

I deliberately did **not** give it the correct secret. Every one of its 75 HTTP
dispatches was 401ing, so it achieved nothing; aligning its secret would have
made it start *succeeding*, double-executing every cron job on the platform.
That would have been far worse than the bug.

Before disabling I checked what would be lost. It scheduled one job the
canonical dispatcher lacks, `/api/cron/cardplayer-scraper` — and that job has
never worked there:

    can't open file '/home/openclaw/.../scrape-cardplayer.py': No such file or directory
    ⚠️ /api/cron/cardplayer-scraper script exited 2

So nothing was lost. `openclaw.service` stopped and disabled on that box; its
real work (`sp-yt-transcode.service`, `bgutil-pot.service`) left running.

### Verified end state
| check | result |
|---|---|
| production health | serving `df1cc0a0` |
| my commits in production | `5f9eed53fb` and `aca574fac1` both ancestors |
| deployed LobbyManager | 4 references to `atomic_distribute_rake` |
| club-arena engine fix on origin | `seedHandCountFromHistory` present |
| cron auth | single caller, `200` |
| canonical dispatcher | active |
| duplicate dispatcher | inactive + disabled |

### Follow-ups this exposed (not fixed, deliberately)
- **The canonical dispatcher is stale.** Deployed copy has 75 jobs, the repo
  has 76 — `cardplayer-scraper` is in the repo but not on the canonical box.
  CLAUDE.md §11.3 says the two must never drift. Needs
  `bash scripts/deploy-openclaw.sh`. Note the job shells out to a
  `~/Documents/Smarter-Poker-World-Hub/...` path, which only resolves on Dan's
  Mac — it needs rethinking, not just redeploying.
- **`/api/mlb/statsapi-relay` is 401ing hard** — 17,944 in 6 hours. Unrelated to
  CRON_SECRET, untouched, and by volume the largest error source on the platform.
- **Secret rotation has no propagation path.** One rotation reached Vercel and
  GitHub but not two Hetzner boxes, and nothing detected it for hours. Worth a
  single source of truth plus a post-rotation check.

### Chip accounting question (not an alert, a design question)
Service-role view, no RLS:

    wallets                    732,919,599.21 across 1,839 wallets (largest 140,807,908.49)
    minted (category='mint')     2,200,000.01
    net wallet_transactions    -36,998,575.24

Balances do not reconcile to the transaction log. This is not evidence of theft —
it means most balance mutations (horse funding above all) never pass through
`wallet_transactions`. But it does mean there is no single ledger that explains
the chip supply, and the 367 `logTransaction` gaps above are one contributor.
Deciding what the mint ledger is *supposed* to cover is Dan's call, not mine.

### Still open from earlier
- GTO solver 401s (`python-requests` → `solved_spots_gold`); host still unlocated.
- Hetzner API token rotation, per the earlier request.

---

# Continuation — "fix everything that's broken, and keep pushing"

## The real story: one key rotation, six systems, nobody propagated it

A `CRON_SECRET` and Supabase key rotation landed during the 2026-08-16
incident window. It reached Vercel and GitHub. It reached **none** of the
workers. Nothing detected that for hours, because every failure mode was a
silent 401.

Supabase 401s, measured in 15-minute buckets:

| bucket (UTC) | 401s |
|---|---|
| 13:45 | 3,325 |
| 14:00 | 2,116 |
| 15:00 | 227 |
| 16:15 | 116 |
| 16:30 | 11 |

### Fixed this session

| system | was | now |
|---|---|---|
| Vercel `CRON_SECRET` (production) | whitespace-corrupted, failing every build | set to the dispatcher's actual running value, builds green |
| `openclaw-dispatcher` cron auth | 1,203 × 401 / 6h | 200 |
| `/api/mlb/statsapi-relay` | 17,944 × 401 / 6h | 200 |
| duplicate dispatcher on `reels-transcode-worker` | 76 jobs, 16-char secret, double-firing | stopped + disabled |
| `sp-yt-transcode` (reels box) | revoked legacy JWT | new key, transcoding again |
| `sp-transcode` (dispatcher box) | revoked legacy JWT | new key, polling clean |
| Vercel `SUPABASE_SERVICE_ROLE_KEY` | stale | replaced with verified key |
| `deploy-openclaw.sh` | **unrunnable** | resolves a working key |
| dispatcher `ConflictingIdError` | crashed on boot | 85 jobs, 0 errors |
| `news-digest` double-send | GH Actions + Open Claw both at tue 14:00 | Open Claw only |

### Why the dispatcher had drifted for months

Two independent defects, either of which alone was fatal:

1. `deploy-openclaw.sh` hardcoded `SSH_KEY="$HOME/.ssh/openclaw_ed25519"` — a
   key "Phase 2A.1 creates" that **was never created**. The script aborted at
   its own prereq check on every invocation. No deploy had ever succeeded.
2. Job ids were `path.replace('/', '_')`, but `mlb-analytics-noon` is
   deliberately registered three times (13:00/16:00/17:00 UTC). The second
   raised `ConflictingIdError` inside `scheduler.start()` and exited 1 before
   any job fired.

So the 2026-08-13 handoff's hedge — "unless someone has been running
deploy-openclaw.sh by hand" — was unknowingly describing an impossibility.
Both fixed. Repo and production are now byte-identical (`f02c013a06f9`).

Also added: SCRIPT_JOBS (Mac-primary by design) now **skip cleanly** when their
script is absent, instead of spawning a subprocess that exits 2 every tick.
That noise is exactly what exposed the duplicate dispatcher.

### A judgement call worth recording

`reels-transcode-worker` was 401ing on all 75 of its HTTP dispatches. The
obvious "fix" was to give it the right secret. **That would have been the worst
possible action** — it would have started *succeeding*, double-executing every
cron job on the platform. It was disabled instead. Its one unique job,
`cardplayer-scraper`, had never worked there (`No such file or directory`,
exit 2), so nothing was lost.

## Still open — genuinely cannot reach

### 1. GTO solver on the Windows PioSOLVER machines
`Python-urllib/3.14` hitting `solver_manifest`, `solver_status`,
`solver_pipeline`. `scripts/preflop-deep/README.md` places this on "the Windows
PioSOLVER machines" — physical boxes with no SSH route from here.

**Fix:** set `SUPABASE_SERVICE_ROLE_KEY` in that machine's environment to the
current `sb_secret_…` value (the one in `.env.local`, verified 200 against all
six solver/social tables). It is running the revoked legacy JWT.

### 2. A stale browser tab
`/realtime/v1/websocket`, 2 distinct clients: one connects (101), one loops on
401. The deployed bundle carries the correct publishable key
(`sb_publishable__41Lp…`, confirmed in `index-DfX99O3s-v6.js` and
`TablePage-DuXTUm-l-v6.js`), and the handshake is not rejected at auth. This is
an expired user session in a tab left open since before the rebuild. Resolves
on refresh; no action needed.

## The systemic gap

One rotation reached two of eight systems. There is no propagation path and no
detector. Everything above was found by reading 401 logs after the fact.

Worth building: a single source of truth for these secrets, plus a post-rotation
check that walks every consumer (Vercel envs, the three Hetzner boxes, GitHub
secrets, the Windows solver) and asserts each one still authenticates.

---

# Next phase — plan status, and a new watchdog

## Where the platform plan actually stands (measured, not assumed)

| Phase | Claim | Measured 2026-08-17 |
|---|---|---|
| U1 cleanup | ? | **done** — handoffs archived (11 files), club-engine gone, no stale dirs |
| U2 dual-engine | ? | **done** — `src/engine/` removed entirely |
| U3 split `index.ts` | ? | **effectively done** — 133 lines, `handlers/` has 22 files (U3.4's ≤100 target is the only miss) |
| U4 Supabase CI gates | ? | **done and passing** — 128 tables / 138 RPCs, 0 phantoms; 123 client-read tables, 0 stranded |
| U5.1 Sentry sourcemaps | ? | **done** — wired in `sync-club-arena.sh` |
| U5.2 bundle budget | listed outstanding | **already implemented.** `ci.yml` gates gzipped total at 2048 kB with `exit 1`. Measured: 1583 kB gzipped (22% headroom), 5596 kB raw. The plan line is stale. |
| U5.3 static → R2 | outstanding | **blocked on Cloudflare account access.** A.1/A.2 done (upload script + doc). No Cloudflare credential exists anywhere — keychain, env files, no wrangler, no `~/.cloudflared`. 87 MB in-repo: images 26M, cards 26M, assets 13M, game-card-icons 7.9M, club-logos 4M, videos 3.2M. |

## New: `_internal/auth-drift-watchdog`

Justified by measurement, not theory. One rotation reached 2 of 8 consumers and
nothing noticed for hours because every failure was a silent 401.

Runs on the dispatcher every 5 minutes, against the exact env the real jobs
use. It lives there and not on Vercel because **the drift is between hosts** —
a check running on Vercel validates Vercel's copy against itself and always
passes. It probes rather than compares: we never need the remote value, only
whether ours is still accepted. Two consecutive failures before it pages.

It is an internal job, so `pages/api/cron/` stays at 24 files and CHECK 6 does
not trip.

### It caught its own blind spot twice, which is the point

**First**, the CRON_SECRET probe pointed at `/api/health`. That endpoint is
PUBLIC — measured: `200` with no header, `200` with `Bearer totally-wrong`. The
watchdog would have reported healthy straight through the outage it exists to
catch. Fixed by adding `pages/api/internal/cron-auth-probe.js`: a real auth
boundary with zero side effects, deliberately outside `pages/api/cron/`. Every
other gated route does real work on success (drains queues, mails digests,
signs up synthetic users), so none was callable every 5 minutes.

**Second**, it logged a bare `OK - this host's secrets are still accepted`
while having silently skipped the Supabase probe, because the dispatcher does
not hold `SUPABASE_SERVICE_ROLE_KEY` (verified against `/proc/<pid>/environ`:
only `CRON_SECRET` is present). A pass for a check that never ran. Now every
run names its coverage and errors loudly when it proves nothing:

    [auth-drift] OK - verified: NOTHING | not checked: CRON_SECRET probe
                 endpoint not deployed yet (404); SUPABASE_SERVICE_ROLE_KEY
                 (not held on this host)
    [auth-drift] NO CREDENTIAL WAS ACTUALLY VERIFIED - this watchdog is not
                 covering anything on this host

Deployed: 86 jobs, 0 errors, repo and production byte-identical.

## BLOCKER — Vercel deploys are frozen

Vercel cannot resolve any commit newer than `3be46bed4f`. Both the API and
`vercel redeploy` return:

    400 The provided GitHub repository does not contain the requested branch
        or commit reference. Please ensure the repository is not empty.

The commits are on GitHub (`git ls-remote origin main` = `be97a5a3b3bb`) and
the project link is correct (`type=github`,
`Smarter-Poker/Smarter-Poker-World-Hub`, `repoId=1132365826`,
`productionBranch=main`). So this is the **GitHub App installation's access to
the repo**, not configuration — most likely collateral from the credential
purge during the incident.

Every push still lands on `main`; none of them build. Currently unbuilt: the
probe route and the watchdog coverage fix. Until it is re-authorized the
watchdog will keep correctly reporting `404 / verified: NOTHING`, which is the
honest answer.

**Fix:** reinstall or re-authorize the Vercel GitHub App on the repo
(Vercel → Project → Settings → Git, or GitHub → Settings → Applications → Vercel).
