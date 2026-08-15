# How agents push to Smarter-Poker repos (READ THIS FIRST)

Last verified: 2026-08-15

## TL;DR — which auth works

- ✅ **GitHub MCP through the device bridge** (`mcp__remote-devices__github__*`)
  is the PRIMARY and only currently-verified push path. Its GitHub connection is
  authenticated on the Mac independently of any `.env` token.
- ❌ **`GITHUB_TOKEN` in `Smarter-Poker-World-Hub/.env`** (prefix `ghp_HUV…`) went
  `401 Bad credentials` on **2026-08-14** (it worked earlier that same morning —
  revoked or rotated mid-day, likely by a parallel agent session). If a fresh PAT
  is dropped into `.env` it becomes usable again for API-based paths; **test it
  against a real repo endpoint before relying on it** (see the /user warning below).
- ❌ The PAT embedded in the club-arena git remote URL (`ghp_waRF…`) has been
  revoked since 2026-08-06. Do not use it.

## ⚠️ Multi-agent coordination rule (added 2026-08-14)

Multiple agent sessions push to these repos **concurrently**. Two incidents on
2026-08-14: the `.env` token was rotated mid-flight under a working session, and
two sessions independently fixed the same cron bug within the same hour (the
race resolved cleanly only by luck). Before shipping ANY change:

1. **Re-fetch the target file from `main` immediately before committing** and
   diff/hash it against the base you edited from. Local checkouts go stale fast.
2. Prefer **small, exact string-replacement edits validated against main's
   current bytes** over full-file overwrites — a full-file push from a stale
   base silently reverts other agents' work.
3. If your change is already on main when you check — **discard yours, verify
   theirs, move on.** Do not push a duplicate.

## Push paths, in order of preference

1. **GitHub MCP through the device bridge** (`mcp__remote-devices__github__*`).
   Runs on the Mac with network + auth. Works for normal-size files
   (`push_files`, `create_or_update_file`, `create_pull_request`,
   `merge_pull_request`, `update_pull_request_branch`).
   This is the default for everyday commits/PRs. Note the bridge is only up
   while the Claude desktop app is open — it drops and reconnects; if tools
   vanish mid-task, wait for reconnect rather than switching to a riskier path.

2. **Large files — the agent-patch pipeline (added 2026-08-15).**
   `push_files` / `create_or_update_file` cap out around ~65 KB per file, which
   blocked every edit to `TablePage.tsx` (307 KB) for weeks. The Club Arena repo
   now has `.github/workflows/agent-apply-patch.yml`: create a branch named
   `patch/<name>` from main, push a **unified diff** to
   `.agent/patches/<name>.patch` (a few KB regardless of target size), and the
   runner applies it with `git apply --index`, deletes the patch file, and
   commits the applied result back to the branch — then open a normal PR.
   Generate the diff mechanically (stage the file via the device bridge,
   `git diff --no-index` or a scratch repo in the cloud container) and verify
   your base blob SHA matches main first; a stale base makes `git apply` fail
   loudly (red workflow run) instead of corrupting anything. Verified live
   2026-08-15: a 1.4 KB diff edited the 307 KB TablePage.tsx, applied in 13
   seconds, merged as CA PR #49. To enable the same pipeline in another repo,
   copy the workflow file — the bridge token has `workflow` scope.

3. **The cloud session's git proxy is per-repo gated.** From the cloud container,
   `git push` / `api.github.com/repos/...` return `403 "not enabled for this
   session"` for repos not in the session's authorized set — regardless of token.
   `/user` still 200s because the proxy injects its own credential there, so that
   endpoint is NOT a valid token test. To push directly from the cloud, add the
   repo to the session's GitHub sources (add_repo, access:"push").

4. **Compute-with-network fallback — RETIRED.** The short-lived Vercel
   string-replace committer functions (`sp-wh-ops`, `sp-ops-oneshot`) were
   **deleted on 2026-08-15** per Dan (they were dead anyway without a valid
   PAT, and the patch pipeline in path 2 covers their use case with no token
   at all). If some future outage kills both the bridge and Actions, the
   recipe was: a serverless function that takes `{token, owner, repo, edits}`
   in the request body (token NEVER baked into source), applies string
   replacements via the git-data API, and gets deleted afterward.

## Merge quirks seen in production

- `PUT /pulls/N/merge` can return 405 "Base branch was modified" or 409 "Head
  branch is out of date" transiently right after branch creation — GitHub's
  async mergeability recompute. Waiting ~1–2 minutes and retrying the merge (or
  calling it via the bridge's `merge_pull_request`) succeeds; `update-branch`
  answering "There are no new commits on the base branch" confirms it's only
  staleness, not a real conflict.

## Deploy pipeline note

Merging to `Smarter-Poker-Club-Arena` `main` triggers the **Build for World Hub
Sync** GitHub Action, which builds the CA bundle and commits it into
`Smarter-Poker-World-Hub/public/hub/club-arena`, which Vercel then deploys.
That sync is **GitHub-Actions-gated** — during an Actions outage a merge will not
go live until Actions recovers and the sync workflow runs.
