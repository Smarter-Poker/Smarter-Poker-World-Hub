---
description: How to log in and test features in the browser using the test account
---

# Browser Testing Workflow

## Test Account Credentials

When you need to test any feature in the browser (locally or on production), use the following test account:

- **Email:** `daniel@bekavactrading.com`
- **Password:** `Bek454545!!`

## Login Steps

1. Navigate to the target page (e.g., `http://localhost:3000/hub/bankroll-manager`)
2. If prompted with "Sign In Required", click the sign-in / login button
3. Enter the email and password above
4. Wait for the session to initialize (usually 2-5 seconds)
5. Proceed with testing

## Notes

- This account has access to all features and should bypass all gates (FeatureGate, BankrollProGate, etc.)
- Do **NOT** use temporary code bypasses for gates — always log in with this account instead
- On production (`https://smarter.poker`), use the same credentials
- If testing locally and the dev server crashes, restart with `npm run dev` from the project root
