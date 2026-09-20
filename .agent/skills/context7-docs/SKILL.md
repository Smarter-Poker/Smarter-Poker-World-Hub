---
name: Context7 MCP — Live Documentation Lookup
description: Fetch real-time, version-specific documentation for Next.js, Supabase, Stripe, and thousands of other libraries. Prevents stale API patterns. Add "use context7" to any prompt.
---

# Context7 MCP — Live Documentation Lookup

> **Real-time docs** — Fetches current, version-specific documentation from official sources and injects it into the agent's context. Prevents hallucinated or outdated API patterns.

## When to Use This Skill

- **Framework APIs** — Get correct Next.js 15, React 19, or Supabase v2 patterns
- **Library updates** — Check latest API changes before writing integration code
- **Migration help** — Verify deprecated methods and their replacements
- **New features** — Discover recently added features in your stack

## Installation Status

**MCP server:** `context7` (user scope)
**Command:** `npx -y @upstash/context7-mcp@latest`
**Status:** ✓ Connected

## GitHub

- **Repo:** https://github.com/upstash/context7
- **npm:** `@upstash/context7-mcp`

## Usage

Just add `use context7` to any prompt:

> "How do I implement middleware in Next.js? use context7"
> "Show me the latest Supabase auth helpers for server components. use context7"
> "What's the correct way to configure Stripe webhooks? use context7"

## Libraries Relevant to Smarter.Poker

| Library | Context7 ID | Why We Need It |
|---------|------------|----------------|
| Next.js | `/vercel/next.js` | Core framework |
| Supabase | `/supabase/supabase` | Database, auth, realtime |
| Stripe | `/stripe/stripe-node` | Diamond store payments |
| Leaflet | `/Leaflet/Leaflet` | Poker Near Me maps |
| Framer Motion | `/framer/motion` | UI animations |
| OneSignal | `/OneSignal/onesignal-node` | Push notifications |
| Chart.js | `/chartjs/Chart.js` | Training analytics graphs |

## Rate Limits

- **Without API key:** Lower rate limits (sufficient for occasional lookups)
- **With free API key:** Higher limits — get one at https://context7.com
