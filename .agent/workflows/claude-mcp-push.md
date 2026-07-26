---
description: How to push code without a local network route using GitHub MCP
---

# Pushing Code without Network Access (Claude Instructions)

If you are running in an environment (like Claude Desktop or a cloud container) where you do not have a direct network route to run `git push` via the local shell, you **must not ask for handoffs**. You are fully capable of pushing code yourself.

## Text and Code (The Solution: GitHub MCP)

For text files, config, and code changes:
1. Use the **GitHub MCP** tools provided in your environment (`create_or_update_file`, `push_files`, etc.).
2. The GitHub MCP server is running natively on the local machine, is **already authenticated**, and has network access. It can push directly to the repository via the GitHub API.

## Binary Assets (The Solution: Local Commits + Auto-Push)

For binary assets (e.g., `.webp`, `.png` files) where the base64 encoding ceiling of the GitHub MCP tools blocks you:
1. Write the binary files to the local disk.
2. Run standard local Git commands to stage and commit the files:
   `git add <files>`
   `git commit -m "your message"`
   **Note**: If a permission request is required to run git commands, you MUST ask for permission for the entire repo root (`/Users/smarter.poker/Documents/Smarter-Poker-World-Hub`) rather than the specific subdirectory. A subdirectory grant creates a mount boundary that prevents git from discovering the `.git` directory, causing commands to fail silently. Also ensure you use explicit paths for `git add` rather than `-A` to avoid capturing unrelated work.
3. **DO NOT attempt to `git push`.** A concurrent `git-safe-push-auto` cron process runs natively on the Mac. It will automatically detect your local commits and push them to GitHub. This bypasses both the MCP encoding ceiling and your sandbox's network block.

Do not ask the user to configure `.env` tokens, give you tokens, or run manual pushes for you. Use the GitHub MCP for text, and rely on the local `git-safe-push-auto` background process to push local commits containing binaries.

## NO "REVIEW BEATS" OR HANDOFFS ALLOWED
Do NOT leave files uncommitted in the working tree to allow for a "review beat." The user explicitly does NOT want manual review gates, handoffs, or deploy prompts. 
Because the local environment is managed by autonomous agents, an automated `git reset --hard origin/main` loop runs between sessions. If you leave your work uncommitted, it WILL be permanently destroyed. 

**For ALL changes (text or binary):** You MUST commit your changes locally before concluding your response. Once committed, the `git-safe-push-auto` background process will push and deploy them to production automatically. You are fully authorized to deploy to production without waiting for the user.


## Run commands on the MAC, not in your cloud container

If you are a Cowork/cloud agent you have TWO shells. They are different
machines and they do NOT share a filesystem:

| Tool | Runs on | Network | Sees the repo? |
|---|---|---|---|
| your container shell (`bash`) | Anthropic cloud sandbox | yes, but NO GitHub enrollment / no route to this repo's remotes | no — only files you staged into it |
| `device_bash` (remote-devices MCP) | the user's Mac | **no network** | **yes** — `mnt/Smarter-Poker-World-Hub` |
| GitHub MCP (`github__*`) | the user's Mac | **yes, authenticated** | pushes via the GitHub API |

Consequences:

- Edit repo files with `device_bash` (or the file tools against the mounted
  path). Editing a copy inside your container changes nothing on the Mac.
- Never conclude "I cannot push" because your container shell failed. Your
  container was never the right shell. Use the GitHub MCP.
- `device_bash` cannot delete files. `rm` fails with "Operation not
  permitted". It also cannot remove `.git/index.lock` after a git command —
  **move the stale lock aside (`mv .git/index.lock .git/index.lock.stale`)
  before and after any git operation**, or the next git command (and the
  `git-safe-push-auto` cron) will be blocked by it.

## Where the environment variables live

Production env vars are on the Mac at:

```
/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env
```

It is untracked by design, so the GitHub API and any repo listing will not
show it. Read it from the local filesystem via `device_bash`. Do not ask
the user to paste tokens, and never commit the file.

## Definition of done

You are done when the commit is on `origin/main` AND a production
deployment containing it is `READY`. Verify with the Vercel MCP
(`list_deployments` on project `hub-vanguard`) and `git merge-base
--is-ancestor <your-sha> <deployed-sha>`. "Pushed" is not "deployed", and
"documented" is not "shipped".
