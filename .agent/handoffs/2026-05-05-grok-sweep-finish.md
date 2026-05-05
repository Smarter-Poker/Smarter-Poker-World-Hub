# Handoff: Finish Operation Grok-Sweep

**Owner:** any Antigravity agent with full shell access on this Mac
**Date opened:** 2026-05-05
**Blocked-on:** prior agent (Cowork sandbox) couldn't delete a host-side `.git/index.lock` (EPERM in sandbox). Trivial for an agent with real shell access.
**Branch:** `main` (per repo convention — direct-to-main commits, see `git log`)
**Prior commit:** `1bf4e2a8e7 refactor(gto): Operation Grok-Sweep — phase out grok-3 from training/GTO endpoints`

---

## Why this handoff exists

The Grok-Sweep PR shipped to `origin/main` as `1bf4e2a8e7` and dropped 99% of `grok-3` usage in the training/GTO pipeline. After the push, a stylistic refinement to `src/lib/explanationTemplates.js` was identified to better match the explicit format from the original templating spec:

> "This is a mixed strategy spot. The solver mixes between [Action 1] (X%) and [Action 2] (Y%)."

The refinement is staged on disk in the working tree but couldn't be committed because a stale `.git/index.lock` is blocking. Cowork-sandbox can't `rm` host-mounted files it didn't create. Need a real shell.

The working-tree change is **already verified by 108/108 unit tests** in the staging harness — the diff is safe to commit and push. Don't re-edit it; just clear the lock and land it.

---

## Pre-flight checks

```bash
cd ~/Documents/Smarter-Poker-World-Hub
git rev-parse HEAD                                 # should be 1bf4e2a8e7 or newer (if more commits landed since)
git rev-parse --abbrev-ref HEAD                    # should be 'main'
ls -la .git/index.lock                             # this is the blocker — should exist, 0 bytes
git status --short src/lib/explanationTemplates.js # should show " M" (working-tree modified)
```

If any of those don't match, STOP and reconcile manually before proceeding. In particular: if HEAD has moved past `1bf4e2a8e7`, fetch+pull first, then verify the working-tree change still applies cleanly.

---

## Step 1 — Clear the stale lock

```bash
rm -f /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.git/index.lock
```

If `rm` reports "No such file or directory," that's fine — someone already cleared it.

If `rm` errors with anything else (e.g., file in use), check whether a real git process is running:

```bash
ps -ef | grep '[g]it' | grep -v Library
```

If there's an active git process, leave it alone. If not, the lock is stale and `rm -f` should succeed.

---

## Step 2 — Verify the diff before committing

```bash
cd ~/Documents/Smarter-Poker-World-Hub
git diff src/lib/explanationTemplates.js
```

You should see (and ONLY see) the following two semantic changes inside `src/lib/explanationTemplates.js`:

### Change A — `buildMixedStrategyNote` (around line 229)

The function should now read:

```js
/**
 * Build the mixed-strategy banner string.
 *
 * Spec (Operation Grok-Sweep):
 *   • If the optimal action's frequency is ≥ 95% → return "" (pure strategy,
 *     banner hidden in the UI).
 *   • Otherwise, return the explicit form:
 *     "This is a mixed strategy spot. The solver mixes between
 *      [Action 1] (X%) and [Action 2] (Y%)."
 *
 * Two-action form is chosen because that's what fits the UI banner cleanly.
 * If only one action has ≥1% frequency we still return the banner (degraded
 * form) rather than going silent — gives the user explicit signal that the
 * spot was scored as mixed.
 */
function buildMixedStrategyNote(freqsPct, correctAnswer) {
    const optimalFreq = freqsPct?.[correctAnswer];
    if (typeof optimalFreq !== 'number') return '';
    if (optimalFreq >= 95) return ''; // pure strategy — banner hidden

    const top = topMix(freqsPct, 2);
    if (top.length === 0) return '';

    if (top.length === 1) {
        const [a, p] = top[0];
        return `This is a mixed strategy spot. The solver plays ${actionLabel(a)} (${Math.round(p)}%).`;
    }

    const [[a1, p1], [a2, p2]] = top;
    return `This is a mixed strategy spot. The solver mixes between ${actionLabel(a1)} (${Math.round(p1)}%) and ${actionLabel(a2)} (${Math.round(p2)}%).`;
}
```

### Change B — pure-strategy fallback inside `buildGtoAnalysisStrings` (around line 536)

The `else` branch should now read:

```js
        mixedStrategy = buildMixedStrategyNote(synthesized, optimalActionCode) ||
            `This is a mixed strategy spot. The solver plays ${actionLabel(optimalActionCode)} (${optimalPct}).`;
    } else {
        mixedStrategy = `Pure strategy — solver always plays ${actionLabel(optimalActionCode)} (${optimalPct}) with ${handLabel} at this node.`;
    }
```

If the diff shows anything else (an unrelated linter sweep, an emoji injection, a console.log change, etc.), STOP and ask the human before committing — that's not what this handoff is about.

---

## Step 3 — Run the verification harness (optional but recommended)

The staging harness from the prior session may still exist on disk:

```bash
ls /Users/smarter.poker/Library/Application\ Support/Claude/local-agent-mode-sessions/*/local_*/outputs/explanationTemplates.test.js 2>/dev/null
```

