---
description: How to ship autonomously from an agent session - commit, push, and what is genuinely blocked
---

# Pushing Code and Publishing without Handoffs (Claude Instructions)

**CRITICAL INSTRUCTION**: The user explicitly forbids "review beats," handoffs, or asking for permission to deploy. Work must be entirely autonomous. Do **NOT** ask the user to configure `.env` tokens, give you tokens, or run manual pushes. Do **NOT** leave files uncommitted in the working tree to allow for a "review beat."

## How to Find Anything and Everything

You have access to the full repository at `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub`.
- **Environment Variables**: The production `.env` file is located at `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local`. It is untracked by Git. Read it from the local filesystem via your native tools. **Never commit `.env` files**.

## What is Blocked

**EGRESS — measured 2026-08-03, re-measured 2026-08-05. Not assumed.** Two different machines, both
behind an allowlist proxy. The device VM (`device_bash`, has the repo) proxies via `localhost:3128`
and resolves no DNS directly. The cloud container (`Bash`, does NOT have the repo) proxies via
`127.0.0.1:39975`.

| Host | Device VM | Cloud container |
|---|---|---|
| `api.github.com` | 403 at CONNECT | **200** |
| `github.com` (git clone / fetch) | 403 at CONNECT | **200 — read works** |
| `github.com` (git push) | 403 at CONNECT | **403 at the git proxy** (see below) |
| `<ref>.supabase.co` | 403 at CONNECT | 403 |
| `api.vercel.com`, `registry.npmjs.org`, `smarter.poker` | 403 | 403 |

`CLAUDE_CODE_HOST_SOCKS_PROXY_PORT` appears in the device VM env but that port is **not listening**.
Diagnose the cloud proxy, including denial reasons, with:
`curl -sS http://127.0.0.1:39975/__agentproxy/status`

### The git-push denial is NOT the sandbox. Do not chase `BypassSandbox`.

Measured 2026-08-05 from the cloud container. `git clone` of this repo **succeeds**; `git push`
fails with:

```
remote: access denied by the git proxy: Smarter-Poker/Smarter-Poker-World-Hub is not in this
session's authorized repository set, so the proxy will not inject a credential for it.
To fix, add the repository to the session's sources.
fatal: ... The requested URL returned error: 403
```

Facts that follow from this, all tested:

- Re-running the identical push with the sandbox disabled (`dangerouslyDisableSandbox: true` on the
  `Bash` tool) returns the **byte-identical** denial. Sandbox state is irrelevant — the refusal is a
  server-side proxy policy decision about which repos this session may write to.
- There is **no `run_command` tool and no `BypassSandbox` argument** in this environment. Advice to
  "pass `BypassSandbox: true` and approve the prompt" does not apply here; there is nothing to
  approve. `device_bash` has no such option either.
- No token fixes it. The proxy denies before authentication, so a PAT in the remote URL cannot help
  (and would persist a live credential into `.git/config` — never do it).
- The same denial applies to every repo tested (`Smarter-Poker-Near-Me`, `club-arena`,
  `smarter-poker-workers`), so it is a session-wide setting, not repo-specific damage.

**The actual fix is to add the repository to the session's sources.** Once that is done, the cloud
container can clone, commit and `git push` normally — that is the only byte-exact, unlimited-size
push route.

## How to Push and Deploy (The Exact Workflow)

1. **Clear Locks**
   If you ever encounter a git lock error, DO NOT hand off to the user. Clear it yourself:
   ```bash
   rm -f .git/index.lock .git/HEAD.lock .git/refs/heads/main.lock
   ```
   Note: the `device_bash` mount cannot `unlink`. `rm` fails with "Operation not permitted", and so
   does `mv` of an existing file, and so does `tar -x` over files that already exist. To overwrite a
   file in place, truncate-and-write instead: `cat /tmp/new/<f> > <repo>/<f>`.

2. **Stage and Commit Locally**
   Other agents work in this repo concurrently. Do **not** `git add -A` — you will commit their
   half-finished work. Stage only your own paths through a private index so the shared one is never
   touched:
   ```bash
   export GIT_INDEX_FILE=/tmp/mine.index
   git read-tree HEAD
   while IFS= read -r f; do
     printf '%s %s\t%s\n' "$(git ls-files --stage -- "$f" | awk '{print $1}')" "$(git hash-object -w "$f")" "$f"
   done < /tmp/myfiles.txt | git update-index --index-info
   git commit-tree "$(git write-tree)" -p "$(git rev-parse HEAD)" < /tmp/msg.txt
   git update-ref refs/heads/main <new-sha> <old-sha>
   ```
   Before staging, verify no other agent has touched your files since you took your baseline —
   compare md5s against the baseline, not against HEAD.

