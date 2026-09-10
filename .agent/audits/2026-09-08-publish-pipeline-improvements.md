# #PUBLISHPIPELINEIMPROVEMENTS - why push and publish take so long

**Date:** 2026-09-08
**Scope:** World Hub (`Smarter-Poker-World-Hub` → `hub-vanguard` → smarter.poker) and
Club Arena (`Smarter-Poker-Club-Arena` → `ca-static.smarter.poker`).
**Status:** audit only. Nothing was changed, committed, or pushed.

Every number below is marked **[M]** measured in this session, **[Mq]** measured by
someone else and quoted from the file's own comments, or **[I]** inferred from config.

---

## The one-paragraph answer

The merge gate is not the bottleneck and has not been for some time - **[M]** median
pull-request-created-to-merged on the World Hub is **2m 30s** across the ten PRs merged
today. The time is spent on either side of it, in two places nobody is watching: a
**local `next build` that is forced to run cold on every single push because Phase 1
deletes the 2.4 GB `.next` directory first**, and a **6-minute post-push verification
poll that, on any branch that gets squash-merged, is waiting for a SHA production will
never serve**. Together those two account for roughly **11 of the ~17 minutes** a World
Hub change costs, and neither one is protecting anything. Club Arena is a different
shape: it is converged and healthy (**[M]** merge → bundle live in 3m 54s today), but its
floor is built out of three serial runner acquisitions and an 84 MB artifact round-trip,
and a 20–29 minute browser suite fires on *every* publish onto the same runner pool the
publisher has to queue in.

---

## Part 1 - World Hub

### 1.1 Phase 1 deletes the build cache, then Phase 2.5 pays for it

`scripts/git-safe-push.sh:513-518` runs, on every push:

```bash
git clean -fdX -e "!.env*" -e "!public/hub/club-arena/assets" \
               -e "!node_modules" -e "!node_modules/**" -e "!.husky"
```

`-X` removes files git ignores. `.next/` is ignored (`.gitignore:68`) and is **not** on
the exclude list. **[M]** Running that exact command with `-n` in this repo prints
`Would remove .next/`, and `.next` is currently **2.4 GB, of which `.next/cache` is
2.0 GB**.

Roughly 200 lines later, Phase 2.5 (`:725`) runs:

```bash
BUILD_OUTPUT=$(NODE_OPTIONS='--max-old-space-size=4096' npx next build --webpack 2>&1)
```

So the script destroys the webpack/SWC/Terser cache and then immediately runs the build
that cache exists to accelerate. **The local build gate can never be warm.** It is a
cold compile of 947 page files and 639 API routes, every time, forever. **[I] 4–8
minutes**; there is no in-repo measurement of it, which is itself part of the problem -
the script prints `PHASE1_DURATION` and `BUILD_END - BUILD_START` but nothing collects
them (`scripts/deploy-log.js` writes `logs/deploy-history.json`, and **[M]** all 36
entries in it are `db:push`, none are pushes).

Two further consequences of the same line:

- **[M]** `.agent-trees/` (24 GB, 17 sibling agent worktrees) is also ignored, via
  `.git/info/exclude:7`, and is also listed by the dry run. Nested worktrees carry a
  `.git` entry so single-`-f` clean should skip their contents - but the parent is on
  the list, and this deserves a deliberate exclude rather than a reliance on that.
- **[M]** `git worktree list` reports **178 registered worktrees** and `.git/worktrees`
  holds **177 entries**. `git worktree prune` is not being run. (Caveat: the sandbox
  sees the repo under a different mount root, so "prunable" against `/Users/...` paths
  is an artifact of this environment - but the `/private/tmp/...` ones are genuinely
  dead, and 177 registrations is real either way.)

