---
name: Claude Memory (claude-mem)
description: Persistent memory compression system for cross-session context. Automatically captures tool usage, generates semantic summaries, and injects relevant context into future sessions. Use when needing to recall past work, decisions, or patterns across conversations.
---

# Claude Memory (claude-mem) v10.6.2

> **Persistent memory compression system** — Automatically captures everything Claude does during coding sessions, compresses it with AI, and injects relevant context back into future sessions.

## GitHub

- **Repo**: [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) (41.8k stars)
- **Docs**: [docs.claude-mem.ai](https://docs.claude-mem.ai/)
- **License**: AGPL-3.0

## What It Does

Claude-mem gives your AI agent **persistent memory across sessions**:

1. **Automatic Capture** — Records tool usage, file edits, and project progress
2. **Semantic Compression** — AI compresses conversations into searchable summaries
3. **Context Injection** — Automatically injects relevant memories into future sessions
4. **Searchable History** — Natural language queries against your full project history

## Architecture

```
Session Lifecycle Hooks (5 hooks):
├── SessionStart     → Injects relevant past context
├── UserPromptSubmit → Observes user intent
├── PostToolUse      → Captures tool activity
├── Stop             → Summarizes completed work
└── SessionEnd       → Compresses and stores session

Worker Service → HTTP API on port 37777
SQLite Database → Sessions, observations, summaries
Chroma Vector DB → Hybrid semantic + keyword search
```

## Installation Status

**Installed to**: `~/.claude/plugins/marketplaces/claude-mem/`
**Linked to**: `~/.claude/plugins/installed/claude-mem`

### How It Was Installed

```bash
# 1. Cloned to Claude Code plugin marketplace
git clone https://github.com/thedotmack/claude-mem.git ~/.claude/plugins/marketplaces/claude-mem

# 2. Installed npm dependencies
cd ~/.claude/plugins/marketplaces/claude-mem && npm install

# 3. Symlinked to installed plugins
ln -sf ~/.claude/plugins/marketplaces/claude-mem ~/.claude/plugins/installed/claude-mem
```

## Key Features

- **Progressive Disclosure** — 3-layer memory retrieval (search → timeline → details) with ~10x token savings
- **MCP Search Tools** — 4 MCP tools for intelligent memory search
- **Web Viewer UI** — Real-time memory stream at http://localhost:37777
- **Privacy Control** — Use `<private>` tags to exclude sensitive content
- **Context Configuration** — Fine-grained control over what gets injected
- **Automatic Operation** — No manual intervention required

## MCP Search Tools

| Tool | Purpose | Tokens |
|------|---------|--------|
| `search` | Search memory index with full-text queries | ~50-100/result |
| `timeline` | Chronological context around observations | ~100-200/result |
| `get_observations` | Full observation details by IDs | ~500-1000/result |

### 3-Layer Workflow

```
1. search(query="authentication bug", type="bugfix", limit=10)
   → Get compact index with IDs

2. timeline(observation_id=123)
   → See what was happening around that observation

3. get_observations(ids=[123, 456])
   → Fetch full details for relevant IDs only
```

## Activation

Claude-mem operates as a **Claude Code native plugin** using lifecycle hooks. It activates automatically when Claude Code starts a session — no manual trigger needed.

**For Antigravity sessions**: The memory is accessible through the installed plugin hooks. Context from past sessions will appear when relevant.

**Settings**: `~/.claude-mem/settings.json` (auto-created on first run)

## Configuration

Settings are managed in `~/.claude-mem/settings.json`:
- AI model selection
- Worker port (default: 37777)
- Data directory
- Log level
- Context injection settings
