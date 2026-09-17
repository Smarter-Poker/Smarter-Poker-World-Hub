# Performance Checklist Audit, 2026-09-17

Owner prompt: audit every World Hub, Club Commander and Club Arena page against
an eighteen-item web performance checklist (cache API responses, load
balancer, index the database, compress images, loading skeletons, cache
expensive queries, no N+1 queries, debounce input handlers, code splitting,
CDN, server-side caching, pagination, compressed payloads, no unnecessary
re-renders, minified JS/CSS, lazy loading, deferred scripts, no unused
dependencies, connection pooling), report done / not done, then build the
gaps in phases. The per-page scan (221 World Hub pages, 37 Commander pages,
656 API routes, 130 Club Arena pages, 560 engine and service files) and its
CSVs live with the owner; this is the record of what was found and shipped.

## Scorecard before the work

| Item | Verdict | Evidence |
| --- | --- | --- |
| Cache API responses | done | SWR + localStorage provider, 60 s dedupe; 204/656 routes set Cache-Control; edge s-maxage on ~40 public endpoints |
| Load balancer | partial | Vercel edge for the hub; engine is one Hetzner node, standby collapsed 2026-08-23 (Dan's decision) |
| Index the database | partial | advisor: 592 unindexed FKs, 320 unused indexes, 1 duplicate; live seq scans on tournament_players, tables, cron_execution_log |
| Compress images | not done (hub) | 86 referenced rasters over 300 KB (83 MB) with no WebP; 13/221 pages on next/image; /hub transferred 13,098 KiB |
| Loading skeletons | mostly | 154/221 hub, 34/37 Commander, 88/130 Club Arena; every flagged gap read and found handled |
| Cache expensive queries | done | in-memory TTL caches in ~129 routes (per instance) |
| N+1 queries | mostly avoided | 44+51 flagged files read: chunked batches and retry loops; one real per-item RPC fan-out (marketplace-items) |
| Debounce inputs | mostly | shared useDebounce in both apps; one real fetch-on-type (Club Arena PurchaseLedger) |
| Code splitting | done | next/dynamic on 156/221 pages; 31 lazy routes + manualChunks in Club Arena |
| CDN | done | Vercel edge; Club Arena assets immutable through the rewrite |
| Server-side caching | done | 28 SSR / 6 SSG / 4 ISR; Caddy s-maxage + stale-if-error on the Club Arena shell |
| Pagination | mostly | 30 routes return lists without range/limit, all cached directory or admin endpoints |
| Compressed payloads | partial | Vercel and static origin compress; engine Caddy did not; select('*') widespread |
| Re-renders | done | memo hooks on 166/221 pages; zustand selectors |
| Minified JS/CSS | done | SWC; terser two-pass |
| Lazy loading | partial | 98/166 hub img tags lazy |
| Deferred scripts | done | no third-party script; next/font; the one former telemetry SDK was idle-loaded and has since been removed |
| Unused dependencies | partial | 2 dead packages in the hub, one type package in Club Arena runtime deps |
| Connection pooling | done | everything through PostgREST; 105/380 backends |

Lighthouse, production, mobile emulation, anonymous, 2026-09-17 18:05 UTC
(JSON at /Volumes/SmarterArchives/agent-evidence/perf-audit-2026-09-17/lighthouse-before):

| page | score | FCP | LCP | TBT | CLS | transfer |
| --- | --- | --- | --- | --- | --- | --- |
| / | 56 | 7.4 s | 10.5 s | 40 ms | 0.018 | 1,578 KiB |
| /hub | 47 | 7.0 s | 7.0 s | 410 ms | 0 | 13,098 KiB |
| /hub/poker-near-me (lands on /lobby) | 39 | 8.6 s | 15.5 s | 70 ms | 0.332 | 3,107 KiB |

The eight largest requests on /hub were its own tiles: /cards/*.png at 1,072
to 1,356 KB each.

## What shipped, by phase

1. **Database root cause** (Club Arena PR #4774, migration 20260917173357,
   applied 17:38 UTC): partial indexes on the live rows of tournament_players
   (319 ms / 132,465 buffers to 19.6 ms / 2,761), tables (119 ms parallel seq
   scan to 11 ms) and cron_execution_log (177 ms to 0.09 ms); duplicate
   unique index on clubs dropped. Recorded, not changed: atomic_table_buyin
   at ~5.5 s recent mean on its write side; tournament_payouts full-scanned
   by the per-minute reconcile functions (10.12 debt).
2. **Hub images** (PR #1843): scripts/perf/generate-webp-siblings.mjs, 64
   siblings (53.1 MB to 8.1 MB), 114 references repointed across 55 files,
   loading="lazy" on five avatar lists, hub background preloaded, and the law
   __tests__/an-oversized-raster-is-served-as-webp.law.test.mjs.
3. **Club Arena hygiene** (PR #4777): PurchaseLedger search debounced; encode
   zstd gzip in both engine Caddy templates; @types/md5 to devDependencies;
   334 vitest timestamp files deleted from the clones.
4. **Hub hygiene** (PR #1845): @supabase/auth-helpers-nextjs and
   react-onesignal removed; lockfile regenerated (56 orphaned entries from the
   telemetry removal pruned, no version changes).
5. **Database round two**: nothing dropped. See decisions below for why.
6. **Protection and records**: this file, scripts/perf/lighthouse-baseline.mjs,
   the law in phase 2, and the Club Arena changelog entries.

## Decisions that are Dan's, with the evidence

- **Unused indexes on hot write tables.** 25 candidates with idx_scan = 0
  since the database's stats began (never reset). All but one were created
  between 2026-08-20 and 2026-09-06 by named feature or perf work, so zero
  scans means the consumer has not shipped or the planner never chose them,
  not that they are dead. Largest: idx_game_management_events_scope_created_cover
  (298 MB, 20260906144259) and idx_game_management_events_scope (205 MB,
  20260902170000) on game_management_events; idx_wallet_tx_club_data_player_window
  (170 MB, 20260830235962) on wallet_transactions; idx_cmds_club_date_user
  (94 MB, 20260905003000); idx_ca_hand_facts_user_class and _allin (124 MB,
  20260831094000). Each owner should confirm before a drop; the one
  pre-August candidate, idx_profiles_farming_flagged (112 kB, May), is not
  worth a migration on its own.
- **50 tables with multiple permissive RLS policies** (survival_progress 6,
  message_reactions 3, and one extra policy on chip_transactions,
  club_wallets, rake_records and 22 others). Merging is a semantic rewrite on
  money tables; it needs the owning workstream, not a hygiene pass.
- **engine.smarter.poker compression.** /etc/caddy/Caddyfile on engine-01 is
  operator-managed host state. Add `encode zstd gzip` to the site block and
  `caddy reload`; both repo templates now carry the line.
- **social_reels bloat** (75 rows, 54 MB): `VACUUM (FULL, ANALYZE)
  public.social_reels` from psql, outside :50-:03 UTC, takes an exclusive
  lock for under a second. The session running this audit was not permitted
  to issue it.
- **rake_history**: 1,372,780 rows, 195 MB, last row 2026-05-01, never read
  by index and 47 times by sequential scan in its life. Retired financial
  history; keep it, but nothing needs it in the hot path.
- **settlement_idempotency_keys** (9.3 GB, 7.6 M rows, 6.5 billion index
  scans) and **solved_spots_gold** (80 GB, read 23 times by seq scan): retention
  and placement rulings, as with hand history.
- **The clones on the Mac.** ~/Documents/club-arena is 57 commits behind
  origin/main with four modified doctrine files; ~/Documents/Smarter-Poker-World-Hub
  is 65 behind with seven; ~/Documents/Smarter-Poker-Club-Arena is 176 behind
  with 443 staged or modified paths, the exact shape CLAUDE.md 10.87 describes.
  All three carry another task's uncommitted work, so this audit did not
  reset or fast-forward any of them. The audit itself worked in owned
  worktrees under /Volumes/SmarterWork/agent-work/perf-audit-2026-09-17/.

## Measured after phase 2 landed

Production served ce5a73c1 (which carries #1843) at 18:5x UTC. Same script,
same page, mobile emulation, anonymous, two runs (JSON under
lighthouse-after and lighthouse-after-run2 beside the baseline):

| page | score | FCP | LCP | TBT | CLS | transfer |
| --- | --- | --- | --- | --- | --- | --- |
| /hub, before | 47 | 7.0 s | 7.0 s | 410 ms | 0 | 13,098 KiB |
| /hub, after, run 1 | 50 | 8.4 s | 8.4 s | 280 ms | 0 | 2,794 KiB |
| /hub, after, run 2 | 55 | 7.1 s | 7.2 s | 140 ms | 0 | 2,795 KiB |

Transfer fell 79 percent. The paint timings move inside single-run variance
on the throttled profile (the hub's first paint is bundle-bound, not
image-bound); the byte figure is the stable one. Every committed WebP
sibling answers 200 with image/webp from production, and the hub HTML
carries the background preload.

## Verification gaps

Live HTTP header checks (x-vercel-cache, content-encoding) could not be run
from either shell available to the audit; CDN and compression verdicts come
from configuration. The signed-in Lighthouse baseline for /hub/commander and
/hub/club-arena/ needs a browser profile and was not taken. The after-merge Lighthouse run for phase 2 is recorded above.
