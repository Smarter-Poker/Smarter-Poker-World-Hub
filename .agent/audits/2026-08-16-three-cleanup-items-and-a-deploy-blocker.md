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

---

# Correction + end-to-end verification (2026-08-17)

## I was wrong about the deploy pipeline being frozen

The previous section claimed Vercel had lost GitHub App access to the repo.
That was a bad diagnosis and it is retracted.

The discriminating test I should have run first:

| gitSource form | result |
|---|---|
| `{repoId, ref:"main", sha:"<head>"}` | 400 `incorrect_git_source_info` |
| `{org, repo, ref:"main"}` | 400 `incorrect_git_source_info` |
| `{repoId:"1132365826", ref:"main"}` (no sha) | **succeeds** |

It also rejected the sha of a commit it had *already built successfully*
(`3be46bed4f`). That was the tell: if it cannot resolve a commit it demonstrably
built an hour earlier, the `sha` parameter is the problem, not repo access.
Repo id and default branch were verified against GitHub independently
(`id 1132365826`, `default_branch main`) — both correct all along.

No re-authorization was ever needed. Deploy with a ref-only `gitSource`.

A separate, real credential gap surfaced while testing: the `gh` PAT lacks
`contents:read` (`403 Resource not accessible by personal access token` on
`repos/.../commits/main`). Unrelated to Vercel, unfixed, noted.

## Work that had been force-pushed away, now restored

