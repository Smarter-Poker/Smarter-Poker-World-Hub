---
description: How "Cash Games Running" is produced and published, why the Bravo live scraper is off, and the environment facts an agent needs so it stops asking for things it already has.
---

# Live Cash Games — Operating Policy

> Read this BEFORE touching anything that reads or writes `venue_live_tables`,
> `game_live_history`, `/api/poker/live-tables`, or the PNM cash-games surface.

---

## 1. The publishing decision (owner, 2026-08-01)

**The Bravo live scraper is intentionally NOT run.** Do not "fix" this by trying
to bring `bravo-live-daemon.py` back, and do not treat its `connect_failed`
heartbeat as an incident to resolve.

"Cash Games Running" is published from **`scripts/bravo-simulator-daemon.py`**,
which models each venue's per-game, per-hour, per-weekday activity from **weeks
of real observed history** already collected in `game_live_history`. These are
approximate numbers derived from real data — that is the intended product, not a
stopgap.

The rule that matters: **publish the estimate, label the estimate.** Never
present a modelled number as a live observation, and never suppress it for being
modelled. Both failure modes have already happened in this repo:

- Suppressing it: `total_tables_running` once counted observed tables only. With
  Bravo off that is permanently 0, so the page showed "0 Live Tables" above a
  full list of games.
- Passing it off: rows were written with `source='bravo'`,
  `data_quality='scraped_verified'` and a fabricated `scrape_html_hash`, and the
  API certified them with `data_is_live: true`.

## 2. The API contract (`/api/poker/live-tables`)

Simulator rows are identified by `scrape_batch_id` starting `sim-`.

| Field | Meaning |
|---|---|
| `total_tables_running` | **What the UI shows.** Live when observed, otherwise the modelled estimate. |
| `total_tables_live` | Observed by a real scrape only. 0 while Bravo is off. |
| `total_tables_simulated` | Modelled from historical observation. |
| `total_tables_catalog` | Room capacity. Never folded into the running count. |
| `data_mode` | `live` \| `mixed` \| `estimated` \| `none` |
| `data_is_live` | Strictly observation-only. **Never true for an estimate.** |
| per-game `is_simulated` | true for modelled rows |
| per-game `data_quality` | `modeled_estimate` for modelled rows |

UI consumers must read `data_mode` and label accordingly. `[pnmTab].js` renders
`N Tables (Approx.)` when `data_mode === 'estimated'`; `LiveGamesFeed` carries
`dataMode` in `globalStats`.

## 3. Daemons — how they run, where they report

| Daemon | Role | Heartbeat |
|---|---|---|
| `bravo-simulator-daemon.py` | **PRIMARY cash-games source** | `data/bravo-logs/simulator-heartbeat.json` |
| `pokeratlas-live-daemon.py` | Game catalogue | `data/pokeratlas-logs/heartbeat.json` |
| `bravo-live-daemon.py` | Real cash games — **intentionally off** | `data/bravo-logs/heartbeat.json` |

They are started by launchd **directly** as
`.venv/bin/python3 scripts/<daemon>.py` — NOT through
`scripts/scrape-daemon-runner.sh`. Anything that must run before a session is
created therefore has to live **in-process**, not in a launcher. That is why
`scripts/browser_heal.py` exists.

Restart without launchctl: find the pid in the heartbeat and `kill -9 <pid>` —
launchd respawns it and it re-reads `.env.local`.

`scripts/scraper-watchdog-local.sh` monitors all three, restarting on a stale
heartbeat, an unhealthy `status`, `consecutive_failures >= 3`, a dead pid, or —
for the simulator — publishing 0 venues / 0 tables.

## 4. Environment facts (stop re-asking)

- **Supabase keys are correct and working.** Source of truth for production is
  **Vercel env vars**, not `.env.local`.
- `.env.local` intentionally holds only `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (new `sb_secret_…` format)
  and `SUPABASE_DB_PASSWORD`. It has **no** `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
  that affects local `npm run dev` only and is not a production issue.
- The service-role key uses the modern `sb_secret_…` format, not a JWT. Do not
  assume a JWT shape or try to decode it.
- Supabase CLI is blocked in the sandbox (`EPERM` under `~/.supabase`). Use
  browser automation against the dashboard instead.

## 5. Sandbox limits an agent will hit

- `device_bash` has **no network**. No `git push`, no `playwright install`, no
  Supabase REST, no curl to smarter.poker. The cloud `Bash` tool has network but
  no repo credentials and is blocked from supabase.co and smarter.poker.
- `device_bash` **cannot delete files** (`rm` → "Operation not permitted"), and
  it cannot clear `.git/*.lock`. It **can** `mv` within the same filesystem, so
  rename a stale lock aside instead of deleting it.
- Long-running background jobs are killed when the shell call ends (45s cap), so
  `npx next build` cannot complete there. Use `npx tsc --noEmit` plus a
  JSX-aware parse; the Build Safety Gate runs the real build on push.
- Chrome's `execute_javascript` / `get_page_content` fail with "Chrome is not
  running" unless **View → Developer → Allow JavaScript from Apple Events** is
  enabled. `list_tabs` and `open_url` work regardless.

## 6. Gates before committing here

```bash
npx tsc --noEmit                 # must exit 0 (repo CLAUDE.md rule)
python3 -m py_compile <file>     # .py
bash -n <file>                   # .sh
node --check <file>              # .js (NOT meaningful for JSX)
```

`node --check` silently accepts JSX in any file Node detects as ESM. For
`.jsx`/JSX-in-`.js`, parse with
`npx tsc --noEmit --allowJs --checkJs false --jsx preserve --noResolve` instead.

The pre-commit hook blocks `supabase.auth.getUser` / `supabase.auth.getSession`.
Server routes use `getSupabase().auth.getUser(token)`; client code uses
`getFreshAccessToken()` from `src/lib/authUtils`.