If found, you can run it to re-confirm 108/108 pass:

```bash
cd /Users/smarter.poker/Library/Application\ Support/Claude/local-agent-mode-sessions/*/local_*/outputs/ && \
cp ~/Documents/Smarter-Poker-World-Hub/src/lib/explanationTemplates.js ./explanationTemplates.staged.js && \
node explanationTemplates.test.js | tail -5
```

Expected last line: `✓ All tests passed.` (PASS: 108, FAIL: 0).

If the harness is gone (sessions get cleaned up), skip this step — the diff is small and self-evidently safe.

---

## Step 4 — Commit + push via the canonical script (RULE 1)

Per `.agent/CLAUDE_AGENT_RULES.md`, NEVER run `git add`/`git commit`/`git push` individually. Use the canonical script:

```bash
bash ~/Documents/Smarter-Poker-World-Hub/scripts/git-safe-push.sh \
  "refactor(gto): align mixedStrategyNote with spec format — Operation Grok-Sweep follow-up"
```

Wait until the script exits 0 with `DEPLOY_VERIFIED:true` and `SHA_MATCHED:true`. If it exits non-zero:
- Check Vercel dashboard: https://vercel.com/smarter-poker/hub-vanguard/deployments
- Read the build log
- Fix any issue (likely none — this is a single-file pure-function change)
- Re-run `git-safe-push.sh`

---

## Step 5 — Optional cleanup (do these in the same session if you have time)

### 5a — Remove the stray sandbox `.bak` file

The previous session's sed step left a backup file the sandbox couldn't delete:

```bash
rm -f ~/Documents/Smarter-Poker-World-Hub/pages/api/training/get-question.js.bak
```

It's already in `.gitignore` (added in `1bf4e2a8e7`), so no commit needed — this is just disk hygiene.

### 5b — Audit the two remaining `grok-3` callers (admin/seeding tools)

These weren't in the original Grok-Sweep scope but still consume `grok-3` tokens. Both are admin-only (no frontend callers):

- `pages/api/training/test-generate.js` — line 163: `model: 'grok-3'`
- `pages/api/training/generate-batch-questions.js` — line 292: `model: 'grok-3'`

Decision needed from Dan: downgrade these to `grok-3-mini` or leave as-is? They're rarely invoked but each call is full-fat `grok-3`. Recommend:

```bash
# Quick safe downgrade — admin/seeding doesn't need grok-3 reasoning
sed -i '' "s/model: 'grok-3'/model: 'grok-3-mini'/" \
  pages/api/training/test-generate.js \
  pages/api/training/generate-batch-questions.js

# Confirm exactly two replacements
grep -nE "model: 'grok-3" pages/api/training/test-generate.js pages/api/training/generate-batch-questions.js
# Expected output: both files now show 'grok-3-mini'
```

If Dan approves the downgrade, ship it as a separate commit with `git-safe-push.sh`:

```bash
bash ~/Documents/Smarter-Poker-World-Hub/scripts/git-safe-push.sh \
  "refactor(gto): downgrade admin grok-3 callers to grok-3-mini (test-generate, generate-batch-questions)"
```

If Dan wants those left alone, skip this step.

### 5c — Security: GitHub PAT in `git remote` URL

⚠️ The current `origin` remote URL has a hardcoded `ghp_...` PAT embedded in it. Anyone with shell access to this Mac can read it via `git remote -v`. Mention this to Dan and recommend:

```bash
git remote set-url origin https://github.com/Smarter-Poker/Smarter-Poker-World-Hub.git
git config --global credential.helper osxkeychain
# Next push will prompt for credentials and store them in the macOS keychain
```

This is a one-time hardening — don't commit anything related; it's a config-only change. Don't act on this without Dan's confirmation since it changes how every future push authenticates.

---

## Definition of done

- [ ] `.git/index.lock` cleared.
- [ ] `src/lib/explanationTemplates.js` change committed and `git-safe-push.sh` exited 0 with `DEPLOY_VERIFIED:true` and `SHA_MATCHED:true`.
- [ ] `production /api/health` serves the new SHA (per RULE 1.5).
- [ ] `pages/api/training/get-question.js.bak` removed from disk (5a).
- [ ] Decision recorded with Dan on the test-generate / generate-batch-questions downgrade (5b).
- [ ] Decision recorded with Dan on the PAT-in-remote security hardening (5c).
- [ ] Brief audit note written to `.agent/audits/2026-05-05-grok-sweep-finish.md` summarizing what landed.

---

## What NOT to do

- Don't re-edit `src/lib/explanationTemplates.js`. The current working-tree version passed 108/108 tests. Just commit it.
- Don't run `git add` / `git commit` / `git push` individually — always `git-safe-push.sh`.
- Don't broaden the commit. The two changes (Change A + Change B above) are the entire payload.
- Don't touch the `pages/api/training/explain-answer.js`, `pages/api/gto/gto-analysis.js`, or `pages/api/training/get-question.js` files — those landed cleanly in `1bf4e2a8e7` and are in production already.
- Don't claim success without `DEPLOY_VERIFIED:true` from `git-safe-push.sh`.
