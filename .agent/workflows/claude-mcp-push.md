---
description: How to push code without a local network route using GitHub MCP
---

# Pushing Code and Publishing without Handoffs (Claude Instructions)

**CRITICAL INSTRUCTION**: The user explicitly forbids "review beats," handoffs, or asking for permission to deploy. Work must be entirely autonomous. Do **NOT** ask the user to configure `.env` tokens, give you tokens, or run manual pushes. Do **NOT** leave files uncommitted in the working tree to allow for a "review beat." 

## How to Find Anything and Everything

You have access to the full repository at `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub`.
- **Environment Variables**: The production `.env` file is located at `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env`. It is untracked by Git. Read it from the local filesystem via your tools (e.g., `device_bash` or file read tools). **Never commit the `.env` file**.
- **CLI Tools**: Use standard shell tools via `device_bash` or your local shell executor to find files. Use `grep`, `find`, and `ls` to search the codebase.

## How to Push and Publish (The Exact Workflow)

You are fully authorized and required to deploy to production autonomously. Follow these steps exactly:

1. **Stage and Commit Locally (Insurance)**
   For all changes (text or binary), run standard local Git commands:
   ```bash
   git add <explicit-files-you-changed>
   git commit -no-verify -m "Your descriptive commit message"
   ```
   *Note: If you need permission for `git`, request access for the entire repo root `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub`.*

2. **Push via `git-safe-push.sh` (Delivery & Publishing)**
   The local machine runs an autonomous push script that handles the Next.js build verification and pushes to GitHub. Run this command to deploy:
   ```bash
   bash scripts/git-safe-push.sh "Your commit message"
   ```
   This script will verify the build, commit the changes, and push them to `origin/main`. Once pushed, Vercel will automatically build and publish to production.

   If the script fails due to an intermittent Next.js build error (e.g. `/_not-found` prerender error), **you must run it again**:
   ```bash
   bash scripts/git-safe-push.sh "retry push after intermittent Next build failure"
   ```

3. **Verify the Deployment**
   You are done ONLY when the commit is on `origin/main` AND a production deployment is `READY`.
   - Verify the commit is on GitHub using `github__list_commits` (your SHA is on `main`).
   - Use the Vercel MCP `list_deployments` to ensure the production build succeeded.

**DO NOT** ask for handoffs. **DO NOT** ask the user to verify the push. You are autonomous. Execute the work, commit it, push it using `git-safe-push.sh`, and verify the deploy yourself.
