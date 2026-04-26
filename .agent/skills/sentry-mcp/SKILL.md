---
name: Sentry MCP — AI-Powered Error Triage
description: Query Sentry error logs, stack traces, and user impact data directly from the agent. Use for post-deploy error monitoring, debugging production issues, and prioritizing bugs by impact.
---

> [!CAUTION]
> **AUTO-FIX PIPELINE DISABLED (2026-04-26)** — Do NOT auto-remediate Sentry errors after deploys. Query Sentry to gather diagnostics, then **STOP and report findings to the user**. The user will decide what to fix and when. Do NOT autonomously push fixes based on Sentry data.

# Sentry MCP — AI-Powered Error Triage

> **Production error intelligence** — Query error traces, stack traces, and user impact data directly. Diagnose issues without opening the Sentry dashboard.

## When to Use This Skill

- **Post-deploy checks** — Check for new errors after every Vercel deployment
- **Bug triage** — Identify most impactful errors by user count
- **Stack trace analysis** — Read full error context without leaving the agent
- **Error correlation** — Link scraper failures to frontend error spikes
- **Proactive monitoring** — Surface issues before users report them

## Installation Status

**MCP server:** `sentry` (user scope)
**Command:** `npx -y @sentry/mcp-server@latest --access-token <token>`
**Auth:** Sentry User Auth Token (from credentials)
**Status:** ✓ Connected

## GitHub

- **Repo:** https://github.com/getsentry/sentry-mcp
- **npm:** `@sentry/mcp-server`
- **Docs:** https://docs.sentry.io/product/integrations/mcp/

## Available Tools

| Tool | Purpose |
|------|---------|
| `list_organizations` | List Sentry organizations |
| `list_projects` | List projects in an org |
| `list_issues` | List error issues with filters |
| `get_issue_details` | Get full issue context |
| `list_issue_events` | Get individual error events |
| `resolve_issue` | Mark an issue as resolved |
| `search_issues` | Search by query |

## Usage Examples

> "Check Sentry for any new errors in the last hour"
> "What are the top 5 unresolved errors by user impact?"
> "Show me the stack trace for the most recent 500 error on poker-near-me"
> "List all errors tagged with 'scraper' from the last 24 hours"

## Smarter.Poker Sentry Project

- **Organization:** Check with `list_organizations`
- **Project:** hub-vanguard (or equivalent)
- **DSN:** Configured in `next.config.js` via `@sentry/nextjs`

## Post-Deploy Chain (REPORTING ONLY — Auto-Fix Disabled)

```
Vercel Deploy
    → Wait 2-3 minutes
    → Sentry: "Any new errors since deploy?"
    → Report findings to the user
    → STOP — user will decide whether to fix and how
```
