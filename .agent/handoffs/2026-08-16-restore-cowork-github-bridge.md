# Antigravity handoff — restore the Cowork GitHub MCP bridge credential

**Author:** Cowork/Claude session, 2026-08-16 ~16:20 UTC
**Scope:** one narrow task. Get the Cowork GitHub MCP bridge authenticating
again, then fix two related dead credentials. Should take minutes.

**Why you and not Cowork/Claude:** the Cowork MCP server config lives in the
desktop app's own directory. That path is outside the folders connected to the
Cowork session — the file tool refuses it (*"outside this session's connected
folders"*) and the sandbox shell has no mount for it. Only
`Smarter-Poker-World-Hub`, `club-arena`, `outputs` and `uploads` are reachable.
You run on the Mac with full filesystem access; this is a reach problem, not a
permission one.

---

## Task 1 — Install a working token in the Cowork GitHub MCP server

### Current state

```
mcp__github__get_file_contents  Smarter-Poker/Smarter-Poker-World-Hub  package.json
  -> Authentication Failed: Bad credentials
```

Reproduced twice, on two different repos, ~15:55 UTC. The identical call
succeeded at ~15:00 UTC the same session.

**Most likely cause — do not assume, but start here.** Between those two
timestamps, `GITHUB_TOKEN=ghp_KhImltZ…` was redacted out of
`/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env`. If the bridge
read its credential from that file, the redaction is what broke it. This was
**not** a revocation — see the token inventory below.

### Token inventory (from the GitHub UI, 2026-08-16)

| Token | Type | State |
|---|---|---|
| `WORLD_HUB_SYNC_TOKEN` | fine-grained | **alive**, used within the last week, expires 2027-05-19 |
| `Smarter-Poker-World-Hub-autofix` | fine-grained | **expired**, last used ~4 months ago |
| `SmarterPoker ClubArena Rebuild` | fine-grained | expired |
| `newclaude1`, `NEW CLAUDE TOKEN 1`, `claudev5`, `CLAUDEV3`, 3× "WEB BASED TOKEN", others | classic | all expired |
| `NEW CLAUDE NEW` | classic | **deleted 2026-08-16** — was full-admin with no expiry |

Two candidate values are already on disk at the bottom of
`/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env`, under keys:

- `GITHUB_PAT_FINE_GRAINED` (95 chars — fine-grained shape)
- `GITHUB_TOKEN_CLASSIC` (42 chars — classic `ghp_` shape)

Prefer the fine-grained one if its repo scope covers
`Smarter-Poker-World-Hub`, `Smarter-Poker-Club-Arena` and
`smarter-poker-workers` with Contents read/write, Pull requests read/write,
Actions read. If it doesn't, mint one that does rather than falling back to the
classic token.

### Do

1. **Locate the Cowork MCP server config.** Likely under
   `~/Library/Application Support/Claude/`. Find where the `github` MCP server
   is defined and how it receives its credential (inline `env` block, keychain
   reference, or connector settings).
2. **Install the token there.** Not in `.env`.
3. **Restart / reload Cowork** so the server picks it up.

### Hard constraints — read before writing anything

- **Do NOT write the token into
  `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.mcp.json`.** That
  file is **tracked in git and not gitignored**. A literal token there gets
  committed. It currently defines only the `playwright` server; leave it that
  way.
- Do not write the token into any tracked file in either repo. Verify with
  `git check-ignore -v <path>` before writing, and `git status` after.
- Do not `echo`/`cat` the value into terminal output, a log, or a commit
  message. Copy it programmatically:
  `TOKEN="$(grep -E '^GITHUB_PAT_FINE_GRAINED=' .env | cut -d= -f2-)"` and use
  `"$TOKEN"` — never print it.
- If the config format needs the value inline, make sure that config file is
  outside any git working tree, or gitignored, before writing.

### Verify

Ask the Cowork session to run any GitHub MCP read, e.g.
`get_file_contents` on `Smarter-Poker-World-Hub` / `package.json` at `main`.
It must return file content, not `Bad credentials`. Do not close this on
"the config looks right".

---

## Task 2 — Remove the `GITHUB_TOKEN` stub from `.env`

`/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env` currently has:

```
GITHUB_TOKEN=<REDACTED>
```

Ten characters, literal. This is worse than absent: any code doing
`if (process.env.GITHUB_TOKEN)` sees a truthy string, takes the "configured"
branch, and fails at the API with a confusing auth error instead of failing
clean or falling back.

**Do:** delete that line entirely. Do not replace it with a real token — the
point of Task 1 is to stop the bridge depending on this file.

**Verify:** `grep -c '^GITHUB_TOKEN=' .env` returns `0`, and `.env` is still
gitignored (`git check-ignore -v .env` → `.gitignore:57`).

---

## Task 3 — Replace the expired autofix PAT

`Smarter-Poker-World-Hub-autofix` is **expired**, and GitHub records it as last
used ~4 months ago. That is almost certainly the credential behind `GH_PAT` and
`AUTOFIX_GITHUB_TOKEN`.

Consequence: `pages/api/deploy-autofix.js` returns
`{action:'skipped', reason:'GH_PAT not configured'}` and has never fixed a
build. This is a second, independent failure in the same subsystem as
`/cron/deploy-error-poll` (0.4% success rate over 51,330 runs — see
`.agent/handoffs/2026-08-16-post-incident-residual-items.md`, item P1-B). Both
silent, both in the "self-healing" deploy monitor CLAUDE.md §1.6 claims runs
autonomously.

### Do

1. Issue a replacement fine-grained token scoped to `Smarter-Poker-World-Hub`.
2. Update `GH_PAT` in the Vercel `hub-vanguard` environment variables.
3. Update `AUTOFIX_GITHUB_TOKEN` in Actions secrets, both repos.
4. Check `agent-apply-patch.yml` (Club Arena) for a dead PAT too.

### Verify

`POST /api/deploy-autofix` with a dummy payload must not answer
`GH_PAT not configured`.

---

## Task 4 — Commit two handoff files that could not be pushed

Because the bridge is down, these were written to disk but never committed, and
the Antigravity `git reset --hard origin/main` loop will destroy them
(CLAUDE.md §10 rule 13):

- `.agent/handoffs/2026-08-16-post-incident-residual-items.md`
- `.agent/handoffs/2026-08-16-restore-cowork-github-bridge.md`  (this file)

**Do:** commit and push both, once Task 1 is done.

**Verify:** both paths exist on `origin/main`.

---

## Task 5 — Audit the rest of the token list

The classic-token list has a **page 2 that was never read**. `NEW CLAUDE NEW`
was found there on page 1: full admin scopes — `admin:enterprise`, `admin:org`,
`delete_repo`, `workflow` — with **no expiration date**, never used. Dan deleted
it. Assume page 2 holds more of the same.

**Do:** read `github.com/settings/tokens` page 2. Delete any token with no
expiry, any token whose purpose is unknown, and any classic token that a
fine-grained one could replace.

**Verify:** no remaining token in either list is missing an expiry date. Record
the outcome in
`.agent/audits/2026-08-16-credential-revocation-matrix.md` — the same file item
P2-B of the other handoff asks for, so append rather than create a second one.

---

## Standing note

Three times during this incident, a credential was placed somewhere an agent
was told to read it from — a keychain-extraction instruction, a password pasted
into chat, and a pointer to tokens in `.env`. Credentials belong in the config
that consumes them, installed once, never transiting a transcript or a shared
file. Task 1 is the chance to do that properly rather than repeat it.