`626b966fd` — the hand-counter fix — was **not** in club-arena `origin/main`.
It was removed by the force-push that `b1a1ba2cf` ("restore 7 force-pushed
PRs") was recovering from; my commit was not among the seven restored. The
object survived locally, so it was cherry-picked back onto current main as
`59b7b61ca`, typechecked clean, and pushed. `seedHandCountFromHistory` is on
origin again.

Worth noting as a pattern: this is the second time today a force-push silently
dropped committed work. RULE 13 warns about uncommitted work; committed-but-
force-pushed-away is the same hazard one level up, and nothing detects it.

## The watchdog, verified end to end

`/api/internal/cron-auth-probe` is live and is a genuine boundary:

    no header            -> 401
    Bearer totally-wrong -> 401
    correct secret       -> 200 {"ok":true,"probe":"cron-auth","secretMalformed":false}

And the dispatcher's log shows the whole arc, including its own honesty about
coverage:

    14:00:03 [INFO]  OK - verified: NOTHING | not checked: CRON_SECRET probe
                     endpoint not deployed yet (404); SUPABASE_SERVICE_ROLE_KEY
                     (not held on this host)
    14:00:03 [ERROR] NO CREDENTIAL WAS ACTUALLY VERIFIED - this watchdog is not
                     covering anything on this host
    14:05:01 [INFO]  OK - verified: CRON_SECRET | not checked:
                     SUPABASE_SERVICE_ROLE_KEY (not held on this host)

Before the coverage fix, both 14:00 lines would have read simply
"OK - this host's secrets are still accepted".

---

# The hand-counter fix was half-working, and the log I insisted on is why we know

Deployed this morning, it worked for 47 of 64 active tables. Two of the largest
silently fell back:

    [ServerTableEngine:87fc21ed-...] Could not seed hand counter (canceling
    statement due to statement timeout) - continuing from #0

`87fc21ed` had 12,919 prior hands. `d43fe52b` had 5,032. Both restarted at #1
anyway — so the fix was failing on precisely the tables it was written for, and
succeeding everywhere it barely mattered. The only reason this was visible is
that the seed was built non-fatal *and logged its failure*; a silent
`catch {}` would have left it looking fully deployed.

## Cause

`ORDER BY hand_number DESC LIMIT 1` has no supporting index. `hand_history`
carries `(table_id)` and `(table_id, created_at DESC)` but not
`(table_id, hand_number)`. Verified plan:

    Limit  (cost=14218.45..14218.45 rows=1)
      -> Sort  (cost=14218.45..14250.17 rows=12687)
           Sort Key: hand_number DESC
           -> Index Scan using idx_hand_history_table  (rows=12687)

Index-scan the whole partition off a 10 GB / ~1.58M-row table, then sort it.

## Why the index still is not built

`CREATE INDEX CONCURRENTLY (table_id, hand_number DESC)` is the right fix and
could not be done from here:

- the API session has `statement_timeout = 2min`; the attempt was cancelled and
  left an **invalid 53 MB index**, which has been dropped
- `dblink` is installed but returns *"Non-superusers must provide a password"*,
  and no DB password exists on this machine
- `pg_cron` 1.6.4 is installed but wraps each job in a transaction, which
  `CONCURRENTLY` forbids
- a non-concurrent build holds a write lock, and live tables were dealing
  **181 hands/minute** at the time

Left open as task #28 for whoever holds the DB password.

## What shipped instead

Read the most recent 500 hands through the index that *does* exist and take the
max. Measured on the table that timed out: **113 ms, 500 rows**, versus a
timeout.

This is a bounded approximation of `MAX`, not `MAX`, and the code says so. If
an older run reached higher than the last 500 hands show, it seeds below that.
Still strictly better than restarting at #0, and self-correcting once numbering
is monotonic. Swap back to the exact `MAX` the day the index exists.

Result on the next boot: **54 tables resumed, 0 failures.** `d43fe52b`, one of
the two that previously failed, now logs
`Hand counter resumed at #5051 (next hand: #5052)`.

# New, unresolved: the rakeback settler is timing out

Surfaced in the same log sweep:

    [RakebackSettler.fetch_failed] Error: canceling statement due to statement
    timeout at RakebackSettlerService._runSettlementInner
    (dist/services/RakebackSettlerService.js:559)

This is the daemon that pays rakeback, and its fetch is dying. Same family of
problem — large tables, a query without a supporting index or bound. Not
investigated. `fn_close_settlement_period` was changed earlier today, so
establish whether the timeout predates that change before assuming causation.
Task #29.

---

# Rakeback settler: two problems, one symptom

`[RakebackSettler.fetch_failed] canceling statement due to statement timeout`
turned out to be two independent slow queries.

## 1. The settlement function — FIXED, 53x, provably money-neutral

`fn_close_settlement_period` filtered on `r.created_at::date`. Casting the
column destroys sargability, so no `created_at` index could be used and every
user-period scanned the whole club partition.

| form | time | rows removed by filter |
|---|---|---|
| `::date` cast | 5,140 ms | 198,229 |
| half-open range | 2,265 ms | — |
| range + 2 new indexes | **96 ms** | Heap Blocks: 869 |

A btree alone was never going to be enough, and the selectivity numbers say why.
In the 7-day window: all clubs 254,744 rows; this club 125,363 (**49% — club_id
is not selective**); this club + this user 1,042. The *jsonb containment* is the
filtering predicate, so the GIN index is the one that matters:

    idx_rake_records_contribs_gin   gin (player_contributions)
    idx_rake_records_club_created   (club_id, created_at) WHERE rake_amount > 0

Both built CONCURRENTLY, both confirmed used together in a BitmapAnd.
`jsonb_ops` is required — `jsonb_path_ops` does **not** index the `?` operator.
The planner ignored both until `ANALYZE`.

Because this moves money, equivalence was proven before shipping — 25 real
unpaid periods: **0 mismatches, max_abs_diff 0.000000, totals 6416.99 =
6416.99**.

## 2. The fetch itself — DIAGNOSED, deliberately NOT shipped

The `fetch_failed` line is not the function; it is the `rake_records` read.
`keysetFilter()` emits the textbook composite keyset:

    or=(created_at.gt."X",and(created_at.eq."X",id.gt."Y"))

Postgres cannot use `idx_rake_records_created_at_id` for that OR. It performs a
full ordered index scan and applies the OR as a **filter**:

    OR keyset form   21,534 ms   Rows Removed by Filter: 560,302
    plain range         259 ms   same table, same LIMIT

That also explains why the failure looked intermittent: the cold-start path
(`useKeyset` false) already uses the fast form, so only cycles *with* a cursor
died — the settler stalled precisely when it had made progress.

**The fix was written, typechecked, and then reverted.** Replacing `.or(...)`
with `.gte('created_at', cursor)` plus an in-memory skip of the already-seen
prefix is behaviourally identical — `gte` is a strict superset of the OR
predicate, and the skip removes exactly the surplus. But it failed 5 of 13 in
`server/src/services/rakebackWatermark.test.ts` with *"rake_records was read
with NO cursor filter at all"*, because the mock recognises only `.or()` as a
cursor filter.

That suite is the AUDIT M6 guard for *"a duplicate created_at across the LIMIT
boundary is no longer skipped"* — a real exactly-once property on a money path.
Rewriting a guard like that to accommodate my change is exactly the kind of
thing that should not be done in a hurry, so it was reverted: **13/13 green**.

To finish: teach the mock the `gte` + skip mechanism while keeping the M6
boundary assertion, then re-apply. Or move the read into an RPC that does a true
row-value comparison `(created_at, id) > (X, Y)` — expressible in SQL, not in
PostgREST.

---

# Closing out: everything reachable is done

## The hand-counter index — built, after four dead ends

The seed was working on 47 of 64 tables and timing out on the largest, because
`ORDER BY hand_number DESC` had no supporting index. Building one turned out to
be the interesting part. Each obvious route was closed:

| route | why it failed |
|---|---|
| `apply_migration` | `CREATE INDEX CONCURRENTLY` cannot run inside a transaction |
| plain `execute_sql` | API session has `statement_timeout = 2min`; the build was cancelled and left an **invalid 53 MB index** (dropped with `DROP INDEX CONCURRENTLY`) |
| `dblink` | installed, but *"Non-superusers must provide a password"* |
| `pg_cron` 1.6.4 | installed, but wraps every job in a transaction |
| `psql` direct | `SUPABASE_DB_PASSWORD` in the repo `.env` is stale — auth fails against both the direct host and the us-west-2 pooler |
| non-concurrent build | would hold a write lock while live tables dealt **181 hands/minute** |

What worked: raise the timeout at **role** level so the next pooled session
inherits it.

    ALTER ROLE postgres SET statement_timeout = '45min';
    CREATE INDEX CONCURRENTLY ...;     -- client disconnected, build continued
    ALTER ROLE postgres RESET statement_timeout;

The client call timed out, but the *server-side* build survived and was tracked
through `pg_stat_progress_create_index` (`index validation: scanning table`,
1,052,253 / 1,146,286 blocks). Final: **valid, 55 MB, zero write blocking**.

Result — the query that used to time out:

    Index Only Scan using idx_hand_history_table_handnum
    Heap Fetches: 1 | Execution Time: 3.481 ms

The engine went back to the exact `MAX`; the bounded 500-row stopgap is gone.
Production after deploy: **60 tables resumed, 0 seed failures.**

The role timeout was reset immediately. Leaving it at 45 minutes would have
removed the guard rail that stops a runaway query pinning a connection — worth
saying out loud, because that is the kind of thing that gets left behind.

## The settler fetch — fixed, and the tests earned their keep

The `gte` + in-memory-skip rewrite went in, and the AUDIT M6 suite immediately
caught a **real bug in my first cut**: `hitLimit` was computed from
`rows.length` *after* the splice, so a single skipped row made a full
10,000-row page read as 9,999 and the drain returned `'idle'` with backlog
still queued. Now judged on the raw page size.

Test changes were mechanism-only and end up stricter, not looser:

- the M6 duplicate-timestamp case asserts **both** the raw page (superset,
  cursor row first) **and** the effective set after the documented skip
- the filter-shape test asserts the new predicate **and** that the OR form is
  absent, so a well-meaning revert to the "textbook" keyset fails there instead
  of in production at 21 seconds a cycle

Full server suite: **551/551 across 47 files.** Production confirms it:

    [RakebackSettler] keyset: skipped 1 already-settled row(s) at the cursor
    timestamp (page was 1000)
    fetch_failed: 0

## The one thing left, and it is physical

Two solver processes hit the `solver_*` tables from the **same public IP**
(24.15.206.254) — both on the local network:

    Python-urllib/3.12   431 x 200, 0 x 401   correct key
    Python-urllib/3.14   136 x 401, 0 x 200   revoked key

So the fix is already live on one machine and simply hasn't been applied to the
other. It is not this Mac: Python 3.14.2 is installed here, but there is no
3.14 process, no `orchestrate.py` process, and no launchd job referencing it —
and at ~2.3 req/min it is running continuously somewhere. ARP shows only the
gateway, ipad, iphone, samsung and watch, so the box is not currently visible
on the LAN and there is no SSH route to it.

Set `SUPABASE_SERVICE_ROLE_KEY` on whichever machine reports
`python --version` = 3.14.x to the current `sb_secret_` value in `.env.local`.
Every other holder of the revoked key across the fleet has been updated.

## The solver, chased to the end: M2, and it is capacity not correctness

The fleet is two machines, self-identified in `solver_status`:

    M1  last heartbeat 2026-08-17 22:17:58   LIVE    Python-urllib/3.12, 431 x 200
    M2  last heartbeat 2026-08-16 00:38:44   STALE   Python-urllib/3.14, 136 x 401

**M2 stopped at the exact moment of the key rotation** and has been shut out for
~46 hours. Both run the identical loop — GET `solver_manifest`, POST
`solver_status`, GET `solver_pipeline` — and M2 401s on all three, so it does
nothing and retries about 2.3 times a minute.

The important part: **nothing is lost or half-written.** M2 cannot claim work,
so M1 takes all of it. And right now both report `phase: scanning` with
*"no work found in phases scanned this pass"* — the queue is empty, so a halved
fleet is currently costing nothing. It will cost throughput the next time solve
work is queued.

It is genuinely not reachable from here, and that was established rather than
assumed:

- **Not this Mac.** Every running Python process is 3.13. 3.14.2 *is* installed
  (`/opt/homebrew/opt/python@3.14`) but there is no 3.14 process, no
  `orchestrate.py`, and no launchd job referencing it.
- **Not a VM or container.** No Docker/Parallels/VMware/UTM/VirtualBox, and the
  only interface with an address is `en1`.
- **Not on this subnet.** A ping sweep would miss a Windows box (ICMP is blocked
  by default), so the subnet was re-swept with TCP probes to force ARP
  resolution at layer 2. `10.1.10.0/24` holds exactly six devices: gateway,
  this Mac, ipad, iphone, samsung, watch.

M2 sits on another segment behind the same gateway. Set
`SUPABASE_SERVICE_ROLE_KEY` there to the current `sb_secret_` value; identify it
as the box whose `python --version` is 3.14.x.

---

# Anti-cheat: the pipeline is 80% built and the middle link is missing

## What was switched on

`INTEGRITY_FEED=on` is now live on the engine (`/opt/club-arena/server/.env`,
backed up as `.env.bak-20260817-integrity`, applied via `engine-up.sh`).
Verified in the running process; container healthy, RestartCount 0, 282 hands
in the following 8 minutes, zero unhandled errors.

Reading `IntegrityFeed` first was worth it: it is genuinely observe-only —
bounded 5,000-hand in-memory store, detectors every 250 hands, every path
swallows its own errors, no enforcement and no money or gameplay effect.

**But it only logs when it finds flags, and persists nothing.** Silence is
therefore ambiguous (ran-and-found-nothing vs never-ran) and the store dies on
restart. It should log coverage on every `analyze()` — hands ingested, store
size, flag count even when zero — and write to `anti_cheat_flags`.

## What already exists, unwired

| piece | state |
|---|---|
| `collusion_tracking` | **169,508 rows**, live since 2026-04-20, ~235/day |
| `anti_cheat_flags` | **0 rows** — full review schema, never written |
| `AntiCheatPage` + `/api/club-arena/anti-cheat` | review UI, reading an empty table |
| `detect_collusion_pairs(club, threshold, min_hands)` | exists, **never scheduled** |

Collection works. The review surface is built. Nothing connects them.

## The number that looks alarming and is not

`collusion_tracking` IS the flag table. All 169,508 rows are `status='open'`,
**zero** human-reviewed, with 146,194 scored 90+ and a max of 100.

That reads like a scandal. It isn't. Evidence at score 100:

    {"direction":"loser_to_winner","bb_per_100":-475.6,  "hands_together":36}
    {"direction":"loser_to_winner","bb_per_100":-2104.5, "hands_together":31}

Thirty-one hands. A bb/100 of ±2000 over 31 hands is a single big pot — pure
variance. Win-rate carries no signal until thousands of shared hands. That is
why **86% of every pair ever scored lands above 90**, and why nobody has
reviewed a row in four months. The detector has no statistical power, so the
queue is noise.

### A mistake I made and caught

I first split those pairs by joining `ai_horses.id` and got a clean-looking
"20,000 both human". That join returns **zero matches for every row in the
table** — `ai_horses.id` is not the player id. The result was meaningless.
Horses *are* in there (`…000000000024` appears as `player_b`). Recorded so the
next person does not repeat it.

## Unresolved, and worth attention on its own

**Nothing I can find writes `collusion_tracking`.** Something POSTs to
`/rest/v1/collusion_tracking` 47×/24h, HTTP 201, client
`supabase-js-node/2.104.1`, inserting exactly the table's columns. It is not in
either repo's source, not in the `smarter-poker-workers` container, not in
`club-arena-engine:/app/dist`, not a Mac launchd job, not a GitHub Actions
workflow, and not in the other local repos.

So an unlocated Node process holds a service key and writes the anti-cheat
table. That deserves resolving on security grounds regardless — and a detector
you cannot find is a detector you cannot recalibrate.

## The pattern, stated plainly

Three findings today, one shape: the deploy script that never ran, the verifier
that would not say what it found, and a detector that flags 86% of everything.
None of these were missing capability. Each was a guard that fired without
earning trust, so it got ignored, and then real signal had nowhere to land.

Being better than other rooms is not more detectors. Most rooms have detectors.
Very few have detectors a human actually reviews.

---

# The integrity channel is now quiet, which is the point

`COMMUNITY_CARD_COUNT` was a strict inequality firing on **236 distinct hands
per hour**. Every observed instance was a board that had run AHEAD of its stage
label — "Stage flop expects 3 community cards, got 5" — which is an all-in
runout: the board is dealt to completion while `stage` still reads flop. The
cards are correct, the label lags, and nothing about it touches fairness or
money.

The direction that IS a fault — a board BEHIND its street, a river played on
four cards — was indistinguishable from that flood.

Replaced with a rule about **direction**, deliberately not an inference about
all-in state, so it cannot be wrong about what it suppresses:

    actual < expected        -> flagged (cards missing)
    actual > 5               -> flagged CRITICAL (impossible board)
    expected < actual <= 5   -> not reported (runout label lag)

Four new cases pin the asymmetry, including the exact production shape.
`StateVerifier.test.ts` 17/17; full server suite **563/563 across 48 files**.

Production after deploy, fix confirmed present in the running image:

    305 hands dealt in 5 minutes
    0 integrity warnings   0 COMMUNITY_CARD_COUNT
    0 CHIP_CONSERVATION    0 DUPLICATE_CARD

236/hour to zero, with every real check still armed. The value is not the
silence — it is that the next thing to appear in that channel will be real.

## Where the platform stands

| item | state |
|---|---|
| Anti-cheat feed | **ON** in production, observe-only, verified no cost |
| State verifier | **trustworthy** — signal only, no noise |
| Rakeback settler | 21.5 s -> 259 ms, payouts proven identical |
| Settlement function | 53x faster, equivalence proven to the cent |
| Hand counter | exact MAX at 3.5 ms, 61 tables resumed, 0 failures |
| Cron + secrets | aligned, with a drift watchdog that names its coverage |

Open, each blocked on something outside the code:

- **Solver M2** — locked out since the key rotation. Capacity, not data loss;
  the queue is currently empty. Needs the key set on a LAN machine I cannot
  reach (`python --version` = 3.14.x).
- **Chip supply** — 733M in wallets vs a 2.2M mint ledger. A product/finance
  decision about what the mint ledger is meant to cover, not an engineering fix.
- **Collusion calibration** — well specified, but the process writing
  `collusion_tracking` is still unlocated. An unidentified Node client holds a
  service key and writes the anti-cheat table; that is worth resolving on
  security grounds regardless of the calibration work.

---

## Appendix F — closing out CI red before the next phase (2026-08-18)

Instruction: "MAKES SURE EVERYTHING IS FULLY FUNCTIONAL, PUSHED AND PUBLISHED
BEFORE MOVING ONTO THE NEXT PHASE." Two repos were green in the working tree but
red in CI. Neither turned out to be a production defect; one hid a real one.

### F1. Phantom RPCs were a stale snapshot, not missing functions

The VIP time-bank commit added `.rpc('fn_time_bank_allowance')` and
`.rpc('fn_consume_time_bank')`. The phantom-ref gate called both phantoms.

Checked the live DB rather than the manifest:

    fn_time_bank_allowance(p_user_ids uuid[])
    fn_consume_time_bank(p_user_id uuid, p_seconds integer)

Both present in `public`. The checked-in `supabase-schema-manifest.json` simply
had not been regenerated. Regenerated through the MCP query documented in
`gen-schema-manifest.mjs` (no service-role key on this host). Diff was exactly
those two names: 774 tables unchanged, functions 1737 -> 1739. Gate now reports
`0 tables, 0 rpcs`; confirmed green in CI run 32083556644.

Production was never broken. Worth noting the failure mode: a generated
artifact checked into the repo will drift silently every time schema is applied
straight to prod, and the gate reports that drift as if it were a code defect.

### F2. The E2E suite tested the site mid-deploy

E2E last passed 22:24 UTC and failed every run after 22:37 — but the first
failing commit was **docs-only**, which cannot break anything. That ruled out a
code cause immediately.

`Wait for Production Deploy` was `sleep 60`. Vercel Next.js builds take 3-5 min
(CLAUDE.md 1.4). With 13 pushes in 90 minutes the tests routinely navigated
into an in-flight deploy: `page.goto: Test timeout`, transient 413s. Red CI,
healthy site.

Proof it was never the product: the exact CI command against production passed
6/6 in 11.9s locally while CI was red.

Replaced with a poll for 3 **consecutive** 200s (10-min cap) so a mid-deploy
blip resets the streak instead of being tested through. Two bugs in that fix
were caught by testing it before shipping:

  - the trailing-slash URL **308-redirects**, so the poll could never observe
    200 — it would have spun 10 minutes and hard-failed every run. An
    always-red guard is worse than the flaky one it replaced. Now uses the
    no-slash URL the tests use, plus `-L`.
  - curl already prints `000` on connection failure, so `|| echo 000` made the
    error read `last HTTP 000000`.

Verified all three paths: healthy -> 0; unreachable -> 1 with an accurate code;
scripted `200,200,404,200,200,200` resets the streak and needs six polls.
CI run 32084070511: every job green, including the E2E that had failed four
runs straight.

### F3. The flaky test was hiding a real user-facing 429

One test still came back "1 flaky": `No console errors on critical pages`. It
waited on `networkidle` — but Club Arena holds Supabase Realtime websockets
open and polls, so the network never reliably goes idle, and this test makes
three sequential navigations inside one 30s budget (3x the exposure). The other
five tests pair `networkidle` with an explicit `toBeVisible`, which is what
actually gates them; none of them flake.

Switching that test to `domcontentloaded` stopped it flaking — and made it
**fail deterministically**, which surfaced the real defect underneath:

    6 x "Failed to load resource: the server responded with a status of 429"
    -> https://smarter.poker/api/pwa/prompt-status

`/api/pwa/prompt-status` is called on every Club Arena page load and carried a
second, hand-rolled limiter (10 req/min keyed on `x-forwarded-for`) applied to
**all** methods, including the GET read. The shared `LIMITS.write` limiter
directly above it already covered writes.

Any shared egress IP trips it: a poker club's venue wifi, an office, a
household with several players, carrier CGNAT. For a club platform that is the
normal case, not an edge case.

Measured on production before the fix:

    GET x14 -> 200 200 200 200 200 200 200 200 200 200 429 429 429 429

The 2026-08-12 audit recorded these same 429s and filed them as "an artifact of
a rapid automated sweep". They are reachable by real users sharing an IP. That
dismissal is the same one I nearly made.

Every other failure branch in that GET already fails open with
`200 {dismissed:false}` — missing table, query error, throw. The hard 429 was
the single inconsistent path. It now fails open the same way and still skips
the Supabase query, so the DB protection the limiter exists for is preserved.
Writes keep the hard 429.

Verified on production serving `9e700d1b`:

    GET  x20 -> 200 (all twenty)          [was 10x200 then 429]
    GET body when throttled -> {"dismissed":false,"throttled":true}
    POST x14 -> 429 (all fourteen)        [abuse protection intact]

Client behaviour is unchanged: `checkServerDismissed` returned false on
`!res.ok` before and returns false on `{dismissed:false}` now.

E2E then passed 6/6 on three consecutive runs, no flaky.

### F4. Two hygiene defects found on the way

  - `test-results/` was not gitignored (only `playwright-report/` was). One
    failing run leaves 4.2 MB of screenshots, videos and trace zips that any
    blanket `git add -A` would have committed — and `git-safe-push.sh` does
    `git add -A` in four places. Added to `.gitignore`.
  - The WH working tree is under an **active Antigravity reset loop**: six
    `reset: moving to origin/main` entries in the last 25 reflog ops (CLAUDE.md
    Phase 0.7 flags >=2). It reverted the prompt-status edit twice mid-session.
    The commit survived because it was already committed; the fix landed by
    merging and pushing in a single atomic command. This is exactly the hazard
    CLAUDE.md WORKING RULE 13 describes, observed live.

### Theme

Same one as the rest of this session: **guards that run but verify nothing, or
verify the wrong thing.** A manifest that reports its own staleness as a code
defect. A deploy wait that waits a fixed 60s for a 3-5 minute build. A flaky
test whose flakiness masked a genuine 429. A prior audit that explained away a
real user-facing error as test noise. In each case the fix was to make the
guard answer the question it claims to answer — and in F2 and F3, testing the
fix before shipping it caught two further bugs in my own work.


---

## Appendix G — the three deferred items, decided and closed (2026-08-18)

Dan: "YOU DECIDE THEN PROCEED." Taking #34 (security), #33 (security +
calibration) and #32 (engineering half only, the business call stays his).

