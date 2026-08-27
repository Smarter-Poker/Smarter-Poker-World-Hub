# Pre-push TypeScript baseline isolation audit

Date: 2026-08-27
Scope: `scripts/hooks/pre-push-js-safety.sh`, Check 10

## Finding

The TypeScript regression check ran `git stash` followed by `git stash pop` while attempting to calculate the remote baseline. Git stashes are shared by every worktree in the repository. When the checkout being pushed was clean, `git stash` created nothing and the unconditional pop applied the repository's existing top stash, which belonged to unrelated work. The same block also used Bash process substitution even though Husky can execute hooks through a shell wrapper.

## Impact

- A clean pre-push check could contaminate its own isolated worktree with another branch's changes.
- The resulting conflicts could block the release and put unrelated work at risk.
- Shell parsing could fail before the comparison, allowing the check to report an invalid result.

Two affected isolated worktrees were preserved for recovery and were not reset, cleaned, or deleted.

## Resolution

- Build the remote TypeScript baseline in a temporary detached worktree with hooks disabled.
- Reuse the installed dependency directory through a symlink without mutating it.
- Remove the temporary worktree after the baseline check.
- Fail closed when a baseline cannot be created.
- Replace process substitution with a portable exact-line comparison.
- Add a regression test that prohibits executable stash operations and process substitution in the hook.

## Verification

- `bash -n scripts/hooks/pre-push-js-safety.sh`
- `sh -n scripts/hooks/pre-push-js-safety.sh`
- `node --test __tests__/pre-push-typescript-baseline-safety.test.mjs`
- Normal verified `git push` (no hook bypass)
