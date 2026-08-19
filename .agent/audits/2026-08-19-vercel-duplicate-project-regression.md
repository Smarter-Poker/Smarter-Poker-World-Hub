# 2026-08-19 — Vercel duplicate-project regression (recurrence of 2026-05-08)

## Symptom
World Hub deployments sat in QUEUED for long stretches and then flipped to
BLOCKED. Surfaced while shipping the Club Arena leaderboard fix: the sync build
took ~4x its usual time to reach production and the follow-up docs commit was
blocked outright. Dan's dashboard showed the same commit building twice, under
two different projects.

## Cause
A second Vercel project, `smarter-poker-world-hub`
(`prj_cAdaLHhlih322O1SjK3pUrcHk2KN`, created 2026-08-16), was linked to the
same GitHub repo as the canonical project:

    hub-vanguard             prj_op66GkZyZcygXQKm76iyycfVFAQx   repoId 1132365826
    smarter-poker-world-hub  prj_cAdaLHhlih322O1SjK3pUrcHk2KN   repoId 1132365826  <-- duplicate

Every push to `main` therefore fired two production builds, and the duplicate's
builds competed for the same concurrency budget — the queue-starvation failure
mode described in CLAUDE.md 1.1.

This is a RECURRENCE. The original duplicate (`smarter-poker-world-hub`,
`prj_PGNqOQZSSWwWx7p86leBf5YTOWEU`) was deleted on 2026-05-08 after the same
incident; see `.agent/audits/2026-05-08-vercel-duplicate-project-incident.md`.
A project with the same name and a NEW id was recreated on 2026-08-16. Note the
duplicate never served traffic (`live: false`, only *.vercel.app domains), so
production was never at risk of serving from it — the damage was purely queue
contention.

## Fix (2026-08-19, with Dan's approval)
Disconnected the duplicate's Git link rather than deleting the project — stops
the duplicate builds immediately, preserves its history, and is reversible:

    DELETE /v9/projects/prj_cAdaLHhlih322O1SjK3pUrcHk2KN/link   -> 200

Verified after:
- duplicate project link: NONE (disconnected)
- hub-vanguard link: Smarter-Poker/Smarter-Poker-World-Hub (intact)
- `node scripts/check-vercel-project-uniqueness.mjs` ->
  "OK: exactly one project (hub-vanguard) links the repo."

## Note on the blocked deployment
The BLOCKED deployment in the dashboard (`6813343`) was a docs-only commit —
one markdown file under `.agent/audits/`, zero code. The leaderboard fix
shipped in the preceding sync build (`8565f20`, READY) and was verified live
on smarter.poker independently of it.

## Follow-up
Anything that recreates this project will reintroduce the stall. If it returns
a third time, find what creates it (a `vercel` CLI link run in the repo root,
or a dashboard "Import Project") rather than only removing it again.
`vercel-uniqueness-check.yml` runs the guard in CI.

## Post-fix observation
One further duplicate build (`dpl_HQyxCiHbmJ9tdqGaJSPkVqb3gUEz`) still appeared
seconds AFTER the unlink returned 200 — a webhook already in flight when the
link was removed, not a re-link. Re-checked immediately after: project link is
`NONE` and the uniqueness guard reports exactly one project. The commit below
is the controlled test push used to confirm no further duplicate builds fire.
