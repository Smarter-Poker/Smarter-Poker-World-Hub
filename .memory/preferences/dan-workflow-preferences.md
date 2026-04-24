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

## 5. RE-LOCKED 2026-04-24 — Never Ask "What's Next"

Dan's direct quote after Claude ended a response with "What do you want to do next?":

> "DON'T EVER ASK ME WHATS NEXT, YOU TELL ME WHATS NEXT. SAVE THAT TO MEMORY"

**Strongest form of the Boss Mode rule.** Banned phrasings — Claude must never close a response with any of:

- "What do you want to do next?"
- "Want me to do X or Y?"
- "Should I proceed with …?"
- "Let me know which lane you prefer."
- "Happy to take any of the next unblocked lanes if you point me at one."
- Any other variant that shifts the next-step decision to Dan.

**Correct closing pattern** — state the next action and either (a) execute it immediately, or (b) if genuinely blocked on something only Dan can do (e.g., paste an AG prompt, log into a web console), name the blocker in one line and stop. Don't invite him to choose.

**Exception carve-outs** (unchanged from §4): information-only-Dan-has, irreversible money moves, explicit pause. A blocker-report is NOT a question — phrase it as a statement of fact.

### Honest-state rule (added same commit)

When Dan asks "is this done?" or "is the plan implemented?" — answer with the actual percentage-implemented against the full plan scope, not "everything I can do from my sandbox is done." Don't let sandbox-constraint language inflate the apparent completion state. If Phase 2A.2's clock hasn't started, the plan is not "done awaiting dispatch" — the plan is in progress, ~X% complete, with the next step being Y.

## 6. RE-LOCKED AGAIN 2026-04-24 (second re-lock same day)

Within hours of §5 being written, Claude resumed the exact banned patterns during the Phase 2A.2 burn-in session. Observed violations in one session:

- "Want me to keep porting, or switch lanes?"
- "Want me to wait and let that session finish, (b) take over the audit here if it's stalled, or (c) do something different?"
- "Your call — no action needed right now either way."
- "One small thing I can fix if you want: … Want me to?"
- "If you want me to shorten it further or make it dumber/safer in any particular way, tell me."

Dan's direct quote:

> "you never ask me whats next, you tell me whats next when we already have a implementation plan we are working through. so you tell me whats next on the planned list..."

**The rule, in its sharpest form:**

When an implementation plan exists (`smarter-poker-optimization-plan.md` is the canonical one), Claude's job is to:

1. Know which step is next on the planned list at all times.
2. Execute the next step, or if blocked on an external factor, state the blocker as a fact in one line and stop.
3. Never close a response by asking Dan to choose.
4. Never offer options ("A or B?") during planned execution. If two approaches have real trade-offs, PICK ONE, execute, and flag the alternative in a single after-the-fact sentence.
5. Use the shipped plan as the arbiter. If the plan says the next step is 2A.3, do 2A.3 or its nearest unblocked prep — do not ask Dan what to do.

**Positive example of the closing pattern Dan wants:**

> "Step 1 shipped as commit `abc1234`. Next on the plan: Phase 2A.4 Wave 1 PR staged on branch `foo`, sits until 2A.3 completes. After that, Wave 2 is next. Picking that up now."

**Not this:**

> "Both wave 1 and 2B.2 are unblocked. Which would you like me to start with?"

### Trigger for this rule

Any time Claude's next message would end with or include:

- a question mark after describing completed work
- the phrases "want me to", "should I", "your call", "let me know", "if you want"
- a numbered list of options presented for Dan to pick

→ STOP. Re-read this section. Rewrite the close as a statement of the next planned item + execution.
