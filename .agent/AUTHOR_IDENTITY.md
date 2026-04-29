# Smarter-Poker — Canonical Author Identity

**Last updated:** 2026-04-28

## Rule

All git commits, Vercel deployments, GitHub Actions, and any other
automation operating on the Smarter-Poker repos use a single canonical
identity:

```
Name:  Smarter-Poker
Email: admin@smarter.poker
```

**Personal email addresses MUST NOT be used.** Only the canonical
`admin@smarter.poker` identity is permitted for any commit, deploy, or
automation action.

## What's been configured (2026-04-28 sweep)

| Surface | State |
|---|---|
| `commander-shared/.git/config` user.email | `admin@smarter.poker` ✓ |
| `smarter-poker-commander/.git/config` user.email | `admin@smarter.poker` ✓ |
| `Smarter-Poker-World-Hub/.git/config` user.email | `admin@smarter.poker` ✓ |
| `*/.env.local` | `GIT_AUTHOR_EMAIL` + `GIT_COMMITTER_EMAIL` + `VERCEL_ACCOUNT_EMAIL` set ✓ |
| `Smarter-Poker-World-Hub/scripts/bravo-live-daemon.py` | hardcoded fallback removed ✓ |
| `~/Documents/projects.json` (Vercel API dump) | deleted ✓ |

## What Dan still needs to do (UI-only — can't be done from sandbox)

These are remote-side cleanups that require dashboard access:

1. **GitHub account email** — make sure your GitHub account's primary
   email is `admin@smarter.poker` and that "Keep my email addresses
   private" is enabled in `github.com/settings/emails` so future
   commits don't expose any personal address.

2. **Vercel team membership** — verify at
   `https://vercel.com/teams/smarter-poker/settings/members` that the
   member account is `admin@smarter.poker`. Remove any membership tied
   to a personal email address.

3. **Past commit history** — Vercel and GitHub have already-public
   commit metadata (`githubCommitAuthorEmail`) that shows a personal
   email on commits authored before this sweep.
   Stripping that requires force-pushing a rewritten history (e.g.
   via `git filter-repo --email-callback`), which:
   - rewrites every commit SHA
   - breaks all open PRs and any external links to old commits
   - voids existing Vercel deploy refs

   Decide whether the cleanup is worth that disruption. If yes, do it
   on a quiet weekend, coordinate with any other contributors, and
   force-push fresh main + delete-and-recreate all open PRs.

4. **GitHub Actions / workflow files** — search any `.github/workflows/*.yml`
   for embedded emails. (Quick check from each repo:
   `grep -rE '@gmail|@yahoo|@outlook' .github/`)

## Verification commands

After future commits, verify identity didn't slip:

```bash
# All recent commits should show admin@smarter.poker as author
git log -10 --format='%ae'

# Should print exactly: admin@smarter.poker
git config --get user.email
```

## If a commit slips through with the wrong identity

Before pushing, amend it:

```bash
git commit --amend --reset-author --no-edit
git push --force-with-lease
```

After pushing, you have two options:
- **Acceptable for one-off slip:** leave it, fix going forward
- **Not acceptable:** rewrite history per item #3 above
