---
description: How to log in and test features in the browser using the test account
---

# Browser Testing Workflow

> **⚠️ MANDATORY: Backend, API, and DB testing MUST be performed against `https://smarter.poker` (production). For minor UI/CSS layout tweaks, you MAY use the `http://localhost:3000` dev server to radically speed up your visual validation loop.**

## Test Account Credentials

When you need to test any feature in the browser, use the following test account:

- **Email:** `daniel@bekavactrading.com`
- **Password:** `Bek454545!!`

## Login Steps

1. Navigate to the target page on **production** (e.g., `https://smarter.poker/hub/bankroll-manager`)
2. If prompted with "Sign In Required", click the sign-in / login button
3. Enter the email and password above
4. Wait for the session to initialize (usually 2-5 seconds)
5. Proceed with testing

## Rules

- **Production Rules:** Use `https://smarter.poker` as the base URL for testing data, login pipelines, API accuracy, DB parity, routing architecture, and full-stack health.
- **Fast Track exemption:** When implementing minor UI adjustments (CSS alignments, responsive styles, colors), agents SHOULD spin up the dev server (`npm run dev`) and test purely visual changes locally to bypass Vercel deployment blockages.
- This account has access to all features and should bypass all gates (FeatureGate, BankrollProGate, etc.)
- Do **NOT** use temporary code bypasses for gates — always log in with this account instead
- **DO NOT** use localhost to test Login, Authentication, Webhooks, Data pipelines, and Vercel edge logic.
