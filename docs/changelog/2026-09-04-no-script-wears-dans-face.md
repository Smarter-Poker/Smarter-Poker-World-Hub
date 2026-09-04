# 2026-09-04: no script wears Dan's face

The quiet half of the login-probe incident
(`2026-09-04-login-probe-signed-dan-out-every-15-minutes.md`).

Dan: "DON'T USE MY ACCOUNT FOR THE CRON, USE THE OTHER 'GOD MODE ADMIN
ACCOUNT' ... KEEP MY ACCOUNT CLEAN." and, an hour later: "Do not hardcode
any credentials. Always read from the `.env.local` files."

## What was found

Thirty-seven files in this repo carried `daniel@bekavactrading.com` as the
account to sign in as. The ones that ran on their own:

- `e2e/00-auth.setup.ts` - every CI run of `e2e-tests.yml` signed in as
  him. The Supabase audit log for one afternoon shows his account logging
  in from Windows Chrome, an iPhone, a Pixel 5, Safari and `node` inside a
  single minute: Playwright's device projects.
- `scripts/verify-pa-production-hardening.mjs` - the production watchdog,
  on every successful deploy.
- `e2e/09-poker-near-me-phase-10.spec.ts`, `e2e/099-diamond-wallet-verification.spec.ts`.
- `pages/api/admin/check-auth-uuid.js` - a live API route.

Plus two dozen one-off scripts under `scripts/`, `tmp/` and the repo root,
and `.env.example` telling every new clone to do the same.

## What changed

- Every literal is `process.env.TEST_USER_EMAIL` now. The two files that
  decide what CI signs in as (`e2e/00-auth.setup.ts`, `e2e/099-...`) throw
  "refusing to guess an account" when it is unset; the watchdog and the
  account-flow verifier treat it as "no session".
- `e2e-tests.yml` and `personal-assistant-production-watchdog.yml` pass
  `TEST_USER_EMAIL: ${{ vars.TEST_USER_EMAIL || secrets.TEST_USER_EMAIL }}`.
  The repository variable `TEST_USER_EMAIL` was created at 19:40 UTC with
  the platform service account (`daniel@smarter.poker`, role `god`,
  "Smarter.Poker Official"). `TEST_USER_PASSWORD` was not touched - Dan says
  the two share a password.
- `.env.example` no longer names a person.
- `scripts/seed-commander-jaqk.js` keeps his address: it is a venue-owner
  record in seed data, the way every other owner is listed, not a
  credential. The law names it as the one exemption and says why.
- `__tests__/a-script-never-wears-a-persons-face.law.test.mjs`, run by
  CHECK 8 via `_test-guards-exist`: the address is a literal nowhere, and
  the CI sign-in reads the variable.

## What to expect

Any e2e spec that depended on the personal account's DATA (its clubs, its
wallet balance, its profile) will now see the service account's data. That
is the intended cost; a spec that fails on it should be fixed to seed what
it needs, not pointed back at a person.
