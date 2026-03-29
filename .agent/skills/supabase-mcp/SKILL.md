---
name: Supabase MCP — Direct Database Access
description: Direct database access via the Supabase MCP server. Use for schema inspection, SQL queries, migration management, RLS policy verification, and real-time data debugging.
---

# Supabase MCP — Direct Database Access

> **Direct database access** — Query schemas, run SQL, manage migrations, and inspect RLS policies without leaving the agent.

## When to Use This Skill

- **Schema inspection** — View table structures, columns, types, and FK relations
- **Data debugging** — Query live data to diagnose scraper/pipeline issues
- **Migration management** — Create and run database migrations
- **RLS verification** — Inspect row-level security policies
- **Type generation** — Generate TypeScript types from live schema

## Installation Status

**MCP server:** `supabase` (user scope, HTTP transport)
**URL:** `https://mcp.supabase.com/mcp`
**Status:** ⚠️ Needs one-time OAuth login from a Claude Code session
**Auth:** Run `/mcp` in Claude Code, select `supabase`, then authenticate in browser

## GitHub

- **Repo:** https://github.com/supabase-community/supabase-mcp
- **npm:** `@supabase/mcp-server-supabase`

## First-Time Setup

1. Open a Claude Code session
2. Type `/mcp`
3. Select `supabase`
4. Click "Authenticate" — browser will open
5. Log in with Supabase credentials
6. Done — persists across sessions

## Key Tables for Smarter.Poker

| Table | Purpose |
|-------|---------|
| `venue_live_tables` | Real-time scraper data (Bravo + PokerAtlas) |
| `poker_events` | Tournament/event calendar data |
| `profiles` | User profiles, VIP status, avatar |
| `social_posts` | Social feed content |
| `training_sessions` | GTO training history |
| `bankroll_sessions` | Bankroll tracking data |
| `trivia_scores` | Trivia leaderboard data |
| `geeves_missed_questions` | Help bot unanswered questions |

## Usage Examples

> "List all tables in the Supabase schema"
> "Show me the structure of the venue_live_tables table"
> "Query the last 10 scraper entries to check data freshness"
> "Check RLS policies on the profiles table"
