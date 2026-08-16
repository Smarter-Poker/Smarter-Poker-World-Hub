---
description: Live testing guidelines. Fast execution for minor UI/CSS updates via localhost, Production for all other tests.
---

# Live Testing & Verification Standard

> **🚨 RULE UPDATE:** Agents MAY use `http://localhost:3000` (`dev-server`) to rapidly verify layout/UI and CSS changes. All complex functionality, API, DB, and backend checks MUST still use production (`https://smarter.poker`).

## Base URLs

| Purpose | URL |
|---------|-----|
| **UI/CSS & Layout Verification (Fast)** | `http://localhost:3000` via `dev-server` |
| **All Other Testing & Verification** | `https://smarter.poker` |
| **Club Arena** | `https://smarter.poker/club-arena` |
| **World Hub** | `https://smarter.poker/hub` |

## Accelerated Workflows ("Fast" Execution Paths)

> **⚡ SPEED OPTIMIZATION:** For minor fixes or layout bugs, explicitly invoke the `/gsd-fast` or `/gsd-quick` workflow in your instruction to bypass full planning docs and subagent overheads.
- **Why?** Generating implementation plans and walkthroughs for simple visual tweaks wastes time. Force the system to use "Fast Execution Paths" inline.

## What This Means

1. When testing **UI/CSS or Layout changes** — navigate to `http://localhost:3000/<page>`.
2. When verifying a backend or full-stack fix — navigate to `https://smarter.poker/<page>`. 
3. When running an E2E audit — use `https://smarter.poker`.
4. When checking API responses — hit `https://smarter.poker/api/<endpoint>`.

## Prohibited Actions

- ❌ Using localhost for DB, Webhooks, or Authentication testing (these require strict production environment parity).

## Test Account

- **Email:** `daniel@bekavactrading.com`
- **Password:** `<TEST_USER_PASSWORD — see .env.local, never commit>`

## Browser Automation for Agents

> **`browser_subagent` is broken** — it requires the Antigravity IDE browser panel to be open. Use `scripts/playwright-test.js` for ALL agent-driven browser testing.

```bash
# Basic page load + screenshot
node scripts/playwright-test.js --url https://smarter.poker/hub/social-media --screenshot /tmp/out.png

# With login + console error check
node scripts/playwright-test.js --url https://smarter.poker/hub/bankroll --login --check-console

# Local dev server visual check (UI/CSS only)
node scripts/playwright-test.js --url http://localhost:3000/hub/social-media --screenshot /tmp/local.png
```

## Rationale

Testing against localhost for complex full-app states introduces environment parity issues. However, waiting for Vercel production deployments to verify purely visual CSS or minor layout adjustments needlessly throttles agent velocity. Balancing local dev-server checks for UI with production checks for logic optimizes both speed and reliability.
