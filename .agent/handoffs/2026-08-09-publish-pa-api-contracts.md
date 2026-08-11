# Handoff — publish local commit `a511b97de6` (PA API hardening + contract guard)

**Date:** 2026-08-09
**Blocker class:** RULE 0 exception — *credentials the agent has no path to obtain*.
**What is blocked:** publishing one finished, tested local commit to `main`.

---

## Why this is a handoff and not a push

The GitHub MCP token expired **mid-session**. It worked for the four
publishes earlier today (`34057baf`, `bf19bda1`, and the two before them) and
now returns, on every call and every path:

```
MCP error -32603: Authentication Failed: Bad credentials
```

The sandbox has no network egress to GitHub (no DNS for `github.com`; the
proxy rejects `api.github.com` with `403 from proxy after CONNECT`), so there
is no fallback read or write path and `git push` cannot run from here either.
Reissuing the token is the one thing the agent genuinely cannot do.

**The work itself is complete and verified** — only transport is missing.

---

## Protection already in place

The commit is local-only, and `scripts/git-safe-push.sh` / the Antigravity
loop periodically run `git reset --hard origin/main`, which destroys
local-only commits on `main`. The work is therefore also parked on a branch,
which that reset does not touch:

```
rescue/pa-api-contracts-20260809  ->  a511b97de6
```

If `main` is ever reset before this is published, recover with:

```bash
git cherry-pick a511b97de6      # or: git merge rescue/pa-api-contracts-20260809
```

---

## What the commit contains

`a511b97de6` — *fix(pa): rate-limit the three unprotected routes, add a
dispatcher error boundary, lock the contracts*

Audited all 25 Personal Assistant API routes against the repo's immutable
rules. Four real defects, all fixed:

1. **`pages/api/assistant/sandbox/analyze.js`** — rate-limited *after* JWT
   validation and the context-authority check, both DB round-trips. Every
   request in a flood bought one or two DB hits before the limiter meant to
   stop it, on the most expensive endpoint of the surface (solver queries plus
   a Grok fallback). The limiter now runs first, before any DB work.
2. **`pages/api/assistant/sandbox/weekly-spot.js`** — no limiter at all, no
   auth required.
3. **`pages/api/assistant/archetypes.js`** — same. For both: the 1-hour edge
   cache is not a substitute, because a unique query string per request
   bypasses the CDN and reaches the handler every time.
4. **`pages/api/sandbox/[...path].js`** — the dispatcher **every**
   `/api/sandbox/*` request funnels through had no `try/catch`. Anything
   thrown outside a sub-handler's own guard reached the client as Next's HTML
   500, which every caller on this surface then failed to parse as JSON
   ("Unexpected token <"). Now returns JSON and never double-sends when a
   sub-handler has already started the response.

Plus **`__tests__/pa-api-contracts.test.mjs`** (new, in `prebuild`): 8 rules
over all 25 routes — rate limiting, rate-limit-before-DB-work, no identity
from body/query (the 2026-03-07 IDOR class), no `.single()`, no raw
`@supabase/supabase-js` import, top-level `try/catch`, and an
exemption list that fails if it goes stale.

**Verification already done:** all 25 guard tests pass (`# pass 25 / # fail
0`); `node --check` clean on all four modified routes; the guard was
negative-tested by removing a limiter, which correctly fails RULE 1.

---

## Exact publish procedure

Every emission below was already hash-verified in the sandbox
(`git hash-object` == `git rev-parse`), so these SHAs are authoritative.

| Path | Parent blob (`a511b97de6~1`) | Target blob (`a511b97de6`) |
|---|---|---|
| `pages/api/assistant/sandbox/analyze.js` | `56e052643f1acb81cef8b979ec16630b0c3e243b` | `2a0f6946a871bc4806a60e014537cb4e51c9d21a` |
| `pages/api/assistant/sandbox/weekly-spot.js` | `ed8e15a51528f6b215e9270ea38ea9a8823d16be` | `7c3090e08b8dd004e82ed6fa618d0eaa8613a9fb` |
| `pages/api/assistant/archetypes.js` | `94837ff6a238dac9f02f11bb05bdfd6b5051ade7` | `db538476f54c83e762bc4663462d71403cc18bbf` |
| `pages/api/sandbox/[...path].js` | `fc79c7700f7075b033547a77d1d4b06940f3a83f` | `8a6ae979dddeff56c232f8ed11fabd5ccdb2178d` |
| `__tests__/pa-api-contracts.test.mjs` | *(new file — absent)* | `19ad0326d0f4a2a8f4bd04c6e7175cf992b0a5d0` |
| `package.json` | `b9eea1333a10fddfb06bdf671ef4f13f1887c274` | `0e7fba7dc3cb4868fb959a3a177e0be13fc100c2` |

### Option A — a shell with network (simplest)

```bash
cd ~/Documents/Smarter-Poker-World-Hub
git log --oneline -1              # expect a511b97de6
bash scripts/git-safe-push.sh "fix(pa): rate-limit unprotected routes, dispatcher error boundary, contract guard"
```

`main` also carries unpushed commits from other sessions (watchdog,
cash-games, scrapers, arena). Confirm that is intended before pushing them
along with this one.

### Option B — GitHub MCP, once the token is reissued

1. **Base check first.** Each existing file's remote blob on `main` must equal
   the *Parent blob* column above, and `__tests__/pa-api-contracts.test.mjs`
   must be absent. Any mismatch → stop; another session has edited that file
   and this needs re-cutting against their version.
2. Content from `git show a511b97de6:<path>`. Pre-verify each emission with
   `git hash-object` before sending.
3. Push `analyze.js` (56,528 B) **in its own call** — it holds most of the
   1,207 `═` / 48 `━` run characters, which is exactly the deterministic
   run-length corruption pattern that has bitten previous publishes. The other
   five files (~26 KB total) can share a call.
4. **Verify every remote blob equals the Target column.** Repair until exact.

No file contains a literal `\uXXXX` sequence, so no double-escaping is needed
— send raw UTF-8. No CR bytes.

---

## Definition of done

- Remote `main` blobs equal the Target column for all six paths.
- Vercel build for that commit reaches READY (prebuild runs the new guard, so
  a failure here is a real signal, not flakiness).
- `git branch -D rescue/pa-api-contracts-20260809` once published.
