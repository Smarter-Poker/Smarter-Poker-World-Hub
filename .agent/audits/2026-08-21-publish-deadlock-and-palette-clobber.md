# 2026-08-21 — the publish deadlock, and the palette fix a rebase quietly undid

Two separate faults, found while verifying that the cashier palette work had
actually reached users. Both share a shape worth naming: **the pipeline
reported success at every step while delivering nothing.**

---

## 1. The deploy queue was permanently busy and permanently unproductive

### Symptom

`https://smarter.poker/hub/club-arena/` served Club Arena sha `7547a6e45` for
hours. Club Arena `main` advanced roughly ninety commits in that window. Every
one of them was built, typechecked, and pushed. None reached a user.

### What it was not

Not a failing build. Not a Vercel error. Not branch protection. Not the
blocked-author bug from 2026-08-19 (CHECK 15) — authorship was clean
(`Smarter-Poker` and `github-actions[bot]`, both resolvable).

### Cause

`.github/workflows/build-for-world-hub.yml` in the Club Arena repo set:

```yaml
concurrency:
  group: build-world-hub-${{ github.ref }}
  cancel-in-progress: true
```

That build takes about **four minutes**. Several agents were pushing to `main`
every **one to two minutes**. Each push cancelled the run that was already in
flight, before it reached the sync-to-World-Hub step.

The run list showed the signature clearly: a long column of `cancelled` at 7s,
14s, 24s, 35s — runs killed almost as soon as they started — with nothing
completing between them. The queue was never idle, which is exactly why the
problem was easy to miss: it *looked* like CI was working hard.

### Fix

`cancel-in-progress: false`.

This does not reintroduce stale publishes, because of how GitHub scopes the
setting: a new run still cancels an older **pending** run in the same group;
only a run that is already **running** is protected. The group therefore
settles at one in-flight build plus the newest queued commit, and each burst of
pushes converges on publishing the latest `main` instead of publishing nothing.

Confirmed after the change: two consecutive successes (5m36s, 6m11s), with
cancellations now only 6-7s — those are superseded *pending* runs, which is the
intended behaviour, not the failure.

### The lesson worth keeping

`cancel-in-progress: true` is correct when pushes are slower than the build. It
inverts into a deadlock the moment they are faster. On a repo with several
agents committing concurrently, that threshold is crossed routinely. Any
workflow whose build time exceeds the push interval should use `false`.

---

## 2. A rebase reverted a shipped fix, and every check still passed

### Symptom

The cashier Trade page was back to the old amber after the palette fix had
already been written, reviewed, and pushed (`44879959f`).

### Cause

Commit `9944251b5` ("gamification font to Rajdhani") branched from a copy of
`src/pages/CashierTradePage.module.css` that predated the palette fix. It did
not intend to touch colours at all — but it carried a whole stale file, so
merging it reinstated all eight `#f5a623` / `rgba(245, 166, 35, …)` values.

`git merge-base --is-ancestor 44879959f HEAD` returned **true** the entire
time. The fix commit *was* in history. Its effect was not in the file.

### Fix

Re-applied as `6968423e5`, and verified by content rather than by ancestry.

### The lesson worth keeping

**Ancestry is not delivery.** "The commit is in `main`" answers a different
question from "the change is in the file", and on a repo with concurrent agents
those answers diverge regularly. The only trustworthy check is to read the
artefact:

```bash
# what the deployed bundle actually contains
IDX=$(curl -s "$BASE/index.html" | grep -o 'assets/index-[^"]*\.js' | head -1)
curl -s "$BASE/$IDX" | grep -o 'assets/CashierTradePage-[^"]*\.css'
curl -s "$BASE/assets/<that-file>" | grep -c 'f5a623'   # want 0
```

This is the same failure mode as the throwables regression documented earlier:
a valid, lint-clean, in-budget bundle that was simply wrong. Gates that check
*shape* cannot see *content*.

---

## 3. Two dead ends worth not repeating

**`build-info.json` is CDN-cached.** It reported `7547a6e45` well after the new
bundle was live and serving. A cache-busting query string did not defeat it.
Verify a Club Arena deploy by fetching the hashed asset filenames that
`index.html` chains to — those names change every build, so they cannot be
stale. (This is the same trap already recorded for the engine `/health`
endpoint.)

**You cannot hand-commit a Club Arena bundle into World Hub.** A pre-commit
hook forbids direct commits under `public/hub/club-arena/` ("the 792-commit
bug"). `scripts/sync-club-arena.sh` builds and *stages* but does not commit;
publishing is the GitHub Action's job. Anything left staged is destroyed by the
Antigravity `git reset --hard origin/main` loop — which is what happened here,
and is exactly the hazard RULE 13 warns about. When the Action is the only path
to production, fixing the Action is the fix. There is no manual bypass, and
looking for one cost real time.

---

## Verified after both fixes

Production entry chunk `index-ShKzCe_R-v6.js` chains to
`CashierPage-BENUnls1-v6.css` and `CashierTradePage-_8tOCmOi-v6.css`, both
returning HTTP 200 with **zero** old-palette values and the house gold present.
