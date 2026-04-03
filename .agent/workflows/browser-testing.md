---
description: How to log in and test features in the browser using the test account
---

# Browser Testing Workflow

> **⚠️ MANDATORY: ALL testing and verification MUST be performed against `https://smarter.poker` (production). NEVER use localhost for live testing or verification. Do NOT spin up a local dev server for verification purposes.**

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

- **ALWAYS use `https://smarter.poker`** as the base URL for all browser testing and verification
- **NEVER start a localhost dev server** (`npm run dev`, `next dev`, etc.) for verification or testing purposes
- This account has access to all features and should bypass all gates (FeatureGate, BankrollProGate, etc.)
- Do **NOT** use temporary code bypasses for gates — always log in with this account instead
- localhost/dev servers should ONLY be used for active development iteration, NEVER for final verification
