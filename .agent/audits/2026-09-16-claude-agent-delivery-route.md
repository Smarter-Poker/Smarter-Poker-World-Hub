# Claude producer delivery route repair

Scope: the first owner handoff, Mobile Optimization World Hub Pages, exposed
contradictory submission and publication instructions. PR1806 is already an
ancestor of the live 01a6556 release; no duplicate mobile release is needed.

The last successful application publication is PR1813 / 01a6556 / deployment
dpl_CEafzZAFV46GrSKxXDFd7dL7HJbL, built in the existing publish-arm64 release
clone and uploaded/promoted on the Mac. Current b5b02bf8 adds only a hook/test
repair. No automatic World Hub publisher workflow exists, and the installed
publisher runner is registered for Club Arena. This repair does not claim to
install that missing publication trigger.

The documented agent-push helper had no working host-gh authentication path;
it required an environment/keychain PAT, placed it in a push URL, copied edited
files onto a different main baseline, used temporary worktrees/dependency links,
and waited only 90 seconds for mergeability. Its DONE output certified neither
required checks nor publication. The replacement submits the actual owned
feature branch through normal authenticated Git and gh, preserves hooks and
work on errors, stages explicit files only, and requests protected auto-merge
bound to the exact pushed head. Shared/main worktrees, environment files,
traversal and unrelated staged work are refused. It reports submission only.

Regression: the prior helper fails the new real-Git host-auth submission case
with no GITHUB_TOKEN/GH_TOKEN or keychain PAT. The replacement passes all 13
cases in the existing git-safe-push-credential-safety test file, including
preservation, existing PR reuse, auth/transport/merge failures and unsafe paths. Held, draft, moved and closed PRs are not queued.
GitHub transport is stubbed in these fixtures; an actual protected PR run is
still required. That test file is already invoked directly by Build Safety
CHECK 8; no new job or duplicate suite was added.

Agent entrypoints now point to the current guide. Existing local publisher,
credentials, resource caps, required checks and release protections are unchanged.
Automatic publication remains an explicit unimplemented infrastructure gap,
not something a producer can fix by reading a project environment file.

Actual resubmission exposed one more path: Git invokes pre-push with no updates
for an already-pushed head, and the existing conservative hook then scans all
source. The helper now reads the exact remote branch SHA and skips only the
redundant transport when it equals HEAD; its existing repeated-invocation case
asserts exactly one push across two submissions. Changed heads still use every
normal hook. The observed redundant scan was stopped without a ref mutation;
no hook was bypassed for the final changed version.
