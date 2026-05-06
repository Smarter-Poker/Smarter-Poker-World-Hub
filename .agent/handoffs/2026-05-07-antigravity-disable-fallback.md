# Handoff: Antigravity Auto-Reset Disable Fallback

**Date:** 2026-05-07
**From:** Antigravity (Current Agent)

## Context
Antigravity (or a background agent subsystem) has been periodically running `git fetch && git reset --hard origin/main` on a session-start or wake event, wiping out uncommitted edits and local commits.

## What I Tried
- Searched all `.gemini` and `Antigravity` configuration files for `git reset` commands or related auto-sync toggles.
- Checked `~/.vscode/settings.json`, `~/.antigravity/argv.json`, and the global `state.vscdb` SQLite database.
- Examined `LaunchAgents` and `crontab` for any triggers.
- Explored implementing a `.git/hooks/pre-reset` script or Git alias, but `git` does not natively support aliasing built-in commands or firing a hook *before* a reset (only `post-checkout` fires, which is too late to prevent data loss).
- Explored a `pre-rebase` hook, but if the agent is running a direct `reset --hard`, the hook won't trigger.

## What Didn't Work
- No obvious toggle was found in the application configuration files.
- Modifying Git's built-in `reset` behavior via standard hooks/aliases is not supported without creating a shell wrapper in the `PATH` that intercepts the binary call, which may be brittle or bypassed depending on how the agent invokes Git.

## Next Agent's Plan
1. **Identify the exact invocation:** Monitor system processes to catch exactly how the `reset` command is invoked (e.g., via a specific extension script or Node.js process).
2. **Implement Shell Wrapper:** If the toggle cannot be found in the UI or configs, implement a robust wrapper script in `~/.local/bin/git` (ensuring it precedes `/usr/bin/git` in the `PATH`) that intercepts `git reset --hard origin/main` and aborts if there are unpushed commits or a dirty working tree.
3. **Check Extensions:** Deep dive into the `~/.antigravity/extensions` folder to see if a third-party extension is responsible for the background synchronization.
