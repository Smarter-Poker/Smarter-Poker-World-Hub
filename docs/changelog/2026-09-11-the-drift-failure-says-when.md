# The Drift Failure Says When

Before: `daily_bonus_boost` was inserted straight into `diamond_reward_catalog` on 2026-09-10 at 18:21 UTC with no migration, no config entry and no pull request. CHECK 9 reads the table, found an action the config did not describe, failed closed, and stopped every merge in this repository for fourteen hours.

Failing closed was correct and is not changed here. It is the reason the row was documented within a day instead of paying quietly forever, and an undocumented row in the table that `award_diamonds_v2` reads is a money path nobody has reviewed. Fourteen hours of merge friction in one repo is a fair price for that; downgrading the gate to an alert would buy back the friction and sell the guarantee.

What was wrong is that the failure told the reader nothing about whose problem it was. The check fails on every pull request in the repository, so the person reading it is almost never the person who wrote the row. Without a timestamp, an undocumented action reads like a long-standing condition the reader has somehow caused, and the natural first move is to go looking through their own diff. The table has recorded `updated_at` all along; the message simply never printed it.

Correction: the query now asks for `updated_at`, and the line that names an undocumented action carries it, with a human-scale age beside it:

```
daily_bonus_boost: in diamond_reward_catalog, MISSING from the config
  (payable but undocumented) — the row changed 2026-09-10T18:21:32.910682+00:00 (12 hours ago)
```

"12 hours ago" says immediately that this is somebody's in-flight work, which turns a mystery into a question with an obvious person to ask. The helper reads in hours below two days and in days above, so an ancient row reads as ancient rather than as a four-digit hour count.

Verification: run against the live database with the config as it stands, the check reports `OK — 33 actions match the database` and exits 0. Removing `daily_bonus_boost` from the config to force the original condition reproduces it exactly, now with the timestamp and the age, and the process still exits 1 — the gate still fails closed. The config was restored byte-identical afterwards.

Still open, and a decision for Dan rather than an agent: whether writes to `diamond_reward_catalog` should be refused outside a migration at the database level. It is possible — a trigger keyed on a `set local` session flag that only migrations set — but it is DDL on a money table, and the first thing it would block is a legitimate emergency write at the worst possible moment. The drift check catches the same class of mistake within one CI run, which is what happened here.
