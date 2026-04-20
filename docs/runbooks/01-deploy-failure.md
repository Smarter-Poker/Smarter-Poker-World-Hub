# 01 — Deploy Failure

## When to use

Any of the following:

- A Vercel deployment enters state `ERROR` and the previous ready deploy is
  also stale (i.e. main is getting pushed but nothing is going live).
- `build-safety-gate.yml` on GitHub Actions goes red on `main`.
- `/api/health` returns a version SHA that predates HEAD by more than one
  commit and pushes aren't landing.
- Two or more consecutive ERROR deploys in the last 30 minutes (**cascading
  failure mode** — see step 4, this has real history).

## Prerequisites

- GitHub write access to `Smarter-Poker/Smarter-Poker-World-Hub`
- Vercel deploy access on `smarter-poker` team
- Ability to run `git revert` and force-push if absolutely necessary

## Symptoms

A deploy build log usually contains one of four signatures. Match yours
against these before picking a mitigation.

**A. Module not found.** `Can't resolve 'some-package'`. Usually a missing
dependency in `package.json` — common when someone adds an import without
installing the package. See historical incident #97 (react-hot-toast).

**B. Webpack compilation error.** `Identifier 'X' is defined multiple
times` or `Unexpected token`. Usually duplicate declarations inside a
single file, or an incomplete merge. See #98 (duplicate `mountedRef` in
VenueMap.jsx — caused 5 chained failures).

**C. Prerender error.** `Error occurred prerendering page "/path"`. A
getStaticProps call is throwing at build time. Usually a missing env var
or a DB call that fails in the build environment.

**D. Timeout.** The build exceeded Vercel's 45-minute cap. Usually someone
unknowingly increased the workload — huge new page, runaway dependency
install, etc.

## Procedure

### Step 1 — Confirm prod is not currently broken for users

```bash
curl -s https://smarter.poker/api/health | jq
```

If the `status` is `ok` and `version` is a reasonable SHA, the last good
deploy is still serving users. This is a SEV-3 — you have time to fix
forward without an emergency rollback. If prod itself is broken, escalate
to SEV-2 and follow step 2.

### Step 2 — Roll back (if prod is degraded)

Find the last known-good deploy:

```bash
# From the Vercel MCP or CLI
vercel ls --scope smarter-poker hub-vanguard --meta state=READY | head -5
```

Pick the most recent `READY` deploy that predates the bad series:

```bash
vercel promote <deployment-id> --scope smarter-poker
```

The alias on `smarter.poker` will flip within seconds. Verify with
`/api/health` — the `version` field should now show the promoted SHA.

### Step 3 — Read the build log and classify

Open the failing deploy in Vercel, go to the Build Logs tab, scroll to
the red section. The error almost always appears 5–50 lines before the
final failure marker. Match against signatures A–D above.

### Step 4 — Cascading-failure detection

**If you see two or more consecutive ERROR deploys for different commits
in the last 30 minutes, STOP pushing.** Every push is triggering a
rebuild, consuming Vercel minutes, and drowning the signal. This is the
pattern that caused incidents #96 and #98 (5 ERROR deploys in a row).

Temporarily pause deploys:

```bash
# In Vercel UI: Project → Settings → Git → "Ignore Build Step" → paste:
bash -c 'exit 1'
```

This makes every push skip the build. Now you have breathing room to
actually fix the root cause. Un-set this once the fix is verified green
in a preview deploy.

### Step 5 — Fix forward

For signature A (module not found):

```bash
cd ~/Documents/Smarter-Poker-World-Hub
npm install <missing-pkg>
git add package.json package-lock.json
git commit -m "fix(deps): add missing <pkg>"
git push origin main
```

For signature B (webpack — duplicate decls or merge leftover):

```bash
# Grep the file for the conflicting identifier
grep -n '<identifier>' <file-path>
# Delete the duplicate, leaving the canonical definition
# Commit normally
```

For signature C (prerender):

- If the failing page is optional, add it to `next.config.mjs`'s
  `excludeDefaultMomentLocales` or wrap the call in a try/catch that
  returns empty props so build succeeds and SSR fills it at request time.
- If the env var is missing, add it in Vercel → Project → Settings →
  Environment Variables. Then redeploy.

For signature D (timeout):

- Bisect by reverting recent commits until the build speeds back up.
- If a dependency install is the culprit, inspect the webpack bundle
  analyzer and remove the offending import.

### Step 6 — Verify in a preview deploy

Before merging or pushing to main, open a PR against main and let Vercel
build the preview. Confirm it reaches READY before unpausing main
deploys.

### Step 7 — Unpause main deploys

In Vercel UI → Project → Settings → Git → clear the "Ignore Build Step"
command. Push the fix to main and watch the deploy reach READY.

### Step 8 — Verify on prod

```bash
# The version SHA should match your fix commit
curl -s https://smarter.poker/api/health | jq '.version'

# Spot-check a key route (Poker Near Me is fragile, check it)
curl -sI https://smarter.poker/hub/poker-near-me | head -5

# Club Arena SPA boots? (200 + correct content-type)
curl -sI https://smarter.poker/hub/club-arena/ | head -5
```

## Rollback

The rollback IS step 2 — promoting the last known-good Vercel deploy. If
you've already pushed a revert commit but the build is still failing on
the revert itself, promote the last good deploy again and investigate
offline — don't keep pushing commits in the hope that the next one will
build.

## Escalation

- If three consecutive pushes fail to build (even trivial ones), suspect
  a Vercel-side issue: open a ticket at https://vercel.com/help and page
  the engineering lead.
- If build times are universally slow but not failing, check
  https://status.vercel.com — Vercel's own build infrastructure has had
  regional slowdowns.

## Postmortem

Required if:

- Two or more chained failures shipped to main (cascade pattern).
- Prod was degraded for > 5 minutes.
- The root cause was a missing pre-merge check that should have caught
  it (e.g., husky hook not installed locally, CI skipped).

Include in the postmortem: the signature class (A/B/C/D), whether the
pre-push hook or CI caught it (it should have), and what guardrail is
being added so this specific signature can't recur.
