# Sign-In / Sign-Up Deep Audit — 2026-08-04

## THE ROOT CAUSE (found and fixed)

**Login was not failing at Supabase. It was succeeding — then dead-ending on an unpassable MFA challenge.**

Evidence chain:

1. Supabase auth logs show password logins **succeeding** (including yours at 19:05 UTC, twice in 7 seconds — the signature of "logged in, got bounced, tried again").
2. `pages/auth/login.js` and `pages/auth/callback.js` redirect to `/auth/mfa` when `profiles.mfa_required === true` **OR** an enrolled factor exists.
3. DB trigger `fn_sync_mfa_required_on_role_change` force-set `mfa_required = TRUE` on **any profile update** where `role='admin'` OR `is_vip=TRUE`.
4. Result: **525 of 1,005 profiles had `mfa_required = TRUE`** (471 of the 472 VIPs, plus 54 ex-VIPs) while **ZERO users platform-wide have an enrolled TOTP factor** (`user_mfa_factors` empty of enabled rows).
5. `/auth/mfa` has no TOTP secret to verify against → every code fails → user is walled out. No error ever surfaced because client Sentry is disabled (OOM workaround) and every catch block was `console.warn`-only.
6. Corroboration: `/api/health/signup` reports **zero signups in 24h** (last: July 28); your `_fix_mfa.cjs` script yesterday fixed exactly this flag — but only for `daniel@bekavactrading.com`. `danbek4545@gmail.com` and 524 others were still locked.

## FIXES APPLIED

### Database (LIVE NOW in production — migration `fix_mfa_required_lockout`)
- Cleared `mfa_required` for every account with no enabled MFA factor (525 → 0). **All accounts can log in again immediately, even on the currently-deployed bundle.**
- Hardened `fn_sync_mfa_required_on_role_change`: it now only sets `mfa_required=TRUE` when the user actually has an enabled factor to challenge against. VIP/admin flag flips can never lock anyone out again.
- Verified after migration: `still_flagged = 0`, your gmail account unlocked.

### Code (committed to your repo — deploy to take effect)
| File | Fix |
|---|---|
| `pages/auth/login.js` | MFA gate now requires an **enrolled factor** (`user_mfa_factors.enabled === true`) — `mfa_required` alone never gates login. Open-redirect fix (`//evil.com` passed the `startsWith('/')` check). Auth errors now POST to `/api/auth/log-client-error` → server Sentry (no more invisible failures). `autoComplete` fixed (`email` / `current-password`) so password managers work. |
| `pages/auth/callback.js` | Same MFA-gate fix for OAuth sign-ins. `exchangeCodeForSession` + `ensure-profile` failures now reported server-side. |
| `pages/auth/mfa.js` | Dead-end guard: if a user lands here with no enrolled factor, they pass through to their destination instead of being trapped (fails open only when the challenge is provably unpassable). |
| `pages/api/auth/update-metadata.js` | **Fixed 100% failure rate**: code destructured `authErr` but tested undeclared `authError` → ReferenceError → every call returned 500, including valid ones. |
| `pages/api/auth/ensure-profile.js` | ILIKE wildcard escape — `_` in an email (e.g. `john_doe@x.com`) is an ILIKE single-char wildcard and could match and then **update a stranger's profile**. Existence-check errors now return 503 RETRY instead of blundering into a duplicate insert that 500s. |
| `pages/auth/signup.js` | "4-digit code" copy → 6-digit (the button required 6; users typing the promised 4 hit a silently disabled button). Double-submit guard around the 3s HIBP check (with `setLoading(false)` on all 12 validation exits). Email normalized (trim+lowercase) before `signUp`. Promo/referral fetches now check `res.ok` (failures were logged as success). |

## GOOGLE & FACEBOOK OAUTH — VERIFIED WORKING

- `/auth/v1/settings`: `google: true`, `facebook: true`, email + phone (Twilio) enabled.
- `GET /auth/v1/authorize?provider=google` → 302 to `accounts.google.com` with valid client_id (`975303446258-…`).
- `GET /auth/v1/authorize?provider=facebook` → 302 to `facebook.com/dialog/oauth` with valid client_id (`838993589254717`).
- Custom auth domain `auth.smarter.poker` active as `redirect_uri` on both.
- Auth logs show Google redirects executing. OAuth users were hitting the **same MFA wall** after callback (step 7.5 in callback.js) — fixed above.
- Deployed prod bundle has a valid anon key baked in (verified live against the auth API: bogus creds → `invalid_credentials 400`, i.e., key accepted).

## REMAINING ISSUES WORTH SCHEDULING (not fixed today — surgical scope)

1. **Signup provisioning runs unauthenticated when email confirmation is on** (`signup.js` "Step 2", ~lines 565–711): `signUp()` returns no session until the email is confirmed, so the RPC/updates for alias, phone, city/state, DOB, player number, and the 500-diamond grant run as `anon` — RLS makes the UPDATEs match 0 rows *with no error*. Users get hollow accounts. The provisioning should move server-side (into `ensure-profile` or the `handle_new_user` trigger) keyed off the confirmed session.
2. **Player-number assignment race** (`ensure-profile.js` + `signup.js`): read-max-then-write with the RPC error ignored (`parseInt(undefined) → 1500` for everyone). Should be a DB sequence or `INSERT … RETURNING` with a unique constraint.
3. **MFA trusted-device cookie is byte-identical to the session cookie** (`mfa/challenge.js` signs the same payload twice) — the 30-day trusted-device token can be replayed as a 12-hour `mfa_session`. Add a purpose field (`trusted`/`session`) to the HMAC payload.
4. **`/api/rewards/referral` called with client-controlled IDs and no auth header** (`signup.js`) — if the server handler trusts the body, referral diamonds are farmable. Verify the handler.
5. **OAuth users never get a `user_diamond_balance` row** (`ensure-profile` sets `profiles.diamonds` only) → OAuth signups see 0 diamonds despite the welcome grant.
6. **`.env.local` has no `NEXT_PUBLIC_SUPABASE_ANON_KEY`** — local dev depends on it being injected some other way; add it explicitly to avoid the dead-client failure mode (`supabase.ts` creates a client with an empty key rather than failing loudly).
7. **18+ gate bypass via impossible dates** (`signup.js`): Feb 31 → `Invalid Date` → `NaN` comparisons all false → gate passes.
8. `probe-login@probe.smarter.poker` had `mfa_required=true` — your own login probe was locked out, which is why monitoring showed green while real logins were dying (probe only checks the Supabase grant, not the client flow). Consider a Playwright probe that exercises the real `/auth/login` page through to `/hub`.

## VERIFICATION PERFORMED

- All 6 edited files parse clean (esbuild JSX).
- Migration applied and re-queried: 0 profiles flagged, trigger function updated.
- Live probes: `/auth/login` 200, `/auth/callback` 200, both OAuth authorize endpoints 302 to the correct providers, password grant path reachable with the deployed anon key.
