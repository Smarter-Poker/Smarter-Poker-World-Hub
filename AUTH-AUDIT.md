# AUTH-AUDIT — Signup / Sign-in Surface
**Date:** 2026-08-04 · **Scope:** `pages/auth/*`, `pages/api/auth/*`, `pages/api/sms/*`, `src/lib/mfaGate.js`, `middleware.ts`
**Owned + changed by this audit:** `pages/api/sms/verify-otp.js`, `pages/api/sms/send-otp.js`. Everything else below is **report-only**.

---

## 0. Status of the assigned critical fix

The brief described `pages/api/sms/verify-otp.js` as reading `const { userId } = req.body` and writing
`phone`, `phone_verified` and a VIP grant to that id with no JWT check.

**That hole is already closed on disk.** The file carries a `HARDENED v3 — July 26, 2026` header and:

- `resolveAuthedUser()` (`verify-otp.js:89`) derives identity **only** from `Authorization: Bearer <jwt>`
  via `supabase.auth.getUser(token)`. The request body is never consulted for identity.
- A present-but-invalid token is a hard `401` (`verify-otp.js:126-128`) — no silent downgrade to the
  anonymous path.
- A body-supplied `userId` is ignored and merely logged as a breadcrumb (`verify-otp.js:136`).
- The duplicate-phone guard is intact and now runs on **both** the authenticated and anonymous paths,
  and **fails closed** on a DB error (`503`, not a free pass).

I verified this rather than assumed it, and I ran a `no-undef` pass over the whole auth surface (see §2)
to confirm the fix was not silently reverted or broken by the MFA restore. No change to `verify-otp.js`
was required. `send-otp.js` has **no equivalent hole**: it accepts only `{ phone }`, performs no profile
writes, and never reads a user id from anywhere.

### What I did change (in owned files)

**`pages/api/sms/send-otp.js` — OTP rollback on Twilio failure** (`send-otp.js:89`, `:171`, `:196-209`)

The OTP row is inserted (`:156`) *before* the SMS is handed to Twilio (`:176`) — correct ordering, since
we must never text a code we failed to persist. The cost was that a Twilio outage left behind rows for
codes the user never received, and those dead rows still counted against `MAX_CODES_PER_HOUR = 5`
(`:62`, `:139`). Five failed sends locked a user out of signup for a full hour on codes that never
existed — and because signup *requires* phone verification, that is a total signup block for that user.
The catch block now deletes the orphaned row by `(phone, code)`. Deletion is by that pair rather than by
id deliberately: it avoids depending on `.select()` being permitted on the insert under the table's
`deny_all` RLS policy (`supabase/migrations/20260513_security_advisor_fixes.sql:139-141`). Cleanup is
best-effort and wrapped so it can never mask the real Twilio error.

---

## Findings, ranked

### F1 — CRITICAL · Unauthenticated remote lockout of any user's MFA (shared `sms_otp_codes` table)

**Where:** `pages/api/sms/verify-otp.js:201-227` × `pages/api/auth/mfa/verify.js:56-115`, `pages/api/auth/mfa/setup.js:90-104`

The MFA rebuild correctly reused the existing Twilio pipeline, but `sms_otp_codes` has **no column
separating an MFA challenge code from a signup phone-verification code**. Both systems key on `phone`
alone. `pages/api/sms/verify-otp.js` is **unauthenticated by design** (the signup path has no session
yet) and it selects the *newest* row for a phone, increments `attempts`, and **deletes the row** once
`attempts >= MAX_ATTEMPTS` (`verify-otp.js:201-206`).

**Failure scenario:** an attacker who knows a victim's phone number POSTs
`/api/sms/verify-otp {phone: <victim>, code: "0000"}` five times with wrong codes. That burns the
attempt counter on — and then deletes — whatever the newest row for that phone is, which may be the
victim's in-flight **MFA login challenge**. `mfa/verify.js:91` then returns `429 Too many attempts` for
the victim's *correct* code. The attacker repeats on every resend. Net effect: any user can be
permanently locked out of MFA login, cashout approval, GDPR erase and account deletion by an
unauthenticated third party who only needs their phone number. Rate limiting does not help —
`LIMITS.write` is 30/min per IP (`vendor/commander-shared/src/lib/apiRateLimit.js:108`) and the attack
needs 5 requests.

`mfa/verify.js:69-71` pins `.eq('id', challengeId)` when a challenge id is supplied, which protects
*selection* — but not the attempt counter or the delete performed by the other endpoint on the same row.

**Smallest fix:** add a `purpose text not null default 'phone_verify'` column to `sms_otp_codes`, write
`'mfa'` from `mfa/setup.js` + `mfa/challenge.js`, and add `.eq('purpose', …)` to every select/update/
delete in both `pages/api/sms/verify-otp.js` and `pages/api/auth/mfa/verify.js`. Needs a migration plus
edits in files I do not own, so it is reported, not applied. *(Note the two endpoints' blanket
`delete().lt('expires_at', now)` purges are safe and can stay unscoped.)*

---

### F2 — CRITICAL · Phone verification at signup is never persisted; the anti-multi-account control is dead on the signup path

