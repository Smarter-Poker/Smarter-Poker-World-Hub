# The reward catalog config matches the database

CHECK 9 of the Build Safety Gate had been red since 2026-09-10 18:21 UTC,
which stopped every merge in this repository: ten open pull requests, none of
them related to diamonds.

## What happened

`daily_bonus_boost` was inserted straight into `public.diamond_reward_catalog`
at 18:21 UTC with no migration, no config entry and no pull request. The last
merge before it landed at 18:05 and touched host attestation, so nothing in
git explains the row. `scripts/check-reward-catalog-drift.mjs` reads the table,
found an action `src/config/diamondRewards.js` did not describe, and failed
closed, which is exactly what it is for.

## Why the row stays

The first instinct - delete the stray row - would have broken a half-landed
feature. `award_diamonds_v2` names it explicitly, in the same family branch as
the tile claim beside it:

```sql
ELSIF p_action_key IN ('daily_bonus', 'daily_bonus_boost') THEN
```

so it draws its amount from `metadata.bonus_diamonds` and is clamped to 125 in
SQL, exactly like `daily_bonus`. It is wired and waiting, not stray. It has
also never paid anybody: zero rows in `diamond_transactions` for it, against
six for `daily_bonus`. Deleting it would have removed the catalog row a
shipping claim path already expects.

So the database is right and this file was the side that was missing an entry.
The new entry MIRRORS the table - `diamonds` 0, `max_per_day` 24,
`counts_toward_daily_cap` true, `lifetime` false - because the table is what
users experience.

## What this does NOT change

No database write, and no runtime behaviour. `award_diamonds_v2` resolves from
the table, which is untouched; this file is documentation and the diamond store
projection. The store renders it as "Up To 125 Diamonds" through the existing
`formatAmount` path for variable rewards, the same as `daily_bonus`, so no
zero-value card appears.

`daily_bonus` itself needed nothing: `counts_toward_daily_cap: true` and
`max_per_day: 4` already matched the table on main. A stale working copy made
them look drifted; a clean checkout of main shows they are not.

## Verification

`node scripts/check-reward-catalog-drift.mjs` against production now reports
`OK - 33 actions match the database`. `npm run test:marketplace` (the suite the
Vercel build command gates on) passes, and `npm run lint` passes across 4,252
files.
