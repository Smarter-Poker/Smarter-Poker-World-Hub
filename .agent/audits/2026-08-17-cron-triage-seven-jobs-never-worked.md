# 2026-08-17 — Cron triage: seven scheduled jobs have never succeeded, once

**Phase A of the audit/upgrade build. Diagnosis complete; fixes require the
`smarter-poker-workers` repo, unreachable this session (Cowork GitHub bridge
down — see `.agent/handoffs/2026-08-16-restore-cowork-github-bridge.md`).**

## Headline

Eight scheduled jobs are failing at 100%. Seven have **never produced a single
successful run** — not once since they were scheduled in early May. Roughly
2,000 wasted invocations, plus 51,982 for the eighth.

The build tracker records this area as "~216 failed invocations/day in
Horse/Content crons". That is stale and describes a different set.

| Job | Scheduled since | Runs | Successes | Last success |
|---|---|---|---|---|
| `/cron/trivia-embed-backfill` | 2026-05-06 | 835 | **0** | never |
| `/cron/trivia-theme-backfill` | 2026-05-06 | 833 | **0** | never |
| `/cron/video-library-reels` | 2026-05-04 | 72 | **0** | never |
| `/cron/trivia-pool-monitor` | 2026-05-06 | 70 | **0** | never |
| `/cron/trivia-quality-audit` | 2026-05-06 | 70 | **0** | never |
| `/cron/trivia-regression-tests` | 2026-05-06 | 70 | **0** | never |
| `/cron/trivia-player-retag` | 2026-05-06 | 69 | **0** | never |
| `/cron/deploy-error-poll` | 2026-05-03 | 51,982 | 227 (0.4%) | 2026-08-05 |

## Two distinct failure classes

| Class | Jobs | Error | Duration |
|---|---|---|---|
| A | the 7 above | `HTTP 404` | 0–1 ms |
| B | `deploy-error-poll` | `HTTP 500` | 680 ms |

Sub-millisecond 404s mean the request never left the box. A 680 ms 500 means a
real round trip that reached a server and failed there. Different bugs — do not
treat them as one incident.

## Class A root cause — routes that were never built

All eight sit in `WORKERS_PREFERRED` (`scripts/openclaw-cron-dispatcher.py`
lines 546–556), so `fire_cron()` sends them to `WORKERS_BASE_URL` on the workers
VM rather than Vercel. Other entries in that same table — `hard-stop` (120/120
clean), `bbj-detect`, `collusion-scan`, the anti-cheat trio — pass, so the
workers service is up, reachable and authenticating. These routes 404 because
they do not exist on it.

Checked against git history:

- **Six trivia jobs** (`trivia-embed-backfill`, `-theme-backfill`,
  `-pool-monitor`, `-quality-audit`, `-regression-tests`, `-player-retag`) —
  `pages/api/cron/<name>.js` **never existed in this repo at any commit**. Added
  to the dispatcher 2026-05-06 with `WORKERS_PREFERRED` mappings pointing at
  workers routes that were never written. No implementation exists anywhere.