**Where:** `pages/auth/signup.js:622-641` (the `supabase.auth.signUp` call) vs `pages/api/sms/verify-otp.js:283-296`

`verify-otp.js`'s anonymous branch performs **zero profile writes** and its comment states *"Signup
itself persists phone_verified on the row it creates."* **It does not.** The `options.data` metadata
block at `signup.js:626-635` carries `full_name`, `first_name`, `last_name`, `poker_alias`, `city`,
`state`, `birth_year`, `birthday` — and **no `phone`, no `phone_verified`**. The only other occurrence
of `phone_verified` in the file is `signup.js:681`, which is a **PostHog analytics property**, not a
database write.

**Failure scenario:** a user completes the SMS gate at signup. Nothing durable records it. Two
consequences:

1. `profiles.phone_verified` is never set to `true` by signup, so the duplicate-phone guard in
   `verify-otp.js:249-282` — which only matches rows with `phone_verified = true` — finds nothing. **One
   handset can create unlimited accounts.** This is the control the brief calls "the best anti-multi-account
   control in the codebase," and on the signup path it is currently a no-op. Every free diamond in the
   catalog is real money; the cheapest attack on the economy is N throwaway accounts.
2. Users who verified at signup still show as unverified and must re-verify later to get the phone
   number onto their profile.

**Smallest fix:** add `phone: cleanPhone, phone_verified: true` to the `options.data` object at
`signup.js:626`, and have `pages/api/auth/ensure-profile.js` copy those two fields from
`authUser.user_metadata` onto the profile row it creates. Not my file.

---

### F3 — HIGH · Nothing calls `/api/auth/mfa/check-trusted` — MFA is unreachable at login, and admin writes are soft-locked

**Where:** `pages/auth/login.js:140-202` (`handleLogin`), `pages/api/auth/mfa/check-trusted.js`, `middleware.ts:181-183`

The brief states *"pages/auth/login.js already POSTs /api/auth/mfa/check-trusted correctly."* As of this
audit it does not. `grep -rn "check-trusted" pages/ components/ src/` returns only the endpoint itself
and a **comment** in `pages/auth/mfa.js:7` describing the call. `handleLogin` goes straight from
`signInWithPassword` (`login.js:150`) to `router.push(getRedirectUrl())` (`login.js:202`) with no MFA
step in between.

**Failure scenario:** two failures at once. (a) A user with MFA enrolled is **never challenged at
login** — the second factor is bypassed entirely by the normal sign-in path. (b) Neither an
`mfa_session` nor an `mfa_trusted_device` cookie is ever minted during login, yet `middleware.ts:181-183`
rejects **every non-GET to `/api/admin/*`** unless one of them is present. Admins are locked out of all
admin writes with no in-product way to obtain the cookie short of manually navigating to `/auth/mfa`.

**Smallest fix:** in `login.js`, after a successful `signInWithPassword` and before
`router.push(getRedirectUrl())`, POST `/api/auth/mfa/check-trusted` with the new access token; if it
returns `mfaEnabled && !trusted`, `router.push('/auth/mfa?next=' + encodeURIComponent(getRedirectUrl()))`
instead. `login.js` is owned by another agent this session and its mtime moved during the audit — this
may already be landing. Flagging so it is not lost.

---

### F4 — HIGH · `/auth/quick` + `/api/auth/quick-signup` bypass phone verification and age/state capture entirely

**Where:** `pages/api/auth/quick-signup.js:52-92`

The emergency signup endpoint takes only `{ email, password, first_name, last_name }` and posts straight
to GoTrue `/auth/v1/signup`. Its own header comment says *"No promo / referral / phone — emergency path."*

**Failure scenario:** it is a live, unauthenticated, rate-limited-but-open route (5/IP/min), not a
break-glass one. Anyone can create accounts through it that (a) never touch the SMS gate — so even after
F2 is fixed it remains an unlimited multi-account faucet, and (b) carry no `birth_year`, `birthday` or
`state`. For a poker platform with real-money-adjacent prize redemption, accounts with **no age
verification and no state** are a compliance problem, and `login.js:205-220` documents that downstream
pages crash without those fields.

**Smallest fix:** put it behind an env flag (`ENABLE_QUICK_SIGNUP`) that is off in production, or write
`_signup_source: 'quick'` (already present at `quick-signup.js:88`) into a profile flag that forces the
user through the full `/auth/signup` completion form before any diamond/prize surface unlocks.

---

### F5 — MEDIUM · `verify-otp` grants 30-day VIP + 25 💎 on a path with no email-confirmation requirement

**Where:** `pages/api/sms/verify-otp.js:298-380` *(owned — reported, not changed)*

The authenticated branch grants VIP and pays the `phone_verified` catalog action to **any** caller with a
valid JWT. A JWT exists as soon as a session does. Combined with F4 (accounts creatable without the
phone gate) and F2 (no `phone_verified = true` rows, so the duplicate guard never fires), the sequence
`quick-signup → sign in → verify any handset → 30-day VIP + 25 💎` is currently repeatable per email
address using **one** phone, because the duplicate-phone guard has nothing to match against.

