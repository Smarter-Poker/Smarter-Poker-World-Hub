# Vercel Duplicate Project Incident — 2026-05-08

## TL;DR

Two Vercel projects (`hub-vanguard` and `smarter-poker-world-hub`) were both
git-connected to the same GitHub repo (`Smarter-Poker/Smarter-Poker-World-Hub`).
Every push fired duplicate builds. The duplicate was misconfigured, so its
builds errored / sat in `QUEUED` indefinitely, fighting `hub-vanguard` for
the team's build-queue concurrency. Dan reported the symptom as "ton of
queued deployments that never build" piling up in the Vercel dashboard.

This is a regression of Phase 3A (Apr 2026, task #67), which already deleted
duplicate Vercel projects for this repo.

## Detection

```
Vercel projects linked to Smarter-Poker/Smarter-Poker-World-Hub:
  ✓ canonical  hub-vanguard               prj_op66GkZyZcygXQKm76iyycfVFAQx
  ✗ DUPLICATE  smarter-poker-world-hub    prj_PGNqOQZSSWwWx7p86leBf5YTOWEU
                                          ↑ created 2026-04-04, NO production
                                            domain bound, builds error/queue
```

Last 20 deploys to the duplicate project:
- READY: 5 (mirroring main-branch builds)
- ERROR: 13 (every preview-branch build)
- QUEUED (stuck): 1 (`dpl_FT5z2WCKBjo2DLZtU6WAD3gw8GKh` — created 13 min before
  detection, never advanced past queue)
- CANCELED: 1

In contrast, `hub-vanguard` over the same window: 11 READY, 8 CANCELED
(skew protection — normal), 0 errors, 0 stuck.

## Root cause

Someone (an agent or AG-driven workflow) re-linked the `Smarter-Poker-World-Hub`
GitHub repo to a second Vercel project named `smarter-poker-world-hub`,
likely via the Vercel "Import Project" flow that auto-detects git-connected
repos. The new project inherited none of `hub-vanguard`'s env vars or build
config, so its builds failed. Vercel's queue treated both projects' deploys
as equal-priority work, causing the duplicate's failed/queued runs to starve
the real one whenever concurrency was tight.

## Resolution

**Part 1 (Dan):** Disconnect + delete `smarter-poker-world-hub` project on Vercel.
Verify only `hub-vanguard` shows in the GitHub repo's Vercel install settings.

**Part 2 (this commit):**
1. `CLAUDE.md` — replace the single-duplicate warning with a table of known dead
   duplicates (so the next agent doesn't re-introduce this duplicate believing
   it's only the older `smarter-poker` duplicate that's dead).
2. `scripts/check-vercel-project-uniqueness.mjs` — daily-runnable script that
   enumerates Vercel projects linked to this repo, asserts exactly one is the
   canonical `hub-vanguard`. Exits 1 if a duplicate appears so Open Claw / CI
   can alert.
3. This audit doc.

## Prevention going forward

- **Open Claw daily cron:** schedule
  `node scripts/check-vercel-project-uniqueness.mjs` to run once per day.
  Alert if it exits non-zero (set up via the same alerting path used for other
  cron health checks).
- **Repo agent rules:** never accept "Vercel can't find your project — let's
  create one" prompts when working in this repo. The canonical project ID is
  `prj_op66GkZyZcygXQKm76iyycfVFAQx`; any other project linked here is a bug.
- **Vercel side:** there's no native "lock this repo to one project" setting,
  so the script + cron is the durable guardrail.

## Affected SHAs / deploy IDs

The duplicate's stuck/errored deploys do not affect production correctness —
no traffic was routed to them. Production traffic continued to flow through
`hub-vanguard` throughout the incident. The only impact was build-queue
contention (intermittent slow deploys for the real project) and dashboard
noise.
