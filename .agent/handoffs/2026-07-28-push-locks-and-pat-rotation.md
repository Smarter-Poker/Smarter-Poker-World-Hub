# HANDOFF: unblock the push, clear the lock storm, rotate the leaked PAT

Author: Claude (Cowork cloud session). The device sandbox this session runs in
has NO network and CANNOT delete files, so it can neither push nor clean locks.
Everything below must run on Dan's Mac, in a normal shell, by an agent that has
network and full filesystem rights.

REPO: `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub`

---

## TASK 1 (BLOCKING, DO FIRST) - the lock storm

`.git` currently holds **101** stale lock files (`.git/index.lock.retry2`,
`.git/HEAD.lock.a5_1`, and so on). Concurrent agents have been working around
locks by renaming them instead of removing them. Git only respects the exact
names `index.lock` and `HEAD.lock`, so the renamed copies are inert litter -
but their presence means several agents were mid-write simultaneously, and that
is why pushes have been silently failing to complete.

```bash
cd /Users/smarter.poker/Documents/Smarter-Poker-World-Hub
# Stop every other agent/process touching this repo FIRST. Do not skip this.
ps aux | grep -i -E "antigravity|claude|node .*next" | grep -v grep

find .git -name "*.lock*" -print -delete
git status            # must respond instantly and cleanly
git fsck --no-progress --connectivity-only || true
```

Do NOT run `git gc --prune=now` until after Task 2 lands, in case a commit is
only reachable through the reflog.

---

## TASK 2 (BLOCKING) - get the queued commits onto origin

The branch has lost its upstream (`git status -sb` prints `## main`, with no
`...origin/main`). That alone will make a bare `git push` no-op or error, and
is a strong candidate for why "deployed" was reported while origin did not move.

Verify the real gap before pushing:

```bash
cd /Users/smarter.poker/Documents/Smarter-Poker-World-Hub
git fetch origin
git branch --set-upstream-to=origin/main main
git log --oneline --reverse origin/main..HEAD    # the real queue
```

Then push using the ONLY authorised command (CLAUDE.md section 1.3), which runs
the `npx next build` gate itself:

```bash
bash scripts/git-safe-push.sh "training: avatar library, seat-ring rotation, remove viewport seat cap"
```

Success is ONLY `DEPLOY_VERIFIED:true` AND `SHA_MATCHED:true`. Anything else
means it is not deployed - do not report success.

### Proof it actually landed - content, not SHA

A SHA can be reported green while origin lacks the code. Assert on content:

```bash
git show origin/main:src/components/training/games/UniversalDynamicTable.jsx | grep -c seatRel
# MUST be > 0  (the seat-ring rotation fix)

git show origin/main:src/components/training/games/UniversalDynamicTable.jsx | grep -c "0.65"
# MUST be 0    (the viewport seat cap, removed for cause - see Task 3)
```

Both must hold before this task is done.

---

## TASK 3 - why the 0.65 seat cap must NOT come back

Production is currently serving a cap that shrinks the table to 6-max when
`feltScale <= 0.65`. It was added to stop furniture overlapping the pot pill at
360x640. It does not fix that, and it causes three real regressions:

1. `SEAT_CONFIGS[9]` and `[6]` both put their top row at `y=15%`; 6-max actually
   places a seat at `x=50`, directly above the pot pill, where 9-max has none.
   `potTopPct` already re-centres the pill in the measured gap.
2. The 6-max position map has no `UTG+1`/`MP+1`/`UTG+2`. Hero at UTG+1 falls
   through `?? 0` to seat 0 (BTN); the button then sees
   `heroSeatIndex === BTN seat` and renders **on hero**. That is the exact bug
   fixed in `c2c5cad682`. At 360x640 `feltScale` is 0.580, so this is live on
   EVERY phone.
3. Seats match `actionHistory` by name. An UTG+1 villain has no 6-max seat, so
   that villain AND his committed chips vanish while the question narrates his
   raise.

The genuine 360x640 constraint: the felt gets 161x233px because chrome takes
356 of the 640 height and the locked 1/1.45 aspect ratio then starves the width.
The correct fix is to let the oval FLATTEN when height-constrained, not to drop
seats. That changes the silhouette against `.agent/design/training-table-template.png`
and is Dan's design call - do not ship it unilaterally.

---

## TASK 4 (SECURITY) - rotate the leaked GitHub PAT

A plaintext PAT was committed into `.git/config` and has been "scrubbed". A
scrub does not un-expose a token: it existed in cleartext on disk, may sit in
this repo's reflog/object store and in any shell history or backup. **Treat it
as compromised. It must be rotated, not just removed.** `grep -cE "ghp_|github_pat_" .git/config`
still returns 1, so a credential-shaped string remains in the config.

