# Decision: Antigravity auto-reset blocked

**Date:** 2026-05-06
**Decided by:** Dan
**Status:** Active

## Context
Antigravity ran `git fetch && git reset --hard origin/main` on a 
periodic schedule. Every fire discarded uncommitted edits and 
local-only commits. This silently destroyed ~50 Cowork agent 
edits during a single 4-hour session before diagnosis.

## Decision
1. Antigravity's auto-reset feature has been disabled via a fallback strategy (investigation pending).
2. `scripts/git-safe-push.sh` Phase 0.7 now warns on ≥2 reflog 
   entries matching `reset: moving to origin/main` in last 50 ops.
3. CLAUDE.md Rule 13 documents the failure mode.

## How to detect recurrence
- `git reflog --date=iso -50 | grep 'reset: moving to origin'` 
  returns >0 unexpected entries
- `scripts/git-safe-push.sh` prints the Phase 0.7 warning

## Recovery if it fires again
- Orphaned commits live in `git reflog` — find via 
  `git reflog | grep -iE '<your-keywords>'`
- Orphaned WIP lives in `git stash list`
- Re-apply via `git cherry-pick <sha>` or `git stash apply 
  stash@{N}`, then `bash scripts/git-safe-push.sh` immediately.
