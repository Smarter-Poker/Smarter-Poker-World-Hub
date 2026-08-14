# Handoff — Open Claw deploys have been failing since 2026-05-17

**Filed:** 2026-08-13 (rewritten same day — the first version had the wrong diagnosis)
**Why a handoff:** RULE 0 credentials exception — repo secrets only Dan can inspect or rotate.
**Effort:** minutes, if the SSH secret is the problem.

---

## The headline

**`.github/workflows/deploy-openclaw.yml` has failed on every run since
2026-05-17.** Seven consecutive failures. The Hetzner `openclaw` VM is still
running the dispatcher that was deployed on **2026-05-17**.

Everything added to `scripts/openclaw-cron-dispatcher.py` since then exists
**only in the repo**:

| Commit | Date | What it added |
|---|---|---|
| `7664c76` | 2026-06-16 | migrate MLB Analytics engine cron to Open Claw |
| `74a61cd` | 2026-06-17 | `mlb-analytics-intraday` cron |
| `0e2996c` | 2026-06-19 | widen MLB intraday window to 10am–11pm CDT |
| `234e237` | 2026-06-21 | MLB HR tracker + `mlb-hr-cache-refresh` |
| `c7975f2` | 2026-06-29 | MLB noon safety-net predict runs |
| `7dea8fd` | 2026-08-13 | weekly news digest (this session) |

Four MLB cron paths are affected: `mlb-analytics-daily`,
`mlb-analytics-intraday`, `mlb-analytics-noon`, `mlb-hr-cache-refresh`.

**They are not scheduled anywhere else.** `vercel.json` has 15 crons and
**zero** MLB entries, and commit `7664c76` only touched the dispatcher — it
never removed anything from `vercel.json`, because they were never there.
Open Claw is their only scheduler.

So unless someone has been running `scripts/deploy-openclaw.sh` by hand from
the Mac, the MLB Analytics prediction and HR-cache jobs have **not run since
they were written in June**.

## Caveat — what I proved vs. what I inferred

- **Proven:** every `deploy-openclaw.yml` run since 2026-05-17 failed. Last
  success is run #7, `25990315663`, 2026-05-17, commit `b397036`.
- **Proven:** the MLB paths are absent from `vercel.json`.
- **NOT proven:** the actual state of the VM. I have no network from the agent
  shell (`connect: Network is unreachable`), so I cannot ssh in and read
  `/opt/openclaw/dispatcher.py` or `journalctl -u openclaw`. If someone ran
  `deploy-openclaw.sh` manually, the VM may be fine.

**First thing to check is therefore the VM itself, not the workflow.**

## Why this went unnoticed for three months

A deploy workflow that fails is not alarmed on. `push-velocity-watchdog`
watches commit flow and `branch-protection-watchdog` watches branch settings,
but nothing watches whether Open Claw actually received what main says it
should be running. This is precisely the drift **CLAUDE.md §11.3** bans
("the repo file and the production file on Hetzner must never drift") — the
rule was right, there was just no detector behind it.

Same shape as the CI failures fixed today: a red signal nobody reads stops
being a signal. CHECK 6c had been red since 2026-07-31 and was masking CHECK 8,
which was masking CHECK 10, which was red on a **real money bug** — every
signup drifting 500 diamonds (fixed, migration `20260813040000`).

## What to do

### 1. Check what the VM is actually running

```bash
ssh openclaw@<HETZNER_HOST>
sudo systemctl status openclaw.service
grep -c "api/cron" /opt/openclaw/dispatcher.py     # job count
grep -n "mlb-analytics-noon\|news/digest" /opt/openclaw/dispatcher.py
sudo journalctl -u openclaw.service -n 50 --no-pager
```

If `mlb-analytics-noon` is missing, the June work never landed and MLB
analytics has been dead for ~2 months. If `news/digest` is missing, that is
expected — it was pushed today and its deploy failed.

### 2. Fix the SSH path

Failing step is #5, **"Bootstrap (idempotent — installs python3 + apscheduler
+ dirs)"** — the first step that opens an SSH connection:

```
ssh "$USER@$HOST" 'bash -s' <<'EOSSH'
```

The annotation is identical on all seven runs:

```
Process completed with exit code 255.
```

255 is ssh's own connect/auth failure code, not a script error — the heredoc
never ran. Check, in order:

1. **`HETZNER_SSH_PRIVATE_KEY`** — most likely. Was the key rotated or the
   Hetzner box rebuilt around 2026-05-17? The public half must be in
   `~openclaw/.ssh/authorized_keys` on the VM. Note `deploy-yt-worker.yml`
   uses the same three secrets — if that workflow still deploys successfully,
   the secrets are fine and the problem is host-side (see 3).
2. **`HETZNER_HOST`** — did the VM's IP change? The local
   `scripts/deploy-openclaw.sh` reads the IP from the macOS Keychain
   (`security find-generic-password -a smarter-poker -s openclaw-server-ip`);
   compare that value against the repo secret. A drift between them would
   explain why manual deploys could still work while CI fails.
3. **`HETZNER_SSH_USER`** — defaults to `openclaw` in the workflow. Confirm
   that user exists and the firewall allows GitHub's runners.

Full logs need sign-in; I could only read public annotations. The real ssh
error message will be in the step log and should name the cause immediately.

### 3. Re-run and confirm

Re-run `deploy-openclaw.yml` via **workflow_dispatch**. On success its last
step tails `journalctl -u openclaw.service -n 30`. Confirm the registered-job
list includes both `/api/cron/mlb-analytics-*` and `/api/news/digest?days=7`.

### 4. Only then, finish the news-digest migration

The dispatcher entry is already on main (`7dea8fd`):

```python
('/api/news/digest?days=7', dict(day_of_week='tue', hour=14, minute=0)),
```

Tue 14:00 UTC is identical to the cron it replaces — `BlockingScheduler` is
constructed with `timezone='UTC'`, so no conversion is involved. Once Open Claw
is confirmed firing it:

1. Delete **only** the `schedule:` block from `.github/workflows/news-digest.yml`.
   **Keep `workflow_dispatch`** and its `dry_run` / `days` inputs — that manual
   control is genuinely GitHub-side and is not what §11 prohibits.
2. Remove `news-digest` from **both** the `ALLOWLIST="..."` line in
   `.github/workflows/build-safety-gate.yml` (CHECK 6c, along with the comment
   block above it that points here) **and** the list in **CLAUDE.md §11.4**.
   CHECK 6c's own error message requires both to change together.

Until then `news-digest` stays allowlisted and keeps running on GitHub
Actions, so no digest is missed.

### 5. Close the hole

Nothing detects this class of drift. Worth adding one of:

- a step in `deploy-openclaw.yml` that opens a GitHub Issue on failure (the
  Build Safety Gate already has a `notify-failure` job to copy), or
- a dispatcher `_internal` job that reports its own job count / file hash to a
  health endpoint, so a stale VM is visible from the app rather than only from
  a workflow log nobody opens.

## Do NOT

- **Do not remove the `schedule:` from `news-digest.yml` before step 3 passes.**
  Neither scheduler would fire it and subscribers would silently miss a week.
- Do not add any of these jobs to `vercel.json`. §11.3 bans it and CI fails on
  any growth of that array.
- Do not leave `news-digest` on the CHECK 6c allowlist once Open Claw runs it.
  A permanent exception is how the rule quietly dies.
