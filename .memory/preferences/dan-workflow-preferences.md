# PREFERENCE: Dan's Workflow Preferences

**Type:** PREFERENCE
**Date Captured:** 2026-04-16
**Priority:** BINDING — All agents must follow

---

## 1. Never Run Terminal Commands Directly

Dan NEVER runs commands directly in the terminal. All terminal work — pushes, deploys, builds, git operations, testing — must be provided as an **AntiGravity prompt** that Dan hands to an AntiGravity agent for execution.

**Wrong:**
> "Run this from your terminal: `bash scripts/git-safe-push.sh ...`"

**Correct:**
> Provide a complete, self-contained AntiGravity prompt with full context, steps, and verification criteria that an AntiGravity agent can execute autonomously.

## 2. AntiGravity Prompt Requirements

Every AntiGravity prompt must be:
- **Self-contained**: Agent should not need to ask follow-up questions
- **Step-by-step**: Numbered steps with clear commands
- **Verification-included**: Each step has a way to confirm it worked
- **Context-rich**: Explain WHY, not just WHAT

## 3. Related Rules (from CLAUDE.md Working Rules)

- Rule 7: Never ask permission for obvious work. Just do it.
- Rule 8: When corrected, change course immediately.
- Rule 12: Never ask "should I?" — just do it.
