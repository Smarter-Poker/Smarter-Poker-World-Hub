# HANDOFF: Fix GitHub Actions npm 401 for @smarter-poker/commander-shared

**Created:** 2026-04-29 by Cowork-Claude
**For:** Any agent with a GitHub PAT that has `workflow` scope on `Smarter-Poker/Smarter-Poker-World-Hub`
**Repo:** `Smarter-Poker/Smarter-Poker-World-Hub`
**Severity:** P1 — every CI run currently fails at "Install dependencies"; CHECK 7 cannot execute.

## 1. Goal

Make the `Build Safety Gate` GitHub Actions workflow successfully install
`@smarter-poker/commander-shared` (a private GitHub Packages npm package).
Currently `npm ci` 401's because `setup-node` is not configured with the
GitHub Packages registry + scope, and the install step has no
`NODE_AUTH_TOKEN`. Once fixed, CHECK 7 (and every other check) actually runs.

## 2. Required capabilities

- GitHub PAT with **`workflow`** scope on the repo (this bot's PAT only has `repo, write:packages, delete:packages`).
- If primary fix path fails (see step 4), Owner/Admin access to the repo to add an Actions secret.

If anything is missing, stop and emit your own handoff to a better-scoped agent.

## 3. Pre-conditions

- `origin/main` HEAD must include CHECK 7 already (commit `66dbd4689c` or later).
- `package.json` lists `@smarter-poker/commander-shared` as a dependency.
- `.npmrc` (committed) configures the scope:
  ```
  @smarter-poker:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=${NPM_TOKEN}
  ```

## 4. Steps

### 4a. Apply the workflow patch

Edit `.github/workflows/build-safety-gate.yml`. Find this block:

```yaml
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'

      - name: Install dependencies
        run: |
          npm ci --ignore-scripts 2>/dev/null || {
            echo "::warning::npm ci failed (lockfile sync issue) — falling back to npm install"
            npm install --ignore-scripts
          }
```

Replace with:

```yaml
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@smarter-poker'
          always-auth: true

      - name: Install dependencies
        env:
          # Primary: built-in GITHUB_TOKEN. It has read:packages on org-owned
          # packages by default IF the package's repo-access settings grant
          # this repo. If 401, fall back to NPM_TOKEN (see 4b).
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          npm ci --ignore-scripts 2>/dev/null || {
            echo "::warning::npm ci failed (lockfile sync issue) — falling back to npm install"
            npm install --ignore-scripts
          }
```

### 4b. Commit + push

```bash
cd /path/to/Smarter-Poker-World-Hub
git fetch origin main
git checkout main
git reset --hard origin/main
# (apply the edit from 4a here, manually or via patch)
git add .github/workflows/build-safety-gate.yml
git -c user.email="bot@smarter.poker" -c user.name="Smarter-Poker" \
  commit -m "ci(safety-gate): authenticate npm install for @smarter-poker GitHub Packages"
git push origin main
```

### 4c. Verify

Open the next workflow run at:
`https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/workflows/build-safety-gate.yml`

The "Install dependencies" step should succeed (no 401). All CHECK steps should run, including CHECK 7.

### 4d. Fallback if `GITHUB_TOKEN` still 401's

If "Install dependencies" still 401's after the patch:
- The package's repo-access settings don't grant the workflow's auto-token access.
- Two fix options, in order of preference:

**Option 1 — Grant the package access to this repo (no new secret needed)**

Visit `https://github.com/orgs/Smarter-Poker/packages/npm/commander-shared/settings`
(adjust path if package name differs). Under "Manage Actions access", add
`Smarter-Poker-World-Hub` with Read role. Re-run the failed workflow. Done.

**Option 2 — Add a fine-grained PAT as a repo secret**

Create a fine-grained PAT with `read:packages` scope on org `Smarter-Poker`,
no expiry or 12-month expiry. Add it as repo secret `NPM_AUTH_TOKEN`:

```bash
gh secret set NPM_AUTH_TOKEN \
  --repo Smarter-Poker/Smarter-Poker-World-Hub \
  --body "$NEW_TOKEN_VALUE"
```

Then update the env block in the workflow:

```yaml
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_AUTH_TOKEN }}
```

Push, verify install succeeds.

## 5. Rollback

If the change breaks installs in some other way:

```bash
git revert <SHA-of-this-commit>
git push origin main
```

State will return to "every build fails at install" — same as before this handoff. No worse, no better.

## 6. Hand-back

After verification:

1. Update `.memory/SUMMARY.md` (local-only) under "Solved problems":
   ```
   - 2026-04-29 — GitHub Actions npm 401 fixed (commit <sha>). build-safety-gate runs green again; CHECK 7 now executes.
   ```
2. Mark task `#69` (Fix GitHub Actions npm 401) as completed.
3. Delete this handoff file `.agent/handoffs/2026-04-29-fix-github-actions-npm-401.md` in the same commit as the verification.

## 7. References

- Workflow file: `.github/workflows/build-safety-gate.yml`
- Repo `.npmrc` (committed): `.npmrc`
- Operating rule: `.memory/decisions/2026-04-29-no-manual-human-work.md`
- Predecessor handoff (CHECK 7): `.agent/handoffs/2026-04-29-apply-ci-bucket-cap-guard.md` (deleted on completion)
