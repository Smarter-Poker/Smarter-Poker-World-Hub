# World Hub Club Arena Engine Mutator Retirement

## TL;DR

World Hub contained an active, manually dispatched diagnostic workflow that
could edit the Club Arena engine host environment and restart the engine from a
mutable image tag. The workflow has been removed. A CI law now rejects every
World Hub workflow that references the Club Arena host checkout, engine image,
or launcher, so the bypass cannot return under another workflow name.

## Context

Club Arena's release path is responsible for building an engine image from an
exact committed server tree, validating it, cutting it over, proving the
running revision, and rolling back to the exact prior image if needed. A World
Hub workflow named `agent-diagnostic.yml` sat outside that authority boundary.

The workflow was active in GitHub Actions and could be started manually. Its
"diagnostic" step was not read-only: when it found maintenance mode enabled,
it copied and edited `/opt/club-arena/server/.env`, then invoked
`/opt/club-arena/server/scripts/engine-up.sh` with the mutable
`club-arena-engine:current` image.

## Root Cause

An emergency diagnostic accumulated a conditional repair action. That made a
World Hub troubleshooting workflow a second engine deployment path without the
exact-source build, release token, maintenance certificate, commit witness,
or rollback guarantees enforced by Club Arena's canonical workflow.

## Resolution

### Immediate

- Deleted `.github/workflows/agent-diagnostic.yml`.
- Did not connect to, edit, build on, or restart the Hetzner engine host.
- Did not change any credential or environment value.

### Durable

Extended `every-workflow-can-actually-start.law.test.mjs`, which already runs
in the repository's prebuild gate, to scan every workflow file. The law fails
if any workflow references:

- `/opt/club-arena`
- `club-arena-engine`
- `engine-up.sh`
- `engine-supervisor.sh`

The rule is name-independent: copying the retired action into a differently
named workflow still fails the gate.

## Forward Checks

1. Run the workflow law directly and require every subtest to pass.
2. Confirm the deleted workflow is absent from the committed tree.
3. Confirm no remaining workflow contains any of the three forbidden markers.
4. After merge, confirm GitHub reports the retired workflow as deleted or
   disabled and production serves a World Hub revision containing the law.
5. Keep all future Club Arena engine mutations inside the Club Arena
   exact-commit deployment workflow.
