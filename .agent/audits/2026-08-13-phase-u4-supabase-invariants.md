# 2026-08-13 — Phase U4.2: phantom-table CI gate

Phase U4 of `CLUB-ARENA-OFFICIAL-UPGRADE-INTEGRATION.md` ("Supabase invariants
as CI gates"). U4.2 is shipped; U4.1 is not.

## Why U4 and not U1/U2/U3/U5/U6

U1 needs the `club-arena` repo and GitHub repo-settings (archiving a repo).
U2 and U3 need `club-arena/src` and `server/src` plus Hetzner deploy access.
U5 needs the CA Vite build and Cloudflare R2. U6 is doc moves across both repos.
None of those are reachable from this session — the only mounted repo is
`Smarter-Poker-World-Hub`, and there is no Hetzner credential.

U4 lives entirely in this repo and needs only Supabase, which is available. It
is also the phase most directly aimed at the bugs found over the previous two
sessions: a missing GRANT, a repurposed column, a `.from()` on a table that was
never created. All three shared a shape — the database and the code disagreed,
and nothing checked.

## What shipped

| File | Purpose |
|---|---|
| `scripts/ci/check-phantom-tables.mjs` | scanner + schema diff |
| `scripts/ci/supabase-invariants.allowlist.json` | intentional exceptions (empty) |
| `.github/workflows/supabase-invariants.yml` | non-blocking gate on push/PR to main |

Commits `4ceefeb3` and `13d53c7b`. Workflow run #2 green.

## First-run findings — 3 real phantoms in 384 referenced relations

    training_moves      src/engines/SessionTracker.js:116,179       INSERT
    xp_logs             src/hooks/useTrainingAccountant.ts:94,239   INSERT
    user_dna_profiles   src/services/MediaUploadService.js:456
                        src/services/SocialService.js:692

All three are live code paths writing to relations that do not exist. Each call
fails with `42P01` and is swallowed by the caller's warn-and-continue handler,
so the write silently never happens. `training_moves` and `xp_logs` are both in
the training/XP path, which suggests a feature that has been quietly recording
nothing.

**Not fixed here, and deliberately not allowlisted.** Creating three tables
requires knowing the intended schema and whether these features are still
wanted — that is a design decision, not a lint fix. Allowlisting them would
hide live data loss to make CI green, which is the opposite of the point.

## Getting to zero false positives

The naive version flagged 20 relations; 17 were wrong. Each exclusion below
cost an iteration and is load-bearing:

1. **Storage buckets.** `supabase.storage.from('avatars')` is not a relation.
   The `.storage` is usually on a *previous* line because the call is chained
   across lines, so a single-line test misses it. Needs a context window.
2. **A second Supabase project.** `pages/api/mlb/*` and `src/lib/mlb_data.ts`
   use `getMlbSupabase()`, which points at project `nscdmxldtyszyvcxxwgr`. Its
   tables (`dim_players`, `fact_games`, `raw_weather`, …) are correctly absent
   from this project. Detected per FILE, since the client is obtained once far
   above the `.from()` calls.
3. **JSDoc.** `src/lib/offlineQueue.js` and `src/lib/supabaseRetry.js` document
   the pattern with `supabase.from('posts')` and `.from('table')` in comments.

Final: 384 referenced, 3 phantoms, 0 false positives.

## Design choices worth keeping

- **Reads the schema from the PostgREST OpenAPI root**, not a custom RPC or a
  direct PG connection, so it works on a stock Supabase project. Verified
  against production that this endpoint accepts **only** the `service_role`
  key — both the legacy anon key and the publishable key return 401 with
  "Only the `service_role` API key can be used for this endpoint."
- **Missing or rejected credentials are a SKIP, never a failure.** Verified by
  running it against a real 401. A gate that red-lights on a network blip or a
  fork PR trains people to ignore it.
- **Separate workflow, not a step in `build-safety-gate.yml`.** That gate has
  failed on every commit for a long time at `CHECK 8`, so anything added to it
  inherits a red status and provides no signal.
- **Non-blocking** (`continue-on-error: true`) per U4.3, which calls for
  warnings first. Flip it to `false` once the 3 phantoms are resolved.

## Open

1. **Confirm `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` exist as
   repo secrets.** Without them the gate SKIPs and provides no value. The run is
   green either way, which is exactly the failure mode to check for. Repo
   secrets cannot be listed via the API from here.
2. **U4.1 — `check-stranded-writers.mjs`** not started. For every table
   referenced by `src/services/*`, assert at least one server-side write site
   exists.
3. **The 3 phantoms** need a decision: create the tables, or delete the dead
   write paths.
4. **Flip to blocking** after (2) and (3), per U4.3.