The Phase 0 guards, by contrast, are **not** the problem and should be left alone.
**[M]** measured in-tree, upper bound (network mount, so slower than the Mac's disk):

| Guard | Cost |
|---|---|
| 0a secret scan #1 (`ghp_`, 9,891 tracked files) | 6.0s |
| 0a secret scan #2 (`github_pat_`) | 3.8s |
| 0e `.js` → explicit `.ts` import scan | 0.9s |
| 0f authUtils export coverage (2,708 files, ~6 procs each) | 5.5s |
| **Phase 0 total** | **≈16s** |

I expected 0f to be the offender and it is not. Measuring it was cheaper than arguing
about it.

### 1.2 Phase 4 is a six-minute wait that cannot succeed on a branch

`scripts/git-safe-push.sh:908` and `:949`, both unconditional after a successful push:

```bash
node "${SCRIPT_DIR}/verify-deploy.js" --wait 60 --match-sha "${COMMIT_SHA}" --timeout 300
```

`verify-deploy.js` waits 60s, then polls `https://smarter.poker/api/health` every 15s
for 300s - and `startTime` is set **after** the wait (`:109`), so the real budget is
**60 + 300 = 360s = 6.0 min**. It compares `health.version` to the **local HEAD short
SHA**.

There is no branch guard on Phase 4 - I read lines 772-975. `BRANCH` defaults to `main`
(`:74`) but takes `$2`, the push is `git push --set-upstream "$AUTH_URL" "${BRANCH}"`
(`:871`), and Phase 4 then polls production for that branch's HEAD. The mandated
workflow (§10.7, `AGENT-PLAYBOOK.md`) is: branch → PR → **squash-merge**, which produces
a *different* SHA on `main`. So on the normal path production is polled for a SHA it
will never serve: **six minutes of dead wait ending in `exit 2` and
`DEPLOY_VERIFIED:false`** - which §1.5 of `CLAUDE.md` defines as "your code is NOT
deployed". A false negative on every successful push, six minutes each, training agents
to disbelieve the one signal the rules say is authoritative.

**And the budget is too small even on `main`.** Four production deployments measured
today via the Vercel API:

| PR | queue (created→building) | build (building→ready) | push→ready |
|---|---|---|---|
| #1593 | 1.2s | 154.7s | **160s** |
| #1598 | 16.8s | 212.7s | **234s** |
| #1601 | 7.3s | 266.1s | **278s** |
| #1586 | **86.0s** | 273.2s | **364s** |

**[M]** #1586 took **364s from `repoPushedAt` to `ready`, against a 360s budget.** A
healthy deploy already loses this race. The repo's own watchdog allows **20 minutes**
for the identical event (`publish-watchdog.yml:17`: *"A Vercel build is 3-5 minutes and
the budget is 20"*). The two components disagree by 3.3×, and the one on the agent's
critical path took the smaller number.

### 1.3 The only required check on `main` is provably a no-op

`scripts/check-branch-protection.mjs:31,49`:

```js
const REQUIRED_CHECK = 'Audit-marker registry vs. tree';
required_status_checks: { strict: false, contexts: [REQUIRED_CHECK] },
```

One required check. It is `audit-marker-guard.yml`, which reads `.github/audit-markers.txt`
through `awk 'NF && $0 !~ /^[[:space:]]*#/'` (`:61-65`).

**[M]** That file is **1,426 lines: 129 blank, 1,297 comments, 0 tokens.** Every marker
entry is itself commented out. The job reaches `:68-71`, prints
`::warning::Registry has no tokens - guard is a no-op`, runs zero greps, and exits 0.

**`main` is gated by a check that cannot fail.** This is a correctness hole first and a
performance finding second - but it explains the timings. It is why merges take 2m 30s,
and it is why `Global Footer E2E` could be red on every run for two days (§10.8) without
blocking anything.

Meanwhile everything expensive is advisory and blocks nothing while still burning
runners: `build-safety-gate / type-check` at **[Mq] 7.9 min, of which 424s is `npm ci`**
for a `continue-on-error` typecheck; `e2e-tests` and `global-footer-e2e`, which each run
a full `next build`.

### 1.4 The app is built 3× before merge and 6× per PR lifecycle

| # | Where | Evidence |
|---|---|---|
| 1 | local Phase 2.5 build gate, always cold | `git-safe-push.sh:725` |
| 2 | `e2e-tests.yml` job `e2e` - `npm run build -- --webpack` | `:85` |
| 3 | `global-footer-e2e.yml` job `footer` - same | `:37` |
| 4 | **Vercel preview deployment** | `vercel.json:15` |
| 5–6 | jobs 2 and 3 **again** on `push: main` after squash-merge | `e2e-tests.yml:8-9` |
| 7 | Vercel production deployment | `vercel.json:15` |

`npm run build` is not one build - **[M]** counted from `package.json`, `prebuild` runs
69 `node --test` files and `build` adds ~57 more before `next build`: **126 test files
per Actions build**. Vercel does not pay this (`vercel.json` overrides `buildCommand`,
so npm's lifecycle hooks never fire), so each Actions build is *heavier* than the
production build it is meant to mirror.

**The Vercel preview build is pure waste.** `scripts/vercel-should-build.sh:37-44` skips
previews only for `agent/*` refs. **[M]** 8 of the last 11 PR branches use
`chore/ feat/ refactor/ perf/ fix/` - the gate misses ~75% of real branches. PR #1601's
only commit status was `Vercel → failure / "Canceled from the Vercel Dashboard"`: a
preview build that consumed a queue slot and produced nothing.

That queue is shared with production. **[M]** Over the last 20 `hub-vanguard`
deployments - 51.9 minutes, one deployment every 2.6 minutes - **8 of 20 were CANCELED
(40%)**, 7 of them previews. The script's own header (`:17-22`) documents a *production*
deploy cancelled for exactly this reason.

`.agent/audits/2026-09-04-build-once-per-pr.md` argued the two Actions builds run in
parallel on free self-hosted compute, so merging them saves no wall clock. That
reasoning still holds and the YAML still matches it - but the note's count is wrong: it
never accounts for the Vercel preview build, nor for both Actions builds running a
second time on `push: main`. Its own criterion ("the case has to be made on wall clock,
not compute") is met by neither Actions build and *is* met by the preview build.

### 1.5 The `main`-ref concurrency inversion

`e2e-tests.yml:16-17` and `global-footer-e2e.yml` both use `cancel-in-progress: true`
on a `${{ github.ref }}` group. On `refs/heads/main` that is the exact failure mode
`.agent/audits/2026-08-21-publish-deadlock-and-palette-clobber.md:55-59` was written
about: *"`cancel-in-progress: true` is correct when pushes are slower than the build. It
inverts into a deadlock the moment they are faster."*

**[M]** over the last 120 commits on `main`: median inter-commit gap **7.3 min, 53% of
gaps under 8 minutes**, against jobs needing ~7 min just to reach their first test. The
`main` runs are being killed more often than they finish.

### 1.6 Cold installs

**[M]** `package.json` has 68 deps + 17 devDeps → 1,324 packages. Four jobs pay a cold
install every run with **no `node_modules` cache**: `e2e-tests / e2e`,
`global-footer-e2e / footer`, `push-delivery-watchdog / probe`,
`preview-signup-gate / gate`. The pattern that fixes it is already proven in this repo
at `build-safety-gate.yml:1034` (424s → ~15s). **[M]** There is **zero `.next/cache`
reuse and zero Playwright browser cache anywhere in the 38 workflow files** - no match
for `.next/cache`, `ms-playwright`, or `PLAYWRIGHT_BROWSERS_PATH`.

**[M]** The lockfile is out of sync: `package.json` declares no `ajv`;
`package-lock.json` pins `node_modules/ajv` at 6.15.0 against a transitive 8.20.0.
`silent-write-guard.yml:68-71` documents it. Three jobs paper over it with
`npm ci 2>/dev/null || npm install`, which discards the error and silently takes the
slow, non-deterministic path on every cold run.

### 1.7 Doc drift found on the way

- `CLAUDE.md` §11.4 allowlists `branch-protection-watchdog.yml` and
  `vercel-deploy-retry.yml`. **Neither file exists.** The first is dead (logic survives
  in `scripts/check-branch-protection.mjs`, called from `vercel-uniqueness-check.yml:40`);
  the second is a *job* inside `build-safety-gate.yml:1076`. Both are still in the CI
  allowlist string at `build-safety-gate.yml:923`.
- `CLAUDE.md` §11.4 says `publish-watchdog.yml` runs "every 15 minutes". **[M]** line 23
  is `*/30 * * * *`.
- The premise that a PR waits on a `*/10` autopilot sweep is wrong: the cron is `*/30`
  (`agent-autopilot.yml:103`), and it is a safety net - auto-merge is armed within
  seconds by `pull_request: [opened, reopened, ready_for_review]`. That part is
  well-tuned and should be left alone.

---

## Part 2 - Club Arena

### 2.1 It is not stalled

**[M]** measured live today: tip of `main` `2cb81ff` committed 15:02:01Z;
`ca-static.smarter.poker/build-info.json?cb=…` reports that same sha,
`built_at 2026-09-08T15:05:55Z`. **Merge → bundle stamped: 3m 54s, fully converged.**
`built_at` is written before `upload-artifact` and the whole `publish-to-origin` job, so
true merge→live is that plus one more runner acquisition and the rsync - call it ~5 min.

The complaint is not a stall. It is that ~5 minutes is the *floor*, and the floor is
made of avoidable serial hops.

### 2.2 Three serial runner acquisitions

```
publish-needed  →  { client-tests (4 shards)  ∥  build-and-store }  →  publish-to-origin
```

`publish-needed` does nothing but 2–6 `gh api` calls and one `curl`, yet occupies a whole
runner and a whole scheduling round-trip. On the common fast path `client-tests` is
skipped, so it gates exactly one downstream job. Its `proven` step (four more API calls)
has **no `if:`**, so it runs even on a `*/30` tick that already decided `skip=true` -
~48 wasted runs/day.

### 2.3 The bundle crosses the network twice, and never deltas

`build-and-store` uploads `dist` as an artifact; `publish-to-origin` downloads it.
**[Mq]** the file records *an 84MB dist*. Runner → artifact store → runner → origin,
when runner → origin would do.

Then the release rsync **cannot** delta:

```yaml
rsync -az --delete -e "ssh $SSHOPTS" dist/ "$ORIGIN_USER@$ORIGIN_HOST:$ORIGIN_ROOT/releases/$SHA/"
```

`releases/$SHA/` never exists before this line, so **[I] 100% of the bundle transfers
every publish** and `--delete` is a no-op. No `--link-dest`. The same bytes then go over
again into `pool/assets/` and `pool/fonts/` - and **[I]** rsync's default quick-check is
size+mtime, which Vite rewrites on every build, so unchanged hashed chunks re-transfer
too. **[I] Five separate SSH handshakes per publish**, each `-o ConnectTimeout=25`, with
no `ControlMaster` multiplexing.

### 2.4 Publishing is single-file, and it re-arms itself

```yaml
concurrency:
  group: publish-club-arena-${{ github.ref }}
  cancel-in-progress: false
```

`github.ref` is `refs/heads/main` for push, schedule *and* dispatch, so every publish
attempt shares one group: at most one in-flight build plus the newest queued commit. Max
throughput **[I] 12–15/hour** at ~4–5 min, against **[M] 9.6 merges/hour** measured today
and **[Mq]** *"about nineteen times an hour"*. Steady-state lag therefore equals roughly
one whole pipeline duration - exactly what was measured.

The tail keeps the group occupied: the last step of `publish-to-origin` dispatches
another publish whenever `main` moved during the build. **[I]** At a ~4-minute pipeline
and a merge every ~6 minutes, that fires on a large fraction of runs. This is documented
nowhere.

### 2.5 A 20–29 minute browser suite fires on every publish, onto the same runner pool

`post-deploy-e2e.yml` triggers on `workflow_run: workflows: ['Publish Club Arena']`,
`runs-on: ${{ vars.CI_RUNNER || 'ubuntu-latest' }}`, `timeout-minutes: 50`,
`cancel-in-progress: false`. **[Mq]** *"Measured at ~29 minutes a run and firing on every
publish"*; *"Cashier plus six isolated stateful groups and the 138-test responsive sweep
take 20-24 minutes."*

**[I] A 20–29 minute job triggered every ~5 minutes with `cancel-in-progress: false`
occupies an estate runner essentially 100% of the time** - the same pool the publisher's
three serial jobs must acquire. It is triggered by the publishes it then slows.
`publish-watchdog.yml` adds to the same pool.

The symptoms are already in the files: **[Mq]** *"8.6m was measured on 2026-09-04 in the
sibling typecheck job while twelve runners installed at once"*, port 4173 collisions,
apt lock collisions - **red required checks caused by nothing in the diff.**

### 2.6 The PR gate in front of it

`ci.yml` says it outright: **[Mq]** *"CSS Beat p50 334s of a 6.8m ci.yml, and PR-to-merge
p50 was also 6.8m: CI *is* the merge latency here."* **[M]** today: #3801 3m03s, #3799
3m05s, #3796 10m17s. Longest chain is `changes → unit_shards(×4) → unit → verdict` -
four serialised runner acquisitions for a suite the file says runs in 13 seconds. `unit`
is hardcoded `runs-on: ubuntu-latest` in the middle of that chain, existing only to
carry the required check name. Two full Vite builds run per PR on **deliberately
non-shared** caches (`nm-full-…` vs `nm-beats-…`), plus a third in the publisher.

### 2.7 One live bug worth fixing today

**[M]** `https://ca-static.smarter.poker/build-info.json` with no cache-buster returned
`dc89c149…`, `built_at 2026-09-04T23:32:24Z` - **3.6 days stale**. The same URL with
`?cb=88213` returned the current sha. The publisher's verify step and
`publish-watchdog.sh` are immune (they send `?cb=$RANDOM` + `Cache-Control: no-cache`),
but **any human or agent who checks the origin directly gets a days-old answer and will
conclude the pipeline is broken when it is converged.** Caddy should send
`Cache-Control: no-store` for `build-info.json`.

### 2.8 Club Arena doc drift

| Doc | Claim | Reality |
|---|---|---|
| CA `CLAUDE.md` §1.1 | "**A publish takes seconds.**" | Four-job DAG with a full `npm run build`. §10.82 of the same file says ~4 min. **[M] 3m54s measured.** The "seconds" describes only the rsync+symlink and is the first number an agent reads. |
| CA `CLAUDE.md` §1.1 | orphan sweep is "in `agent-autopilot.yml`" | It is `.github/scripts/orphan-work-watchdog.sh`, in **`publish-watchdog.yml`'s `engine` job**. Autopilot's orphan step reaps stuck *workflow runs* - a different thing. |
| `AGENT-PLAYBOOK.md` §3/§6 | "Self-heals **once** per sha" | `MAX_RETRIES:-3`. The issue is filed on retries 1 and 2 *while still healing* - so the playbook tells an agent to investigate a failure the watchdog is actively fixing. This file is byte-identical across seven repos and `estate-integrity` enforces that, so the stale number is replicated seven times. |
| `AGENT-PLAYBOOK.md` §7b | "CI required checks, end to end: 0-2 min" | ~4 min (§10.82), 6.8 min historically. Three different numbers across two documents an agent reads in sequence. |
| CA `CLAUDE.md` §5 rule 8 | "it stops the World Hub sync" | The sync was retired 2026-09-03; §1.1 of the same file says so. |
| *nowhere* | - | That all publishing is single-file (`cancel-in-progress: false` on one group), and the Converge self-dispatch tail. |

---

## The latency budget, one World Hub change

| Stage | Time | Basis |
|---|---|---|
| Phase 0 guards | ~16s | **[M]** |
| Phase 1 `git clean -fdX` - deletes 2.4 GB `.next` | seconds, then costs the next stage | **[M]** |
| **Phase 2.5 `next build`, always cold** | **4–8 min** | **[I]** |
| push + PR open + autopilot arms auto-merge | <1 min | **[M]** config |
| required check (no-op) → squash merge | **2m 30s** median | **[M]** 10 PRs |
| Vercel queue | 1–86s | **[M]** n=4 |
| Vercel build | 155–273s (median ~4 min) | **[M]** n=4 |
| **Phase 4 `verify-deploy` dead poll** | **6 min, ends in `exit 2`** | **[M]** from source |
| **Total** | **≈17–18 min** | |

**~11 of those ~17 minutes are the cold build and the dead poll.** Neither protects
anything. The 2m 30s merge gate - the part everyone looks at - is the smallest term, and
it is small because it is empty.

---

## Ranked fixes

**World Hub**

1. **Guard Phase 4 on `BRANCH == main` and raise its budget.** `git-safe-push.sh:908,949`.
   Saves 6 min per push on the normal path and removes a false `DEPLOY_VERIFIED:false`
   on every success. When it does run, `--wait 30 --timeout 900` - agreeing with
   `publish-watchdog.yml`'s own 20-minute figure instead of contradicting it. *Largest
   single win, smallest diff.*
2. **Stop Phase 1 deleting `.next/cache`.** Add it to the clean's exclude list (cache
   only, not the whole of `.next` - stale build output is a known bug source, per the
   `CLAUDE.md` §8 table). Turns a guaranteed cold build into a warm one. **[I] 2–5 min
   per push.** While there, exclude `.agent-trees/` explicitly rather than relying on
   nested-repo skip, and run `git worktree prune` (177 stale registrations).
3. **Widen `vercel-should-build.sh` GATE 1 to skip previews for every PR branch, not
   just `agent/*`.** `:37-44`. 8 of the last 11 branches miss the gate; 40% of recent
   deployments were cancelled. Removes the third pre-merge build and de-contends the
   production queue.
4. **Fix `.github/audit-markers.txt`, then decide what `main` actually requires.** All
   1,297 entries are commented out, so the sole required check cannot fail. Either
   uncomment the registry or retire the workflow - but do not leave a required check
   that is structurally incapable of failing. *Correctness before speed; this is the
   higher-priority half of the audit.*
5. **Cache `node_modules`, `.next/cache` and `~/.cache/ms-playwright` in the four cold
   jobs**; fix the `ajv` lockfile mismatch; delete the `2>/dev/null ||` fallbacks that
   hide it. Pattern already proven at `build-safety-gate.yml:1034` (424s → ~15s).
6. **`cancel-in-progress: false` for the `main` ref** on `e2e-tests.yml:16` and
   `global-footer-e2e.yml`. Keep `true` for PR refs. Costs nothing on the merge path and
   makes the `main` E2E signal mean something again.

**Club Arena**

1. **Get `post-deploy-e2e.yml` off the publisher's runner pool and off every publish.**
   Pin it to `ubuntu-latest` (the watchdog file already makes this argument for its own
   jobs), or debounce to one run per N publishes. **[I] biggest single win here.**
2. **Delete the artifact round-trip.** Have `build-and-store` rsync straight into
   `releases/<sha>/`, and reduce `publish-to-origin` to the symlink swap + verify.
   Removes an 84 MB upload, an 84 MB download, and one of three serial runner
   acquisitions - while keeping the `needs: client-tests` gate, since nothing is live
   until the symlink moves.
3. **Make the release rsync a real delta:** `--link-dest=$ORIGIN_ROOT/current/`. Add
   `--size-only` to the pool rsyncs, or populate `pool/` server-side by hardlinking out
   of the new release dir - zero network.
4. **Multiplex SSH** (`ControlMaster=auto`, `ControlPersist=60`): five handshakes → one.
5. **`Cache-Control: no-store` on `build-info.json`** at the origin. Cheap, and it stops
   agents diagnosing a converged pipeline as broken.
6. **Fold `publish-needed` into `build-and-store`**, or at minimum put an `if:` on the
   `proven` step so no-op `*/30` ticks stop burning a runner slot 48×/day.
7. **Correct the docs** - "a publish takes seconds", the orphan-sweep location, and
   `MAX_RETRIES`. The retry claim is the actively harmful one: it sends agents to
   investigate failures that are still self-healing.

---

## What I did not verify

- The 4–8 min figure for the local cold `next build` is **[I]**. Nothing in the repo
  records it, because `git-safe-push.sh` prints its phase durations and no one collects
  them. **Fix 2 should land with a one-line append of `BUILD_END-BUILD_START` to
  `logs/deploy-history.json`**, so the next person arguing about this has a number.
- Club Arena files were read through the GitHub API; no clone is mounted in this
  session, so line numbers are given only for World Hub files.
- Deployment sampling is n=4 for build durations and n=20 for the cancellation rate,
  drawn from one 52-minute window today. Directionally solid, not a week's p50.

---
---

# Round 2 - what shipped, what is left, and what nobody had looked at yet

## Shipped, verified on `main`

PR #1615, squash `49f827c`. `scripts/git-safe-push.sh` on `main` is blob
`a6da0abddccdbcc9db19fbc7581417e773e3403b`, byte-identical to the file that passed
`bash -n` and the dry-run here. Phase 1 keeps `.next` and `.agent-trees/`; Phase 2.5
clears the previous build's output and keeps `cache/`; Phase 4 is guarded on
`BRANCH == main` in both push paths with a 30s + 900s budget; `git worktree prune`
added; the build gate now records its own duration to `logs/deploy-history.json`.

Two things confirmed themselves live while the PR was open. The `patch/` branch
triggered a full Vercel preview build - finding 1.4, demonstrating itself on the
audit's own pull request. And the merge took 9m57s wall clock, of which the required
check was the no-op described in 1.3.

---

## New findings, this round. All [M] measured from the Vercel build logs of `dpl_D726H` (PR #1601, production)

### R1. The build machine has 8 cores. Next.js is told to use 2.

`next.config.js:511-520`:

```js
// [2026-05-18 cost-opt] cpus raised 1->2 to cut wall-clock build time.
cpus: process.env.BUILD_CPUS ? Number(process.env.BUILD_CPUS) : 2,
```

and at `:397`, the reasoning: *"cpus limits parallel compilation to prevent 8-core
machines from OOMing."*

The build log confirms it is in force, and shows exactly what it costs:

```
14:50:30  Build machine configuration: 8 cores, 16 GB   (Enhanced Build Machine)
14:50:56  - Experiments (use with caution):
14:50:56    - cpus: 2
14:52:43  Compiled with warnings in 106s
14:52:43  Collecting page data using 2 workers ...
14:52:50  Generating static pages using 2 workers (0/397) ...
14:54:21  [done]
14:54:25  Build Completed in /vercel/output [4m]
```

So the 215s of `next build` splits into **106s of webpack compile and 98s generating
397 static pages**, and both halves are pinned to **2 of 8 available cores**. Static
page generation parallelises close to linearly across workers; the compile phase
benefits too.

The OOM that motivated the cap was on 2026-05-18, and the machine now has 16 GB with
`--max-old-space-size=7168`. The cap may simply be older than the hardware.

**This is a zero-code experiment.** `BUILD_CPUS` is already an env override. Set it to
4 in the Vercel project, watch one build, compare the two worker lines. If memory
holds, it plausibly takes 60-90s off **every production deploy, every Actions build,
and every local build gate** - the single largest remaining lever found in either
round, and instantly reversible.

### R2. The levers people usually reach for are already pulled

Worth recording so nobody spends a day on them:

| Lever | State | Evidence |
|---|---|---|
| Build machine size | **Already Enhanced**, 8 cores / 16 GB | `Build machine configuration: 8 cores, 16 GB` |
| Vercel build cache | **Working.** 858 MB, restored each build | `Restored build cache from previous deployment (CEK3RkEY...)` |
| Dependency install on Vercel | **2 seconds.** Not a factor | `up to date in 2s` |
| The tests in `buildCommand` | **~3 seconds** for all 30 marketplace files | timestamps: whole suite inside `14:50:53` |
| Cache upload (858 MB, 41s) | **Free.** Happens after `ready` | `ready` 14:54:56, upload finishes 14:55:37 |

The 4 minutes is `next build` and almost nothing else. That is why R1 matters and why
trimming the build command would not.

### R3. `vercel.json` already has the right mechanism for the preview problem

```json
"git": { "deploymentEnabled": { "ci-marker/**": false, "backup/**": false,
                                "build/**": false, "agent/**": false } }
```

`deploymentEnabled: false` stops the deployment being **created**. `ignoreCommand`
does not - it provisions a build container, clones, and then runs
`scripts/vercel-should-build.sh` to decide. So the map is strictly better than the
script for any branch prefix that should never build, and `patch/**` is missing from
it, which is why this audit's own branch built.

Worse, the script fails open, and did so on this very production build:

```
14:50:48  Running "bash scripts/vercel-should-build.sh"
14:50:48  [should-build] Cannot determine diff - building to be safe
```

Correct for production. But it means the gate cannot be relied on for previews either,
and the real question underneath is whether previews are wanted at all - PR #1601's
was cancelled unread.

### R4. Two deprecations that will become build failures

```
14:50:56  The "middleware" file convention is deprecated. Please use "proxy" instead.
14:50:56  The Edge Runtime is deprecated. You can use the "nodejs" runtime instead.
```

On Next 16.2.12. Neither is urgent; both are cheaper now than on the day a Next upgrade
turns them into errors, and the codemod is named in the log.

### R5. One 2.74 MB chunk

```
/_next/static/chunks/32958.88a03eb886f671ee.js is 2.74 MB, and won't be precached.
```

A build cost, a service-worker gap, and a user-facing download, in one artifact. Worth
one `@next/bundle-analyzer` run to find out what is in it.

### R6. `output: 'standalone'` on Vercel

`next.config.js:371` sets `output: process.env.VERCEL ? 'standalone' : undefined`.
Vercel's Next builder does its own output tracing, so standalone mode may be a second
tracing pass over ~1,300 packages for an artifact Vercel does not consume. **Not
verified** - it needs one A/B build to confirm either way, and it is the cheapest
remaining thing to test after R1.

---

## The structural ceiling, and the two moves that actually raise it

Everything above shaves seconds off a pipeline whose real constraint is arithmetic:
**[M]** median gap between commits on `main` is 7.3 minutes, and a publish takes ~4.5.
The system runs at roughly 60% of saturation, which is why 40% of deployments get
cancelled and why `cancel-in-progress` inverts into a deadlock. Shaving 90 seconds
helps. It does not change the shape.

1. **A merge queue.** GitHub's merge queue batches merges and builds the batch once,
   which is the first-class answer to the cancellation rate, to the `main`-ref
   concurrency inversion (1.5), and to the Club Arena publisher's single-file
   concurrency group (2.4) - all three are the same problem stated three ways. It is
   also the only one of these fixes that gets *better* as agent count grows, and this
   estate is adding agents.
2. **Measure it.** Nothing in either repo records pipeline latency; every number in
   this document had to be excavated by hand, and the two defects that were fixed had
   been costing eleven minutes a push for months in plain sight. Now that
   `logs/deploy-history.json` collects build durations, a small Open Claw job that
   posts a weekly p50 of push -> merge -> live would turn the next version of this
   argument into a lookup. **This is the enhancement that makes all the others
   self-correcting**, and it should not go on the Claude scheduler (section 10.9).

## The backlog, ranked by minutes saved against risk

| # | Change | Saves | Risk | Where |
|---|---|---|---|---|
| 1 | `BUILD_CPUS=4` and watch one build | **[I] 60-90s per build, everywhere** | Low, instantly reversible | Vercel env |
| 2 | Add `patch/**` to `git.deploymentEnabled`, decide whether previews are wanted at all | a whole preview build per PR; de-contends the prod queue | Low | `vercel.json` |
| 3 | `cancel-in-progress: false` on the `main` ref for the two E2E workflows | 0 on the merge path; restores a signal that has been meaningless for days | Low | 2 workflow files |
| 4 | `node_modules` + `.next/cache` + Playwright caches on the four cold jobs; fix the `ajv` lockfile | **[Mq] 424s -> ~15s** on each | Low, pattern proven in-repo | 4 workflow files |
| 5 | Fix `.github/audit-markers.txt`, then decide what `main` requires | none - it *costs* time | Medium: it is the first real gate in months | correctness, do it anyway |
| 6 | `Cache-Control: no-store` on Club Arena `build-info.json` | none - stops false diagnoses | Low | Caddy |
| 7 | Club Arena: `post-deploy-e2e` off the publisher's runner pool | **[I] largest CA win** | Medium | 1 workflow file |
| 8 | Club Arena: kill the 84 MB artifact round-trip; `--link-dest`; multiplex SSH | **[I] ~1 runner acquisition + 168 MB** | Medium | publish workflow |
| 9 | A merge queue | the shape, not the seconds | High - changes how everything lands | estate-wide |
| 10 | Weekly pipeline p50 via Open Claw | none directly; makes 1-9 provable | Low | new cron |

Item 5 is the only one where the honest recommendation is to accept a *slower*
pipeline. A required check that cannot fail is not a fast pipeline, it is an unguarded
one.

---
---

# Round 3 - shipped, measured, and three findings retracted

Everything in this section is after the fact. Where a Round 1 or Round 2 claim turned
out to be wrong, it is corrected here rather than edited above, so the record shows
what was believed and what it cost.

## Shipped and verified on main

| PR | What | Proof |
|---|---|---|
| WH #1615 | Phase 1 keeps `.next/cache` and `.agent-trees/`; Phase 4 guarded on `main` with a 30s+900s budget; `git worktree prune`; the build gate records its own duration | blob `a6da0ab` on main |
| WH #1627 | `resolveBuildCpus()`, preview allow-list, `patch/**` refused before a container, `e2e-tests` stops cancelling its own main runs | 4 blob shas on main; **`cpus: 4` in the production build log** |
| WH #1633 | vercel.json schema hotfix + a law for the whole class | production deploying again |
| WH #1640 | `node_modules` + Playwright + `.next/cache` on the four cold jobs; `push-delivery-watchdog` concurrency; the weekly p50 report | merged 17:35 |
| WH #1642 | 127-token registry, empty registry now fails, one-pass scan | open at time of writing |
| CA #3842 | SSH multiplexing, `--link-dest`, `proven` step gated | open at time of writing |

**The one number that matters.** `dpl_EzRgt`, production, after #1627:

```
Build machine configuration: 8 cores, 16 GB
  - cpus: 4
Compiled with warnings in 74s                              (was 106s)
Generating static pages using 4 workers (396/396) in 4.6s
Build Completed in /vercel/output [2m]                     (was [4m])
```

`buildingAt -> ready` 266.1s -> 190.1s. One sample after against a before with real
spread (155-273s), so the compile figure and the worker count are the hard claims.

## RETRACTED

**R-1. Finding 1.4, the build count, and half of 1.5.** Both were computed from a local
worktree **2,000 files divergent from `main`**. On real main, `e2e-tests.yml` dropped its
`pull_request` trigger on 2026-09-04 and `global-footer-e2e.yml` dropped its `push: main`
trigger the same day. So it is ONE Actions build per PR and one per main push, not two
each; and the concurrency fix applies to `e2e-tests.yml` alone - on `global-footer-e2e`
the expression would have been dead code. Caught before shipping. The criticism of
`.agent/audits/2026-09-04-build-once-per-pr.md` was also wrong: that note was acted on,
on the day it was written, exactly as it described.

**R-2. Finding 2.5, `post-deploy-e2e` on the publisher's runner pool.** Wrong twice.
Its own comment says **OFFLOADED 2026-09-02** - it was deliberately moved *onto* the
estate box because it was the single largest GitHub-billed job in the repo, and the
comment explains at length why CSS Beat E2E was not moved with it. And **74 of its last
100 runs were SKIPPED**: it only fires when the publish it follows succeeded. Acting on
the recommendation would have undone a good decision and put the biggest job back on the
bill. Ranked #7 above as "largest CA win"; it was not a win at all.

**R-3. Finding 2.7, the stale `build-info.json`.** Re-measured: the origin sends
`cache-control: no-store, no-cache, must-revalidate` and the busted and un-busted reads
return the same sha. Either it was fixed in between or the original read was an edge
artifact. Nothing to do.

The common thread in all three: they were the findings I did not measure myself. R-1
came from a subagent reading the wrong tree, R-2 and R-3 from quoting a file's own
comments (`[Mq]`) without checking whether the comment described the present tense.

## Found while shipping, and fixed

**The patch bridge could not push a workflow file.** `agent-apply-patch.yml` had
`contents: write` but not `workflows: write`, so the wave-1 patch applied perfectly and
then died at the push:

```
! [remote rejected] (refusing to allow a GitHub App to create or update
  workflow `.github/workflows/e2e-tests.yml` without `workflows` permission)
```

The job exits 1 with the patch still queued; it is not a required check; autopilot
squash-merged the branch anyway, so `main` took the `.patch` FILE and none of its
changes. Every earlier patch through that bridge touched only `scripts/` and `src/`.

**Production had stopped publishing, and nothing said so.** A `_comment` key added to
`vercel.json`'s `/avatars/` header entry failed Vercel's route schema. Valid JSON, so
every `JSON.parse` and all fourteen checks were green; Vercel is the only thing that
applies that schema, after merge, at deploy time, with **no build log at all**. Nothing
had published for about 25 minutes and the pipeline reported success throughout. This is
the worst failure shape available here and it now has a law.

**Two of my own mistakes, caught by this repo's own guards.** `_test-guards-exist`
failed my new law test for being executed by nothing. `vercel-build-queue.test.mjs`
failed because it encoded the deny-list I had just inverted. Both were correct; both are
fixed rather than deleted.

## The weekly report, on its first run

Written to prove the numbers above stop being archaeology - and it immediately found
something Round 1 and 2 missed:

| workflow | runs on main, 7d | cancelled |
|---|---|---|
| E2E Tests (Playwright) | 26 | **23** |
| Push Delivery Watchdog | 26 | **21** |

88% and 81% never reached a verdict. E2E was fixed in #1627; **Push Delivery Watchdog
had the same defect and was not in the audit at all** - and that one is a watchdog. It
also corroborates Round 1 independently: median 7m 50s between commits on main, 50 of 99
gaps under eight minutes, against 7.3 min and 53% from a different sample.

## Still open, deliberately

1. **The 84 MB artifact round-trip in the Club Arena publisher.** Real, and worth
   removing. It restructures which job holds the bundle when the `client-tests` gate is
   evaluated, and there is no way to test that without publishing. It gets its own change
   with its own verification, not a rider on three one-line fixes.
2. **A merge queue.** Unchanged from Round 2, and now unblocked: it needed a required
   check that can actually fail, and #1642 provides one. This is the only item that
   changes the *shape* rather than the seconds, and the only one that improves as agents
   are added.
3. **`AGENT-PLAYBOOK.md:200`** says the watchdog "self-heals once per sha";
   `publish-watchdog.sh:289` sets `MAX_RETRIES=3`. Not fixed, because that file is
   byte-identical across seven repos and `estate-integrity` enforces it - it needs one
   estate-wide change, not a local edit that breaks the check. Club Arena's own
   `CLAUDE.md` already says "up to three times" correctly, so the drift is confined to
   the shared file.
4. **`output: 'standalone'` on Vercel** (`next.config.js:371`). Still unverified; still
   the cheapest remaining thing to A/B now that the cpus change has landed.
5. **The `ajv` lockfile mismatch.** `package.json` declares no `ajv`; `package-lock.json`
   pins 6.15.0 against a transitive 8.20.0. Not fixed: regenerating a 1,324-package
   lockfile needs a network the sandbox does not have and a verification pass this
   session could not give it.


---
---

# Round 4 - the day after, and four more retractions

Round 3 closed with five items open. Four of them turned out not to be worth
doing, and finding that out cost less than doing them would have. The fifth
was a defect I had introduced myself.

## The one that was mine

**E2E was burning 556 runner-minutes a day.** Removing `cancel-in-progress`
from `e2e-tests.yml` was right in general and wrong for that workflow. It runs
on `push: [main]` only, takes 25-50 minutes, is not a required check, and has
been red since 2026-09-03 - so cancellation was the only thing keeping it
affordable. Measured over the following 24 hours: **20 runs on main, every one
red, 556 runner-minutes**, nine hours a day of a runner from the pool this
audit itself identified as the estate's binding constraint.

And the verdict was environmental. 78 failures a run trace to one cause:

```
GET /api/health   Expected: 200   Received: 503
```

The job starts the app against `https://placeholder.supabase.co`, so the health
route correctly reports itself unhealthy and three specs assert 200.
Production's `/api/health` is `status ok`. It is now `workflow_dispatch` only,
with the fix recorded for whoever restores the triggers.

## The law that was generalised, tried, and narrowed

The obvious next move was a general rule: no workflow triggering on `push:
main` may carry a bare `cancel-in-progress: true`. It flagged seven. Measured
over 30 main runs each **before** believing it:

| workflow | cancelled | declared timeout |
|---|---|---|
| audit-marker-guard | 0/30 | 3m |
| no-conflict-markers | 0/30 | 2m |
| silent-write-guard | 0/30 | 6m |
| supabase-invariants | 0/30 | none |
| undefined-identifier-guard | 0/30 | none |
| build-safety-gate | 1/30 | 30m |
| silent-revert-guard | 2/30 | none |

All seven finish inside the ~7m50s median gap between commits on main, so the
cancellation never fires and `true` is correct for them. The inversion only
bites when a job cannot finish inside that gap - a property of run history that
a file-reading law cannot see. A static proxy would have been wrong for most of
the repo, so the law asserts the two cases actually measured instead.

## Four retractions

**R-4. The `ajv` lockfile mismatch.** `npm ci --ignore-scripts` on npm 11.16.0
- newer than the node 24.12.0 CI runs - returns **exit 0, 1170 packages in
11s**. The nesting is ordinary deduplication and is valid. Someone had already
fixed it and left a comment in `silent-write-guard.yml` warning against
regenerating a healthy lockfile on the strength of a stale sentence. That
warning caught me with a worktree open to do exactly that. *What was real* is
the `2>/dev/null` that hid it: three jobs now emit a `::warning::` before
falling back.

**R-5. The 84 MB artifact round-trip.** Ranked #2 on the Club Arena list as
"the clearest waste". Measured on a real successful publish:

```
Upload dist for the sync job              12.0s
Download the dist built by the previous job  17.0s
Publish - rsync, swap the symlink, prune      7.0s
publish-to-origin, whole job              0.6 min
```

Twenty-nine seconds. Removing it means moving SSH secrets into another job and
restructuring which job holds the bundle when the `client-tests` gate is
evaluated - on a live publish path - to save about twenty seconds. The audit
inferred that 84 MB must be slow without timing it.

**R-6. Folding `publish-needed`.** The same measurement: 0.1 min. Six seconds.

**R-7. `output: 'standalone'`.** No evidence of a win:

```
standalone OFF   dpl_C6VAk6   build 259.3s   READY
standalone ON    dpl_EzRgt7   build 190.1s
```

n=1 each on different trees, so not conclusive either way - but nothing
suggests it is costing anything, and turning it off changes how production is
packaged. Restored.

## Shipped

- `AGENT-PLAYBOOK.md` said the watchdog "self-heals once per sha";
  `publish-watchdog.sh:289` sets `MAX_RETRIES=3`. Corrected in **all seven
  repos** that carry the file, in one pass. Every one was on blob
  `6212cb3f1992` before and is on `1bbc91aa2356` after, so byte-identity holds.
  The padding was trimmed by exactly the characters the sentence grew, leaving
  the file at 46,032 bytes.
- The three silent `npm ci ... 2>/dev/null ||` fallbacks are loud.

## And one more hole, found by falling into it

I pushed `preview/standalone-ab` to measure something, on a preview branch
precisely so production would be untouched, with "Not for merging as-is" in
the commit message. `agent-open-pr.yml` opened a pull request for it because
it opens one for every non-main branch; autopilot squash-merged it; Vercel
promoted it. **An experiment was serving smarter.poker four minutes after I
pushed it.**

Nothing enforces a commit message. The two halves of the preview mechanism had
been taught different things - `vercel-should-build.sh` learned on 2026-09-08
that `preview/*` means "build me a preview", and `agent-open-pr.yml` still
treated it as a branch to land. `preview/` now joins the skip list that file
already keeps for `backup/`, `ci-marker/`, `build/`, `dependabot/`,
`renovate/`, `sentry-autofix/` and `revert-`, and one law asserts both halves
together.

No outage: the accidental deployment built and served correctly.

## Not mine, but on main right now

`__tests__/_test-guards-exist.test.mjs` is **1412 of 1419** on main - seven
Training deadline and transport assertions failing identically on every branch
I tested. Someone's work in flight, flagged rather than touched.

## What is left

**A merge queue**, and nothing else. Every other item from Rounds 1-3 is
shipped, retracted on measurement, or recorded above with the number that
settled it. The merge queue is the only remaining change that alters the shape
rather than the seconds, it is now unblocked because a required check that can
actually fail exists, and it is the one item whose blast radius is every merge
in the estate - so it wants a deliberate decision, not a quiet Tuesday.
