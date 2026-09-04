# 2026-09-04: a probe that cannot run says so where probes speak

`recovery-probe` had written **zero rows** to `probe_heartbeats` in 24 hours.
Not failures - nothing. `PROBE_RECOVERY_EMAIL` is empty in Vercel, so the
handler returned `{status:'unconfigured'}` and exited before its heartbeat
insert. The auth-health dashboard reads that table; a row that does not
exist cannot be drawn red, so the probe was indistinguishable from one that
was never scheduled. It was found by accident, reading a different probe's
rows during the login-probe incident - which had the same shape, for 22
hours: a monitor that reports nothing wrong because it reports nothing.

## What changed

- `src/lib/probeUnconfigured.js`: `unconfiguredProbe(res, admin, name, error)`
  writes a `failed` heartbeat with `details.status = 'unconfigured'` (the
  dashboard already renders `failed` red), then returns the same 500 the
  callers always returned. Fail-open: no admin client (the service key is
  what is missing) or an insert error still answers.
- `login-probe`, `recovery-probe`, `signup-probe`: every "missing env"
  early-return goes through it. Five call sites.
- `__tests__/a-probe-that-cannot-run-says-so.law.test.mjs` (run by CHECK 8
  via `_test-guards-exist`): every probe imports the helper, none hand-writes
  the silent `json({ status: 'unconfigured', error })` form, and the helper's
  order and fail-open behaviour are exercised with a fake client.

## What this makes visible, and does not fix

On the next tick `recovery-probe` will show as **failed / unconfigured** on
the dashboard, every 15 minutes, until `PROBE_RECOVERY_EMAIL` is set to a
dedicated `probe-recovery@probe.smarter.poker` account (file header). That
is the point: it has been broken for months; now it looks broken. Setting
the account is Dan's.
