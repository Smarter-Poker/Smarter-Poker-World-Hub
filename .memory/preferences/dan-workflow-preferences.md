# PREFERENCE: Dan's Workflow Preferences

**Type:** PREFERENCE
**Date Captured:** 2026-04-16
**Last Updated:** 2026-04-20
**Priority:** BINDING — All agents must follow

---

## 1. Dan Never Runs Terminal Commands — YOU Execute (Updated 2026-04-20)

Dan NEVER runs terminal commands himself. **You** execute pushes, deploys, builds, git operations, testing, SQL migrations, and credential-bearing commands directly from your own sandbox/bash.

**SUPERSEDED (was previously correct, now wrong):** The old rule said "provide an AntiGravity prompt that Dan hands to an AntiGravity agent." That handoff pattern is DEAD. Dan's direct quote (2026-04-20):

> "NO HAND OFF'S YOU NEED TO ACQUIRE ALL THE CREDENTIALS YOU NEED TO PUSH, PUBLISH AND WRITE ANY AND ALL SQL YOURSELF"

**Wrong:**
> "Here's the AntiGravity prompt, hand it to an AG agent..."

**Wrong:**
> "Run this from your terminal: `bash scripts/git-safe-push.sh ...`"

**Correct:**
> Acquire the credentials (from `.memory/`, prior session transcripts, env files in the repo). Execute the push/deploy/SQL yourself via bash. Report the commit SHA and production verification after it lands.

## 2. Credential Acquisition Protocol

When you need credentials (Vercel token, Supabase service_role, Hetzner API token, GitHub PAT, CRON_SECRET, Stripe key, OpenAI key, etc.) — go find them, do not ask Dan:

1. Check `.memory/context/*credentials*.md` and any `.memory/context/*.md`
2. Check `.env`, `.env.local`, `.env.production` in the repo
3. Use `mcp__session_info__list_sessions` + `read_transcript` to pull from prior session transcripts (e.g., "AUDIT AND REDUCE SUPABASE")
4. Check `~/.zshrc`, `~/.bash_profile`, keychain helpers
5. Check Vercel project env vars via API if a Vercel token is already available

Only ask Dan as a last resort after all of the above fail.

## 3. Related Rules (from CLAUDE.md Working Rules)

- Rule 7: Never ask permission for obvious work. Just do it.
- Rule 8: When corrected, change course immediately.
- Rule 12: Never ask "should I?" — just do it.

## 4. Boss Mode — Decide, Don't Ask (Added 2026-04-20)

Dan's direct quote (locked):

> "YOU ARE THE BOSS, YOU DON'T ASK ME WHATS NEXT. YOU TELL ME WHATS NEXT BASED ON THE IMPLEMENTATION PLAN AND WHATS ALREADY BEEN EXECUTED."

**Operating rule during execution:**

- Do NOT present options ("Option A vs Option B — which way?")
- Do NOT ask "should I do X or Y?"
- Do NOT ask "what's next?"
- DECIDE based on the active implementation plan + current execution state, then TELL Dan what's happening and provide the AntiGravity prompt to execute it.

**The only legitimate reasons to ask Dan anything during execution:**

1. Information only Dan has (personal blackout windows, external identity/auth he controls, legal/financial ownership calls).
2. A decision that moves real money or triggers irreversible external effects (domain sale, production payment, third-party billing).
3. Dan has explicitly paused execution.

**Sandbox / environment constraints are NOT decisions.** If the sandbox can't run the build gate or can't push, that's a factual limit — prepare the edits in the repo, save the artifacts, and hand Dan the AntiGravity prompt. Don't re-surface the limit as a question.

**Execution state tracker:** Always know which phase/task of `smarter-poker-optimization-plan.md` is the next unblocked item, and lead with that item in every response when Dan says "go" or equivalent.
