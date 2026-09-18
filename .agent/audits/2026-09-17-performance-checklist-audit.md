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
| Compressed payloads | done (measured 2026-09-18) | hub `br`; every Club Arena bundle on the player path `zstd`; static origin `zstd`. engine.smarter.poker has no `content-encoding` and needs none - see the decision below. `select('*')` widespread and unchanged |
| Re-renders | done | memo hooks on 166/221 pages; zustand selectors |
| Minified JS/CSS | done | SWC; terser two-pass |
| Lazy loading | partial | 98/166 hub img tags lazy |
| Deferred scripts | done | no third-party script; next/font; the one former telemetry SDK was idle-loaded and has since been removed |
| Unused dependencies | done | 2 dead packages removed from the hub (#1845); `md5` and `@types/md5` removed from Club Arena (#4816) - nothing imported either, and three transitive packages went with them |
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
3. **Club Arena hygiene** (PR #4777, merged 23:51 UTC as 414c12e1): the
   PurchaseLedger search debounced at 300 ms, `encode zstd gzip` added to
   infra/monitoring/engine-01/Caddyfile, and the changelog entries. 334
   gitignored vitest timestamp files deleted from the clones. Two things
   were cut from this pull request as it landed and are recorded honestly
   here rather than as shipped: the same line in server/Caddyfile (that path
   matches CI's `server:` filter and was summoning an unrelated red job), and
   the @types/md5 move. Both went to #4816 - see phase 7.
4. **Hub hygiene** (PR #1845): @supabase/auth-helpers-nextjs and
   react-onesignal removed; lockfile regenerated (56 orphaned entries from the
   telemetry removal pruned, no version changes).
5. **Database round two**: nothing dropped. See decisions below for why.
6. **Protection and records**: this file, scripts/perf/lighthouse-baseline.mjs,
   the law in phase 2, and the Club Arena changelog entries.
7. **Close-out** (Club Arena PR #4816, World Hub PR for this file): md5 and
   @types/md5 removed from Club Arena dependencies - nothing imported either,
   and every md5 token in that repository is PostgreSQL's own md5() inside a
   SQL string in a contract test, so charenc, crypt and is-buffer left with
   them. social_reels reclaimed. The engine-01 operator step withdrawn on
   measurement. The live header checks this file recorded as ungettable,
   taken.

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
- **engine.smarter.poker compression: withdrawn, nothing to do.** This was
  carried as an operator step. It is not one. Measured against production on
  2026-09-18 (table under "Measured live" below): the hub answers `br`, every
  Club Arena bundle on the path a player actually loads answers `zstd` with
  `max-age=31536000, immutable`, and the static origin answers `zstd`. The one
  origin with no `content-encoding` is engine.smarter.poker, and on the live
  box that hostname serves the engine reverse-proxy alone - `/grafana/login`
  and `/runbooks/00-incident-response.md`, both routed by the repository
  template, return the engine's own 21-byte JSON 404. What is left behind that
  name is WebSocket traffic, which `encode` never touches, and JSON: `/health`
  is 9,583 bytes and gzips to 3,555. A real 63 percent, on a monitoring
  endpoint, not worth a reload on the box that deals cards. The line stays in
  the templates, which describe a configuration that would benefit from it.
  Nobody needs to go and apply it.
- **That the live Caddyfile does not serve the template's routes is its own
  finding**, and it belongs to whoever owns engine-01 rather than to this
  audit. CLAUDE.md 10.84 is about exactly this gap in the other direction.
- **social_reels bloat: done, 54 MB to 224 kB.** Not by the `VACUUM (FULL,
  ANALYZE)` this file first prescribed - the Supabase SQL transport wraps
  statements in a transaction and VACUUM refuses to run in one. `CLUSTER
  public.social_reels USING social_reels_pkey` performs the same heap rewrite,
  runs inside a transaction, and rebuilds every index as well, which mattered
  here: 13 indexes on 75 rows held 11 MB and now hold 176 kB, and the heap
  went from 43 MB to 40 kB. Taken at 00:05 UTC on 2026-09-18, outside the
  break window, after sampling the table for ten seconds and seeing zero index
  scans, zero sequential scans and zero updates, with `SET LOCAL lock_timeout
  = '3s'` so it would abort rather than queue in front of live traffic.
  Verified after: 75 rows, 75 distinct ids, all 13 indexes present and valid,
  65 public rows readable, `ALTER TABLE ... SET WITHOUT CLUSTER` to leave the
  catalog as it was found, and ANALYZE. The churn that caused it (3,700
  updates, no inserts, no deletes) will do so again; a per-table autovacuum
  setting is the durable answer and is a migration somebody should own.
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

## Measured live, 2026-09-18 00:0x UTC

The gap recorded below as ungettable was got. Anonymous requests carrying
`Accept-Encoding: gzip, br, zstd`, from a shell with production egress:

| what | code | content-encoding | cache | bytes on the wire |
| --- | --- | --- | --- | --- |
| smarter.poker/ | 200 | `br` | x-vercel-cache HIT | 6,003 |
| smarter.poker/hub | 200 | `br` | x-vercel-cache MISS, no-cache | 18,943 |
| smarter.poker/hub/commander | 200 | `br` | x-vercel-cache HIT | 20,158 |
| CA assets/index-*.js | 200 | `zstd` | max-age=31536000, immutable | 158,905 |
| CA assets/vendor-react-*.js | 200 | `zstd` | max-age=31536000, immutable | 76,501 |
| CA assets/index-*.css | 200 | `zstd` | max-age=31536000, immutable | 40,570 |
| ca-static.smarter.poker/ | 200 | `zstd` | s-maxage=60, stale-if-error=86400 | 13,121 |
| engine.smarter.poker/health | 200 | none | none | 9,583 |

So the CDN and compression verdicts no longer come from configuration. The
x-vercel-cache MISS on /hub is the page's own `no-cache, must-revalidate`, not
a CDN fault.

Phase 3 was also verified in the artefact rather than the source. The published
bundle changed hash (index-1YFaOFaa to index-UCXxW8eI), build-info.json reports
ca_sha 414c12e1654f, and inside MarketplacePage-BEnLGge--v6.js the compiled
PurchaseLedger reads `[h,p]=e.useState(""),x=H(h,300)` - useDebounce(query,
300) - with the request built from `x.trim()` and the callback's dependency
array `[s,o,x,k]`. It refires on a pause, not on a keystroke, in production.

## Verification gaps

The signed-in Lighthouse baseline for /hub/commander and /hub/club-arena/
needs a browser profile and was not taken; the anonymous after-merge run for
phase 2 is recorded above. engine-01 itself was never reached from this
session - SSH to it is refused here - so every statement about that box is an
inference from its public HTTP surface, which is sufficient for the
compression ruling and is not sufficient for anything about its disk.
