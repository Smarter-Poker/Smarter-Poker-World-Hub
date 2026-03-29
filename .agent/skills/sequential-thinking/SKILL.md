---
name: Sequential Thinking MCP — Structured Reasoning Engine
description: Forces step-by-step reasoning with revision and branching for complex architectural decisions, debugging, and multi-phase planning. Use for ambiguous problems where jumping to conclusions would be risky.
---

# Sequential Thinking MCP — Structured Reasoning Engine

> **External reasoning notebook** — Forces explicit, step-by-step problem solving with the ability to revise earlier steps, branch into alternative solutions, and dynamically adjust the plan.

## When to Use This Skill

- **Architecture design** — Complex systems like realtime sync, GTO engines, auth flows
- **Multi-layer debugging** — Issues spanning auth → session → RLS → query → UI
- **Ambiguous requirements** — When the full scope isn't clear upfront
- **Refactoring decisions** — Evaluating tradeoffs before touching 35+ files
- **Risk analysis** — Exploring "what could go wrong" scenarios

## Installation Status

**MCP server:** `sequential-thinking` (user scope)
**Command:** `npx -y @modelcontextprotocol/server-sequential-thinking`
**Status:** ✓ Connected

## GitHub

- **Repo:** https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking
- **npm:** `@modelcontextprotocol/server-sequential-thinking`

## How It Works

```
Step 1: Define the problem
    ↓
Step 2: Break into sub-problems
    ↓
Step 3: Analyze each sub-problem
    ↓  ← Can REVISE earlier steps
    ↓  ← Can BRANCH into alternatives
Step 4: Evaluate tradeoffs
    ↓
Step 5: Synthesize solution
    ↓
[Dynamic: Total steps adjusts as understanding deepens]
```

## Features

| Feature | Description |
|---------|-------------|
| **Numbered Steps** | Every thought is explicitly numbered |
| **Revision** | Can go back and fix earlier reasoning |
| **Branching** | Explore alternative solution paths |
| **Dynamic Planning** | Adjust total step count mid-process |
| **Traceability** | Clear audit trail of how a decision was reached |

## Usage Examples

> "Use sequential thinking to design the architecture for adding real-time game alerts to Poker Near Me"
> "Think through step by step: what's causing the auth redirect loop on mobile Safari?"
> "Use structured reasoning to evaluate whether we should migrate from CSS to Tailwind"

## Best For in Smarter.Poker

| Problem | Why Sequential Thinking Helps |
|---------|------------------------------|
| GTO 3-engine architecture | Complex dependency analysis |
| Club Arena realtime sync | Multi-layer state management |
| Scraper pipeline resilience | Failure mode enumeration |
| Auth flow Safari issues | Multi-step debugging |
| Training module refactor | Impact analysis across 35+ pages |
