---
name: Playwright MCP — Browser Automation & E2E Testing
description: THE ONLY authorized automated browser testing tool. Replaces browser_subagent entirely. Use Playwright MCP for ALL agent-driven navigation, screenshots, E2E flows, and UI verification on any Smarter.Poker page.
---

# Playwright MCP — Browser Automation & E2E Testing

> **This is the ONLY tool authorized for automated browser testing.**
> `browser_subagent` is broken — it requires the IDE's browser panel to be open and will fail silently when it's not. **Always use Playwright MCP instead.**

---

## Why Playwright MCP — Not browser_subagent

| | `browser_subagent` | Playwright MCP |
|---|---|---|
| Requires IDE browser open? | ✅ Yes — fails when closed | ❌ No — fully independent |
| Own Chromium install? | ❌ No | ✅ Yes (`ms-playwright/chromium`) |
| Works when IDE is idle? | ❌ No | ✅ Always |
| Reliable for agents? | ❌ Never | ✅ Always |

---

## Installation Status

**MCP server:** `playwright` (user scope)
**Command:** `npx -y @playwright/mcp@latest`
**Status:** ✓ Connected
**Browser:** Chromium installed at `/Users/smarter.poker/Library/Caches/ms-playwright/chromium-1208/`

---

## When to Use This Skill

- **Post-deploy verification** — Automatically test hub pages after Vercel deployment
- **Visual regression** — Screenshot pages and compare against expected layouts
- **E2E flows** — Login, signup, bankroll entry, social post creation
- **UI debugging** — Inspect DOM, check console errors, validate responsive layouts
- **Smoke testing** — Any time `browser_subagent` would have been used

---

## GitHub

- **Repo:** https://github.com/playwright-community/mcp
- **npm:** `@playwright/mcp`

---

## Available Tools (via MCP)

| Tool | Purpose |
|------|---------| 
| `browser_navigate` | Go to a URL |
| `browser_click` | Click an element |
| `browser_type` | Type into an input |
| `browser_screenshot` | Capture a screenshot |
| `browser_evaluate` | Run JavaScript in the page |
| `browser_wait` | Wait for element/condition |
| `browser_get_text` | Extract text content |

---

## Reusable Agent Script — `scripts/playwright-test.js`

A production-ready helper script lives at `scripts/playwright-test.js`. **Always use this instead of writing custom node code.**

```bash
# Navigate + screenshot
node scripts/playwright-test.js --url https://smarter.poker --screenshot /tmp/out.png

# Navigate + check for JS console errors
node scripts/playwright-test.js --url https://smarter.poker/hub/social-media --check-console

# Navigate + login as test account first
node scripts/playwright-test.js --url https://smarter.poker/hub/bankroll --login --screenshot /tmp/bankroll.png

# Extract text from a CSS selector
node scripts/playwright-test.js --url https://smarter.poker --text "h1"

# Extra wait for slow pages (ms)
node scripts/playwright-test.js --url https://smarter.poker/hub/training --wait 5000 --check-console
```

Output always contains `PLAYWRIGHT_TEST:PASS` or `PLAYWRIGHT_TEST:FAIL` and `CONSOLE_ERRORS:<count>`. Exit code 0 = success.

---

## Usage Examples

---

## Smarter.Poker Test Targets

| Page | URL | What to Verify |
|------|-----|---------------|
| Poker Near Me | `/hub/poker-near-me` | Venue cards render, map loads |
| PNM Lobby | `/hub/poker-near-me-lobby` | Tab navigation, live data |
| Daily Tournaments | `/hub/daily-tournaments` | Tournament table, filters |
| Training Hub | `/hub/training` | Game cards, session start |
| Social Media | `/hub/social-media` | Feed loads, post creation |
| Trivia | `/hub/trivia` | Game modes, question display |
| Bankroll | `/hub/bankroll` | Dashboard metrics |
| Login | `/login` | Form renders, auth flow |

---

## Test Credentials

- **Email:** `daniel@bekavactrading.com`
- **Password:** `<TEST_USER_PASSWORD — see .env.local, never commit>`
