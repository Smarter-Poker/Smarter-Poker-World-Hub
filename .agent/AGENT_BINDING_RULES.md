# AGENT BINDING RULES — push, publish, branch protection

**Last updated:** 2026-05-10
**Audience:** every agent that touches this repo (Cowork, Antigravity, Claude Code, autofix loops, any future agent).
**Status:** binding. Violations are auto-detected and (where possible) auto-reverted.

This file is short on purpose. Read it before any push, deploy, or
infrastructure operation. It exists because every rule below corresponds
to a real regression observed on 2026-05-10 — not theory, not paranoia.
The longer rule book lives at `.agent/CLAUDE_AGENT_RULES.md`; this file
is the bookmark you keep open.

---

## 0. The mental model

The repo is touched by multiple agents and an Antigravity auto-reset loop
simultaneously. Local `main` is **not yours** — it gets `git reset --hard
origin/main` on a schedule. Two consequences:

1. Any commit on local `main` that hasn't reached `origin/main` will be
   silently wiped within minutes. **Never commit to local main from an
   agent session.**
2. Concurrent agents pollute the shared working tree with each other's WIP.
   `git add -A` will sweep up someone else's half-finished work into your
   commit. **Stage explicit file paths only, never `-A`.**

The solution to both is the same: spin up an isolated git worktree
branched directly off `origin/main`, do your work there, push as a
feature branch, open a PR, auto-merge. The helper is
`scripts/agent-push.sh`. Use it.

---

## 1. FORBIDDEN actions (with the watchdog that auto-detects each)