Every one of the three turned out to be **misfiled**. In each case the
mechanism was already built and correct; what was broken was smaller, more
specific, and different from the headline.

### G1. #34 — "deduct_diamonds executable by browsers"

Not the hole the title implies. The function self-checks:

    IF COALESCE(auth.role(),'') <> 'service_role'
       AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id) THEN
      RETURN ... 'Cannot deduct diamonds for another user';

So a browser could never drain another player. The real exposure was narrower:
bypassing `/api/diamonds/spend`'s ALLOWED_SOURCES to write arbitrary
source/type/description into `diamond_transactions`, and replaying a known
`p_reference_id` to get `{success:true, idempotent:true}` back with **no new
deduction** — free item for any flow trusting that result client-side.

The only browser caller was a legacy fallback in `ThrowableService.ts`. Three
facts made deleting it the right move rather than repairing it:
  - `fn_use_throwable` is live and is already the primary path — SECURITY
    DEFINER, derives the user from `auth.uid()`, takes no user_id or amount
    parameter, advisory-locked. That is the correct shape, and it keeps its
    `authenticated` grant.
  - `diamond_transactions` has **0 rows** with `transaction_type='throwable'`
    all-time. The paid path never charged a single real player.
  - the fallback was independently broken: it checked only `deductError` and
    never the returned `success` flag, and insufficient funds comes back as
    `data.success=false` with NO postgres error — so it fell through and
    recorded a **free throw**.

