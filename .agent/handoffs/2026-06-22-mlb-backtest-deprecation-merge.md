# Handoff: Ship the MLB backtest -> model-intel deprecation merge

**Created:** 2026-06-22
**Author:** Cowork (master-architect review session)
**For:** Any agent on Dan's Mac with push credentials (SSH key for
`git@github.com:Smarter-Poker/Smarter-Poker-World-Hub`).
**Why a handoff (RULE 0):** the reviewing agent ran in a sandbox with NO SSH
push key (a credential it has no path to obtain), so it could not run the
push phase of `scripts/git-safe-push.sh`. All code edits are complete and
verified on disk; only the sanctioned push remains.

## Decision (master-architect ruling)
`/hub/MLB-ANALYTICS/backtest` is a relic. `model-intel.tsx` is a strict
superset of it (Lock-In Gate + Daily Performance Log + Market Breakdown +
bet-type trust ledger + a cumulative P&L Recharts chart that backtest never
had). `backtest` is deprecated and now redirects to `model-intel` — the same
pattern already used for `accuracy`.

`validation` STAYS STANDALONE — do NOT merge it. It is the public (un-gated)
edge-bucket calibration page; model-intel/backtest are premium-gated. A
second Antigravity chat recommended merging validation INTO backtest, but it
was working from a stale map: backtest is the page being deleted.

## Changes already applied to the working tree (verify, then push)
1. `pages/hub/MLB-ANALYTICS/backtest.tsx` — full page replaced with a
   client-redirect stub -> `/hub/MLB-ANALYTICS/model-intel` (mirrors
   accuracy.tsx; noindex).
2. `pages/hub/MLB-ANALYTICS/model-intel.tsx` — Lock-In Gate sample-size
   threshold standardized to **n>=500** (was 300) in all THREE places:
   `isGatePassed` logic (~L352), the Sample Size GateRow label + `passed`
   (~L680/682), and the footnote prose (~L1031). Dan chose 500 as canonical
   (stricter bar for the real-money go-live gate).
3. `src/components/ui/MlbSubNav.tsx` — removed the "Backtest" nav item.
4. `src/components/ui/MlbSubNav.jsx` — DELETED (dead/stale duplicate; nothing
   imported it; it still listed both Accuracy and Backtest).
5. `pages/hub/MLB-ANALYTICS/portfolio.tsx` — removed the "Backtest" link
   button (the adjacent "Model" button already points to model-intel).
6. `pages/sitemap.xml.js` — removed the `/backtest` AND `/accuracy` entries
   (both are redirects; should not be indexable sitemap URLs).
7. `pages/api/mlb/backtest.ts` — DELETED (only backtest.tsx consumed it; its
   RPC fallback scanned the raw `sim_bets` fact table into serverless memory,
   a latent Vercel-504 risk now removed).

## Concurrency note (read before pushing)
At review time the working tree ALSO held in-flight changes by another agent
that are NOT part of this task:
- `pages/api/mlb/trigger-stage.ts` (stub -> Supabase `pipeline_runs` wiring)
- `pages/hub/MLB-ANALYTICS/players/[id].tsx` (~97 lines)
`git-safe-push.sh` stages everything, so those will ride along under this
commit. Confirm they are intended to ship (or coordinate with the other
agent) before pushing.

## Action
```bash
cd ~/Documents/Smarter-Poker-World-Hub
bash scripts/git-safe-push.sh "MLB: deprecate backtest -> redirect to model-intel; standardize Lock-In Gate to n>=500; remove backtest API route + stale MlbSubNav.jsx; sitemap cleanup"
```
Done ONLY when it exits 0 with `DEPLOY_VERIFIED:true` and `SHA_MATCHED:true`.
Then confirm in production:
- `/hub/MLB-ANALYTICS/backtest` redirects to `/hub/MLB-ANALYTICS/model-intel`
- the gate card reads "Sample Size (N>=500)"

## Follow-ups (separate, not blocking this push)
- `validation.tsx`: `refreshInterval: 60000` -> `1_800_000` (data is daily;
  matches model-intel's 30-min poll). Optional polish: chart/table toggle,
  responsive chart height, typed Recharts tooltip payload.
- Do NOT switch `/api/mlb/validation.ts` to `runtime: 'edge'`. The Node
  request-polyfill wrapper is a platform-wide pattern across all MLB API
  routes; if the boilerplate is unwanted, extract a shared
  `wrapEdgeHandler()` helper instead of changing one route's runtime.
- Optional SEO hardening: upgrade both `accuracy.tsx` and `backtest.tsx`
  client redirects to real 308s in `next.config.js`.
