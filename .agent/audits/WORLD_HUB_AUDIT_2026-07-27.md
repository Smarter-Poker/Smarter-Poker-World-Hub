# World Hub — Database Integrity and Defect-Class Sweep

**Date:** 2026-07-27 · **Scope:** `pages/api` (578 routes) and `src/lib` across the World Hub repo — 850 files scanned.

**Result:** 10 production defects found and fixed; 4 apparent findings correctly identified as false positives and deliberately left alone; four other defect classes came back clean.

---

## Method

This sweep did not re-read 3,000 files. It ran the detectors that had the highest yield during the Club Commander audit, on the theory that defect classes repeat within a codebase. Every `.from()` and `.rpc()` reference in the repository was extracted and checked against the live production schema, and four crash/security patterns were scanned mechanically.

## What was broken: references to database objects that did not exist

Ten objects were called by shipping code but absent from the database. Because most call sites wrap these in `.catch()` handlers, they failed **silently** — no error surfaced to a user or an operator.

The most serious three sit in `src/lib/poker-engine/`, which runs live cash games. `update_table_stats` and `record_promo_wagering` are called from `LobbyManager.js` at hand completion, and `close_table_session` from `AntiCheat.js` when a session ends. `fn_get_all_identity_unread_counts` broke `/api/social/pages` — the same endpoint Club Commander's hub calls, which the earlier audit had flagged as unverified and which is now confirmed. `training_spaced_repetition` was missing across three routes, leaving that entire training feature non-functional; the route even carried a fallback comment reading "table may not exist yet". `w2g_forms` broke bankroll tax reporting, which is a compliance surface.

The remainder were `pb_calibration_profiles` (poker-brain calibration), `horse_session_analytics` (performance tracking), `fn_increment_agent_player_count` (club-arena agent counts) and `increment_cache_served` (Geeves cache statistics).

All ten were created in one verified migration. Every signature was taken verbatim from its call site rather than guessed. Two columns, `hands_dealt` and `avg_pot`, were added to `tables` because `update_table_stats` documents an exponential moving average over them and neither existed.

One deliberate restraint is worth recording. `record_promo_wagering` is labelled "PROMO PLAYTHROUGH" and plainly relates to when promotional funds become withdrawable — but nothing in the codebase reads wagering totals anywhere. It was therefore implemented as a faithful append-only ledger that records exactly what the call site passes, and it does **not** gate withdrawals or clear promo balances. That rule is not defined in code and inventing it would have been worse than the silent no-op it replaced.

## What was not broken: four false positives

A less careful pass would have created junk objects for all four of these.

`posts` appeared as a missing table but the only reference is inside a documentation comment in `src/lib/offlineQueue.js`. `avatars` is a Supabase **storage bucket** reached via `.storage.from('avatars')`, not a database table. And `get_mlb_model_intel` and `get_mlb_player_detail` are not missing at all — the MLB routes use `getMlbSupabase()`, which points at an entirely separate Supabase project (`nscdmxldtyszyvcxxwgr`). Both functions exist there with matching signatures. The original check had been run against the main project only, which made it a false negative in the detector, not a defect in the code.

## Defect classes that came back clean

Four patterns that produced real findings in Club Commander do not appear here. There are zero `.single()` calls in violation of the repository's `maybeSingle()` rule. There are zero cases of `.limit()` applied to a JavaScript array or number, the pattern that crashed two Commander endpoints. There are zero hardcoded secret-like literals outside `process.env`. And of 578 API routes, zero handle a mutating method and perform a database write without an authentication signal — the class that produced Commander's unauthenticated PII leak.

Three automatic-semicolon-insertion candidates were flagged and all three proved to be comments ending in a closing parenthesis, not executable code.

World Hub is in materially better shape than Commander was, which is consistent with Commander having been extracted recently and accumulated drift in the process.

## Verification

All thirteen created objects (six functions, five tables, two columns) were re-queried and confirmed present. Each of the six functions was then executed against non-matching identifiers to prove it runs without type or column errors. That smoke test inserted one row into `promo_wagering_ledger` — a sentinel UUID was passed where NULL was intended — which was identified and deleted; the ledger is confirmed empty.

No World Hub application code required modification. Every fix was database-side.
