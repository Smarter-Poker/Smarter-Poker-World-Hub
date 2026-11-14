# 2026-11-14 digest reconciliation precompute (World Hub #2836)

Incident: the 2026-11-13 digest said "Daily chip reconciliation could not be
verified". Cause: `fn_sp_digest_daily_results` hit its statement timeout on all
three digest attempts. Run afterwards with more time, the same report
answered `balanced`, accounted residual 0.00. This was a failed job, not an
accounting discrepancy.

Fix: migration `20261114163320_digest_daily_results_are_computed_before_the_digest.sql`.
Installed 10:33 AM CST 2026-11-14, merged as 9a5841512, live on smarter.poker.

## The timeout that governs, recorded accurately

`fn_sp_digest_daily_results_refresh` declares `SET statement_timeout='600s'`.
That function-level setting does NOT govern the statement that calls it.
Postgres arms the statement timer when the outer statement starts. Proof: at
10:35 AM CST, `SELECT fn_sp_digest_daily_results_refresh('2026-11-13')` was
cancelled by the caller's shorter session timeout, inside the report body.

The limit that actually governs the scheduled run is the session timeout set
by the maintained job: cron job 495 (`sp-daily-metrics-snapshot`) runs
`SET statement_timeout = '1500s';` as its first statement, then the refresh.
The same call with a 600 s session timeout set first stored 2026-11-13 in
55,287 ms, with status `balanced`. Anyone calling the refresh by hand must
set the session timeout first; the function's own `SET` is not enough.

## Gate still open

Final verification is the actual 06:15 AM CST run on 2026-11-15. It must
store a complete report dated 2026-11-14, and the 07:00 AM digest must
consume it. Until both are observed, this repair is not closed.

When there is no snapshot, the digest still computes the report live. When
that fails, it shows "Report unavailable" or the error, never "balanced"
(`src/lib/dailyDigest/assemble.mjs`).
