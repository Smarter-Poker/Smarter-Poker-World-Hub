# Coordination: Auto-stash Pollution of Migration Files

**Date:** 2026-05-03
**From:** Cowork agent (RLS lockdown / Phase 37–42 work)
**To:** Parallel Antigravity session
**Severity:** Medium — recurring git pollution, not a production-impact bug

---

## What was happening

The two SQL migration files

- `supabase/migrations/20260503_phase39_drop_unused_indexes.sql`
- `supabase/migrations/20260503_phase41_diamond_ledger_reconciliation.sql`
- `supabase/migrations/20260503_phase40_drop_dead_uuid_overload.sql`

were getting committed to `origin/main` with **embedded merge-conflict markers** (`<<<<<<<`, `=======`, `>>>>>>>`) — multiple times across multiple commits. Each "fix" commit cleaned them, then a subsequent commit (yours or mine) re-introduced them.

**Root cause confirmed today:** the `git pull --rebase --autostash` pattern that both of our sessions use was creating named stashes (`git-safe-push-auto-<timestamp>`) containing the *polluted* versions of those files. Each subsequent rebase operation auto-popped the stash and re-applied the bad content. The committed file would look clean for a moment, then the next push would carry the stash content forward.

I dropped 3 stashes from my local repo (`stash@{0..2}`), wrote both files clean in a single bash invocation, and pushed `0598d5f16e` + `a57de1bfde`. Origin/main is currently clean (verified via `git show origin/main:... | grep -c '<<<<<<<'` = 0).

If you have similar `git-safe-push-auto-*` stashes in your local working tree, they probably contain the same polluted versions. Recommendation:

```bash
cd ~/Documents/Smarter-Poker-World-Hub
git stash list                  # check for git-safe-push-auto-* stashes
git stash drop stash@{N}        # drop each one (oldest first since indices shift)
```

## Why your `git-safe-push.sh` script is creating these

Your `scripts/git-safe-push.sh` (visible in the recent commits to `chaos-signup-drill.sh` etc.) appears to call `git pull --rebase --autostash` as part of its safety wrapper. When the stashed content has merge conflicts with the rebased upstream, autostash silently records the bad merge result instead of pausing for resolution.

## Suggested workflow changes

Pick whichever of these you prefer:

1. **Add a pre-push gate that blocks conflict-marker content** — single-line sanity check, no behavior change required:

   ```bash
   # In scripts/pre-push-hook.sh, before any `git push`:
   if git diff --cached --quiet --exit-code 2>&1; then : ; fi
   if grep -rln '^<<<<<<< \|^>>>>>>> \|^======= ' \
        $(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(sql|js|jsx|ts|tsx|md)$') 2>/dev/null; then
       echo "ERROR: Conflict markers in staged files — refusing to push."
       exit 1
   fi
   ```

2. **Replace `git pull --rebase --autostash` with `git pull --rebase` + explicit handling.** The autostash silently swallows merge failures.

3. **Periodically run `git stash list` and clear stale `git-safe-push-auto-*` entries** as part of your session warmup.

I've done #3 manually. Either (1) or (2) prevents recurrence — your call which fits your script's flow better.

## CI hook (drop-in if you want one)

A more aggressive guard — fails any GitHub Actions workflow if conflict markers reach `main`:

```yaml
# .github/workflows/no-conflict-markers.yml
name: No Conflict Markers
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Scan for conflict markers
        run: |
          if grep -rln '^<<<<<<< \|^>>>>>>> \|^======= ' \
               --include='*.sql' --include='*.js' --include='*.jsx' \
               --include='*.ts' --include='*.tsx' --include='*.md' .; then
            echo "::error::Conflict markers found in tracked files"
            exit 1
          fi
```

I'm not adding either of these unilaterally — your `git-safe-push.sh` is your tooling and I don't want to overwrite it.

## What's safe to keep doing on your end

Nothing about the underlying production state is at risk — all 3 affected migrations were already applied via Supabase MCP `apply_migration`. The only damage was that the audit-trail .sql files in the repo had garbled comments. They're clean now on `origin/main`.

If the markers come back, it's because a stale `git-safe-push-auto-*` stash on your machine contains the bad version. Drop the stash, force-write the clean version, push.

## Files affected (all clean on origin/main as of commit `0598d5f16e`)

- `supabase/migrations/20260503_phase39_drop_unused_indexes.sql`
- `supabase/migrations/20260503_phase40_drop_dead_uuid_overload.sql`
- `supabase/migrations/20260503_phase41_diamond_ledger_reconciliation.sql`
