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
8. **What phase 3 broke** (Club Arena #4824, World Hub #1880): the audit's own
   debounce introduced a race, found by reading the merged file rather than
   the diff. See below.

## The change in phase 3 introduced a bug, and here it is

Debouncing the purchase search removed a request per keystroke. It also made
overlapping requests possible for the first time: a pause fires while an
earlier page or an earlier search is still on the wire, and nothing orders the
replies, so the older one is free to land second and overwrite the table.
Before the debounce every keystroke started a request and the last one started
was almost always the last one back; the fix for one problem opened another.

It matters more on this screen than on most. The refund control is drawn
inside the row and reads its purchase id off it, so rows the admin never asked
for arriving underneath those buttons is a money question. Club Arena #4824
gives every request a ticket and lets only the newest write to the table; a
superseded reply is discarded, and a superseded failure no longer raises a
toast or leaves an error banner over rows that had loaded perfectly well. The
empty-state sentence now describes the search the rows answer rather than the
text still being typed, and the pager is held while the two disagree.

Pinned by tests/the-ledger-shows-the-answer-to-the-question-asked.test.tsx,
which lands the replies out of order. Both tests fail with the fix reverted
and the test kept - the second reporting the symptom exactly, "expected
vi.fn() to not be called at all, but actually been called 1 times", that being
the alarm raised by a request nobody was waiting on. It ran in CI on shard 3
among 396 passing test files.

The audit's own two scripts had the same shape of fault and were corrected in
World Hub #1880: generate-webp-siblings.mjs took its repository root from
URL.pathname, so under a checkout path containing a space it found no public/
and printed "0 files" as though the work were already done, and
lighthouse-baseline.mjs printed its output directory and exited 0 when every
page had errored. Both now refuse rather than report.

## What the database sweep found, which was nothing

Ten tables looked heavily bloated on pg_stat_all_tables: data_audit_log at
4 GB for an apparent 6,307 rows, bus_event_log at 102 MB for 215, four more
reading as entirely empty. Every one of them was a false reading. n_live_tup
is a counter, not a measurement, and on tables autovacuum has not visited it
drifts without limit: the real counts are 1,401,851, 462,808 and 80,818, and
the space is data. reltuples, which is what the planner actually uses, was
accurate throughout, and pg_statistic has entries for these tables.

Recorded because the near miss is the useful part: ten production tables were
one step away from an exclusive lock each on the strength of a statistic that
was never a row count. Nothing was reclaimed and nothing needed to be. The one
measured imperfection is selectivity on bus_event_log.event_type, where the
planner expects 16 percent and the true figure is 99.8; an ANALYZE would
correct it, and it is left for an owner to schedule because changing
statistics changes plans immediately, including on money tables.

## Post-deploy certification is red for everybody

Not a finding about this audit's work, but visible from it and worth somebody
owning: Post-Deploy E2E failed 27 of its last 30 runs, across every agent's
commits. The usual cause is "Read The Origin Job Verdict" - it is refusing to
certify a release that the publish job declined to ship, and publishes decline
often because main moves faster than a build completes and
stamp-build-provenance correctly refuses a tree that has gone behind. The
pipeline converges; production did reach a41e126895. But a check that is red
27 times in 30 cannot show anybody a real regression, which is what 10.83 says
about checks nobody can see.

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
  **Re-measured 2026-09-18 02:4x, and the reasoning held.** The largest
  candidate of the twenty-five,
  idx_game_management_events_scope_created_cover, has gone from zero scans to
  62 and from 298 MB to 314 MB: its consumer shipped in the intervening day.
  The others are still at zero. That is the case for leaving all of them
  alone, now with an instance behind it rather than an argument - a drop
  performed on the evidence available yesterday would have removed an index
  that production began using today.
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
  updates, no inserts, no deletes) was expected to recur, and this file
  prescribed a per-table autovacuum setting as the durable answer.
  **That prescription is withdrawn on measurement.** Ten hours after the
  rewrite the table is still 224 kB, with zero dead tuples and n_tup_upd
  unchanged at 3,700 - no update has touched it since. The churn was
  historical, not ongoing, and autovacuum has 29 successful runs on this
  table, so there is nothing for a tuning migration to defend against.
  Nobody should open one.
- **rake_history**: 1,372,780 rows, 195 MB, last row 2026-05-01, never read
  by index and 47 times by sequential scan in its life. Retired financial
  history; keep it, but nothing needs it in the hot path.
