# The ref guard that said "NOT on origin" without asking origin

2026-09-21

## The defect

`.husky/reference-transaction` is the only hook that fires before a
`git reset --hard origin/main` lands. Its job is to refuse a ref update that
would orphan commits nobody else has a copy of, and it decided that with one
command:

    ORPHANED=$(git log "$NEW..$OLD" --oneline 2>/dev/null | head -20)

and then printed, about whatever came back:

    They are NOT on origin. Nothing has been lost - they are saved at: ...

`NEW..OLD` answers "reachable from OLD, not from NEW". It is the right question
for what the update DROPS and it says nothing whatsoever about origin. The hook
had not read a single origin ref before making a claim about origin.

## Measured, not inferred

Commit `a45bc57c` in this repository is on
`origin/rescue/world-hub-news-search-2026-09-21`; `git branch -r --contains`
lists it there. Reproduced in a throwaway repository on 2026-09-21, the hook as
it stood on `origin/main`:

    exit: 1
    BLOCKED: this ref update would orphan local commits.
      c4c31e3 pushed
      They are NOT on origin. Nothing has been lost - they are saved at: ...
    git branch -r --contains says: origin/rescue/thing

It is CLAUDE.md 10.86 in one line: a check answering confidently when it has not
asked. The cost is not cosmetic. The recovery the message prescribes is the
wrong one, and an agent who reads "NOT on origin" about work that is on origin
spends the next hour rescuing something that was never at risk, or learns to
distrust the guard and reaches for `AGENT_REF_GUARD_OK=1` the next time it
speaks. A guard that cries wolf is disarmed by its readers, not by its author.

There was a second, quieter half of the same fault. `2>/dev/null` with no status
check turns an unreadable `git log` into an EMPTY one, and empty was read as
"nothing would be orphaned" and waved through. That is 10.86 rule 2, in the one
place where being wrong costs commits.

## What changed

Three outcomes where there were two, each with its own name and its own exit
code (10.86 rule 1):

| outcome | test | result |
| --- | --- | --- |
| LOST | `git rev-list NEW..OLD --not --remotes=origin` is non-empty | block, exit 1 |
| SAFE | that list is empty, so every dropped commit is on an origin ref | say so, allow |
| UNKNOWN | the range or the origin refs could not be read | block, exit 3 |

Specifically:

- **It still refuses genuinely unpushed work.** That is the first thing the test
  file pins, because a "fix" that made the hook quieter by making it permissive
  would pass a does-it-lie test and lose the next session's commits.
- **When it blocks, it names only the commits origin does not have,** and counts
  both halves ("1 of the 2 commit(s) it drops"). It used to list the whole range
  and call all of it lost.
- **UNKNOWN is a distinct refusal**, not a false negative. A clone holding no
  `refs/remotes/origin/*` cannot support the claim that anything is missing from
  origin, so it says that instead of asserting it, and every read is status
  checked rather than silenced.
- **The scope of the SAFE claim is stated, not implied.** It is the
  remote-tracking refs THIS clone holds. A commit pushed from another machine
  and never fetched here is still reported as LOST, and the message says
  `git fetch origin` refreshes the view.
- **It stops pointing at a retired publisher.** The old recovery line said
  `bash scripts/git-safe-push.sh`, the shared-clone path the repo instructions
  retired. It points at `PUBLISHING.md` now. 10.86 rule 4: a fix that leaves the
  next person reaching for something that does not apply has not landed.

## Its reader

`__tests__/ref-guard-tells-the-truth-about-origin.test.mjs`, seven cases, pure
git and bash in a throwaway repository under `$TMPDIR` with no network and no
`node_modules`. It runs in `build-safety-gate.yml` as a named step, "The ref
guard tells the truth about origin", so the guard has somewhere its result is
read rather than only going red where nobody looks (10.86 rule 3).

The test deletes `CI` and `GITHUB_ACTIONS` from the child environment on
purpose. The hook returns 0 immediately when either is set, so leaving them in
place would make every assertion pass for the wrong reason, which is the same
shape of false green the whole file is about.
