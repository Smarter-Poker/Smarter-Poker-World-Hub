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
| Diamond Arena (only when assigned) | `Smarter-Poker/Smarter-Poker-Diamond-Arena` (requires an assigned scope, not another approval) |

## Rule 2 — Forbidden pushes

- **NEVER push to `Smarter-Poker/Club-Arena-Design`.** Archived (read-only). Its content lives in `Smarter-Poker-Club-Arena` now.
- **NEVER add `"crons":` to any `vercel.json`.** Vercel crons are policy-forbidden across the team. Use Open Claw → workers exclusively.
- **Preserve canonical Vercel projects.** A release does not authorize duplicate infrastructure. Any assigned architecture change must update the URL map and retain the owning provider safeguards.
- **Use an owned worktree.** Follow the current owner SSD policy; preserve shared clones and other tasks' files. Do not create duplicate infrastructure or reactivate retired local publishers.

## Rule 3 — Forbidden code patterns

- `supabase.auth.getUser()` calls outside `src/lib/auth/*` — use the validated Bearer wrapper.
- Client-side PIN gates for admin surfaces — server-side cookie + HMAC only (Phase 3.6 enforced).
- `export const runtime = 'edge'` on Pages Router routes that import `apiErrorHandler`, `supabaseServerClient`, or `serverAuth` — those are Node-only. Lesson from the 81-route revert in commit `683a8d380`.

## Rule 4 — Complete the actual delivery

Follow root AGENTS.md, the operating law and PUBLISHING.md. Run applicable local
prechecks, protected CI and merge, then verify the owning publisher, exact live
component and affected behavior. Read actual results; no fixed sleep or automatic
revert substitutes for diagnosis. Club Arena client publication is independent
of World Hub and the engine maintenance window. Never invoke a retired server
script, fallback publisher, watcher or repair loop.

## Rule 5 — One change per deploy

No stacked architectural changes. Every commit must be independently revertible. Every new Vercel project, every new Hetzner service, every new GitHub repo is its own gate with its own PR.

## Rule 6 — Audit before claiming "done"

Hard evidence required: file paths, commit SHAs, HTTP status codes, deploy IDs. "Should be done" is not "done." This rule exists because the four-times-100% pattern of April 2026 (claim 100%, find it wasn't, revise, repeat) was caused by skipping verification.

## Rule 7 — Preserve the actual product assignment

This instruction does not assign Diamond Arena development or another product phase. Follow the latest explicit assignment and current owner policy; do not infer a global release hold from this historical consolidation plan. Preserve canonical infrastructure and do not restore retired schedules.

## Rule 8 — Current owner authority

No additional human approval is required within assigned work. The current
owner policy governs all repositories, worktrees and provider locations.
Preserve required automated checks, financial integrity, secret handling,
existing canonical infrastructure and higher-priority tool constraints. A policy
file does not create unrelated assignments or bypass actual authentication.

## Rule 9 — Resolve blockers without abandoning independent work

Inspect configured access and documented metadata early. Diagnose failures,
repair supported causes and finish every eligible step yourself. A pending
credential input blocks only its dependent action; continue local checks,
integration and independent publication. State a genuine unavailable input
precisely, with its prepared next action. Never invent credentials or success.

## Rule 10 — Read this file before starting

Every Claude/AG/Cowork session that touches smarter.poker reads `.agent/architecture/url-map.md` and this file before opening a destructive tool. This isn't optional. If you can't access this file, you're in the wrong directory or repo.