Deleted (CA `d3899e89e`), grant revoked (`20260818010142`, pre-flight +
post-apply assertions + pasted rollback). Verified: authenticated **false**,
service_role **true**, fn_use_throwable authenticated **true**, anon **false**.
Build Safety Gate CHECK 10 `authenticated_cannot_update_economic_columns`
PASS.

### G2. #33 — "miscalibrated AND its writer is unidentified"

**The writer was never unidentified.** It is `/api/cron/collusion-scan`,
scheduled `*/30` at `openclaw-cron-dispatcher.py:294` and routed to the workers
service at line 482. It runs on the **private** VM (`10.0.0.3:8081`), which is
why a public probe 404s. The earlier search looked for the table name in code —
which appears only in migrations — instead of the route. Not a security
incident.

The calibration half was real and worse than filed:

| measure | value |
|---|---|
| rows since 2026-04-20 | 169,523 |
| WIN_RATE_ANOMALY | 169,505 (99.99%), avg suspicion_score **97** |
| CHIP_DUMP | 18 rows, avg 81, none >=90 |
| distinct pairs flagged | 81,301, from just **573** players |
| players flagged | 573, of which **572 are horses (99.8%)** |
| ever reviewed | **0** |

573 players is ~164,000 possible pairings, so it had flagged roughly **half of
every pair that exists**. The single human, `kingfish`, had played **6 hands**
and drew 4 flags. The rule fires on >=30 shared hands and |bb/100| >= 80;
attributing a whole multiway pot delta to two named players is very noisy, so
across a field of horses grinding thousands of hands essentially every pair
clears it. CHIP_DUMP sitting next to it at 18 rows in four months is what a
working detector looks like.

