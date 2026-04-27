# Agent Rulebook — One Source of Truth

**For all Claude / AntiGravity / Cowork / autonomous agent sessions touching smarter.poker.**

This rulebook is the post-consolidation contract. The platform consolidation completed 2026-04-27. Future sessions must NOT recreate the sprawl that was just cleaned up.

Live URL map: `.agent/architecture/url-map.md` (kept current with every architectural change).
Full plan: `~/Documents/SMARTER-POKER-PLATFORM-CONSOLIDATION.md` on Dan's Mac.

## Rule 1 — Canonical repos

Every product surface has exactly one repo. Pushes go nowhere else.

| Surface | Canonical GitHub repo |
|---|---|
| World Hub frontend + most APIs | `Smarter-Poker/Smarter-Poker-World-Hub` |
| Commander Orb | `Smarter-Poker/smarter-poker-commander` |
| Club Arena (engine + Vite frontend) | `Smarter-Poker/Smarter-Poker-Club-Arena` |
| Cron handler execution | `Smarter-Poker/smarter-poker-workers` |
| Cron scheduler config | `Smarter-Poker/Smarter-Poker-World-Hub` (`scripts/openclaw-cron-dispatcher.py`) |
| Diamond Arena (CLOSED until Club Arena ships) | `Smarter-Poker/Smarter-Poker-Diamond-Arena` (do not push without Dan's go) |

## Rule 2 — Forbidden pushes

- **NEVER push to `Smarter-Poker/Club-Arena-Design`.** Archived (read-only). Its content lives in `Smarter-Poker-Club-Arena` now.
- **NEVER add `"crons":` to any `vercel.json`.** Vercel crons are policy-forbidden across the team. Use Open Claw → workers exclusively.
- **NEVER create new Vercel projects** without an explicit Dan approval AND adding the row to `.agent/architecture/url-map.md` in the same PR.
- **NEVER add a new local clone of an existing repo** to `~/Documents/`. Use the canonical clone (named exactly as listed in Rule 1).

## Rule 3 — Forbidden code patterns

- `supabase.auth.getUser()` calls outside `src/lib/auth/*` — use the validated Bearer wrapper.
- Client-side PIN gates for admin surfaces — server-side cookie + HMAC only (Phase 3.6 enforced).
- `export const runtime = 'edge'` on Pages Router routes that import `sentryWrap`, `supabaseServerClient`, or `serverAuth` — those are Node-only. Lesson from the 81-route revert in commit `683a8d380`.

## Rule 4 — Verify after every push

After any push that touches production:

1. Wait ~3 minutes for Vercel to build (or `bash server/deploy-hetzner.sh` for the engine).
2. Probe at least three URLs from `.agent/architecture/url-map.md` and confirm 2xx/3xx.
3. If state goes ERROR or any probe returns 5xx: revert immediately with `git revert <sha> && git push`. Do NOT let the autofix bot compound failed deploys (that pattern caused multiple session-ending incidents in April 2026).

## Rule 5 — One change per deploy

No stacked architectural changes. Every commit must be independently revertible. Every new Vercel project, every new Hetzner service, every new GitHub repo is its own gate with its own PR.

## Rule 6 — Audit before claiming "done"

Hard evidence required: file paths, commit SHAs, HTTP status codes, deploy IDs. "Should be done" is not "done." This rule exists because the four-times-100% pattern of April 2026 (claim 100%, find it wasn't, revise, repeat) was caused by skipping verification.

## Rule 7 — Diamond Arena is closed

No new feature work on `Smarter-Poker-Diamond-Arena` until Club Arena reaches 100% completion. The `diamond-arcade` Vercel project was deleted 2026-04-27 (no custom domain, scaffold-only). When Diamond reopens, treat it as a fresh build — don't reanimate the old crons.

## Rule 8 — Approval boundaries

Sandbox sessions can do, without further approval:
- File operations on `~/Documents/` (move, edit, delete files NOT in graveyard restoration)
- Read-only API calls to Vercel, GitHub, Supabase
- URL probes against production (HEAD/GET only)
- Drafting docs and pre-push hooks

Sandbox sessions REQUIRE explicit Dan approval for:
- Deleting Vercel projects (only the duplicates listed in this consolidation plan are pre-authorized)
- Creating new Vercel projects
- Archiving GitHub repos beyond what this plan already covers
- Any change to `.github/workflows/build-safety-gate.yml` (DO NOT touch — new workflows only)
- Any cron added to or removed from Open Claw's `WORKERS_PREFERRED` map

## Rule 9 — When stuck, stop

If the next step requires a credential, server access, or domain knowledge you don't have, STOP and ask. Do not invent paths. Do not push commits with `-m "WIP"`. The platform's reliability comes from refusing to guess.

## Rule 10 — Read this file before starting

Every Claude/AG/Cowork session that touches smarter.poker reads `.agent/architecture/url-map.md` and this file before opening a destructive tool. This isn't optional. If you can't access this file, you're in the wrong directory or repo.
