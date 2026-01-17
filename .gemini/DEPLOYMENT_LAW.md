# 🚀 DEPLOYMENT LAW — MANDATORY FOR ALL AGENTS

**Status**: ACTIVE — APPLIES TO ALL CONVERSATIONS (CURRENT AND FUTURE)  
**Created**: 2026-01-16  
**Authority**: User Directive  
**Priority**: CRITICAL

---

## **THE LAW:**

**At the end of ANY session where code changes were made**, the agent MUST:

1. ✅ Ensure all files are saved
2. ✅ Provide a **SINGLE-LINE copy-paste command** (no line breaks)
3. ✅ End with clear deployment instructions
4. ✅ Use a code block for easy one-click copy

---

## **MANDATORY CLOSING FORMAT:**

```
═══════════════════════════════════════════════════════════════════════════
✅ SESSION COMPLETE
═══════════════════════════════════════════════════════════════════════════

📦 CHANGES MADE:
- [List of changes]

🚀 TO PUBLISH TO SMARTER.POKER:

Copy this ONE command (click the copy button) and paste into Mac Terminal:

```bash
cd /Users/smarter.poker/Documents/hub-vanguard && git add -A && git commit -m "session: [brief description]" && git push
```

Press ENTER after pasting ⏎

═══════════════════════════════════════════════════════════════════════════
```

---

## **CRITICAL RULES:**

### ✅ MUST DO:
- Use **ONE continuous line** (no line breaks in the command)
- Use a **code block** (```bash ... ```) for one-click copy
- Include **&&** to chain all commands
- Add clear **"Press ENTER"** reminder
- Keep command **simple and error-proof**

### ❌ NEVER DO:
- Multi-line commands (causes paste errors)
- Multiple separate commands
- Commands without commit message
- Assume user knows deployment process
- End session without deployment command

---

## **STANDARD DEPLOYMENT COMMAND FORMAT:**

```bash
cd /Users/smarter.poker/Documents/hub-vanguard && git add -A && git commit -m "descriptive message" && git push
```

**Components:**
1. `cd` to project directory
2. `git add -A` to stage all changes
3. `git commit -m "..."` with descriptive message
4. `git push` to deploy
5. All joined with `&&` for single-line execution

---

## **EXAMPLES:**

### ✅ CORRECT:
```bash
cd /Users/smarter.poker/Documents/hub-vanguard && git add -A && git commit -m "feat: Added daily challenges" && git push
```

### ❌ WRONG (Multi-line):
```bash
cd /Users/smarter.poker/Documents/hub-vanguard
git add -A
git commit -m "feat: Added daily challenges"
git push
```

### ❌ WRONG (No code block):
Run: cd /Users/smarter.poker/Documents/hub-vanguard && git add -A && ...

---

## **WHEN TO PROVIDE:**

- ✅ After creating new files
- ✅ After modifying existing files
- ✅ After any code changes
- ✅ Before ending a session
- ✅ When user asks for deployment

---

**This law is PERMANENT and applies to:**
- All current conversations
- All future conversations
- All agents working on this project

🔒 **NON-NEGOTIABLE**
