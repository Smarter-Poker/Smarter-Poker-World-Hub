# 2026-09-04: the login probe now proves the session WORKS, not that it was issued

Third and last piece of the 2026-09-03 outage
(`2026-09-04-login-probe-signed-dan-out-every-15-minutes.md`).

## The question this answers

Why did a monitor that runs every 15 minutes, specifically to prove login
works, report `ok` for all 22 hours of an outage whose entire content was
that login did not work?

Because every step it had asked GoTrue to **issue or describe** a token, and
issuing never broke:

| Step             | What it asked                              | During the outage |
| ---------------- | ------------------------------------------ | ----------------- |
| `login`          | signInWithPassword returns a session        | passed, 91 times  |
| `getuser`        | that access_token describes a user          | passed            |
| `oauth_chain`    | the Google callback host answers over TLS   | passed            |

All true, all useless. The probe was cutting a key every 15 minutes,
confirming the key was cut, and never once trying the door — while its own
global `signOut()` deleted the session row behind it and every table socket
in Club Arena was refused `session_not_found`.

## Step 4: `engine_accepts_session`

After the session is in hand, the probe now calls the engine with it:

    GET https://engine.smarter.poker/voice/ice
    Authorization: Bearer <the token this run just obtained>

That endpoint runs the engine's `authenticateRequest` ->
`supabase.auth.getUser(token)` — **the exact call that answered
`session_not_found`** — and touches no table, no seat, no hand and no money
(it mints a short-lived STUN/TURN credential for the caller and nothing
else). Verified against production while writing this: no token -> 401, a
malformed token -> 401.

Choosing a read-only endpoint is deliberate and is CLAUDE.md 11.5: a probe
that seats, bets or moves chips every 15 minutes is the 2026-08-25 incident,
where verifying a guard against production cost a member 48 chips.

### What alarms, and what deliberately does not

- **401 / 403 — CRITICAL, raises.** GoTrue issued this session seconds ago
  and the engine refuses it. That is a revocation loop, a retired signing
  key, or an engine pointed at the wrong Supabase project. It is exactly the
  2026-09-03 shape, and it would have fired on the first tick at 20:45 UTC on
  2026-09-03 rather than 22 hours later.
- **Unreachable, timeout, 5xx — recorded, `skipped`, does NOT raise.** The
  engine being down is not the session being bad, and `EngineDown` /
  `EngineScrapeDown` already page for it. Two alarms for one event is how
  alerts get muted.

That asymmetry is pinned by the law, because it is the part most likely to be
"tidied" into consistency by a later pass.

## Laws

`__tests__/synthetic-probes-never-sign-out-a-person.law.test.mjs` gains two
tests (7 total, run by CHECK 8 via `_test-guards-exist`): the engine step
exists, runs after a session exists, presents the probe's own token, uses a
side-effect-free endpoint and calls none of `/action`, `/addchips`,
`/heartbeat`, `/leave`, `/preaction`; and only a refused session throws.
Verified red against the pre-change probe (2 failures), green after.

## The general lesson, worth keeping

**A probe that only exercises the issuing half of a system will report green
through any failure in the using half.** The same shape is worth checking
wherever else this estate probes something: signup-probe asserts rows exist
after a signup, which is the using half — good. The recovery probe currently
writes no heartbeat at all (see below), so it asserts nothing.

## Two things found while writing this, not fixed here

- **`recovery-probe` has been dead, not misconfigured-loud.**
  `PROBE_RECOVERY_EMAIL` is empty, so the handler returns
  `{status:'unconfigured'}` and returns BEFORE writing a heartbeat — it has
  written zero rows to `probe_heartbeats` in 24 hours and nothing notices a
  probe that never speaks. An earlier note in this incident said it was
  emailing a personal address every cycle; that was wrong, and this is the
  correction. The fix is a heartbeat on the unconfigured path, so silence
  becomes visible.
- **`sentry-signup-bridge` has failed 96 times in 24 hours**
  (`sentry_unavailable`, 30 pending) and `video-library-stale` reports 6 dead
  sources. Both are outside this incident.
