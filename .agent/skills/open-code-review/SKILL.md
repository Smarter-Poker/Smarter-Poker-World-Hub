---
name: Open Code Review (OCR)
description: Multi-agent code review tool that simulates a customizable team of engineers performing code review with built-in discourse. Use when you need rigorous multi-perspective code auditing, security reviews, or requirements verification.
---

# Open Code Review (OCR) v1.9.0

> **AI-powered multi-agent code review** — Simulates a customizable team of Engineers performing code review with built-in discourse and debate.

## When to Use This Skill

- **Pre-deployment code audit** — Run a full multi-agent review before pushing to production
- **Security review** — Specialized security personas audit for vulnerabilities
- **Requirements verification** — Review code against spec files or acceptance criteria
- **Large changeset navigation** — Code Review Maps for 20+ file changes
- **Quality assurance** — Multiple independent reviewers catch what a single pass misses

## GitHub

- **Repo**: [spencermarx/open-code-review](https://github.com/spencermarx/open-code-review)
- **npm**: `@open-code-review/cli` (installed globally)
- **License**: Apache-2.0

## How It Works

```
Tech Lead (orchestrator)
    ├── Reviewer 1 (e.g., Principal Engineer)
    ├── Reviewer 2 (e.g., Security Specialist)
    └── Reviewer 3 (e.g., Quality Lead)
         │
    Discourse Phase (reviewers debate findings)
         │
    Final Synthesis (unified, prioritized feedback)
```

1. **Context Discovery** — Scans CLAUDE.md, .cursorrules, project standards
2. **Change Context** — Analyzes git diff and affected files
3. **Tech Lead Analysis** — Assigns review strategy
4. **Parallel Reviews** — Multiple agents review independently
5. **Findings Aggregation** — Collects all individual findings
6. **Reviewer Discourse** — Agents AGREE, CHALLENGE, CONNECT, or SURFACE issues
7. **Final Synthesis** — Unified, severity-ranked output
8. **GitHub PR Posting** — Optional post to PR with inline comments

## Quick Start

### First-Time Setup (run once per project)

```bash
# Initialize OCR in the project (interactive — select your AI tools)
ocr init
```

### Run a Review

```bash
# Stage your changes first
git add .

# Then from your AI assistant:
/ocr:review                                    # Review staged changes
/ocr:review Review against openspec/spec.md    # With requirements
/ocr:review --team security,performance        # Specific team
```

### Dashboard

```bash
# Launch the web dashboard for review browsing
ocr dashboard

# Monitor review progress in real-time
ocr progress
```

## 28 Built-In Reviewer Personas

### Generalists
- Principal Engineer (2 instances)
- Quality Reviewer (2 instances)

### Specialists
- Security Specialist
- Performance Engineer
- API Designer
- Test Engineer
- Accessibility Expert

### Famous Engineers
- Martin Fowler (refactoring, design patterns)
- Kent Beck (TDD, simplicity)
- Sandi Metz (OOP, SOLID principles)
- And more...

### Custom
- Create your own persistent reviewers with custom prompts and focus areas

## Key Commands

| Command | What It Does |
|---------|-------------|
| `ocr init` | Initialize OCR for a project |
| `ocr dashboard` | Launch web dashboard |
| `ocr progress` | Real-time review progress |
| `/ocr:review` | Start a multi-agent review |
| `/ocr:map` | Generate Code Review Map for large changesets |
| `/ocr:post` | Post review to GitHub PR |
| `/ocr:doctor` | Verify installation |
| `/ocr:reviewers` | List available reviewer personas |
| `/ocr:history` | List past review sessions |
| `/ocr:show [session]` | Display a specific past review |

## Requirements-Aware Review

Pass spec files, proposals, or inline requirements. Every reviewer evaluates against your stated criteria:

```bash
/ocr:review Review against openspec/specs/cli/spec.md    # Spec file
/ocr:review Check against proposal.md                     # Proposal
/ocr:review Requirements:                                 # Inline
  - Max 100 requests per minute per user
  - Return 429 with Retry-After header
```

## GitHub PR Integration

```bash
# Post review to PR (requires gh CLI authenticated)
/ocr:post

# Two modes:
# 1. Team Review — Posts multi-reviewer synthesis as-is
# 2. Human Review — AI-rewrites into natural voice following Google's code review guidelines
```

## Multi-Round Reviews

Running `/ocr:review` on an existing session automatically starts a new round. Previous rounds are preserved — shared context is reused across rounds.

## Configuration

OCR stores data in `.ocr/` directory using SQLite. Discovers project standards from:
- `CLAUDE.md` — Project standards
- `.cursorrules` — Cursor-specific rules
- OpenSpec configs — Spec-driven requirements

## Activation

**CLI**: Already installed globally (`ocr` command available)
**In Antigravity**: Run `ocr init` once, then use commands via terminal
**In Claude Code**: Slash commands `/ocr:review`, `/ocr:map`, `/ocr:post` available after init
