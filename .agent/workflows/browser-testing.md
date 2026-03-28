---
description: How to log in and test features in the browser using the test account
---

# Browser Testing Workflow

> **MANDATORY LAW — ZERO EXCEPTIONS**
>
> ALL browser testing and UI verification MUST be performed on the **live production site**:
>
> **`https://smarter.poker`**
>
> **NEVER** test on `localhost`, `127.0.0.1`, or any local dev server URL.
> The dev server exists for build verification ONLY — not for browser testing.
>
> Any agent that opens a browser to `localhost:3000` for testing is in VIOLATION of this standard.

## Test Account Credentials

- **Email:** `daniel@bekavactrading.com`
- **Password:** `Bek454545!!`

## Login Steps

1. Navigate to `https://smarter.poker` (or the specific page, e.g., `https://smarter.poker/hub/bankroll-manager`)
2. If prompted with "Sign In Required", click the sign-in / login button
3. Enter the email and password above
4. Wait for the session to initialize (usually 2-5 seconds)
5. Proceed with testing

## Why Production Only?

- The local dev server does NOT have the same environment, data, or auth state as production
- Features that "work on localhost" often break in production due to missing env vars, RLS policies, edge caching, etc.
- Testing on production catches REAL bugs — testing on localhost gives false confidence
- The user deploys continuously; by the time you test localhost, the code is already live

## Notes

- This account has access to all features and should bypass all gates (FeatureGate, BankrollProGate, etc.)
- Do **NOT** use temporary code bypasses for gates — always log in with this account instead
- If you need to verify a build compiles, use the dev server health check (`/dev-server` workflow) — but do NOT open a browser to localhost
- For API endpoint testing (curl/fetch), you may use `https://smarter.poker/api/...` directly