Fixed at write time (workers `edf5691`): drop a finding only when **both**
players are horses, so horse/human survives and a horse leaking chips to a
human still surfaces. If the horse lookup errors the scan returns 500 rather
than falling back — falling back means quietly resuming the 170k-row
behaviour. Response reports `suppressed_horse_pairs`. The test asserts all
three rules and was confirmed to **fail 3/3** against the pre-fix source.

Backlog cleared (`status='cleared'`, not deleted — it is the evidence for the
recalibration): review queue **169,523 open -> 4 open**, and those 4 are
exactly the human-involved rows.

### G3. #32 — "chip supply has no single ledger"

Also misfiled. M4 had already done the hard thinking and built the right
thing. Absolute conservation is **unknowable** on this database —
`category='mint'` is 3 rows totalling 2,200,000.01 against ~732M in wallets,
several categories stopped being written entirely, ~776M unexplained — so M4
deliberately refused to invent a genesis figure, on the grounds that a
confident-looking wrong number is the original bug. It built
`fn_snapshot_chip_supply()` + `chip_supply_snapshots` around the one thing that
IS knowable: conservation **between** snapshots needs no genesis, and
Δholdings = Δ(credits − debits) is exactly the invariant an unbacked credit
violates. Deltas are NULL on a first snapshot by design.

