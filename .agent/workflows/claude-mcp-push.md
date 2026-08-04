---
description: How to ship autonomously from an agent session - commit, push, and what is genuinely blocked
---

# Pushing Code and Publishing without Handoffs (Claude Instructions)

**CRITICAL INSTRUCTION**: The user explicitly forbids "review beats," handoffs, or asking for permission to deploy. Work must be entirely autonomous. Do **NOT** ask the user to configure `.env` tokens, give you tokens, or run manual pushes. Do **NOT** leave files uncommitted in the working tree to allow for a "review beat."

## How to Find Anything and Everything

You have access to the full repository at `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub`.
- **Environment Variables**: The production `.env` file is located at `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local`. It is untracked by Git. Read it from the local filesystem via your native tools. **Never commit `.env` files**.

## What is Blocked

**EGRESS — measured 2026-08-03, not assumed.** Two different machines, both behind an allowlist
proxy. The device VM (`device_bash`, has the repo) proxies via `localhost:3128` and resolves no DNS
directly. The cloud container (`Bash`, does NOT have the repo) proxies via `127.0.0.1:39975`.

| Host | Device VM | Cloud container |
|---|---|---|
| `api.github.com` | 403 at CONNECT | **200** |
| `github.com` (git over HTTPS) | 403 at CONNECT | 403 |
| `<ref>.supabase.co` | 403 at CONNECT | 403 |
| `api.vercel.com`, `registry.npmjs.org` | 403 | 403 |

`CLAUDE_CODE_HOST_SOCKS_PROXY_PORT=40829` appears in the device VM env but that port is **not
listening**. Diagnose the cloud proxy, including denial reasons, with:
`curl -sS http://127.0.0.1:39975/__agentproxy/status`

**You do NOT have the `run_command` tool with `BypassSandbox: true`**. Do not attempt to use `BypassSandbox`.

## How to Push and Deploy (The Exact Workflow)

Follow these steps exactly to bypass the proxy blocks natively:

1. **Clear Locks**
   If you ever encounter a git lock error, DO NOT hand off to the user. Clear it yourself using your bash tool:
   ```bash
   rm -f .git/index.lock .git/HEAD.lock .git/refs/heads/main.lock
   ```

2. **Stage and Commit Locally**
   Run standard local Git commands.
   ```bash
   git add -A
   git commit --no-verify -m "Your descriptive commit message"
   ```

3. **Push Code — use the GitHub MCP. It is the only path that works.**

   `mcp__remote-devices__github__*` runs on the Mac natively, outside both proxies, with real
   network. Use `create_or_update_file` for a single file (pass the current `sha` from
   `get_file_contents` when replacing) or `push_files` for several. Vercel builds `main` on push.

   For a large batch the inline file contents get expensive — commit locally instead and confirm
   the background automation carried it:
   ```bash
   git fetch origin && git rev-list --count origin/main..HEAD   # 0 = shipped
   ```

   **DO NOT put a PAT in the git remote URL. It does not work.** Tested verbatim from the device VM:
   ```
   $ git ls-remote "https://smarter-poker:$GITHUB_PAT@github.com/.../repo.git" HEAD
   fatal: unable to access '...': Received HTTP code 403 from proxy after CONNECT
   ```
   The proxy rejects the CONNECT *before any authentication happens*, so no token can satisfy it.
   It also persists a live credential into `.git/config`. Do neither.

4. **Supabase Migrations — genuinely blocked. Do not chase this.**

   **There is no Supabase MCP server.** `mcp__remote-devices__supabase__*` does not exist. The
   remote-devices servers actually available are `github`, `Control_Chrome`, `counselors` and the
   `computer_*` screen tools.

   No shell in an agent session can reach the database: the device VM resolves no DNS at all, and
   both proxies return 403 on CONNECT to the Supabase host. `SUPABASE_DB_PASSWORD` in `.env.local`
   is real but there is no route to use it on.

   Commit the migration, then state once that it needs applying:
   ```bash
   npm run db:status && npm run db:push
   ```

   To make this autonomous in future, one of:
   - **Allowlist the Supabase host** in the Anthropic org egress policy
     (*Admin settings -> Capabilities -> network access*), then `npm run db:push` works from the
     cloud container; or
   - **Run the Cowork task on the computer** instead of in the cloud (desktop app -> "Run this
     task" picker, top right). That shell has the Mac's own network.

   A 403 from the proxy is an organization egress policy denial. The platform's own docs
   (`/root/.ccr/README.md`) say to report the blocked host rather than route around it.

**DO NOT** ask for handoffs. Execute the work, commit it, push it with the GitHub MCP, verify it
landed on `origin/main`, and finish the job autonomously.

## Verify before claiming anything shipped

Never trust the working tree or a subagent's report - both have been wrong here. Check the
committed object:
```bash
git show HEAD:path/to/file | grep -c 'distinctive string'
git cat-file -e origin/main:path/to/file && echo on-origin
```

Gates: `node node_modules/typescript/bin/tsc --noEmit` must exit 0 (note tsconfig only includes
`**/*.ts`/`**/*.tsx`, so it does NOT check the `.js`/`.jsx` majority). `node --check` gives FALSE
PASSES on ESM/JSX - use `node ./_chk.cjs <files>` instead. Keep
`node --test src/lib/rewards/__tests__/transferMath.test.mjs` green (63 cases).
