# 2026-09-04: the login probe signed Dan out of every device every 15 minutes

## What Dan saw

"ALL TABLES INSIDE THE CLUB ARENA ARE CURRENTLY DOWN, NOBODY CAN PLAY... THEY
ALL JUST SAY 'RECONNECTING TO TABLE' AND IT NEVER DOES... JUST SILENTLY FAILS."

## What it was

Not the engine. The engine was dealing 5,700 hands per ten minutes the whole
time and answered /health cleanly; every horse table was fine. What was down
was Dan's login.

`/api/cron/login-probe` runs on Vercel every 15 minutes. On 2026-09-03 at
20:15 UTC its `PROBE_LOGIN_EMAIL` / `PROBE_LOGIN_PASSWORD` were set to Dan's
own account rather than the dedicated `probe-login@probe.smarter.poker` user
the file header has prescribed since the MAU fix in May. From the next tick
(20:45 UTC) the probe signed in as him and then tidied up with
`anon.auth.signOut()`.

`signOut()` with no argument is `scope: 'global'`: revoke every session this
user holds, on every device. Supabase's audit log (auth_audit_logs) shows
the pair - `login`, then `logout` with `user_agent: "node"` - at exactly
:00/:15/:30/:45 for 22 hours straight, 76 global sign-outs in one day, all on
`daniel@bekavactrading.com` and nobody else.

## Why it looked like a table outage

The Club Arena engine verifies every table socket at upgrade with
`supabase.auth.getUser(token)`. GoTrue answered
`session_not_found: Session from session_id claim in JWT does not exist`, the
engine wrote `HTTP/1.1 401` on the upgrade (captured with tcpdump on the
Caddy-to-engine hop), the browser sees a pre-handshake 401 as close code
1006, and `EngineStateClient` treated 1006 as a network blip and reconnected
with the same dead token on its backoff ladder, forever.

Nothing else noticed, for two reasons worth remembering:

- PostgREST checks only the JWT signature, not the session row. Every lobby
  query, every wallet read and the World Hub `/api/club-arena/*` routes kept
  returning 200. The app LOOKED signed in.
- The access token is issued with a seven-day life. supabase-js only refreshes
  near expiry, so no refresh was attempted, so the one call that would have
  said "your session is gone" never happened.

So a monitor built to prove that login works was the thing breaking it, and it
reported `ok` on every run.

## The fix (this PR)

1. Both `signOut()` calls in login-probe are now `signOut({ scope: 'local' })`:
   end the session the probe created, nothing else. This is the line that ends
   the outage, and it is correct regardless of which account the probe is
   pointed at.
2. The probe refuses to run as anything but a probe account: an address
   under `@probe.smarter.poker`, or the platform service account named in
   `PROBE_ALLOWED_ACCOUNTS`. Anything else records a `failed` heartbeat with
   `status: 'misconfigured'`, returns 500, and does not sign in. A synthetic
   monitor never borrows a person's identity.
3. `__tests__/synthetic-probes-never-sign-out-a-person.law.test.mjs`, run by
   CHECK 8 via the `_test-guards-exist` import: no headless code (pages/api,
   scripts, lib, src/lib, src/utils) may call `signOut` without
   `scope: 'local'`, the login-probe guard must run before
   `signInWithPassword`, and the allowlist is exactly the one service
   account. Verified red against the pre-fix file.

## Which account the probe uses now

Dan, mid-incident: "DON'T USE MY ACCOUNT FOR THE CRON, USE THE OTHER 'GOD
MODE ADMIN ACCOUNT'. IT HAS THE SAME PASSWORD. KEEP MY ACCOUNT CLEAN."

That account is `daniel@smarter.poker` (profiles.role = `god`, display name
"Smarter.Poker Official", the platform's own service identity - the same
actor the ledger migrations have used since May). `PROBE_LOGIN_EMAIL` in
Vercel (hub-vanguard, production + preview) was repointed at it on
2026-09-04 ~19:20 UTC; `PROBE_LOGIN_PASSWORD` was left as it was on Dan's
word that the two share a password. The guard's allowlist
(`PROBE_ALLOWED_ACCOUNTS`) names exactly that one address alongside the
`@probe.smarter.poker` domain, and the law test pins that
`daniel@bekavactrading.com` never appears in the file.

With `scope: 'local'` the probe ends only the session it made, so the
service account's other sessions - if Dan is using it in a browser - are
untouched.

## The client side

The Club Arena client should have said "your session ended, sign in again"
instead of "Reconnecting To The Table" for 22 hours. That is a separate pull
request in the club-arena repo (a revoked session is detected after repeated
handshake failures and surfaced as `auth_failed` with a sign-in prompt), and
the engine now answers a pre-handshake 401 with a reason the browser can see.