3. **Push Code**

   **Route A (preferred, byte-exact, any size): `git push` from the cloud container.** Requires the
   repo to be in the session's authorized sources. If it is not, you get the git-proxy 403 above.

   **Route B (works today, small files only): the GitHub MCP.**
   `mcp__remote-devices__github__*` runs on the Mac natively, outside both proxies, with real
   network. Use `create_or_update_file` for a single file (pass the current `sha` from
   `get_file_contents` when replacing) or `push_files` for several. Vercel builds `main` on push.

   **Route B has a hard size ceiling, and exceeding it corrupts production.** These tools require
   the literal file bytes to be emitted inline in the tool call, so the model is *retyping* the
   file. Above roughly 25 KB per call the response truncates mid-file and commits broken JS. Files
   like `pages/hub/poker-near-me/[pnmTab].js` (167 KB), `lobby.js` (168 KB), `pages/api/poker/venues.js`
   (123 KB) and `VenueCard.js` (111 KB) **cannot be shipped this way at any batch size**. Do not try
   to "carefully" transcribe them — transcription drift on a live site is a regression, not a risk.

   If your change set contains any large file and Route A is unavailable, commit locally, say so
   plainly and once, and stop. That is not a handoff; it is a blocked route being reported.

4. **Supabase Migrations — the Supabase MCP now exists. Use it.**

   Superseded 2026-08-05. The `mcp__Supabase__*` server is connected (`list_projects`,
   `list_migrations`, `list_tables`, `apply_migration`, `execute_sql`, `get_advisors`, `get_logs`).
   PokerIQ-Production is project ref **`kuklfnapbkmacvwxktbh`**.

   Still true: no shell in an agent session can reach the database directly — the device VM resolves
   no DNS and both proxies 403 on CONNECT to the Supabase host, so `npm run db:push` does not work
   from an agent session. Use the MCP instead, and verify with `list_migrations` that the version
   actually landed.

   Note `list_migrations` returns ~97k characters. Call it inside a subagent, or grep the saved
   tool-result file, rather than pulling it into the main context.

**DO NOT** ask for handoffs. Execute the work, commit it, push it, verify it landed on `origin/main`,
and finish the job autonomously.

## Verify before claiming anything shipped

Never trust the working tree or a subagent's report - both have been wrong here. Check the
committed object:
```bash
git show HEAD:path/to/file | grep -c 'distinctive string'
git cat-file -e origin/main:path/to/file && echo on-origin
```

The strongest check, and the one to use after any push that went through a lossy route: clone
`origin/main` into the cloud container and `cmp` every file against your verified local copy.
`identical=N differs=0 missing=0` is the only acceptable result.

Gates that actually catch agent-introduced defects in `.js`/`.jsx` (repo `tsconfig` only includes
`**/*.ts`/`**/*.tsx`, so `tsc --noEmit` does NOT check the majority of this codebase, and
`node --check` gives FALSE PASSES on ESM/JSX):

```bash
# 1. parse gate - JSX-aware, no resolution
npx tsc --noEmit --allowJs --checkJs false --jsx preserve --noResolve --skipLibCheck \
  --target es2020 --module esnext --moduleResolution bundler <files>

# 2. correctness gate - the repo .eslintrc turns no-undef OFF, so run a flat config that turns it
#    back ON together with react-hooks/rules-of-hooks. This is what catches undefined identifiers
#    and conditional hooks that the parse gate cannot see.
node_modules/.bin/eslint --config /tmp/eslint.strict.mjs --no-config-lookup <files>

# 3. import gate - confirm every relative/alias specifier resolves to a real file
```

`npx next build` does **not** run on the device VM: `node_modules` is installed for darwin-arm64 and
the Linux VM fails on `Cannot find module @rollup/rollup-linux-arm64-gnu`. Do not read that as a
defect in your change.

Keep `node --test src/lib/rewards/__tests__/transferMath.test.mjs` green (63 cases).
