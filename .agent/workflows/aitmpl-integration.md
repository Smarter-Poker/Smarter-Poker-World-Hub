---
description: Integration workflow with aitmpl.com Claude Code Templates for premium Smarter.Poker development
---

# aitmpl.com Integration Workflow

This workflow combines the **ClaudeKit battle-tested methodology** with our custom **Futuristic Metal UI** and **Superstar Agent** skills.

## Quick Setup

### 1. Install ClaudeKit CLI
```bash
# Login with GitHub
gh auth login

# Install ClaudeKit CLI globally
npm i -g claudekit-cli

# Initialize in Smarter.Poker project
cd /Users/smarter.poker/Documents/Smarter-Poker-World-Hub
ck init
```

### 2. Install aitmpl.com Templates
```bash
# Run health check
npx claude-code-templates@latest --health-check

# View analytics dashboard
npx claude-code-templates@latest --analytics

# Browse available agents
npx claude-code-templates@latest --plugins
```

---

## The Smarter.Poker Workflow

Combines ClaudeKit's battle-tested workflow with our custom skills:

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: INITIALIZATION                                     │
│  ┌───────────┐    ┌────────────────┐    ┌─────────────────┐ │
│  │/docs:init │ -> │ Load Custom    │ -> │ futuristic-     │ │
│  │           │    │ Skills         │    │ metal-ui SKILL  │ │
│  └───────────┘    └────────────────┘    └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: REQUIREMENTS                                       │
│  ┌───────────┐    ┌────────────────┐    ┌─────────────────┐ │
│  │/brainstorm│ -> │ BrainGrid      │ -> │ superstar-agent │ │
│  │           │    │ PM Agent       │    │ multi-agent     │ │
│  └───────────┘    └────────────────┘    └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 3: PLANNING                                           │
│  ┌───────────┐    ┌────────────────┐    ┌─────────────────┐ │
│  │/plan      │ -> │ Create         │ -> │ Apply Futuristic│ │
│  │           │    │ implementation │    │ Metal design    │ │
│  │           │    │ _plan.md       │    │ tokens          │ │
│  └───────────┘    └────────────────┘    └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 4: CLEAN SLATE                                        │
│  ┌───────────┐                                               │
│  │/clear     │    Fresh context for implementation           │
│  └───────────┘                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 5: IMPLEMENTATION                                     │
│  ┌───────────┐    ┌────────────────┐    ┌─────────────────┐ │
│  │/code:auto │ -> │ Frontend       │ -> │ Standards       │ │
│  │or /cook   │    │ Engineer       │    │ Agent review    │ │
│  └───────────┘    └────────────────┘    └─────────────────┘ │
│                                              │              │
│                            ┌─────────────────┘              │
│                            ▼                                 │
│                   ┌─────────────────┐    ┌─────────────────┐ │
│                   │ UI Critic       │ -> │ Self-healing    │ │
│                   │ verify premium  │    │ fix loop        │ │
│                   └─────────────────┘    └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## ClaudeKit Commands Reference

| Command | Function | When to Use |
|---------|----------|-------------|
| `/docs:init` | Scan codebase, generate specs | Start of project or major refactor |
| `/brainstorm` | Requirements gathering with AI | New feature ideation |
| `/plan` | Parallel research, impl plan | Before any build |
| `/clear` | Fresh context window | Before implementation |
| `/code:auto` | Full auto implementation | Hands-off building |
| `/cook` | Standalone implementation | Quick feature builds |
| `/code:review` | Security + performance audit | Before deploys |
| `/watzup` | Project health metrics | Status checks |

---

## Stack Builder Configuration

Use the aitmpl.com Stack Builder to create a custom install command for Smarter.Poker:

### Recommended Stack
```
🤖 Agents:
  - ClaudeKit Engineer
  - BrainGrid (PM)
  
⚡ Commands:
  - /docs:init
  - /brainstorm
  - /plan
  - /code:auto
  - /cook
  - /code:review
  
⚙️ Settings:
  - Claude Opus 4.5 optimized
  - High effort for UI tasks
  
🪝 Hooks:
  - Pre-commit lint check
  - Post-implement UI review
  
🔌 MCPs:
  - Supabase MCP
  - Stripe MCP
  
🎨 Skills:
  - futuristic-metal-ui (custom)
  - superstar-agent (custom)
```

---

## Example: Building a Premium Feature

### Step 1: Initialize
```
/docs:init
```
This scans the codebase and loads our custom skills including `futuristic-metal-ui`.

### Step 2: Brainstorm
```
/brainstorm Build a premium Club Leaderboard with metal frame, 
neon stats displays, and animated rank changes
```

### Step 3: Plan
```
/plan
```
Creates implementation_plan.md with phases, applying our design tokens.

### Step 4: Clear Context
```
/clear
```

### Step 5: Implement
```
/code:auto
```
Or for more control:
```
/cook
```

### Step 6: Review
```
/code:review
```
Triggers Standards Agent and UI Critic from our superstar-agent skill.

---

## Premium Validation Checklist

Before any feature is complete, verify:

### From ClaudeKit
- [ ] Tests written and passing
- [ ] Code review completed
- [ ] Security audit passed
- [ ] Specs updated

### From futuristic-metal-ui
- [ ] Uses dark navy/gunmetal base
- [ ] Has metal frames with bolts/rivets
- [ ] Includes neon cyan accents
- [ ] Uses industrial typography
- [ ] Feels like casino hardware

### From superstar-agent
- [ ] Self-healing loop completed
- [ ] No violations from UI Critic
- [ ] Build passes
- [ ] Deployed and verified

---

## Resources

- **aitmpl.com Agents**: https://www.aitmpl.com/agents
- **ClaudeKit**: https://claudekit.cc
- **Documentation**: https://docs.aitmpl.com/
- **Stack Builder**: https://www.aitmpl.com/agents (sidebar tool)
- **Discord**: https://discord.gg/dyTTwzBhwY