| # | Never do this                                                         | Why                                                                 | Auto-detector                                          |
|---|-----------------------------------------------------------------------|---------------------------------------------------------------------|--------------------------------------------------------|
| 1 | Set `enforce_admins=true` on `main` branch protection                 | Blocks admin pushes → kills auto-deploy                             | `scripts/check-branch-protection.mjs` (daily, `--fix`) |
| 2 | Set `required_pull_request_reviews` on `main`                         | Blocks every non-reviewed merge → kills auto-deploy                 | same watchdog (auto-reverts)                           |
| 3 | Create a NEW Vercel project for an existing repo                      | Duplicate builds, queue starvation, "deployments queued forever"    | `scripts/check-vercel-project-uniqueness.mjs` (daily)  |
| 4 | Create a NEW GitHub repo, Supabase project, OAuth client for existing work | RULE 12 violation — adds parallel infra that drifts and confuses agents | manual via RULE 12 canonical-homes table          |
| 5 | Add a Vercel cron in `vercel.json`                                    | Wrong host for scheduled work — use Open Claw on Hetzner            | `build-safety-gate.yml` CHECK 6a (blocks at PR time)   |
| 6 | Add a GitHub Actions scheduled workflow without allowlisting it       | Today's 3-hour stall — CHECK 6c failed every push, agents backed off | `build-safety-gate.yml` CHECK 6c (blocks at PR time)   |
| 7 | `git push --force` or `git push -f` to `main`                         | Rewrites history mid-flight for every other agent                   | branch protection (`allow_force_pushes: false`)        |
| 8 | `git reset --hard` on local `main`                                    | You don't own local main — AG does, and it'll fight you             | `.git/hooks/pre-rebase` blocks rebase when WIP exists  |
| 9 | Commit directly to local `main` from an agent session                 | AG auto-reset will wipe it within minutes                           | use `scripts/agent-push.sh` (worktree-isolated)        |
| 10 | Use `git add -A` / `git add .` when other agents may be editing      | Bundles their WIP into your commit (caused #2 today)                | `scripts/agent-push.sh` stages explicit paths only     |
| 11 | Hardcode `kuklfnapbkmacvwxktbh.supabase.co` in NEW code              | Bypasses Custom Domain ($10/mo paid feature). Use the env var.      | grep CI lint (future)                                   |
| 12 | Claim "100% verified" without a real human / production click confirming the result | Past sessions wasted hours on premature success claims      | self-discipline (the user will catch you)              |
| 13 | Skip the audit doc for substantive infra changes                      | Next agent has no record of why or what was investigated            | RULE 9 in `.agent/CLAUDE_AGENT_RULES.md`                |


### 1.1 Exception to #9 and #10 — network-blocked agents

Rows 9 and 10 assume you can reach GitHub from your shell. Some agents
(Cowork cloud containers, Claude Desktop) cannot. For those agents the
ordering of evils is: **uncommitted work is worse than a local commit**,
because the Antigravity reset destroys uncommitted work outright.

If you cannot reach GitHub from your shell:

- **Preferred:** push through the **GitHub MCP** (`push_files` /
  `create_or_update_file`). It runs on the Mac, is authenticated, and has
  a network route. This keeps rule 9 intact — nothing lands on local main.
- **Binaries only** (base64 ceiling): commit locally with **explicit file
  paths** (never `git add -A`, rule 10 still binds) and let
  `git-safe-push-auto` push it.
- **Never** leave the work uncommitted "for review". See
  `.agent/workflows/claude-mcp-push.md`.
---

## 2. REQUIRED workflow for any non-trivial commit

```bash
# The ONE command for any agent commit:
bash scripts/agent-push.sh "commit message" path/to/file1 path/to/file2 ...
```

This script:
1. Fetches `origin/main` (never trusts local main).
2. Creates a fresh git worktree branched off `origin/main` HEAD.
3. Copies your local edits to the named files (and ONLY those files) into the worktree.
4. Stages explicitly (no `git add -A`).
5. Asserts the staged diff matches exactly the files you named (fails loudly otherwise).
6. Commits.
7. Pushes the feature branch.
8. Opens a PR via the GitHub REST API.
9. Waits for required status checks to pass.
10. Auto-squash-merges.
11. Deletes the feature branch.
12. Cleans up the worktree on exit (`trap`).

If `scripts/agent-push.sh` fails for any reason, READ the error and fix
it. Do not fall back to `git-safe-push.sh` for multi-agent work — that
script does `git add -A` and will pollute your commit.

**The legacy script `scripts/git-safe-push.sh` is still valid for SINGLE-AUTHOR
work** (trusted single user pushing their entire local working tree). Do
NOT use it from an agent session where other agents may be active.

After the merge:
1. Confirm the new SHA appears in `/api/health` on production.
2. Confirm `Build Safety Gate` is green for the new commit on `main`.
3. Then — and only then — say "shipped."

---

## 3. Detection layer (the watchdogs)

Three independent watchdogs catch silent regressions. They run on
schedules and auto-correct or alert.

| Watchdog                                       | Schedule  | What it watches                                                                              | Action on failure                                     |
|------------------------------------------------|-----------|----------------------------------------------------------------------------------------------|-------------------------------------------------------|
| `scripts/check-vercel-project-uniqueness.mjs` | 09:00 UTC daily | exactly one Vercel project linked to this repo                                       | exits non-zero; CI workflow alerts                    |
| `scripts/check-branch-protection.mjs --fix`   | 09:00 UTC daily | `main` protection state matches canonical (no reviews, no enforce_admins, audit-marker required) | **auto-corrects** via PUT                          |
| `scripts/check-push-velocity.mjs`             | hourly during 12:00–04:00 UTC | a commit landed on `origin/main` in the last 4 hours                       | opens a GitHub Issue labeled `watchdog-push-velocity` |

If a watchdog issue appears: **investigate immediately.** It means a real
regression is in flight. The watchdogs do not fire spuriously — every
incident class they cover has a documented postmortem under
`.agent/audits/`.

`build-safety-gate.yml` runs on every push and PR. It enforces:
- No new Vercel crons beyond cap 40
- No new `pages/api/cron/` handlers beyond cap 45
- No new GitHub Actions scheduled workflows outside the allowlist (CHECK 6c)
- No `.single()` calls (uses `.maybeSingle()` instead)
- No merge-conflict markers in source
- No unused hook imports
- No dynamic `@supabase/supabase-js` imports bypassing the patched server client
- Test fixture files present
- (CHECK 6 details in `build-safety-gate.yml` lines 269–333.)

**This check is informational on `main`** (not in the required_status_checks
list) — but agents must verify green before declaring "shipped." Today's
3-hour stall was caused by a chronic CHECK 6c red that agents correctly
respected.

---

## 4. Scheduled work — where it goes

Decision tree, in order:

1. **Default — Open Claw on Hetzner CPX21.** Add a route under
   `smarter-poker-workers/src/routes/` and register the schedule in
   `scripts/openclaw-cron-dispatcher.py`. This is the canonical home for
   ALL new scheduled work.

2. **Vercel cron (`vercel.json` `crons` array).** Only for jobs that
   genuinely need to run on the Vercel deployment runtime (rare —
   typically signup/auth probes that already exist). Cap: 40. Asking
   yourself "could this run on Open Claw?" and answering "yes" → use Open
   Claw, not Vercel.

3. **GitHub Actions `schedule:` cron.** Only if the job genuinely needs
   the GitHub Actions runner environment (e.g. `stale.yml` closes stale
   issues using `github.token`). If you add one:
   - Add to ALLOWLIST in `.github/workflows/build-safety-gate.yml` CHECK 6c
   - Add to the §11.4 list in CLAUDE.md
   - Both updates in the **same PR**, or CHECK 6c will fail and the
     push pipeline will stall (today's incident).

---

## 5. Canonical infrastructure (RULE 12 — no new infra, ever)

There is exactly ONE of each:

| Surface             | Canonical home                                            | Project/Repo ID                              |
|---------------------|-----------------------------------------------------------|----------------------------------------------|
| World Hub repo      | `Smarter-Poker/Smarter-Poker-World-Hub`                   | github repo `1132365826`                     |
| Club Arena repo     | `Smarter-Poker/club-arena`                                | (single canonical)                           |
| Workers repo        | `Smarter-Poker/smarter-poker-workers`                     | (single canonical)                           |
| Vercel project      | `hub-vanguard`                                            | `prj_op66GkZyZcygXQKm76iyycfVFAQx`           |
| Vercel project      | `smarter-poker-commander`                                 | `prj_vIeaVMjyHZIPgBzTZuzcaPwFlpbP`           |
| Supabase project    | `kuklfnapbkmacvwxktbh.supabase.co` (+ `auth.smarter.poker` custom domain) | (single canonical)            |
| Hetzner engine VM   | nbg1 / CX23 (poker engine)                                | see `.agent/CLAUDE_AGENT_RULES.md` RULE 10.4 |
| Hetzner workers VM  | CPX21 (workers + Open Claw)                               | see RULE 10.4                                |
| Google OAuth client | one client in the smarterpoker45@gmail.com GCP project   | (single canonical)                           |
| Facebook OAuth app  | one app in developers.facebook.com (Smarter Poker)        | App ID 838993589254717                       |
| Domain              | `smarter.poker` (via Vercel)                              | (single canonical)                           |

**If something feels like it needs a new entry in this table, you are wrong.**
Almost every "I should make a new repo for this" instinct in agent traces
has been a misread of existing structure. Edit the existing thing, or ASK
Dan before creating anything new.

---

## 6. Auto-deploy invariants — never break these

For the auto-deploy pipeline (push → Vercel build → smarter.poker serves
the new SHA), the following invariants MUST hold:

1. `required_pull_request_reviews` on `main`: **null**.
2. `enforce_admins` on `main`: **false**.
3. `required_status_checks.contexts` on `main`: **["Audit-marker registry vs. tree"]** (and ONLY that one — adding more required checks blocks admin pushes).
4. `vercel.json` `crons` array length: **≤ 40**.
5. `pages/api/cron/` file count: **≤ 45**.
6. GH Actions schedule triggers: **only the allowlist in §11.4 of CLAUDE.md**.
7. `Smarter-Poker/Smarter-Poker-World-Hub` GitHub repo linked Vercel projects: **exactly 1** (`hub-vanguard`).

If any of these regress, the watchdogs detect within 24h (or 1h for push
velocity). Don't manually "fix" by tweaking GitHub settings — that's how
today's regressions happened. Run the auto-corrector script.

---

## 7. Verification before claiming "done"

Before saying "shipped" / "deployed" / "verified" / "complete":

```bash
# 1. The SHA is on origin/main:
git fetch origin main && git log origin/main -1 --oneline
# Expected: your commit SHA

# 2. Production is serving the SHA:
curl -sS https://smarter.poker/api/health | jq .version
# Expected: matches the first 8 chars of your SHA

# 3. The Build Safety Gate run on this SHA is green:
gh run list --workflow=build-safety-gate.yml --branch=main --limit=1
# (Or check via API; conclusion should be "success")

# 4. For user-visible changes, you have NOT verified anything 100%
#    until a real human (or test user) clicks the path and gets the
#    expected result. Algorithmic chain verification (curls, status
#    codes) is necessary but not sufficient.
```

If the user (Dan) asks "is X 100% working?" — the only correct answer is
either "yes, here's the real-user-click confirmation" OR "the algorithmic
chain is verified but the final human-click test is still needed; I'm
waiting on you." Anything else is wrong.

---

## 8. Audit doc requirement

Substantive infra changes get an audit doc under
`.agent/audits/YYYY-MM-DD-<slug>.md`. Template lives at
`.agent/audits/2026-05-10-branch-protection-and-push-cascade.md`.

Pattern: TL;DR → context → root cause (or "couldn't locate") → resolution
(immediate + durable) → forward checks.

This is RULE 9 in the longer rule book. It's repeated here because today
several rules were rediscovered from-scratch that an earlier audit doc
would have made obvious.

---

## 9. Escape hatches

If you genuinely need to do something on the FORBIDDEN list above, the
escape path is:

- **Add a GH Actions scheduled workflow**: allowlist it in CHECK 6c AND
  CLAUDE.md §11.4 in the same commit. (See PR #309 for the template.)
- **Add a new env var to Vercel**: use the Vercel API (`PATCH /v9/projects/{id}/env/{envId}`). Do not edit the dashboard.
- **Modify branch protection**: don't. If the canonical state is wrong,
  edit `scripts/check-branch-protection.mjs` `CANONICAL_PROTECTION` AND
  ship the change as a PR.
- **Anything else on the table**: ask Dan. The cost of asking is 30
  seconds. The cost of creating a parallel infra is several hours of
  cleanup.

---

## 10. Quick reference — when you sit down to work

```
1. fetch origin/main, verify it advanced since you last looked
2. read RULE 12 canonical homes — confirm you're touching an existing
   thing, not creating new
3. bash scripts/agent-push.sh "msg" <specific files>     # do not git add -A
4. verify Build Safety Gate green on the new SHA
5. verify /api/health returns your SHA
6. for user-visible changes, ask Dan to click-test before claiming done
```

If anything in steps 1–5 fails:
- Branch protection regressed? → `node scripts/check-branch-protection.mjs --fix`
- Duplicate Vercel project? → `node scripts/check-vercel-project-uniqueness.mjs`
- Push pipeline stalled? → the hourly watchdog opens a GitHub Issue with diagnostic commands

---

## Changelog

- **2026-05-10**: created (Dan, via Cowork session — codifying the day's regressions: branch protection re-enabled 4×, 3h push stall, Vercel duplicate project, Supabase Custom Domain not wired, premature success claims).
