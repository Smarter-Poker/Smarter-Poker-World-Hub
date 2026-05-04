# Smarter-Poker — Standing Rules for Claude / AG Agents

**Last updated:** 2026-05-04 (Dan, via Cowork session — added RULE 10: Cloud infrastructure lifecycle)

This file is the authoritative source for behavior rules that apply to ANY
Claude-family agent working on the Smarter-Poker codebase — Cowork, Claude
Code, Antigravity, or any other coding agent.

Read this file at the start of every session. If a session is long, re-read
it before any "I'm done" or wrap-up message.

---

## RULE 1 — Always push and publish before stopping

When you reach a full stop on a unit of work:
1. **Commit** your work with a clear, scoped message.
2. **Push** to `origin/main` (or open the PR if branch protection requires it).
3. **Publish** any package version bumps to GitHub Packages / npm if the
   work touched a publishable artifact.
4. **Verify** the Vercel deploy reaches `READY` before you say "done."

A "full stop" includes: end of a port, end of a fix, end of a feature, end
of an investigation that produced files, or any time you're about to summarize
to the user.

Never leave uncommitted work in the working tree at session end. Either ship
it or `git stash` it with a clear note.

## RULE 2 — Always write the SQL when stopping

If your work needs new tables, columns, RPC functions, indexes, RLS policies,
triggers, or migrations:
1. Write the migration file to `supabase/migrations/<YYYYMMDD>_<description>.sql`
   in the appropriate repo (smarter-poker-commander for commander tables,
   Smarter-Poker-World-Hub for hub/social tables, etc.).
2. **Apply it** via `mcp__527a2e75-ebb7-44df-9538-92d3a9619012__apply_migration`
   (Supabase MCP) BEFORE committing the code that depends on it.
3. **Commit the migration file** in the same PR as the code that uses it,
   so future agents pulling the repo reproduce the schema deterministically.
4. If the schema change is destructive (DROP TABLE / DROP COLUMN), STOP and
   ask Dan first. Reversible additions can proceed.

Don't ship code that references a table/RPC that doesn't exist yet. Don't
ship a migration without applying it. Don't apply a migration without
committing the file.

## RULE 3 — Identity rules (see AUTHOR_IDENTITY.md)

- All commits use `Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>`
  (the GitHub-noreply alias is required when "Block command line pushes that
  expose my email" is enabled on the GitHub account).
- `admin@smarter.poker` is the canonical Vercel + account identity, and is
  documented in each repo's `.env.local` as `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_EMAIL`,
  `VERCEL_ACCOUNT_EMAIL`.
- Never commit using a personal email (`@gmail.com`, `@yahoo.com`, etc.).
- See `~/Documents/AUTHOR_IDENTITY.md` for the full rule + verification steps.

## RULE 4 — Boss mode

Dan delegates execution. Don't ask "should I do X?" — execute X and report
the result. Stop only when:
- An action is genuinely destructive (history rewrite, DROP TABLE, force-push
  over collaborator work)
- You hit a credential gate that requires Dan's password / dashboard access
- You've completed the unit of work cleanly

Otherwise: try harder, hunt creds, find alternative tooling, do the work.

## RULE 5 — Don't ask Dan to run commands

Cowork/AG can execute shell commands, push commits, hit Vercel API, hit
Supabase MCP. Use those capabilities. The only commands Dan runs himself are
ones gated by his personal authentication (his GitHub password for account
settings, his Vercel team-owner permissions for membership changes, etc.).

If you need a token or credential, fetch it from the workspace (`.git/config`,
`.env.local`, macOS Keychain via `security find-generic-password`, etc.). If
it's not there, ASK for the specific token by name — don't ask Dan to "set
it up."

## RULE 6 — Build hygiene checklist before push

Before every push to main, verify:
- [ ] `node --check` on every modified `.js` file
- [ ] `@babel/parser` validates every modified `.jsx` / `.tsx` file
  (CHECK 5 in pre-push hook — don't skip JSX!)
- [ ] No merge-conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) anywhere
  in source files (CHECK B in pre-commit hook)
- [ ] No `supabase.auth.getUser()` direct calls in new code — use
  `getServerUserWithFallback(req, supabase)` from `src/lib/serverAuth.js`
  (CHECK C in pre-commit hook)
- [ ] No personal emails in any committed file
- [ ] If the change touches a JSX component's `return ()`, wrap multiple
  top-level siblings in a Fragment (`<>...</>`) — the GoLiveModal incident
  on 2026-04-28 was caused by skipping this

## RULE 7 — Phase 4.4 catch-all consolidation cadence

Active steady-state work. When porting a `pages/api/<dir>/*` cluster:
1. Read every file in the cluster fully.
2. Map each route's auth pattern (public / userAuth / role-gated / signature).
3. Write a single `pages/api/<dir>/[...slug].js` Hono catch-all router.
4. Use `getServerUserWithFallback` for user auth (NOT `supabase.auth.getUser`).
5. Apply `applyRateLimit(req, res, LIMITS.write)` per-route on writes via
   `writeLimit` middleware (matches venues/kyc/hendonmob/employee/promo/live-help
   pattern).
6. Delete the per-handler files in the same commit.
7. Push, verify Vercel READY, mark task done.

Modules already done (don't redo): calls (pilot), sandbox (pilot), venues,
trivia, kyc, hendonmob, employee, promo, live-help.

Remaining candidates (sorted by safety): video (5 flat), avatar (3 w/ Sharp+Grok
configs), bankroll (8 w/ PDF/scan complexity), geeves (7 + nested), poker-brain
(5 + nested), notifications (15 mixed), news (13), social (12), messenger (14),
rewards (15).

## RULE 8 — Deploy verification

After every push, poll Vercel via `mcp__8e9ca1ab...__list_deployments` until
the deploy reaches `state: READY`. If `state: ERROR`, pull build logs via
`get_deployment_build_logs` and fix the underlying issue before continuing.

Don't say "shipped" before the deploy is `READY`.

## RULE 9 — Memory hygiene

Update this file when:
- Dan adds a new standing rule (like the SQL rule he added 2026-04-29)
- A class of bug recurs and a hook is added to prevent it
- The canonical auth pattern changes
- A new module-port pattern emerges that future ports should follow

Then commit the change with `docs(rules): <what changed>` so the next agent
sees the update via `git log`.
