# A tree is provisioned for its own lockfile

`scripts/agent-workspace.sh` is on the estate-integrity list of files that
must be byte-identical in every repo. Club Arena fixed a provisioning hole in
it on 2026-09-10 and this brings the World Hub's copy back in step, byte for
byte, so the two do not drift.

## What the fix does

The provisioner clones `node_modules` from the main clone into every new tree
and judged that install usable when it had the type checker and a real
population. Usable is not current: a main clone sitting behind `origin/main`
has an install that matches its OWN old lockfile perfectly while the tree
being claimed was cut from `origin/main` and needs a different set, so `tsc`
fails on a package that is not there and the pre-push hook refuses. The
sibling-donor search could not help because it compared candidates against
the main clone's lockfile, the stale one.

- `node_modules_matches_lockfile` compares npm's own record of what it
  installed (`node_modules/.package-lock.json`) with a lockfile; every
  top-level, non-optional package must be present at the lockfile's version.
- The reference lockfile is the TREE's, for the main clone and for every
  donor.
- A clone that still does not satisfy the tree's lockfile is finished with
  `npm ci` in the tree itself, which is safe because the tree owns its
  `node_modules` outright.

See the Club Arena changelog of the same name for the incident that produced
it. No World Hub source changes; this is the shared provisioner only.