Claude cannot do this - handling credentials is outside what it is permitted to
do. A human or an agent explicitly trusted with secrets must:

1. **Revoke first, at GitHub.** github.com -> Settings -> Developer settings ->
   Personal access tokens. Find the token used by this repo/Vercel and click
   **Delete/Revoke**. Revoke BEFORE creating the replacement, so a leaked token
   is never valid alongside a new one.
2. **Audit what it did.** Settings -> Security log, filter by that token. Look
   for pushes, workflow runs, or package reads you do not recognise.
3. **Mint a replacement with the narrowest scope that works.** Prefer a
   fine-grained PAT limited to `Smarter-Poker/Smarter-Poker-World-Hub` with only
   Contents: Read and write. Add `read:packages` ONLY if the GitHub Packages
   route is being restored - it currently is not needed, because
   `commander-shared` is vendored at `vendor/commander-shared` and installed via
   `file:`. Set an expiry.
4. **Store it somewhere that is not the repo.** macOS Keychain via
   `git config --global credential.helper osxkeychain`, or an env var sourced
   from outside the working tree. Never in `.git/config`, never in `.npmrc`,
   never in a tracked file.
5. **Clean the config and confirm:**
   ```bash
   cd /Users/smarter.poker/Documents/Smarter-Poker-World-Hub
   git config --local --unset-all credential.helper 2>/dev/null || true
   grep -nE "ghp_|github_pat_|x-access-token|:.*@github" .git/config   # must print NOTHING
   ```
   The remote is SSH (`git@github.com:...`), so no token belongs in this config
   at all.
6. **Update every consumer**, then re-verify each one still works:
   - Vercel project `hub-vanguard` env vars (if `NPM_TOKEN` or any GitHub token
     is set there). Note `NPM_TOKEN` is currently DEAD and is what took three
     production deploys down on 2026-07-27; it is bypassed by the vendoring.
   - Any GitHub Actions secrets.
   - Local shell profiles / `.env` files.
7. **Consider the history.** If the token was ever committed to a tracked file
   (not just `.git/config`), rotation is still mandatory but the string will
   persist in history. Do not rewrite published history to hide it - rotation is
   the fix; history rewriting on a shared main is its own incident.

---

## TASK 5 - stop the agents damaging each other

Observed this session, repeatedly:

- An agent ran `git add -A` and swallowed another agent's half-finished work
  into its own commit. This happened at least twice.
- An agent left a `git stash pop` conflict inside
  `src/components/training/games/UniversalDynamicTable.jsx`.
- The working tree was once overwritten with pre-sweep copies that would have
  silently reintroduced ~2,000 emoji across 316 files if committed. Caught only
  by hashing every dirty file against the last 25 commits.

Binding rules for every agent on this repo from now on:

1. **Never `git add -A` / `git add .`** Stage explicit paths you personally
   edited, and nothing else.
2. **Re-read `git status` immediately before every commit** and confirm the
   staged set is exactly yours.
3. **One agent writes at a time.** If another is active, wait; do not work
   around a lock by renaming it.
4. **Never rename a lock file to bypass it.** Find and stop the process holding
   it.
5. **When diverged, merge - do not rebase.** Rebasing under concurrent writers
   is what kept changing commit SHAs mid-session.

---

## Current state for the receiving agent

- All harnesses green at time of writing:
  `node scripts/engine-correctness-harness.js` 99 PASS / 0 FAIL
  `node scripts/table-geometry-check.js` 40 PASS / 0 FAIL
  `node scripts/preflop-pot-check.js` 8 PASS / 0 FAIL
  `node scripts/avatar-library-check.js` 17 PASS / 0 FAIL
  Re-run all four after the merge in Task 2. Any regression means the merge lost
  something.
- Emoji: residual is ZERO across `src/`, `pages/api/`, `pages/hub/`, EXCEPT three
  deliberate files where emoji are the feature payload and are to be KEPT -
  `EmojiThrower.jsx`, `ThrowableEmojis.jsx`, and the
  `quickEmojis`/`QUICK_EMOJIS`/`REACTION_EMOJIS` arrays in `LivePokerTable.jsx`.
- `scripts/playwright-test.js` EXISTS and is the sanctioned way to verify UI.
  There is no Playwright MCP and no `playwright-testing` skill visible from the
  Cowork session - the script is the route.
- Still hardcoding their own 9-10 avatar arrays, not yet migrated to
  `AVATAR_LIBRARY`: `TrainingGameTable.jsx`, `LivePokerTable.jsx`.
