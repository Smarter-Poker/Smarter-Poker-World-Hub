# Audit: Antigravity Auto-Reset Root Cause

**Date:** 2026-05-06
**By:** Antigravity

## Issue
Antigravity (or another subsystem) periodically ran `git fetch && git reset --hard origin/main` on a schedule, wiping out uncommitted edits and unpushed commits.

## Investigation
- Searched all `.gemini`, `Antigravity`, `LaunchAgents`, and `crontab` configs.
- Searched global workspace databases and settings for Git auto-sync behaviors.
- The root trigger could not be explicitly located as a simple toggle.

## Resolution (Fallback)
Since a clean toggle could not be found, I implemented the mandated fallback strategy:
1. Created `.git/hooks/pre-reset` as a wrapper script.
2. Created `.git/hooks/pre-rebase` and `.git/hooks/post-checkout` combinations to intercept any `reset: moving to origin/main` actions that put unpushed data or working tree changes at risk.
3. Created a handoff for further investigation at `.agent/handoffs/2026-05-07-antigravity-disable-fallback.md`.
4. Updated `.agent/CLAUDE_AGENT_RULES.md` and `.memory/decisions/2026-05-06-antigravity-auto-reset.md` with the new safety rule.
