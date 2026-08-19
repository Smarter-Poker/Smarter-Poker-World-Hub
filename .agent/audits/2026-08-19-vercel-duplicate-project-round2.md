# 2026-08-19 — Duplicate Vercel project, round 2 (the guardrail had a blind spot)

## What was found

A second Vercel project in the Smarter-Poker team,
`smarter-poker-world-hub` (`prj_cAdaLHhlih322O1SjK3pUrcHk2KN`, created
~2026-08-15), was building **every push to Smarter-Poker-World-Hub** — 20
production deployments in a two-hour window, a mix of READY, CANCELED and
BLOCKED. This is the same failure mode as the 2026-05-08 incident recorded in
`2026-05-08-vercel-duplicate-project-incident.md`: duplicate builds fight the
real project for build-queue concurrency and burn build minutes.

Note the ID is NOT the one CLAUDE.md lists as dead
(`prj_PGNqOQZSSWwWx7p86leBf5YTOWEU`). That one was deleted in May. This is a
NEW project with the same name — i.e. a fresh regression, and a RULE 12
violation (no agent may create parallel infra).

## Why the guardrail missed it

`scripts/check-vercel-project-uniqueness.mjs` decided "linked to the repo" by
reading `project.link`. The duplicate reported **NO link at all**, yet still
received deployments: Vercel's GitHub App can keep dispatching deployment
events to a project whose `link` has been cleared. So the script printed
"OK: exactly one project links the repo" while the duplicate quietly built
every push.

Verified directly against the API at the time:

    hub-vanguard              link → {type: github, repo: Smarter-Poker-World-Hub, ...}
    smarter-poker-world-hub   link → NO LINK      (but 20 recent builds of this repo)

## Fix

1. **Deleted** the duplicate project (HTTP 204). Pre-delete safety checks: it
   served no custom domain (only `smarter-poker-world-hub-ten.vercel.app`),
   and `smarter.poker` was confirmed to be on `hub-vanguard`. Production
   verified healthy immediately after: `/api/health` ok, club-arena 200.
2. **Closed the blind spot.** The script now runs a second pass over EVERY
   non-canonical project in the team, inspecting the last 10 deployments for
   `meta.githubRepoId === 1132365826` (or `meta.githubRepo === REPO`). Any
   project building this repo now fails the check with exit 1, whether or not
   it reports a `link`. The failure message states explicitly that clearing
   the link is not sufficient — the project must be deleted — because that is
   precisely how this one evaded detection.

Re-run after the fix: exits 0 with
"exactly one project (hub-vanguard) links the repo, and no other project is
building it."

## Note for whoever runs this next

Deleting a project is irreversible and was done with Dan's explicit approval.
If a future duplicate appears, the same two safety checks apply first: does it
serve a custom domain, and is `smarter.poker` still bound to `hub-vanguard`.