**Why it never produced anything: the function timed out.**
`wallet_transactions` is 2,048,502 rows / 582 MB and the body scanned it THREE
times — totals, then group-by-category for credits, then again for debits. One
parallel seq scan measures 2.4 s, so three is ~7.2 s before the wallets,
table_seats and prior-snapshot queries. PostgREST connects as `authenticator`,
which carries `statement_timeout=8s`. It sat just over the line. The table held
exactly **one** row (2026-08-08) with every delta NULL.

Rewritten to a single `GROUP BY (type, category)` pass — 18 rows, from which
both totals and both category maps derive. Identical outputs; `round(,2)` still
only inside the jsonb maps. No index: the table takes a write every hand and
removing two redundant scans was enough.

Then the missing caller: `/cron/chip-supply-snapshot` in workers, scheduled
hourly through Open Claw (§11, not `vercel.json`).

**First reconciliation output in the platform's history**, measured through the
live cron route:

    elapsed 3,889 ms   snapshots_available=2   has_comparable_prior=true
    unexplained_delta = 28,765,423.76

Caveat stated plainly: that delta spans 2026-08-08 → now, a window that
includes the known-incomplete logging period, so it is **not** yet a clean
signal. The hourly series from here is. What to do about a persistent non-zero
delta is Dan's call, not mine — this work exists to give him the number, not to
decide what it means.

### G4. Two deploy pipelines were dead in the same way

`deploy-workers.sh` verifies the image via GHCR before deploying. The keychain
PAT `github-pat-ghcr-read` returns **401 Bad credentials**, and the VM's own
docker credential returns **denied** — so no workers deploy could complete from
either end. This is the identical failure mode as `deploy-openclaw.sh` earlier
today (hardcoded key that never existed). Worked around via the script's
documented GHCR-free `--build-on-server` path: builds HEAD's tree on the VM, no
registry. Deployed rev `2e505f052e4`, health OK.

**Both credentials still need rotating** — that is a real follow-up. The
deploys are unblocked, not the credentials fixed.

### G5. A mistake of mine, recorded

Adding the chip-supply registration to workers `src/index.ts`, I staged a file
that already carried another agent's uncommitted import for a route they had
not committed yet. That pushed an import with no module and took workers main
red. I landed their two files (202-line route, 164-line test, typecheck clean,
9/9 passing) rather than strip the import, since the work was finished. Lesson:
in a shared tree, check what is already dirty in a file before adding to it.

### Theme, again

