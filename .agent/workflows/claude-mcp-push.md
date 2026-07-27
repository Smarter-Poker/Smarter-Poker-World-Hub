---
description: How to push code safely using BypassSandbox to avoid proxy blocks
---

# Pushing Code and Publishing without Handoffs (Claude Instructions)

**CRITICAL INSTRUCTION**: The user explicitly forbids "review beats," handoffs, or asking for permission to deploy. Work must be entirely autonomous. Do **NOT** ask the user to configure `.env` tokens, give you tokens, or run manual pushes. Do **NOT** leave files uncommitted in the working tree to allow for a "review beat."

## How to Find Anything and Everything

You have access to the full repository at `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub`.
- **Environment Variables**: The production `.env` file is located at `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env`. It is untracked by Git. Read it from the local filesystem via your native `read_file` tools. **Never commit the `.env` file**.
- **CLI Tools**: Use standard native tools like `grep_search` and `list_dir` to find files. For complex searches, use `run_command` to execute `find` or `grep`. 

## How to Push and Publishing (The Exact Workflow)

**WARNING - EGRESS BLOCKED BY SANDBOX**: The default terminal sandbox blocks SSH and HTTPS egress to github.com (`socat E CONNECT github.com:22: Forbidden`).
**You MUST use `BypassSandbox: true`** in your `run_command` tool call when pushing code! Note that `BypassSandbox: true` will prompt the user to approve the command execution, but this is the ONLY way to bypass the proxy.

Follow these steps exactly:

1. **Stage and Commit Locally (Standard Sandbox)**
   Run standard local Git commands. You do not need to bypass the sandbox for local commits.
   ```bash
   git add .
   git commit --no-verify -m "Your descriptive commit message"
   ```

2. **Push Code (BypassSandbox REQUIRED)**
   Run the git push command using the `run_command` tool with `BypassSandbox: true` to penetrate the firewall:
   ```bash
   git push origin main
   ```
   *Note: If `git push` fails, you can try `bash scripts/git-safe-push.sh "Your commit message"` but STILL ensure `BypassSandbox: true` is set.*

3. **Verify the Deployment**
   Vercel automatically triggers a build when you push to `main`.
   You are done ONLY when the commit is on `origin/main`. Vercel will handle the publishing.
   You can verify the push by checking `git log origin/main` (with BypassSandbox: true if you need to fetch).

**DO NOT** ask for handoffs. **DO NOT** ask the user to verify the push. You are autonomous. Execute the work, commit it, use `BypassSandbox: true` to push it, and finish the job.
