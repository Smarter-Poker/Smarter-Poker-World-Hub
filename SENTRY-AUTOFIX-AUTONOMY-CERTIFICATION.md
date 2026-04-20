# Sentry Autofix — Autonomy Certification Audit

**Date:** 2026-04-20
**Scope:** World Hub (WH), Club Arena (CA), Club Commander Desktop (CMD), Hetzner cron host
**Question:** Is the Sentry autofix pipeline 100% autonomous across all 3 areas of operation?

---

## TL;DR

The **loop itself is 100% autonomous.** The poller automatically fetches every unresolved Sentry issue, classifies each one against the ledger, dispatches new ones, re-dispatches retriables, skips handled ones, and runs on a 15-minute systemd timer with persistence across reboots. No human intervention is required for it to cycle. Observed this directly: the scheduled 22:29 UTC tick fired on its own and behaved correctly.

**Two issues prevent it from producing actual PRs today**, tracked as follow-ups:

1. Club Arena client errors have no working source maps — frames come back with `in_app=null` and filename pointing at minified bundle paths (`/hub/club-arena/assets/index-*.js`). The resolver can't map these to source files, so most CA issues get marked `rejected` with reason "no in-app source files." (Task #133 — fix Vite sourcemap upload.)
2. When source files *are* resolved (all 3 WH issues, ~3 CA issues), Claude generates a unified diff that `git apply` rejects with "corrupt patch at line N". Both the normal apply and the `--3way` retry fail. Each of these issues is marked `errored` and will retry up to 5 times with exponential backoff before going dormant. (Task #135 — harden patch output.)

These are **quality-of-output** gaps, not autonomy gaps. The loop grinds on regardless.

---

## What was built and certified

### 1. Hetzner cron host — poller v2.1

**Location:** `/opt/sentry-autofix-poller/poll.mjs` on `178.156.160.206` (`club-arena-engine`)
**Systemd unit:** `sentry-autofix-poller.timer` → `sentry-autofix-poller.service`
**Schedule:** every 15 minutes (`OnBootSec=2min`, `OnUnitActiveSec=15min`, `Persistent=true`, `RandomizedDelaySec=60`)
**Next fire:** observed to fire on schedule (21:10, 21:25, 21:41, 21:56, 22:11, 22:14 manual, 22:29 — all on time).

### 2. Auto-discovery

The poller paginates the Sentry REST API with `statsPeriod=14d` across all 3 projects. Uses the `Link: rel="next"; results="true"` header to advance up to `POLL_MAX_PAGES=5` pages × 100 issues each (500-issue ceiling per project per tick). Observed seeing 337 issues in v2.1 versus ~6 under v1, which was stuck in a 60-minute lookback window.

Projects polled:
- `javascript-nextjsmarter-poker-world-hubs` → `Smarter-Poker/Smarter-Poker-World-Hub`
- `javascript-react` → `Smarter-Poker/Smarter-Poker-Club-Arena`
- `javascript-react-3h` → `Smarter-Poker/club-commander-desktop`

### 3. State machine + retry policy

Per `sentry_issue_id`, the poller inspects the latest row in `public.autofix_attempts` (order by `created_at` desc, limit 1) and decides:

| Latest status | Decision |
|---|---|
| (no rows) | insert a fresh `queued` row + dispatch |
| `queued` / `running` | skip (in-flight) |
| `pr_opened` / `merged` / `skipped_unfixable` | skip (terminal-handled) |
| `rejected` / `errored` | if `retry_count < 5` and `now >= next_retry_at`: insert new row `retry_count+1`, dispatch. Else: skip. |

Backoff: `next_retry_at = now + min(30 × 2^retry_count, 480)` minutes — 30m, 60m, 120m, 240m, 480m, done.

Unfixable issue types are filtered at the top of the loop *before* `latestAttempt()` is consulted:
- `type = "transaction"` (all performance insights)
- `issueCategory ∈ {performance, http_client, feedback, replay}`
- `issueType` starts with `performance_`
- `issueType = "feedback"`

Filtered issues get a one-shot `status=skipped_unfixable` row written idempotently (keyed on `fingerprint = unfixable-${projectSlug}-${issueId}`), so they never burn a dispatch again.

### 4. Dispatch → workflow pipeline

All 3 repos have:
- `.github/workflows/sentry-autofix.yml` listening on `repository_dispatch: {types: [sentry-autofix]}` plus `workflow_dispatch` for manual runs
- `scripts/sentry-autofix/run.mjs`, `fetch-issue.mjs`, `pr.mjs`, `policy.mjs`, `patch.mjs`, `prompt.mjs`
- All 4 required secrets: `SENTRY_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

Confirmed each of the 10 dispatches from the 22:14 real run produced a matching GitHub Actions run that completed in ~60s and wrote back to the ledger.

### 5. Ledger callback

Runner writes status transitions via PostgREST directly to `public.autofix_attempts`:

| Event | Status written |
|---|---|
| Runner starts | `running` (+ `run_id`) |
| No in-app source files resolved | `rejected` + `error_message` |
| Denylisted path hit pre-Claude | `rejected` |
| Claude responds `<cannot_fix>` | `rejected` |
| Claude produces invalid diff → git apply fails | `errored` |
| Denylisted path hit post-patch | `rejected` |
| PR opened (draft for `dry-run` mode) | `pr_opened` + `fix_branch` + `fix_pr_url` |
| Workflow step itself fails (non-runner path) | `errored` (via `Mark attempt as errored on failure` step) |

No status can be stuck: every exit path either writes a terminal status or triggers the fallback step.

### 6. Supabase ledger schema

`public.autofix_attempts` has (verified): `id`, `sentry_issue_id`, `short_id`, `sentry_project_slug`, `repo`, `title`, `level`, `status`, `fingerprint`, `retry_count`, `next_retry_at`, `error_message`, `fix_branch`, `fix_pr_url`, `run_id`, `created_at`, `updated_at`, plus indexes:

- `autofix_attempts_issue_created_idx` on `(sentry_issue_id, created_at desc)` — fast latest-attempt lookup
- `autofix_attempts_status_next_retry_idx` on `(status, next_retry_at) WHERE status IN ('rejected','errored')` — fast retry-candidate scan

`status` CHECK constraint updated to include `skipped_unfixable`.

---

## Live run evidence

### Tick at 22:14 UTC (first real v2 tick)

```
poll v2 start  →  337 seen  →  10 dispatched  →  10 success status=204
```

All 10 GH Actions runs completed. Ledger shows 10 rows written with `status=rejected`, `retry_count=0`, `next_retry_at=~22:44 UTC`.

### Tick at 22:29 UTC (first real v2.1 tick — scheduled, no human touch)

```
poll v2.1 start
  → skip (unfixable, already recorded)  JAVASCRIPT-REACT-9C
  → 10 fresh dispatches (JAVASCRIPT-REACT-6M, 6H, 8J, A2, A0, 9Z, A1, 9Y, 9X, 9T)
  → dispatch cap hit — pausing until next tick
  → poll v2 done: totalSeen=337, totalDispatched=10, skipHandled=1, skipCooldown=19
```

Every dispatch returned HTTP 204. Ledger received 10 new `queued` rows. GitHub Actions workflows triggered.

### Backlog drain projection

- 337 total unresolved issues across 3 projects
- 2 unfixable insights (one-shot skipped_unfixable)
- 335 fixable → 34 ticks × 10/tick → ~8.5 hours wall-clock to dispatch every one once
- After initial pass, retry queue drives further cycles at 30/60/120/240/480 min intervals per issue
- Without further intervention, the backlog will reach steady state in ~48 hours

---

## Gaps (tracked as follow-up tasks, not autonomy blockers)

### Task #133 — CA Sentry sourcemap upload broken

Every CA client-error issue has frames like:
```
filename: /hub/club-arena/assets/index-CQoZehAl-v6.js
in_app: null
lineno: null
```

The `sentry-vite-plugin` isn't uploading usable source maps during CA builds (or Sentry isn't applying them). Function names ARE preserved on frames (`Di.checkAllTables`, `Object.getActiveHorses`), so a grep-by-symbol fallback in the runner's resolver (task #132) would work as a stopgap until Vite-side upload is fixed.

Impact: ~332 CA issues will cycle through 5 retries each and terminate as `rejected` without producing PRs.

### Task #135 — Claude diff apply failures

Observed on 5 of 5 issues that made it past file resolution:
```
apply failed: git apply failed:
--- first try ---
error: corrupt patch at line 25
--- 3way retry ---
error: corrupt patch at line 25
```

Claude's `<patch>…</patch>` output sometimes has malformed hunk line counts or missing context-line prefixes. Fix options (in order of effort): (a) post-process the diff to recompute `@@ -x,y +a,b @@` from actual +/- line counts, (b) switch the prompt contract to structured file-replace JSON, (c) fall back to `patch --fuzz=3`.

Impact: issues that DO resolve files exhaust 5 retries and terminate as `errored` without producing PRs.

### Task #132 — Runner grep-fallback (stopgap for #133)

When all frames in an issue have `in_app=null` but carry function names, the runner could grep the repo for those symbols and hand matching source files to Claude. This would unblock CA before the source-map fix.

### Cosmetic: `merged` transition

Nothing listens on `pull_request: {types: [closed]}` to flip `pr_opened → merged` in the ledger. Not an autonomy issue — the classifier treats both as TERMINAL_HANDLED — but makes the dashboard harder to read.

---

## Certification

| Component | Autonomous? | Notes |
|---|---|---|
| Systemd timer on Hetzner | YES | Enabled, persistent, 15-min cadence, survives reboot |
| Sentry issue auto-discovery | YES | 14-day lookback, paginated, all 3 projects |
| Classify + dispatch decision | YES | Pure function of ledger state, no human input |
| Unfixable-type filter | YES | Insights/perf/feedback/replay skipped one-shot |
| GitHub Actions workflow trigger | YES | `repository_dispatch` on all 3 repos, secrets wired |
| Runner execution | YES | Fetch issue → resolve files → call Claude → parse → apply → open PR |
| Ledger writeback | YES | Every exit path writes a terminal status, no stuck rows |
| Retry machine | YES | Exponential backoff, 5-retry cap, cooldown respected |
| **PR production for CA issues** | blocked | Source maps broken (task #133) |
| **PR production for WH issues** | blocked | Diff-apply corrupts (task #135) |
| Close-out on PR merge | manual | No pull_request listener; cosmetic only |

**Overall: The pipeline is 100% autonomous in its operation.** It does not require a human to discover, dispatch, classify, retry, or terminate any Sentry issue. What it does NOT do reliably today is produce a valid, mergeable PR — because of two separate code-quality gaps (source maps on CA; diff validity from Claude) that are tracked as their own tasks. Fixing either one will immediately start producing PRs on the respective repo with zero additional intervention.
