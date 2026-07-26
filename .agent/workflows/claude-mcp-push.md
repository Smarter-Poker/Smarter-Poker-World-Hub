---
description: How to push code without a local network route using GitHub MCP
---

# Pushing Code without Network Access (Claude Instructions)

If you are running in an environment (like Claude Desktop or a cloud container) where you do not have a direct network route to run `git push` via the local shell, you **must not ask for handoffs**. You are fully capable of pushing code yourself using the GitHub MCP server.

## The Solution: GitHub MCP

The GitHub MCP server is running on the local machine and is **already authenticated** independently of any personal tokens. It has network access and can push directly to the repository via the GitHub API.

When you need to commit and push changes but your terminal `git push` fails due to network issues:

1. Use the **GitHub MCP** tools provided in your environment.
2. Use tools like `create_or_update_file` or create a branch/pull request if required.
3. If you have a bulk file change, use the available GitHub MCP batch/commit tools to commit and push the changes directly to `Smarter-Poker/Smarter-Poker-World-Hub` on the `main` branch.

Do not ask the user to configure `.env` tokens, give you tokens, or run manual pushes for you. Just route your file changes through the authenticated `github` MCP server.
