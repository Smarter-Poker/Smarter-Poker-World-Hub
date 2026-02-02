---
name: Superstar Agent Orchestration
description: Multi-agent Designer-Critic workflow patterns for premium quality assurance and autonomous task completion
---

# Superstar Agent Orchestration

## Overview

This skill defines the orchestration patterns for operating as a "superstar" agent on Smarter.Poker. It implements the Designer-Critic workflow, effort control strategies, and self-healing quality assurance loops.

## Claude Opus 4.5 Capabilities

### Benchmark Performance
| Metric | Score | Implication |
|--------|-------|-------------|
| SWE-bench Verified | 80.9% | Handle complex refactors autonomously |
| ARC-AGI-2 (Abstract Reasoning) | 37.6% | Reason about GTO poker logic and game trees |
| Terminal-Bench | 59.3% | Execute deployment and system admin reliably |

### Effort Control Strategy

Dynamically adjust computational depth based on task complexity:

| Task Type | Effort Level | Examples |
|-----------|--------------|----------|
| Simple CSS fix | Low | Button color change, margin adjustment |
| Component creation | Medium | New card component, form validation |
| Architecture design | High | Real-time sync layer, GTO solver integration |
| Premium UI build | Maximum | Full page with Futuristic Metal aesthetic |

---

## Multi-Agent Designer-Critic Pattern

### Workflow Phases

```
┌──────────────────────────────────────────────────────────────┐
│  PLANNING PHASE                                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
│  │ BrainGrid   │ -> │ Requirement │ -> │ Feasibility │       │
│  │ (PM Layer)  │    │ Analysis    │    │ Check       │       │
│  └─────────────┘    └─────────────┘    └─────────────┘       │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  IMPLEMENTATION PHASE                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
│  │ Frontend    │ -> │ Backend     │ -> │ Integration │       │
│  │ Engineer    │    │ Engineer    │    │ Testing     │       │
│  └─────────────┘    └─────────────┘    └─────────────┘       │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  VERIFICATION PHASE (Self-Healing Loop)                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
│  │ Standards   │ -> │ UI Critic   │ -> │ Fixer Agent │       │
│  │ Agent       │    │             │    │             │       │
│  └─────────────┘    └─────────────┘    └─────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

### Agent Personas

#### 1. Frontend Engineer Agent
**Trigger:** Creating or modifying React/JSX components
**Responsibilities:**
- Implement UI components following Futuristic Metal design system
- Ensure responsive behavior
- Wire up state management and API calls
- Apply proper animations

#### 2. Standards Agent
**Trigger:** After any implementation completes
**Responsibilities:**
- Verify code follows project conventions
- Check design system compliance
- Ensure TypeScript/ESLint rules pass
- Validate accessibility

#### 3. UI Critic Agent
**Trigger:** After visual components are created
**Responsibilities:**
- Verify Futuristic Metal aesthetic is achieved
- Check for presence of: metal frames, bolts, neon accents
- Ensure no flat/generic styling leaked through
- Validate micro-interactions exist

#### 4. Fixer Agent
**Trigger:** When Standards or UI Critic detects violations
**Responsibilities:**
- Create targeted fix plan
- Apply corrections without breaking other code
- Re-run verification

---

## ClaudeKit Commands

Leverage these commands for structured workflows:

| Command | Function | When to Use |
|---------|----------|-------------|
| `/cook` | Standalone implementation with planning | New feature builds |
| `/code:review` | Security and performance audit | Before major deploys |
| `/watzup` | Project health and milestone tracking | Status checks |
| `/clear` | Reset context before implementation | Clean slate needed |

---

## Task Management Protocol

### 1. task.md Structure
```markdown
# Current Task: [Feature Name]

## Objective
[Clear statement of what we're building]

## Acceptance Criteria
- [ ] Component renders correctly
- [ ] Follows Futuristic Metal design system
- [ ] Has proper animations
- [ ] Passes build without errors
- [ ] Tested in browser

## Progress
- [x] Created base component
- [x] Applied metal frame styling
- [ ] Added neon accents
- [ ] Wired up interactions
```

### 2. implementation_plan.md Structure
```markdown
# Implementation Plan: [Feature Name]

## Proposed Changes

### Component: [Name]
- File: `/path/to/file.tsx`
- Changes: [Description]

### Styling
- Apply Futuristic Metal tokens
- Add bolt decorations
- Include neon accent strips

## Verification Plan
1. Run `npm run build`
2. Open in browser
3. Screenshot and verify against design system
4. Check animations work
```

---

## Quality Assurance Checklist

Before marking any task complete:

### Code Quality
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Build passes successfully
- [ ] No console errors in browser

### Design Compliance
- [ ] Uses Futuristic Metal color palette
- [ ] Has metal frame elements where appropriate
- [ ] Includes neon cyan accents
- [ ] Typography uses Orbitron/Rajdhani
- [ ] Feels like casino hardware, not generic web app

### Functionality
- [ ] All buttons/links work
- [ ] State management correct
- [ ] API calls succeed
- [ ] Error states handled

### Performance
- [ ] No unnecessary re-renders
- [ ] Images optimized
- [ ] Animations smooth (60fps)

---

## Thinking Block Preservation

For multi-phase tasks, maintain reasoning continuity:

1. **Document key decisions** in implementation_plan.md
2. **Track progress** in task.md
3. **Log blockers** explicitly
4. **Summarize state** at each phase transition

This ensures context is not lost between planning, implementation, and verification phases.

---

## Self-Healing Workflow

When issues are detected:

```
1. DETECT: Standards/Critic agent finds violation
2. DIAGNOSE: Identify root cause and file location
3. PLAN: Create minimal fix that doesn't break other code
4. FIX: Apply targeted changes
5. VERIFY: Re-run checks to confirm resolution
6. DOCUMENT: Update task.md with resolution
```

Never leave a task in a broken state. Always complete the self-healing loop before moving on.