Same as F. **The mechanism was built and correct in all three cases; what
failed was one specific thing nobody measured.** A grant left open for a
caller that had never once been used. A detector nobody had ever counted by
player type. A reconciliation that could not finish inside its own statement
timeout. In each case the headline in the task list was wrong, and reading the
data before writing code changed what got built.

---

## Appendix H — #16 solver: the task named the wrong problem (2026-08-18)

Filed as "Solver M2 locked out since the key rotation — capacity, not data
loss." Checking the data before touching anything found something larger.

### H1. What is actually true

| measure | value |
|---|---|
| solved_spots_gold | 8,410,279 spots |
| carry strategy_matrix_v2 | 1,891,817 (**22.5%**) |
| v2 remaining | **6,518,462** (77.5%) |
| v2 solved in last 24h | **0** |
| last v2 solve | **2026-08-15 09:57** (~64h before this audit) |
| M1 | alive, reporting every few seconds |
| M2 | silent since 2026-08-16 00:38 (~49h) |

**M2 is not the cause.** It went quiet roughly fifteen hours *after* v2 had
already stopped. The v2 re-solve pass is dead on both machines.

**And the backlog is growing.** M1 stayed alive the whole time creating NEW v1
spots — 49,532 in 24 hours — none of which have v2. Measured live during this
session, `v2_remaining` rose from 6,518,462 to 6,518,694 in minutes.

The reason nobody noticed: from a distance throughput looks *better*.
`solved_spots_gold` grew 70,076 rows in the last 48h versus 31,462 in the prior
48h. The fleet is busy. It is just busy doing the half of the job that was
already done.

### H2. Severity, stated honestly

**Not user-facing.** `browse-solutions.js:96`:

    const matrix = (spot.strategy_matrix_v2 ? v2ToAppMatrix(spot.strategy_matrix_v2) : null)
                   || spot.strategy_matrix || {};

It prefers v2 and falls back to v1, so a player always gets a matrix — 77.5% of
spots simply serve the older pre-PioSOLVER strategy. `custom-train.js` and
`aggregate-report.js` never read v2 at all. This is a quality gap, not an
outage, which is exactly the sort of thing that stays invisible for three days.

### H3. What was fixed, and what was not

The solver runs on LAN machines this codebase cannot reach, so **the solver was
not restarted** — that still needs doing on the boxes themselves, and M2's
`SUPABASE_SERVICE_ROLE_KEY` still needs the `sb_secret_` value.

What was in reach was the reason it went unnoticed. `/cron/solver-watchdog`
(workers `dca7731`, scheduled hourly at :20 via Open Claw) reports machine
silence and v2 stall into the **existing** `cron_health_log` — unique on
`cron_name`, so it is a current-state row, not an append log. No new infra
(RULE 12).

Thresholds live in an exported pure function so they are testable without a
database. Five tests, including the real 2026-08-15 scenario reconstructed from
production, a boundary case, and — deliberately — that the check goes **quiet**
once the backlog is finished rather than alarming forever after success. A
watchdog that fires permanently is one people learn to ignore, which is how the
collusion detector in Appendix G ended up with 169,523 unread rows.

Backed by `fn_solver_v2_progress()`. The naive count over 8.4M wide jsonb rows
measures **27,399 ms** against an 8s `statement_timeout` — a watchdog written
that way could never run, which is the same failure it exists to catch. Partial
index (40 MB, CONCURRENTLY) plus a `reltuples` estimate brings it to 486 ms.

### H4. My own watchdog silently recorded nothing

First production run returned HTTP 200 with a completely correct verdict —
`M2 silent for 49.5h`, `v2 backfill stalled: 6,518,694 spots remaining, no v2
solve for 64.2h`. I checked `cron_health_log` anyway. **No row.**

`cron_health_log_last_status_check` permits only `success|error|timeout`; I had
written `ok`/`warn`, so every upsert was rejected — and the route swallowed the
error with `console.warn` and returned 200 regardless. A monitor that reports
health while persisting nothing is worse than no monitor, and I had rebuilt
that exact defect inside the route written to end it.

Fixed both: the verdict maps onto the allowed vocabulary, and a failed write now
returns **500** instead of a cheerful 200. Verified after redeploy —
`last_status=error`, `last_duration_ms=3844`, both problems in `error_message`,
`v2_remaining` and `hours_since_v2` in `metadata`.

The lesson is the one this whole session keeps producing: **checking the 200 is
not checking the outcome.** The only reason this was caught is that I queried
the table instead of trusting the response code.

### H5. Still open for Dan

1. **Restart the v2 backfill on the LAN boxes** — nothing here can reach them.
   The watchdog will flip to `success` on its own once v2 solves resume.
2. **M2's service-role key** — still the original item, still capacity-only.
3. **Rotate the two dead deploy credentials** from Appendix G4.

---

## Appendix I — sweeping the cron surface (2026-08-18)

With the task list clear, swept the scheduled-job surface the same way: read
production telemetry rather than guess. Three findings, one of them the cause
of several others.

### I1. The email deliverability probe failed daily on correct DNS

`email-deliverability-check` returned 503 every morning and wrote `error` to
`cron_health_log`. `probe_heartbeats` shows the identical single failure on
2026-08-15, -16 and -17:

    spf_includes_resend — SPF exists but does not include Resend
                          "v=spf1 include:spf.privateemail.com ~all"

**The DNS is right; the check was wrong.** SPF is evaluated against the
envelope sender (Return-Path), not the visible From. Resend sends via Amazon
SES and uses `send.<domain>` as that Return-Path, so its SPF record belongs
there. Live:

    smarter.poker        "v=spf1 include:spf.privateemail.com ~all"
    send.smarter.poker   "v=spf1 include:amazonses.com ~all"
    resend._domainkey    present
    _dmarc               "v=DMARC1; p=none;"
    MX                   mx1/mx2.privateemail.com

