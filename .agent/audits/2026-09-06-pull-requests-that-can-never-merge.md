# Nine pull requests that could never merge, and nothing was watching

Found 2026-09-06, by accident, while verifying an unrelated fix - the same way
`Global Footer E2E` was found two days earlier, and the second time this week
that the discovery method was "somebody happened to look".

## The shape

`agent-open-pr.yml` opens a pull request with the first token it can get: the
Autopilot App, then `GH_PAT`, then `GITHUB_TOKEN`. It already knows the last one
is different and says so in its own log line:

    opened with GITHUB_TOKEN (sweep must rescue events)

**GitHub fires no `pull_request` events for a pull request created with
`GITHUB_TOKEN`.** That is deliberate on GitHub's part - it stops a workflow
triggering itself. The consequence here is that none of the `on: pull_request`
gates ever run. Not late. Never.

`agent-open-pr` then arms squash auto-merge, correctly and immediately. What is
left is the worst shape a pipeline can produce: a pull request that looks
healthy. Open, armed, reporting itself as waiting for required checks - checks
that do not exist and will not be created. GitHub does not even compute
`mergeable`; all nine read `unknown`.

**No sweep rescues this.** The comment says one must. `agent-autopilot`'s
every-30-minutes pass ARMS auto-merge, and arming was never the missing part.
Nothing in the estate re-creates absent check runs, and nothing notices they are
absent.

## What was actually sitting there

| repo | PR | idle | what it is |
| --- | --- | --- | --- |
| PepNationLab | #89 | 210h | add agent playbook and rules |
| PepNationLab | #117 | 210h | super agent price floor |
| World Hub | #1308 | 58h | five money routes respect the freeze |
| World Hub | #1329 | 50h | no feather on the frame alpha |
| Club Arena | #3143 | 19h | profile phase 2, 270 files |
| Club Arena | #3167 | 17h | handoff, card presentation |
| World Hub | #1384 | 16h | diamond wallet realism |
| Club Arena | #3009 | 7h | remove direct payment rails |
| Club Arena | #3286 | 1h | realtime phase 6 |

Nine, zero check runs between them, every one armed to merge. Two touch money
routes. The oldest pair had been waiting nine days.

**The first sweep found seven.** It looked at the two busy repos only. Widening
it to the estate found the PepNationLab pair - the identical correction
`check-main-is-green.mjs` had to make one day earlier, for the identical reason:
a detector scoped to one repo reports that the estate is fine because the room
it is standing in is fine. That mistake has now been made twice in two days by
two different detectors, which is worth more than the bug itself.

## The fix

`scripts/ci/check-prs-can-actually-merge.mjs`, in `publish-watchdog.yml`
alongside the other estate sweeps, on the same 15-minute schedule and the same
owner-scoped App token.

It reports any open pull request with no `pull_request` workflow run on its head
sha past a 30-minute grace period, and with `--repair` it closes and reopens
each one. `reopened` is in the default activity set for `on: pull_request`, so
every gate runs on the next tick. It merges nothing, moves no branch and changes
no code - it only lets the pipeline that was supposed to run, run.

**The repair refuses to run as `github-actions[bot]`.** Reopening with
`GITHUB_TOKEN` fires no events either, so that repair would report success and
change nothing - closing the loop on itself and teaching everyone the repair
does not work. It says so and exits 1 instead.

## What this is NOT

It is not a way to make a red pull request merge. Reopening creates the checks;
a failing check still blocks, exactly as it should. Several of the nine are days
old against a fast-moving `main` and will come back CONFLICTING - which is also
the correct answer, and one nobody could see before today.

## The rule underneath

CLAUDE.md 10.83 says a check nobody can see is not a check. This is that law one
level up: **a pull request nobody can merge is not a pull request**, and it fails
in the same direction - quietly, while looking fine.

The deeper fix would be to stop `agent-open-pr` ever falling back to
`GITHUB_TOKEN`, since every pull request it opens that way is born broken. That
needs the Autopilot App installed with PR scope in all seven repos, or `GH_PAT`
present as a secret in each. Until then the fallback is better than failing to
open a pull request at all - but only because something now repairs what it
produces.