- **settlement_idempotency_keys** (9.3 GB, 7.6 M rows, 6.5 billion index
  scans) and **solved_spots_gold** (80 GB, read 23 times by seq scan): retention
  and placement rulings, as with hand history.
- **The clones on the Mac, re-measured 2026-09-18 and worse, with the danger
  now named.** Not this audit's to fix, and the most urgent thing in this
  file. `scripts/check-checkout-freshness.sh` - the repository's own check,
  advisory by design - reports ~/Documents/Smarter-Poker-Club-Arena 236
  commits behind with 433 paths staged but never committed, and
  ~/Documents/club-arena, the one clone AGENT-PLAYBOOK 1b actually allows, 117
  behind. Two clones of the same repository exist where the playbook allows
  one. 554 worktrees hang off the canonical clone and 202 of them are more
  than 500 commits behind. ~/Documents/Smarter-Poker-World-Hub is 30 behind
  and clean.
  The concrete harm is no longer hypothetical. `.claude/skills/deploy-hetzner/SKILL.md`
  on disk in BOTH Club Arena clones is **v3.0.0**, and it names raw hosts
  including 178.156.160.206 - the TURN server, not the engine. `origin/main`
  has carried **v4.0.0** since 2026-09-17 18:13 (#4809), which names no IP at
  all and routes engine delivery through stage-engine-release.yml and
  auto-deploy-hetzner.yml. The file carries no local edit in either clone, so
  the difference is pure staleness: an agent pointed at either tree today
  loads v3.0.0 and is instructed about raw hosts that current doctrine has
  deliberately stopped naming. This is 10.87's own worked example, live again,
  six days later.
  **Fixed 2026-09-18 06:4x, by the narrowest route that removes the harm.**
  The owner's instruction was to find the safest path rather than escalate, so:

  1. Every uncommitted byte was preserved first, without touching any tree.
     `git stash create` builds a commit from the index and working tree while
     modifying neither, and each was given a durable tag: `club-arena` at
     wip/preserved/20260918T063625Z (4 files, 28 insertions, 109 deletions)
     and Smarter-Poker-Club-Arena at the same tag name (276 files, 33,326
     insertions). Untracked files - 21 and 25 of them - are not captured by
     `stash create`, and nothing run here deletes untracked files.
  2. The provenance of the dirty state was measured rather than assumed. In
     Smarter-Poker-Club-Arena the staged blobs for ci.yml, MIGRATION-CHANGELOG
     and the Diamond programme doc were each found in origin/main's own
     history at commits from 2026-09-14: an interrupted pull, exactly 10.87's
     account. In club-arena, though, AGENTS.md, CLAUDE.md and GEMINI.md are
     NOT in main's history at any point. Those are somebody's novel,
     uncommitted doctrine edits.
  3. So HEAD was not moved on either Club Arena clone. Committing another
     agent's doctrine rewrite is not this audit's to do and discarding it is
     what 10.87 forbids.
  4. What was fixed is the part that carries the harm. Nine agent-loaded files
     under `.claude/skills/` and `.agents/rules/` were stale in club-arena and
     **none of them carried a local edit**, so `git checkout origin/main -- <those nine>`
     touched nobody's work. The same was done in the duplicate clone, skipping
     `.agents/rules/00-agent-playbook.md`, which is locally edited there.
     Both clones now load deploy-hetzner **v4.0.0 with zero IP addresses**;
     178.156.160.206 appears in neither. Reversible with
     `git checkout HEAD -- <path>`.
  5. ~/Documents/Smarter-Poker-World-Hub was clean, so it simply
     fast-forwarded 30 commits and is current.

  Both clones remain behind by commit count, which the freshness check will
  keep reporting and should: that distance closes only when somebody resolves
  those three doctrine edits. The danger it was reporting is gone.

  **The worktree fleet was pruned with the repository's own tool.**
  `scripts/prune-stale-worktrees.sh` removes a tree only when it is clean, its
  HEAD is reachable from a remote ref, and its last commit is older than 72
  hours, and it uses `git worktree remove` without --force as a final refusal.
  69 pruned, 51 GB returned (68 GiB free to 119 GiB). Verified afterwards by
  path: all 72 worktrees holding unpushed commits still present, all 303 dirty
  worktrees still present, all 69 pruned gone.

  **72 worktrees hold commits that exist nowhere else** and that is now the
  open item in their place: codex-engine-version-guard has 7, codex-horse-phase8-r1
  6, Codex/2026-08-30/.../resume-audit 17. One disk failure loses them. They
  need pushing by whoever owns them; the prune script lists every one.

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
