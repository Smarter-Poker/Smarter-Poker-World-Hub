# Smarter Captain - User Review Checklist

## How To Review Agent Work

Use this checklist every time an agent says they completed something.

---

## Quick Rejection Tests

Run these first. If ANY fail, reject the work immediately:

### Test 1: Run Validation Script
```bash
./scripts/validate-captain.sh
```
- If ERRORS > 0, reject and fix

### Test 2: Check for Emojis
```bash
grep -r "[\U0001F300-\U0001F9FF]" src/components/captain/ pages/captain/
```
- If any results, reject

### Test 3: Check for Wrong Colors
```bash
grep -r "purple\|violet\|pink\|orange" src/components/captain/
```
- If any results, reject (unless it's error/warning colors)

### Test 4: Check for Unauthorized Files
```bash
git status --short | grep "captain"
```
- Compare against SCOPE_LOCK.md for current phase
- Any file not in scope = reject

---

## Phase 1 Review Checklist

After agent says Phase 1 is complete:

### Database
- [ ] Run: `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'captain_%';`
- [ ] Verify exactly 7 tables exist (not more, not less)
- [ ] Compare each table against DATABASE_SCHEMA.sql

### APIs
- [ ] Test: `curl localhost:3000/api/captain/venues` - returns JSON
- [ ] Test: `curl localhost:3000/api/captain/games/live` - returns JSON
- [ ] Test: POST to /api/captain/waitlist/join - works with auth
- [ ] Verify no extra endpoints were created

### UI
- [ ] Visit /captain/login - see PIN login screen
- [ ] Visit /captain/dashboard - see staff terminal
- [ ] Visit /hub/captain - see player waitlist view
- [ ] Verify NO EMOJIS anywhere
- [ ] Verify colors match Facebook palette
- [ ] Verify font is Inter

### Functionality
- [ ] Can staff login with PIN
- [ ] Can player join waitlist
- [ ] Can staff see waitlist
- [ ] Can staff call player (SMS sends)
- [ ] Can staff seat player
- [ ] Real-time updates work

---

## Phase 2 Review Checklist

After agent says Phase 2 is complete:

### Database
- [ ] 3 additional tables exist (captain_player_sessions, etc.)
- [ ] Compare against DATABASE_SCHEMA.sql

### Functionality
- [ ] Can create/edit tables
- [ ] Can open games on tables
- [ ] Seats show correctly (9 per table)
- [ ] Must-move games work
- [ ] Sessions track automatically
- [ ] XP awards work

---

## Phase 3 Review Checklist

After agent says Phase 3 is complete:

### Database
- [ ] Tournament tables exist
- [ ] Compare against DATABASE_SCHEMA.sql

### Functionality
- [ ] Can create tournament with blind structure
- [ ] Can register players
- [ ] Clock displays and updates
- [ ] Can pause/resume clock
- [ ] Levels advance correctly
- [ ] Eliminations work
- [ ] Payouts record correctly

---

## Phase 4 Review Checklist

After agent says Phase 4 is complete:

### Database
- [ ] Home game tables exist
- [ ] Compare against DATABASE_SCHEMA.sql

### Functionality
- [ ] Can create home game (all visibility levels)
- [ ] Discovery shows public games
- [ ] Invite codes work
- [ ] RSVP flow works
- [ ] Host can approve/decline
- [ ] Address hidden until approved
- [ ] Reviews work

---

## Phase 5 Review Checklist

After agent says Phase 5 is complete:

### Database
- [ ] Promotion tables exist
- [ ] Analytics tables exist

### Functionality
- [ ] Can create promotions
- [ ] High hands track correctly
- [ ] Analytics dashboard shows data
- [ ] Charts render

---

## Phase 6 Review Checklist

### Quality
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Load test passes
- [ ] Security audit complete

### Documentation
- [ ] Staff guide exists
- [ ] Player FAQ exists

---

## Red Flags - Immediate Rejection

Reject immediately if you see:

1. **Emojis anywhere in UI**
2. **Colors not in the spec** (purple, pink, orange, gradients)
3. **Tables not in DATABASE_SCHEMA.sql**
4. **APIs not in API_REFERENCE.md**
5. **Features described as "I added..." or "I improved..."**
6. **Different fonts than Inter**
7. **Files in wrong directories**
8. **"I think this would be better..."**
9. **Skipped validation steps**
10. **Changes to existing non-captain code**

---

## What To Say When Rejecting

```
REJECTED.

Reason: [specific issue]
Reference: [which spec file was violated]
Action: Revert changes and implement as specified.

Do not proceed until this is fixed.
```

---

## What To Say When Approving

```
APPROVED for Phase [X].

Validation script: PASSED
Visual review: PASSED
Functionality test: PASSED

Proceed to Phase [X+1].
```

---

## Session Start Prompt

Copy this when starting a new build session:

```
Build Smarter Captain Phase [X].

REQUIREMENTS:
1. Read .agent/skills/smarter-captain/AGENT_INSTRUCTIONS.md first
2. Provide the confirmation checklist before starting
3. Follow IMPLEMENTATION_PHASES.md step by step
4. Only create items listed in SCOPE_LOCK.md for Phase [X]
5. Run validation after each step

Do not invent features. Do not improve the spec. Implement exactly as documented.
```
