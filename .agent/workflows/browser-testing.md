---
description: How to log in and test features in the browser using the test account
---

# Browser Testing Workflow

> **⚠️ MANDATORY: Backend, API, and DB testing MUST be performed against `https://smarter.poker` (production). For minor UI/CSS layout tweaks, you MAY use the `http://localhost:3000` dev server to radically speed up your visual validation loop.**

---

## 🚫 CRITICAL — DO NOT USE `browser_subagent`

**`browser_subagent` is BROKEN and must NEVER be used for automated testing or verification.**

### Why it keeps failing

The `browser_subagent` tool's `open_browser_url` function requires the Antigravity IDE's built-in browser panel to be **already open and active**. When no browser pages are currently open (which is the normal idle state), the tool fails with a connection error. Agents have no way to spawn a new browser window for subagents — this is an IDE infrastructure constraint, not a code bug.

**Past agents that tried to "fix" this by killing Chrome on port 9222 made it WORSE** — that port is the Antigravity IDE's own managed browser and must NEVER be touched by agents.

### The correct tool for ALL automated browser testing

Use **Playwright MCP** — it has its own dedicated Chromium install at:
`/Users/smarter.poker/Library/Caches/ms-playwright/chromium-*/`

This is completely independent of the IDE browser and never fails due to the browser panel state.

---

## Test Account Credentials

When you need to test any feature in the browser, use the following test account:

- **Email:** `daniel@bekavactrading.com`
- **Password:** `<TEST_USER_PASSWORD — see .env.local, never commit>`

---

## Browser Testing Decision Tree

```
Need to test something in a browser?
│
├─ Automated / agent-driven test?
│   └─ ✅ USE PLAYWRIGHT MCP  (see /playwright-testing skill)
│       npx -y @playwright/mcp@latest
│
└─ Manual visual check?
    ├─ Minor UI/CSS tweak?  → http://localhost:3000 (fast track)
    └─ Everything else?     → https://smarter.poker (production)
```

---

## Login Steps (Manual or Playwright)

1. Navigate to the target page on **production** (e.g., `https://smarter.poker/hub/bankroll-manager`)
2. If prompted with "Sign In Required", click the sign-in / login button
3. Enter the email and password above
4. Wait for the session to initialize (usually 2-5 seconds)
5. Proceed with testing

---

## Rules

- **Production Rules:** Use `https://smarter.poker` as the base URL for testing data, login pipelines, API accuracy, DB parity, routing architecture, and full-stack health.
- **Fast Track exemption:** When implementing minor UI adjustments (CSS alignments, responsive styles, colors), agents SHOULD spin up the dev server (`npm run dev`) and test purely visual changes locally to bypass Vercel deployment blockages.
- This account has access to all features and should bypass all gates (FeatureGate, BankrollProGate, etc.)
- Do **NOT** use temporary code bypasses for gates — always log in with this account instead
- **DO NOT** use localhost to test Login, Authentication, Webhooks, Data pipelines, and Vercel edge logic.
- **DO NOT** kill or restart Chrome on port 9222 — this is the Antigravity IDE's browser, not an agent resource.
- **DO NOT** use `browser_subagent` for any reason — it will fail every time the IDE browser panel is not active.