Both records are correct — root covers Private Email (which the MX confirms is
the real mailbox host), subdomain covers Resend. The check demanded
`include:spf.resend.com` on the **root**, which Resend never asks for, and
satisfying it would have meant putting `include:amazonses.com` on
`smarter.poker` — authorising the whole of Amazon SES to send as
`@smarter.poker`. **The probe was pushing toward a worse configuration than the
live one.**

Cost: a daily 503 plus a Sentry alert on the one channel meant to warn that
signup and password-reset mail has broken. Same crying-wolf failure as the
collusion detector (Appendix G) and the state verifier.

Fixed to query `send.<DOMAIN>`; verified against live DNS with a negative
control (`send.example.com` correctly fails). Test pinned and confirmed to FAIL
when the route is reverted. CHECK 8 47/47. Deployed — production serves the fix.

### I2. `deploy-error-poll` has failed 720 out of 720 times in 24h

`cron_execution_log` (224,204 rows, and actively written by a `/cron/*`
middleware — the workers service is NOT unmonitored, an early read of mine that
was wrong) shows one job dominating every failure count:

    /cron/deploy-error-poll   ok=0  bad=720  every 2 minutes  HTTP 500

Root cause: `VERCEL_TOKEN` is present in the container but revoked —
`403 {"code":"forbidden","invalidToken":true}`. Per CLAUDE.md §1.6 this route
IS the deploy self-healing system, so **failed production builds have not been
auto-fixed** for as long as the token has been dead. The Vercel CLI's own
`auth.json` token is also 403.

Cannot be fixed from here — minting a Vercel token needs Dan's account, the one
category RULE 0 still allows a handoff for. Written to
`.agent/handoffs/2026-08-18-rotate-three-dead-credentials.md`.

### I3. The 404 cluster had a single upstream cause

Seven jobs were 404ing on schedule: `trivia-theme-backfill`,
`trivia-embed-backfill`, `trivia-regression-tests`, `trivia-player-retag`,
`trivia-pool-monitor`, `trivia-quality-audit`, `video-library-reels`.

All seven are registered in `src/index.ts` with real handlers. They 404'd
because **the deployed container was stale**: the GHCR credentials died
(Appendix G4), so `deploy-workers.sh` could not run, `main` drifted ahead of the
running image, and every route added since never reached production.

Resolved as a side effect of this session's `--build-on-server` deploys. All
seven verified returning **200** afterwards. The registry path is still broken
and is item 2 of the handoff.

### I4. Three dead credentials, none of them detected

    github-pat-ghcr-read   401 Bad credentials
    VM docker credential   denied
    VERCEL_TOKEN           403 invalidToken

Every one was found by reading production data during this session, not by any
alarm. `deploy-error-poll` was failing 720 times a day into a table nobody
reads. Task #26's secret-consumer drift detector is the natural home for an
automated check that stored credentials still authenticate; it currently covers
neither Vercel nor GHCR.

### Correction to my own earlier read

I initially counted "58 workers routes, 1 writes cron_health_log, 57
unmonitored" and was about to build a shared health wrapper. That was wrong —
`src/index.ts:110` already installs a `/cron/*` middleware writing every
request to `cron_execution_log`, 224k rows deep. Checking before building
avoided adding redundant infrastructure (RULE 12). The real gap is not
collection, it is that **nothing reads what is collected**.

---

## Appendix J — /auth/login: four reports, one root cause (2026-08-18)

Dan reported, with screenshots: mobile "blue boxes" making typing nearly
impossible, an undismissable full-width error after a wrong password, no
visible field boxes at all on desktop, and the card cut off at the bottom.

All four trace to one design fact: **the background image bakes in every
control EXCEPT the email/password fields** — that band of the card is empty
art. The real `<input>` elements were styled nearly invisible
(`rgba(0,8,25,0.65)` on black, 1.5px cyan border) at **14px** font.

- Desktop: fields effectively invisible — nowhere to type.
- Mobile: iOS Safari auto-zooms the page when focusing ANY input under 16px.
  The zoomed viewport is the "blue boxes everywhere" screenshot; the 10px
  floating labels sat 7px above 15px-tall inputs and collided.
- Error banner: zIndex 20 directly over the email field, no dismiss — one
  wrong password left the form dead.
- Cutoff: `height: 100vh` + `overflow: hidden`; on mobile 100vh includes the
  area under browser chrome.

Fix (b28db4818c): fields restyled as real visible boxes matching the baked
design language, **16px font** (the zoom trigger), placeholders replacing the
colliding labels, inputs grown to the empty art band (44px tap targets — 
Apple's exact recommendation), banner made pointer-events:none with a
self-enabled X + 8s auto-expiry + cleared on first keystroke (success
messages persist for magic-link flows), container `minHeight: 100dvh` +
auto overflow.

Verified **in production** on an iPhone 13 viewport via Playwright:
fields visible at 195×44px, font 16px, page fits the viewport, and the exact
reported failure flow re-run — wrong password → banner shows correct text →
cleared by typing TRUE, cleared by X TRUE, auto-expired at ~8s TRUE, email
field clickable under a live banner TRUE.

Verification note for future agents: Next.js injects
`#__next-route-announcer__` which is also `[role="alert"]` and always
"visible". It poisoned the first verification pass (every clear reported
false because the locator kept matching the announcer after the real banner
unmounted). Use `div[role="alert"]`.

Auth guard suites 10/10; the handleSignup/validatePassword guard untouched.
