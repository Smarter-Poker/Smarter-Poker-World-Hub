---
name: GitHub MCP — PR & Issue Management
description: Manage GitHub pull requests, issues, code review, and repository operations directly from the agent. Chains with OCR code review and Vercel deploy.
---

# GitHub MCP — PR & Issue Management

> **Full GitHub integration** — Create PRs, manage issues, post review comments, and manage repository operations without leaving the agent.

## When to Use This Skill

- **PR creation** — Auto-create PRs with changelogs after completing features
- **Issue tracking** — Create and assign bugs discovered during development
- **Code review** — Post OCR review findings as PR comments
- **Branch management** — Create feature branches, check status
- **Release management** — Tag releases, track milestones

## Installation Status

**MCP server:** `github` (user scope)
**Command:** `npx -y @modelcontextprotocol/server-github`
**Auth:** GitHub PAT from `gh` CLI (Smarter-Poker account)
**Status:** ✓ Connected

## GitHub

- **Repo:** https://github.com/modelcontextprotocol/servers/tree/main/src/github
- **npm:** `@modelcontextprotocol/server-github`

## Available Tools

| Tool | Purpose |
|------|---------|
| `create_or_update_file` | Create/update files in repo |
| `create_issue` | Create a new issue |
| `create_pull_request` | Create a PR |
| `list_issues` | List open issues |
| `get_pull_request` | Get PR details |
| `add_issue_comment` | Comment on an issue |
| `create_branch` | Create a new branch |
| `search_code` | Search code in the repo |
| `list_commits` | List recent commits |

## Workflow Chain

```
GSD Phase Complete
    → OCR Code Review
    → GitHub PR (with review findings)
    → Vercel Preview Deploy
    → Playwright E2E Test
    → Application Error Log Check
    → Merge to Production
```

## Usage Examples

> "Create a PR for the current branch with a changelog of today's changes"
> "Create an issue for the VenueCard mobile layout bug"
> "List all open issues labeled 'poker-near-me'"
> "Post the OCR review summary as a PR comment"

## Repository

- **Owner:** Smarter-Poker
- **Repo:** Smarter-Poker-World-Hub
- **Default branch:** main