- **`video-library-reels`** — existed in World Hub, added `6abfc11dbc`
  (2026-04-25), deleted `60a07b0b29` (2026-04-27, *"delete 7 dead-code cron
  handlers"*). The port to workers did not include it.

The control that proves the diagnosis: `generate-trivia-questions` was deleted
in that same 2026-04-27 batch, *was* genuinely ported, and works today. The
pattern is sound — the batch was incomplete and nobody checked.

### Narrowing on video-library

Four of five `video-library-*` workers routes are healthy over 7 days:

```
video-library-scraper   7/7  ok
video-library-backfill  1/1  ok
video-library-purge     1/1  ok
video-library-views     1/1  ok
video-library-reels     0/7  FAIL
```

One missing route, not a broken family.

### A fix that looks right and is not

`video-library-reels` is registered twice — `SCRIPT_JOBS` (line 407, via
`SCRIPT_JOB_SCRIPTS` → `scripts/video_library_to_reels.py`, 481 lines, present
on disk) and `WORKERS_PREFERRED` (line 430). `_workers_dispatch()` wins, so a
working local script is shadowed by the 404ing route.

**Removing it from `WORKERS_PREFERRED` does NOT fix it.** `SCRIPT_JOBS` are
skipped wholesale on the secondary/Hetzner dispatcher — host-portability guards
at lines 718/745/775/802, skip at line 916 (*"Skipping N SCRIPT_JOBS on
secondary (SCRAPER_PY is Mac-only)"*). The job would go from 404ing to silently
not running, which is worse: it would look fixed.

Note the header comment at lines ~389–396 — on 2026-08-15 someone found a
*different* bug in this same job (`--sync-captions` belongs to
`video_library_to_reels.py`, not `video_library_scraper.py`) and fixed the
`SCRIPT_JOBS` side correctly. That fix only takes effect on the Mac primary. The
`WORKERS_PREFERRED` entry was left, so on the dispatcher that actually fires,
nothing changed. A correct fix, invisibly incomplete.

**Real fix:** build `/cron/video-library-reels` in `smarter-poker-workers`,
porting `scripts/video_library_to_reels.py`.

## Measured downstream damage

Not merely log noise. The trivia jobs were the maintenance layer for
`trivia_questions`, and none ever ran:

```
trivia_questions            11,197 rows
  missing embedding         11,197   (100%)
  never retagged            11,197   (100%)
  missing theme              8,728   (78%)
  missing quality_score           0
```

- The `embedding` column (pgvector) is **entirely empty** after 835 runs of the
  job meant to populate it. Semantic dedup and similarity search over the trivia
  pool have never functioned.
- Difficulty retagging has never run on any question.
- 78% of questions carry no theme, degrading theme-based selection.
- `quality_score` is 100% populated — maintained by `generate-trivia-questions`,
  the one job in the batch that was actually ported. The contrast is the control.

## Class B — `deploy-error-poll`

Separate bug. 51,982 runs, 227 successes (0.4%), none since 2026-08-05. HTTP 500
from a route that does exist. Moved to workers by `154cb4e33f` (2026-04-27):
*"flip deploy-error-poll to workers — VERCEL_TOKEN now on /opt/workers/.env"*.

Prime suspect is that `VERCEL_TOKEN`. Seven Vercel tokens were deleted during
the 2026-08-15 incident response — **but these failures predate that deletion by
months**, so a dead token is at best a second cause layered on an older one.
Read the worker logs before assuming.

This matters more than its row count suggests: it is the deploy monitor
CLAUDE.md §1.6 describes as running autonomously and self-healing. It was blind
through the entire 2026-08-15/16 incident, which is why six consecutive `ERROR`
deployments in Vercel drew no response. Combined with the separately-discovered
expired `Smarter-Poker-World-Hub-autofix` token behind `GH_PAT`, that subsystem
has two independent silent failures and has effectively never worked.

## Required work, in order

1. **Build `/cron/video-library-reels`** in `smarter-poker-workers` — port
   `scripts/video_library_to_reels.py`. Best value/effort: the implementation
   exists and is proven.
2. **Fix `deploy-error-poll`** — read `/opt/workers` logs on `5.161.252.33`.
   Restores deploy safety before Phases C and D ship anything.
3. **Decide on the six trivia jobs.** They are unbuilt features, not broken
   ones. Either implement them in workers or remove them from `ALL_CRONS` and
   `WORKERS_PREFERRED` — but do not leave them scheduled. 2,000 failures a
   quarter of pure noise is what let `deploy-error-poll` hide in this log.
4. **Backfill the damage** once the jobs run: 11,197 embeddings, 11,197 retags,
   8,728 themes.

## Guard to add (Phase B / U4)

None of this was hidden. It sat in `cron_execution_log` the whole time — nothing
was watching. Phase B should include an invariant that fails CI, or alerts, when
any job in `ALL_CRONS` has **zero successes in 24h**. That single check would
have caught all eight on day one, in May.
