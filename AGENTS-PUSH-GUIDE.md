# World Hub agent delivery (current, September 16, 2026)

Read `/Users/smarter.poker/Documents/AGENTS.md` and
`/Users/smarter.poker/Documents/AGENT-HARDENING-STANDARD.md` first.
This route applies equally to Claude, Codex and Antigravity. It supersedes
older references to direct main pushes, project `.env` tokens, hosted Vercel
builds, automatic release repair jobs and temporary dependency worktrees.

## Submit the exact work you reviewed

Use your existing owned `.agent-trees` worktree on a feature branch. Integrate
current main normally when needed and preserve other agents' work. From that
worktree, submit only explicitly named files:

```sh
bash scripts/agent-push.sh "Describe the change" path/to/file1 path/to/file2
```

The helper uses ordinary Git and the host's existing `gh` login, retains local
hooks, pushes the same branch, creates or reuses its PR, and requests protected
auto-merge bound to the submitted head. It preserves the worktree on failure.
It does not install dependencies, extract tokens, copy edits onto a different
base, bypass required checks, or report publication from a successful merge.
An existing staged index must be reviewed before calling it.

Claude/Cowork sessions without host network access should invoke the same
command through their installed host-terminal/device bridge in that exact
worktree. If the bridge or host authentication is unavailable, retain the
branch and report that specific failure; never obtain a token from `.env`.

The live repository currently requires seven check contexts, including
TypeScript Check and Pre-Deploy Safety Checks. Inspect the actual PR checks;
do not turn a skipped check, a zero-second startup failure, or an earlier
revision's success into evidence for the final submitted revision.

## Publication: current capability and remaining gap

`vercel.json` deliberately disables Git integration deployments so builds stay
on approved local compute. A merge therefore does not publish World Hub.
There is currently **no automatic World Hub publication trigger**. The current
publisher VM has a GitHub runner registered for Club Arena only. A repository
`.env` file cannot supply this missing wiring.

The existing successful World Hub route is the local prebuilt sequence in
[local-production-build-env.md](docs/runbooks/local-production-build-env.md).
Dedicated release clones live in the existing `publish-arm64` VM at
`/home/lima.guest/releases/wh/<full-merge-sha>/source`. Private upload directories
live on the Mac at `/Volumes/SmarterWork/gha-cache/private-release/`.
These are publisher locations, never dependency directories for agent worktrees.
The publisher owner reserves the existing fifth heavy slot, builds the exact
qualified merged source, uploads the existing output with archive transport,
verifies the candidate, promotes it, and verifies the public identity. Preserve
the existing release, freshness, rollback, credential and resource controls.

Last verified successful release: PR1813, source
`01a6556bb5750132b89dbc2bebf1c543c5c21b38`, deployment
`dpl_CEafzZAFV46GrSKxXDFd7dL7HJbL`. This contains mobile PR1806.
At this inspection main was `b5b02bf80ac0e702d272a582782b361e5c9ab00e`;
its only later changes were a push hook and its tests, so that difference did
not require an application rebuild. Re-read current identity for later work.

Automatic publication remains a pipeline-owner repair: connect the existing
local build/upload/promotion sequence to a directly triggered, protected
request without adding capacity, exposing credentials to PRs or agents, or
using a scheduler. Do not promise that route is installed until an actual
protected release and public SHA demonstrate it.
