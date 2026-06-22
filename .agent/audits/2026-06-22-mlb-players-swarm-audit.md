# MLB Players — Swarm Deep Audit + Fixes (2026-06-22, session 2)

Four parallel read-only audit subagents (list page, detail+compare, API routes,
SQL/RPC vs live DB), triaged in the main thread, every finding verified against the
live engine DB before action. Done concurrently with another agent that was
refactoring the same feature (see "Concurrency" below).

## Real fixes shipped (verified in main + live)

1. **compare.tsx picker regression** — the other agent split `/api/mlb/players` into
   `/api/mlb/hitters` + `/api/mlb/pitchers` and deleted the old route (now 404).
   compare.tsx still fetched `/api/mlb/players`, so its player picker was dead. Repointed
   to the two split endpoints (`{data:[...]}`). (commit b329905e)

2. **league-averages perf: 8,479ms -> 11ms** — `get_mlb_league_averages()` deduped the
   full agg history on every cold call. Added partial indexes
   (`idx_agg_batter_fgseason_latest`, `idx_agg_pitcher_fgseason_latest`) + converted the
   function to a 1-row lazy cache (`mlb_league_avg_cache`, refresh ~20h, instant otherwise).
   (migration 20260622110000)

3. **hitter directory perf: 2,232ms -> ~875ms (DB), fresh endpoint ~1.2s** — the slow form
   caused cold-start **503s on /api/mlb/hitters** (the main list). Rewrote to lateral over
   DISTINCT batter_ids + one index seek per player (inner CTE 34ms). Applied the same
   pattern to the pitcher directory for parity. Added numeric guards so one bad metric
   can't error the whole RPC. (migration 20260622120000) — VERIFIED: fresh cache-busted
   /api/mlb/hitters now 200 in ~1.2s (was 503).

4. **standings.ts resilience** — latest-game lookup is now best-effort (degrades to null
   instead of 500-ing the whole standings payload); error/empty responses are no longer
   CDN-cached for 5 min. (commit b329905e)

5. **players.tsx rate-sort sample qualifier** — sorting by AVG/OPS/ERA/WHIP now requires a
   min sample (PA>=50 / IP>=20) so a tiny-sample player (e.g. 1 PA, OPS 3.25) can't top the
   leaderboard. Applied directly to the latest `main` copy to avoid clobbering the other
   agent's active refactor. (commit 80f20c29)

## Verified FALSE POSITIVES (no action — checked against live DB)

- "position / player_class missing from hitter directory" (list audit, from a stale
  migration file) — live RPC returns both: 845/845 position, 560 player_class.
- "Standard stat keys (AB/H/2B/3B/PA) missing" — all present for Judge.
- "fmtIp renders 96.6667" — IP stored clean ("183.2").
- "wBsR should be BsR" — DB has wBsR (~1.1), BsR is null; code reads wBsR (correct).
- pitcher tendencies via `pitching_custom` — that window only holds `{ERA}`, not pitch-mix,
  so there's nothing rich to surface (correctly left null for pitchers).
- `luck` window enrichment — actual babip/hr_fb are 0 making the diff fields garbage; NOT
  surfaced (would show misleading values).

## Concurrency

Another agent refactored this feature live during the session (6+ pushes:
33de0170 -> ... -> 79c2fa7d), splitting the players API and adding PageErrorBoundary,
HrMatchupConditions, and mobile haptics. To avoid a clobber war I did NOT push the hot
`players.tsx` wholesale; the one polish item I landed (sort qualifier) was applied to the
freshest `main` copy with conflict-retry. All my commits are ancestors of HEAD (nothing
clobbered; confirmed via /compare API).

## Remaining (engine pipeline — separate repo, NOT this one) — see handoff

- situational/historical_trends coverage is 562/1959 batters (29%); ~70% of hitter detail
  pages show no Situational/Tendencies sections (they conditionally hide). Expanding this is
  a Python engine-pipeline job — handoff: `.agent/handoffs/2026-06-22-mlb-engine-coverage.md`.
- streaks missing for ~9% of batters; props slate can be one day behind. Both engine-side.

## Verification
- `node_modules/.bin/tsc --noEmit`: 0 errors in compare.tsx / standings.ts / players.tsx
  (1 pre-existing error in unrelated `hr-bets.ts`).
- Live: /api/mlb/{hitters,pitchers,standings,league-averages,players/[id]} all 200;
  /hub/MLB-ANALYTICS/{players,players/[id],players/compare} all 200; league-averages 11ms.