I left this alone deliberately: the grant logic itself is correct and carefully written (lifetime VIP is
never shortened, `award_diamonds_v2` is idempotent on a user-scoped reference id at `verify-otp.js:352`).
The exposure comes entirely from F2 and F4. **Fix F2 first** — the duplicate guard then starts firing and
this closes on its own. No change here is the right call until then.

---

### MEDIUM · `login.js` "sign up" form validates a password it then discards

**Where:** `pages/auth/login.js:225-231` (`handleSignup`)

`handleSignup` runs the full HIBP + entropy `validatePassword`, then unconditionally
`router.push('/auth/signup')` without creating anything. A user is told their password is too weak on a
form whose input is thrown away, and a user who passes must retype it. **Smallest fix:** drop the
`validatePassword` call and redirect immediately, or stop collecting a password on this form.

---

### LOW · Dead locals left by the auth-helper refactor

**Where:** `pages/api/auth/ensure-profile.js:66,68-70`; `pages/api/auth/delete-account.js:46,48`

Both files still build `const token = authHeader.replace('Bearer ', '')` and
`const authData = { user: authUser }` after the switch to `getServerUserWithFallback(req, …)`, which
reads the header itself. `ensure-profile.js:70` even carries a `/* removed duplicate authUser */`
marker. Harmless but it obscures where identity actually comes from. **Smallest fix:** delete the dead
lines.

---

## 1. Checked and found sound (no action)

| Area | Evidence |
|---|---|
| **Body-supplied user id** | Only `ensure-profile.js:42` takes `user_id` from the body, and it hard-403s on `authUser.id !== user_id` (`:75-77`). No other auth/SMS endpoint trusts a body id. |
| **`ensure-profile` degradation** | A failed existence check returns `503 RETRY` instead of falling through to a duplicate-PK 500 (`:88-96`). Correct. |
| **OAuth callback** | `callback.js` handles provider errors, PKCE `exchangeCodeForSession`, `token_hash` recovery, and a `getSession` fallback; `ensure-profile` failure is explicitly non-blocking (`:196-206`). No 500 paths, no loops. |
| **Redirect safety** | `login.js:37-45` restricts `?redirect=` to internal paths (no open redirect). `signin.js` is a real `getServerSideProps` 302 to `/auth/login` preserving the query string — the long-referenced 404 is fixed. |
| **Account enumeration** | Uniformly handled: `login.js:213-224` (neutral copy), `quick-signup.js:97-105` (200 on "already registered"), `forgot-password.js:63-66` (generic confirmation), and `send-otp.js:110-124` deliberately defers the phone-uniqueness check to verify-otp so it is not an oracle. |
| **Password reset** | `forgot-password.js:54` routes through `/auth/callback?next=/auth/reset-password`; `reset-password.js:46,77` requires a live session before `updateUser` and re-runs `validatePassword`. |
| **`log-client-error.js`** | Flow tag allowlisted (`:51-64`), all fields truncated, rate-limited 30/IP/min, and returns 200 even on internal failure so clients cannot death-spiral. Sound. |
| **`requireRecentMfa` / 30-day rule** | `src/lib/mfaGate.js:318-333` now short-circuits on `verifyTrustedDevice` with **no** freshness requirement; the 5-minute `STEP_UP_MAX_AGE_SEC` survives only as the no-trusted-device fallback. This matches Daniel's "one code every 30 days covers everything." All three gated endpoints call it (`delete-account.js:71`, `admin/users/delete-gdpr.js:91`, `club-arena/approve-cashout.js:86`). |
| **TOTP fully removed** | No `speakeasy` / `otplib` / `otpauth` / QR path remains in `pages/auth/mfa.js` or `pages/api/auth/mfa/*`; all four routes run on SMS through `sms_otp_codes`. `setup.js:197-202` writes the legacy NOT-NULL `secret` column as the literal `'sms'` — intentional, documented, no half-built enrolment. |

## 2. ReferenceError sweep — clean

The brief flagged a recurring `error: authErr` destructured / `authError` tested mismatch. I checked
every file under `pages/api/auth`, `pages/auth` and `pages/api/sms` and then ran a real `no-undef` pass:

```
npx eslint --no-config-lookup --config /tmp/ec.mjs pages/api/auth pages/auth pages/api/sms \
  src/lib/mfaGate.js src/lib/serverAuth.js
```

**Zero `no-undef` errors.** (The 4 errors reported are missing *rule definitions* — `react-hooks/*`,
`import/*` — from the stripped config, not code defects.) The previously-broken files now all declare
what they test: `update-metadata.js:36-42` carries the fix comment, and `sessions/{track,list,revoke}.js`
plus `delete-account.js` each bridge with `const user = authData?.user;` before the `if (authErr || !user)`
test. The bug class is currently eradicated on this surface.

## 3. Not reachable from here

`sms_otp_codes` has no `CREATE TABLE` in `supabase/migrations` — only RLS policies
(`20260513_security_advisor_fixes.sql:139`, `20260520000002_…:152`). The column list in F1's fix should be
confirmed against the live schema before writing the migration.
