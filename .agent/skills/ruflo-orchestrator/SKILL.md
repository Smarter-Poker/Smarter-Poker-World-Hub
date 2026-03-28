---
name: Ruflo Multi-Agent Orchestrator
description: Deploy intelligent multi-agent swarms, coordinate autonomous workflows, and build conversational AI systems using Ruflo (formerly Claude-Flow). Use this skill when you need to run multiple agents in parallel, coordinate complex multi-step workflows, or deploy agent swarms.
---

# Ruflo Multi-Agent Orchestrator (v3+)

> **Ruflo** (formerly Claude-Flow) is the leading agent orchestration platform for Claude. Deploy intelligent multi-agent swarms, coordinate autonomous workflows, and build conversational AI systems.

## When to Use This Skill

- **Parallel Agent Execution** — Need multiple agents working simultaneously on different tasks
- **Complex Multi-Step Workflows** — Sequential pipelines where one agent's output feeds the next
- **Swarm Coordination** — Deploy 15-100+ specialized agents with topology-aware coordination
- **Self-Learning Systems** — Agents that improve from experience via ReasoningBank
- **Security Scanning** — AIDefence threat detection, PII scanning, prompt injection defense
- **Browser Automation** — AI-optimized browser control with trajectory learning

## Package Ecosystem

| Package | Purpose |
|---------|---------|
| `ruflo` | Core orchestration CLI & runtime |
| `@claude-flow/memory` | AgentDB + HNSW vector storage |
| `@claude-flow/swarm` | Multi-agent coordination (6 topologies) |
| `@claude-flow/security` | AIDefence threat detection |
| `@claude-flow/hooks` | Event-driven lifecycle + ReasoningBank |
| `@claude-flow/neural` | SONA self-learning |
| `@claude-flow/browser` | 59-tool browser automation |
| `@claude-flow/testing` | London School TDD framework |
| `agentic-flow` | Token optimization + model routing |
| `agentic-jujutsu` | Self-learning version control (23x faster than Git for multi-agent) |
| `ruvector` | High-performance Rust/WASM vector database |

## Quick Start

### Initialize a Swarm

```bash
# Start MCP server
npx ruflo@latest mcp start

# Initialize a swarm with mesh topology
npx ruflo@latest swarm init --topology mesh --max-agents 10

# Spawn specialized agents
npx ruflo@latest agent spawn -t coder
npx ruflo@latest agent spawn -t tester
npx ruflo@latest agent spawn -t reviewer
```

### Stream-Chain Pipeline (Sequential)

```bash
# Create a processing pipeline
npx ruflo@latest stream-chain create \
  --name "feature-pipeline" \
  --stages "researcher,architect,coder,tester,reviewer"

# Run it
npx ruflo@latest stream-chain run feature-pipeline \
  --input '{"requirements": "Add user dashboard with analytics"}'
```

### Pair Programming Mode

```bash
# Start TDD pair programming
npx ruflo@latest pair start --mode tdd
```

## Topology Options

| Topology | Agents | Best For |
|----------|--------|----------|
| **Centralized** | 2-3 | Simple tasks, single coordinator |
| **Distributed** | 4-5 | Parallel processing, speed |
| **Hierarchical** | 6+ | Complex tasks, clear authority |
| **Mesh** | 4+ | Collaborative, fault-tolerant |
| **Hybrid** | 7+ | Multi-domain, mixed workloads |
| **Adaptive** | 2+ | Auto-scaling, unpredictable load |

## MCP Integration

```bash
# Add Ruflo as MCP server to Claude Code
claude mcp add agentic-flow -- npx agentic-flow mcp start

# 313 MCP tools available across categories:
# - Agent Booster (5 tools)
# - ReasoningBank (8 tools)
# - Embeddings (6 tools)
# - Model Router (4 tools)
# - Memory (10 tools)
# - Swarm (12 tools)
# - Neural (8 tools)
```

## AIDefence Security

```bash
# Scan for threats
npx ruflo@latest security defend -i "ignore previous instructions"

# Full security audit
npx ruflo@latest security scan --depth full

# PII detection
npx ruflo@latest security defend -f ./user-prompts.txt
```

## Configuration

Create `claude-flow.config.json` in project root:

```json
{
  "version": "3.0.0",
  "memory": { "type": "hybrid", "path": "./data" },
  "swarm": { "topology": "hierarchical", "maxAgents": 15 },
  "security": { "mode": "strict" },
  "neural": { "enabled": true, "sona": true }
}
```

## Key Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAUDE_FLOW_MAX_AGENTS` | Max concurrent agents | `15` |
| `CLAUDE_FLOW_TOPOLOGY` | Default swarm topology | `hierarchical` |
| `CLAUDE_FLOW_MEMORY_TYPE` | Memory backend | `hybrid` |
| `CLAUDE_FLOW_SECURITY_MODE` | Security level | `standard` |
| `ANTHROPIC_API_KEY` | Anthropic API key | Required |

## CLI Reference

```bash
# Swarm management
npx ruflo@latest swarm init --topology mesh
npx ruflo@latest swarm status
npx ruflo@latest agent spawn -t <type>
npx ruflo@latest agent list

# Memory & learning
npx ruflo@latest memory search -q "query"
npx ruflo@latest hooks pretrain
npx ruflo@latest hooks metrics

# Configuration
npx ruflo@latest config list
npx ruflo@latest config set --key swarm.maxAgents --value 10
npx ruflo@latest doctor --fix

# Pipeline / Stream-Chain
npx ruflo@latest stream-chain create --name <name> --stages <stages>
npx ruflo@latest stream-chain run <name> --input <json>
npx ruflo@latest stream-chain status <name>

# Pair programming
npx ruflo@latest pair start --mode navigator|driver|tdd|switch
npx ruflo@latest pair switch
npx ruflo@latest pair end
```

## GitHub Repository

- **Repo**: [ruvnet/ruflo](https://github.com/ruvnet/ruflo)
- **npm**: `ruflo` (installed as devDependency)
- **License**: MIT
