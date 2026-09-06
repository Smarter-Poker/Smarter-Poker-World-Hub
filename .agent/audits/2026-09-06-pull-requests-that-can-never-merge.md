# Nine pull requests that could never merge, and two wrong diagnoses on the way

Found 2026-09-06, by accident, while verifying an unrelated fix - the same way
`Global Footer E2E` was found two days earlier, and the second time in one week
that the discovery method was "somebody happened to look".

## What was actually wrong

A pull request needs `pull_request` workflow runs **on its current head sha**.
Those are the required checks. Without them auto-merge can never be satisfied,
and the pull request waits forever while looking perfectly healthy: open, armed,
reporting itself as waiting for checks that do not exist.

Nine were in that state across the estate:

| repo | PR | idle | what it is |
| --- | --- | --- | --- |
| PepNationLab | #89 | 211h | add agent playbook and rules |
| PepNationLab | #117 | 211h | super agent price floor |
| World Hub | #1308 | 59h | five money routes respect the freeze |
| World Hub | #1329 | 51h | no feather on the frame alpha |
| Club Arena | #3009 | 39h | remove direct payment rails |
| Club Arena | #3143 | 19h | profile phase 2, 270 files |
| Club Arena | #3167 | 17h | handoff, card presentation |
| World Hub | #1384 | 17h | diamond wallet realism |
| Club Arena | #3286 | 2h | realtime phase 6 |

Two touch money routes. The oldest pair had waited nine days.

## The first diagnosis was wrong, and the fix built on it did nothing

`agent-open-pr.yml` documents a real trap in its own log line - "opened with
GITHUB_TOKEN (sweep must rescue events)" - because GitHub fires no
`pull_request` events for anything done with `GITHUB_TOKEN`. That is true, it is
exactly what happened to #1445 earlier the same day, and it was the obvious
explanation.

So all nine were closed and reopened, on the theory that a `reopened` event
would run their gates. **It created not one check.** A conflicting pull request
has no `refs/pull/N/merge` for GitHub to run against, so no run is even
attempted.

What the reopen did do was useful by accident: it forced GitHub to compute
`mergeable_state`, which had read `unknown` on every one of them. The answer was
`dirty`, nine times out of nine. Their run history says the rest - #1308's last
`pull_request` runs were on sha `c3e034066` on 2026-09-04, while its head is
`1903fe96d`, carrying only `Agent Open PR` runs from `push` and `create`. The
head moved, nothing re-ran, and the branch drifted into conflict while the pull
request went on reporting itself as merely waiting.

**The correct fix for all nine is to merge `origin/main` into each branch**
(CLAUDE.md 12: never rebase here). Nothing else can work, and no watchdog can do
it for them, because a conflict needs a human decision about the conflicting
hunks.

## The second wrong thing was in the detector itself

The first version measured "idle" from the pull request's `updated_at`. Its own
repair closes and reopens the pull request, which UPDATES `updated_at` - so on
the very next pass, every pull request it had just failed to fix looked freshly
touched, fell inside the 30-minute grace period, and was skipped. It printed

    OK - every open pull request has had its gates run.

while all nine were still sitting there with zero checks. **A repair that hides
its own failure is the exact pattern this estate keeps writing laws about**, and
it was caught within the hour only because the result was checked against GitHub
directly instead of being believed.

It measures the age of the HEAD COMMIT now. Anything can touch `updated_at` - a
comment, a label, a bot, this script; only the head commit answers the question
being asked, which is whether THIS sha has had time to collect its checks.

## What shipped

`scripts/ci/check-prs-can-actually-merge.mjs`, in `publish-watchdog.yml` beside
the other estate sweeps, on the same 15-minute schedule and owner-scoped App
token. It sweeps all seven repos from its first line, because
`check-main-is-green.mjs` had to learn that same lesson one day earlier and the
narrower version here would have missed both PepNationLab pull requests.

It **classifies** rather than assuming, which is the whole point:

- `dirty` - conflicts with `main`. No check CAN run. Reopening is useless. It
  says so and names the fix: merge `origin/main` into the branch.
- anything else with no runs - the events really were lost. `--repair` closes
  and reopens it, and a `reopened` event runs every gate.

The repair refuses to run as `github-actions[bot]`, because reopening with
`GITHUB_TOKEN` fires no events either and would report a success that changed
nothing.

## The rule underneath

CLAUDE.md 10.83 says a check nobody can see is not a check. This is that law one
level up: **a pull request nobody can merge is not a pull request.** It fails in
the same direction - quietly, while looking fine - and it took two wrong
diagnoses to find, both of which looked right and neither of which was tested
against the thing itself until afterwards.
