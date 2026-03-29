---
name: Playwright MCP — Browser Automation & E2E Testing
description: Automated browser testing via the Playwright MCP server. Use for E2E testing, visual regression, screenshot capture, and UI verification on any Smarter.Poker page.
---

# Playwright MCP — Browser Automation & E2E Testing

> **Automated browser control** — Navigate pages, click elements, fill forms, take screenshots, and run E2E test assertions directly from the agent.

## When to Use This Skill

- **Post-deploy verification** — Automatically test hub pages after Vercel deployment
- **Visual regression** — Screenshot pages and compare against expected layouts
- **E2E flows** — Login, signup, bankroll entry, social post creation
- **UI debugging** — Inspect DOM, check console errors, validate responsive layouts

## Installation Status

**MCP server:** `playwright` (user scope)
**Command:** `npx -y @playwright/mcp@latest`
**Status:** ✓ Connected
**Browser:** Chromium installed via `npx playwright install chromium`

## GitHub

- **Repo:** https://github.com/playwright-community/mcp
- **npm:** `@playwright/mcp`

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

## Usage Examples

**Screenshot a page:**
> "Use Playwright to navigate to https://smarter.poker/hub/poker-near-me and take a screenshot"

**E2E login flow:**
> "Use Playwright to test the login flow: go to /login, enter test credentials, submit, and verify the dashboard loads"

**Console error check:**
> "Navigate to /hub/training with Playwright and check for any JavaScript console errors"

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
