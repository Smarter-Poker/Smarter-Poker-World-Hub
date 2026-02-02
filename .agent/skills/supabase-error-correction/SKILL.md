---
description: Military-grade protocol for safely investigating and fixing Supabase errors (401/400s, RLS issues, permission problems)
---

# 🔒 SUPABASE ERROR CORRECTION SKILL

> **CRITICAL:** This skill exists because previous Supabase "fixes" caused catastrophic failures (broken database pulls, corrupted permissions, multi-day recovery). Follow this protocol EXACTLY.

---

## 🚨 MANDATORY READING BEFORE PROCEEDING

**YOU MUST FOLLOW ALL 4 GATES. NO EXCEPTIONS.**

| Gate | Description | Required User Input |
|------|-------------|---------------------|
| **GATE 1** | Start investigation | User says "Start reconnaissance" |
| **GATE 2** | Review diagnosis report | User decides if fixes needed |
| **GATE 3** | Approve EACH individual fix | User says "Approve fix #X" |
| **GATE 4** | Final verification | User confirms everything works |

---

## 🛡️ DEFENSE LAYERS (ALWAYS ACTIVE)

### Layer 1: ZERO-WRITE RECONNAISSANCE
- All initial investigation is READ-ONLY
- No database writes (`INSERT`, `UPDATE`, `DELETE`)
- No RLS policy modifications
- No schema changes
- No auth configuration changes

### Layer 2: FULL STATE CAPTURE (Before ANY Fix)
Before making any approved change:
```bash
# Export current RLS policies
supabase db dump --data-only > backup_rls_policies_$(date +%Y%m%d_%H%M%S).sql

# Git tag current state
git add -A && git commit -m "BACKUP: Pre-Supabase-fix state" && git tag pre-supabase-fix-$(date +%Y%m%d_%H%M%S)
```

### Layer 3: CHANGE ISOLATION
- ONE change at a time
- Document exact rollback command BEFORE executing
- 30-second verification window after each change
- User sign-off required for each change

### Layer 4: IMMEDIATE ROLLBACK
- Rollback script prepared BEFORE any change
- If verification fails, execute rollback immediately
- User can say "ABORT" at any time

---

## 📋 PHASE 1: RECONNAISSANCE (READ-ONLY)

### Step 1.1: Capture Console Errors
```javascript
// Run in browser console on production site
// Or use browser_subagent to capture
console.log('Capturing Supabase errors...');
```
**RISK: NONE** - Just reading browser output

### Step 1.2: Identify Failing Endpoints
Review code for Supabase calls that match error patterns:
```bash
# Safe - just reading files
grep -r "supabase" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" src/
```
**RISK: NONE** - Just reading files

### Step 1.3: Configuration Audit
Compare `.env` keys against Supabase dashboard:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY (if exists)
```
**RISK: NONE** - Just comparing values

### Step 1.4: Feature Impact Assessment
Test affected pages to determine if errors are:
- **BLOCKING** - Features actually broken
- **NON-BLOCKING** - Console noise, features work

**RISK: NONE** - Just browsing the site

---

## 📋 PHASE 2: DIAGNOSIS REPORT

After Phase 1, produce report with:

1. **Error Inventory**
   - Exact error messages
   - Which pages/features affected
   - Frequency of occurrence

2. **Impact Assessment**
   - Features that are actually broken vs. console noise
   - User-facing impact

3. **Root Cause Analysis**
   - Why each error is occurring
   - What needs to change (if anything)

4. **Proposed Remediation**
   - Exact fix for each issue
   - Risk level of each fix
   - Rollback procedure for each fix

5. **Recommendation**
   - "Fix required" vs. "Monitor only" vs. "Ignore (cosmetic)"

**STOP HERE AND WAIT FOR USER DECISION**

---

## 📋 PHASE 3: REMEDIATION (USER-APPROVED ONLY)

### Pre-Flight Checklist
- [ ] Layer 2 backups complete
- [ ] Rollback script verified and ready
- [ ] User has given explicit written approval for specific fix
- [ ] Change documented with exact before/after

### Execution Protocol
```
1. Execute ONE approved change
2. Wait 30 seconds
3. Run verification:
   - Production site loads?
   - Login works?
   - Affected feature works?
   - No new console errors?
4. If ALL PASS → Document → Get approval for next change
5. If ANY FAIL → Immediate rollback → STOP → Report to user
```

### Post-Change Verification
- [ ] Production site loads correctly
- [ ] User authentication works
- [ ] Data pulls correctly on affected pages
- [ ] No new console errors introduced

---

## 🚫 AUTOMATIC ABORT CONDITIONS

If ANY of these occur, STOP ALL OPERATIONS IMMEDIATELY:
- Production site becomes unreachable
- Login functionality breaks
- Any database table returns empty unexpectedly
- Console shows new critical errors not present before
- User says "STOP", "ABORT", or "HALT"

---

## ⚠️ THINGS I WILL NEVER DO (WITHOUT EXPLICIT APPROVAL)

| Action | Risk Level | Why Dangerous |
|--------|------------|---------------|
| Modify RLS policies | 🔴 CRITICAL | Can lock out all users |
| Change table permissions | 🔴 CRITICAL | Can break all data access |
| Alter table schemas | 🔴 CRITICAL | Can corrupt relationships |
| Modify auth settings | 🔴 CRITICAL | Can break all logins |
| Run `ALTER`, `DROP`, `GRANT` SQL | 🔴 CRITICAL | Destructive operations |
| Change service role keys | 🔴 CRITICAL | Can break backend |

---

## 📞 COMMUNICATION PROTOCOL

During this operation:
- Report status after EACH step
- Wait for user confirmation before proceeding
- NEVER assume approval
- User can PAUSE at any time: "PAUSE"
- User can ABORT at any time: "ABORT"

---

## ✅ READY TO START

To begin this skill, user must say: **"Start reconnaissance"**

I will then execute Phase 1 (read-only) and report findings before any changes are considered.
