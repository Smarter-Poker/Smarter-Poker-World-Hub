# The deploy documents named a route that is gone, and one of them was a git hook

Date: 2026-09-04
Branch: `fix/the-deploy-docs-name-the-live-route`

## The mechanism, first, because it is what makes this urgent

**Next.js serves `public/` BEFORE a rewrite.** Club Arena stopped publishing
through this repo on 2026-09-03: it builds in its own repo and rsyncs to
`ca-static.smarter.poker`, and this repo carries one rewrite,
`/hub/club-arena/:path*` -> that origin. The 1,792 vendored files under
`public/hub/club-arena/`, `scripts/sync-club-arena.sh` and
`scripts/build-club-arena.sh` were all deleted.

So an agent that followed the old instructions would not have created a
harmless duplicate. It would have **SHADOWED the live bundle**: production
keeps serving the committed copy, `publish-club-arena.yml` keeps rsyncing to an
origin nobody reads, `build-info.json` keeps reporting a sha that is correct
for a file nobody is served, and nothing anywhere raises an alarm. That is a
silent production freeze with a green pipeline over it.

## What was still telling agents to do it

Four documents, three of them live instructions in the present tense with no
banner. Every one of them is opened before touching anything, which is the
worst possible place for a stale instruction.

| File | What it said |
| --- | --- |
| `.agent/workflows/club-arena-rebuild.md` | "THE ONLY WAY TO DEPLOY ... No exceptions" over `bash scripts/build-club-arena.sh`, and "NEVER gitignore `public/hub/club-arena/`" as **HARD LAW** - the exact inverse of `.gitignore:27` |
| `scripts/hooks/pre-commit-core.sh` | An EXECUTING git hook printing `bash scripts/sync-club-arena.sh` as its remediation, plus two escape hatches (`ARENA_BUILD=1`, `MERGE_HEAD`) that would have let the directory back in |
| `AGENT-DEPLOYMENT-GUIDE.md` | 294 lines under a MANDATORY READING banner: build on a Club Arena Vercel project, download 200+ chunks, push them here with the Git Trees API |
| `.agent/AGENT-OPERATIONS-GUIDE.md` | Drifted from Club Arena's copy of the same file; still described the sync as the publish path |

Three more, found by sweeping the whole repo rather than the four the handoff
named:

| File | What it said |
| --- | --- |
| `CLUB-ARENA-OFFICIAL-UPGRADE-INTEGRATION.md` | The platform plan CLAUDE.md calls authoritative. Its pipeline diagram, its "frontend change" recipe and roadmap item U5.4 all named the deleted scripts |
| `.agent/workflows/completion-protocol.md` | "or run `npx vercel --prod` locally" - forbidden outright by CLAUDE.md 1.3 |
| `STRIPE_WEBHOOK_SETUP.md` | `vercel --prod` as step 4 of a runbook, same prohibition |

And one that promised a safety net that does not exist: `CLAUDE.md` L198, L228
and L806 all described `club-arena-scheduled-deploy.yml` as "the sanctioned
daily safety-net workflow" owning `VERCEL_HUB_VANGUARD_DEPLOY_HOOK`. That
workflow was retired on 2026-09-03 with the sync it protected, and
`scripts/ci/check-no-vercel-deploy.mjs` has had an EMPTY allowlist ever since -
but that script's own header still named the exception too. A believed-in
safety net that is not running is worse than none: it is a reason to stop
checking.

## What changed

- `.agent/workflows/club-arena-rebuild.md` and `AGENT-DEPLOYMENT-GUIDE.md`
  **replaced**, not bannered. A banner over a body that still reads as
  present-tense law does not help a reader who skims into the middle of it.
- `scripts/hooks/pre-commit-core.sh` CHECK A rewritten: **no escape hatch**.
  There is no legitimate commit that puts a file back in that directory, and a
  merge that wants to is a merge of a branch older than the deletion - the
  message now says to resolve it with `git rm -r --cached`.
- `.agent/AGENT-OPERATIONS-GUIDE.md` resynced from Club Arena's copy, which was
  a strict superset and already correct.
- `AGENTS-PUSH-GUIDE.md`, `CLUB-ARENA-OFFICIAL-UPGRADE-INTEGRATION.md`,
  `.agent/workflows/completion-protocol.md`, `STRIPE_WEBHOOK_SETUP.md`
  corrected in place, each saying what it used to say and why that is wrong.
- `CLAUDE.md` and `scripts/ci/check-no-vercel-deploy.mjs` now agree with the
  code: no deploy-hook caller is permitted, and the retired workflow is marked
  retired in the cron allowlist so nobody re-adds it.
- `MLB_SUPABASE_URL` / `MLB_SUPABASE_SERVICE_KEY` removed from
  `.env.local` - nothing in this repo reads them and the service was removed.
  The old file is kept at
  `~/.smarter-poker/retired-credentials/wh-env-local-with-mlb-vars-20260904.bak`
  (mode 600, outside every repo). **The key itself has not been rotated; that
  is Dan's call and it is flagged in the session report.**

## What stops it coming back

`tests/the-deploy-docs-name-the-live-route.test.mjs`, wired into CHECK 8 of
`build-safety-gate.yml`. It sweeps **every** tracked `.md` and `.sh` in the
repo, not a hand-written list of three - the Club Arena copy of this law
covered three files and none of the offenders above.

Two design decisions worth defending:

1. **It matches the script path, not a `bash ` prefix.** Club Arena's version
   required a literal `bash scripts/sync-club-arena.sh`, so
   `~/Documents/Smarter-Poker-World-Hub/scripts/build-club-arena.sh` on its own
   line and "run scripts/sync-club-arena.sh" both evaded it - and both existed.
2. **The exemption window is one line either side.** A correction or a
   prohibition that governs a line is written next to it ("**No `vercel
   --prod`.**" in the same table cell). A twelve-line window let
   `completion-protocol.md` off, because an unrelated "FORBIDDEN" in a CAUTION
   block sat in the same paragraph as a live instruction to run the CLI.

`.agent/audits/`, `.agent/handoffs/`, `docs/changelog/` and `docs/_archive/`
are exempt by directory. An audit of the 2026-08-21 publish deadlock has to be
able to name the script that deadlocked; sanitising history would destroy the
only account of why these rules exist, and nobody opens a dated audit looking
for today's deploy command.
