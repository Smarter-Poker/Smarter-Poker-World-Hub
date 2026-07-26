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
3. **DO NOT attempt to `git push`.** A concurrent `git-safe-push-auto` cron process runs natively on the Mac. It will automatically detect your local commits and push them to GitHub. This bypasses both the MCP encoding ceiling and your sandbox's network block.

Do not ask the user to configure `.env` tokens, give you tokens, or run manual pushes for you. Use the GitHub MCP for text, and rely on the local `git-safe-push-auto` background process to push local commits containing binaries.
