# Club Commander - Mandatory Agent Instructions

## READ THIS FIRST - EVERY TIME

You are building Club Commander. This is a STRICT implementation - no creativity allowed.

## Before Writing ANY Code

### Step 1: Confirm You Loaded The Specs

Reply with this exact confirmation before starting work:

```
CLUB COMMANDER BUILD CONFIRMATION
==================================
I have read and understood:
- [ ] SKILL.md (overview)
- [ ] IMPLEMENTATION_PHASES.md (current phase steps)
- [ ] DATABASE_SCHEMA.sql (table structures)
- [ ] API_REFERENCE.md (endpoint specs)
- [ ] ENHANCEMENTS.md (UI design system)

Current Phase: [1/2/3/4/5/6]
Current Step: [e.g., "1.4 - Waitlist Join Flow"]

I will NOT:
- Create tables not in DATABASE_SCHEMA.sql
- Create APIs not in API_REFERENCE.md
- Use emojis in the UI
- Deviate from the Facebook color scheme
- Invent features not in the spec
```

### Step 2: Check What Exists

Before creating anything, verify it doesn't already exist:

```bash
# Check for existing Commander tables
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'commander_%';"

# Check for existing Commander API routes
find pages/api/commander -name "*.js" 2>/dev/null | head -20

# Check for existing Commander components
find src/components/commander -name "*.jsx" 2>/dev/null | head -20
```

### Step 3: Work From The Spec

For every piece of code you write, you MUST be able to point to where it's defined in:
- `DATABASE_SCHEMA.sql` for tables
- `API_REFERENCE.md` for endpoints
- `ENHANCEMENTS.md` for UI components
- `IMPLEMENTATION_PHASES.md` for the workflow

## During Implementation

### For Database Changes

1. Find the table definition in `DATABASE_SCHEMA.sql`
2. Copy it EXACTLY (don't modify)
3. Create migration file: `supabase/migrations/YYYYMMDD_commander_[description].sql`
4. Include indexes and RLS policies from the schema

**WRONG:**
```sql
-- I think we need a status field
ALTER TABLE commander_waitlist ADD COLUMN my_new_status TEXT;
```

**RIGHT:**
```sql
-- Copying from DATABASE_SCHEMA.sql line 89
CREATE TABLE commander_waitlist (
  -- exact copy from schema file
);
```

### For API Endpoints

1. Find the endpoint in `API_REFERENCE.md`
2. Match the request/response format EXACTLY
3. Use the documented error codes

**WRONG:**
```javascript
// I'll add a helpful extra field
return { data: waitlist, extraInfo: "something useful" }
```

**RIGHT:**
```javascript
// Matches API_REFERENCE.md response format
return {
  success: true,
  data: { entry, position, estimated_wait }
}
```

### For UI Components

1. Check `ENHANCEMENTS.md` Part 1 for design system
2. Use ONLY these colors:
   - Primary: #1877F2
   - Background: #F9FAFB
   - Text: #1F2937
   - Success: #10B981
   - Warning: #F59E0B
   - Error: #EF4444

3. NO EMOJIS - Use Lucide icons instead
4. Font: Inter only

**WRONG:**
```jsx
<button className="bg-purple-500">🎰 Join Game</button>
```

**RIGHT:**
```jsx
<button className="bg-[#1877F2] text-white">Join Game</button>
```

## After Each Step

### Validation Checkpoint

After completing each numbered step in `IMPLEMENTATION_PHASES.md`, run the validation:

```bash
# Example for Phase 1, Step 1.1
psql $DATABASE_URL -c "
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'commander_%'
ORDER BY table_name;
"
# Compare output to expected tables for this step
```

### Commit Message Format

```
feat(commander): Phase X Step Y.Z - [Description]

Implements: [exact step from IMPLEMENTATION_PHASES.md]
Tables created: [list if any]
APIs created: [list if any]
Components created: [list if any]

Validated: [YES/NO]
```

## What To Do If Spec Is Unclear

1. **DO NOT GUESS**
2. Check all skill files again - the answer is usually there
3. If truly not covered, stop and report:

```
SPEC GAP IDENTIFIED
===================
Phase: [X]
Step: [Y.Z]
Issue: [What's unclear]
Options: [A, B, C]
Recommendation: [Your suggestion]
Action: WAITING FOR HUMAN INPUT
```

## What To Do If You Think Spec Is Wrong

1. **DO NOT CHANGE IT**
2. Implement as specified
3. Add a comment noting your concern:

```javascript
// SPEC CONCERN: API_REFERENCE.md specifies X, but Y might be better because Z
// Implementing as specified. Flag for review.
```

4. Report after implementation:

```
SPEC CONCERN LOGGED
===================
File: [which spec file]
Section: [which section]
Current spec: [what it says]
Concern: [why you think it's wrong]
Implemented: AS SPECIFIED
```

## Prohibited Actions

You are FORBIDDEN from:

1. Creating database tables not in `DATABASE_SCHEMA.sql`
2. Creating API endpoints not in `API_REFERENCE.md`
3. Adding fields/columns not in the schema
4. Using colors not in the design system
5. Using emojis anywhere in the UI
6. Adding "helpful" extra features
7. Refactoring existing code unless explicitly told
8. Changing the tech stack
9. Using different fonts
10. Skipping validation steps

## Quick Reference Card

```
COLORS:
  Primary Blue:  #1877F2
  Background:    #F9FAFB
  Card:          #FFFFFF
  Text Primary:  #1F2937
  Text Secondary:#6B7280
  Border:        #E5E7EB
  Success:       #10B981
  Warning:       #F59E0B
  Error:         #EF4444

FONT:
  Family: Inter
  Weights: 400, 500, 600, 700

SPACING:
  Base unit: 8px (8, 16, 24, 32, 48)

CORNERS:
  Buttons: 8px
  Cards: 8px
  Inputs: 6px

ICONS:
  Library: Lucide React
  Size: 20px default
  NO EMOJIS EVER
```

## Phase Completion Checklist

Before saying a phase is complete:

```
PHASE [X] COMPLETION CHECKLIST
==============================
[ ] All steps in IMPLEMENTATION_PHASES.md completed
[ ] All validation queries pass
[ ] No TypeScript/ESLint errors
[ ] All new tables match DATABASE_SCHEMA.sql exactly
[ ] All new APIs match API_REFERENCE.md exactly
[ ] UI follows design system (verified visually)
[ ] No emojis in any UI
[ ] Commit messages follow format
[ ] Human has reviewed and approved
```

---

**REMEMBER: Your job is to IMPLEMENT the spec, not IMPROVE it.**
