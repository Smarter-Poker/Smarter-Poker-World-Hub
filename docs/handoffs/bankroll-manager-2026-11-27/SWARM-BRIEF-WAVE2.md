# Bankroll Manager swarm brief, wave 2 (2026-11-27 23:10 CT, Dan's order)

Dan (owner, Chicago time) ordered: "FULLY BUILD, FIX AND ENHANCE ALL OF THESE AND MAKE SURE THEY ARE FULLY
WIRED IN AND TESTED BEFORE CLAIMING SUCCESS." "These" = every section of the Bankroll Manager at
https://smarter.poker/hub/bankroll-manager (page: pages/hub/bankroll-manager.js, components:
src/components/bankroll/, libs: src/lib/bankroll/). You own ONE group of sections (given in your prompt).
Decide and act yourself; never hand Dan a step. Never stop at "pushed" - finish through live publication.

## Repo and rules
- Repo: Smarter-Poker/Smarter-Poker-World-Hub (shallow clone). Read CLAUDE.md sections 3 (8 immutable
  rules), 7, 10 before editing. No emoji in source. Mobile-first at 375px. Never call AI players "bots".
- Work on your own branch off fresh origin/main: `git fetch --depth=50 origin main && git checkout -B
  <branch> origin/main`. Branch name: `fix/bankroll-<group>-<short>` (never bookmark/handoff/wip names).
- Commit author MUST be: `git -c user.name="Smarter-Poker" -c
  user.email="254329056+Smarter-Poker@users.noreply.github.com" commit ...` (else Vercel BLOCKS the build).
  End commit messages with:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01UxDLnLzgZ6XC5SV4XCSNJr
- Only edit files in your group. AVOID pages/hub/bankroll-manager.js unless the defect truly lives there;
  if you edit it, keep the edit small, rebase onto origin/main right before pushing, and then recompute
  its hash in docs/business-hub-guide-review.json (inputs["pages/hub/bankroll-manager.js"] =
  sha256 of the file) - a test fails otherwise. Only do that for non-claim changes.
- Push: `git -c push.negotiate=true push -u origin <branch>`.
- PR: GraphQL is blocked; use REST: `gh api repos/Smarter-Poker/Smarter-Poker-World-Hub/pulls -f title=..
  -f head=<branch> -f base=main -f body=..` (body ends with the two lines:
  "🤖 Generated with [Claude Code](https://claude.com/claude-code)" and the session URL above).
  Repo automation queues an approved PR for squash auto-merge once checks pass. Poll checks with
  `gh api repos/.../commits/<sha>/check-runs?per_page=100`; on failure read the job log via
  `gh api repos/.../actions/jobs/<id>/logs`, fix, push again to the SAME branch (PR not merged yet).
  "Chromium and WebKit footer contract" may stay pending; it is not required.
- Any NEW test file under __tests__/ must be imported in __tests__/_test-guards-exist.test.mjs (next to
  `import './bankroll-analytics-view.test.mjs';`) or Pre-Deploy Safety Checks fails. Tests must not
  mutate process.env.TZ or other globals (that file imports them all into one process).
- Local `node --test` works for plain .mjs tests; repo node_modules are NOT installed (do not npm install
  in the repo). Some unrelated tests fail locally for missing deps (@babel/parser, posthog) - ignore those,
  CI is authoritative. Pre-existing failure on main: __tests__/image-header-help-icon.law.test.mjs.

## Verification you must do
1. Unit tests for every logic fix (node:test, .mjs).
2. Real render at 375px of every component you changed, with synthetic data: a ready harness exists in
   /tmp/rh (react 18, react-dom, recharts 3, lucide-react, esbuild, playwright-core; Chrome at
   /usr/bin/google-chrome). Pattern: write /tmp/rh/<you>/app.jsx importing the real component by
   absolute path, bundle with esbuild (nodePaths ['/tmp/rh/node_modules'], jsx automatic, loader .js:jsx,
   define process.env.NODE_ENV, plugin redirecting `next/dynamic` and `@supabase/supabase-js` to stubs;
   see /tmp/rh/dyn.js and /tmp/rh/supa.js), load in Chrome via playwright-core with
   `window.process={env:{NODE_ENV:"production"}}` set first, screenshot, LOOK at it (Read the png), and
   check console errors. Install extra packages into /tmp/rh/<you>/ only, never the repo.
   Components that call Supabase directly: stub the module with fake query builders returning
   synthetic rows.
3. After merge: confirm Vercel production deployment for project prj_op66GkZyZcygXQKm76iyycfVFAQx
   (team smarter-poker) is READY on your merge SHA or a later main SHA that contains it
   (`gh api repos/.../compare/<yourSHA>...<liveSHA>` status ahead/identical). Use mcp__Vercel__
   list_deployments (load via ToolSearch). Do not use sleep loops longer than needed; poll every ~60s.

## Hard limits
- NEVER use `git stash`: all wt-* worktrees share one stash list (two agents popped each other's work
  at 21:11 CT). Use WIP commits on your own branch or copies under /tmp/<you>/.
- NEVER read real user data from the database, never type passwords, never use Dan's account.
  No database migrations unless a defect is impossible to fix otherwise (then stop and report instead).
- Do not create scheduled tasks, new infra, or Vercel projects.
- Wave 1 already merged and live tonight (read their code, reuse their helpers, do not redo or revert):
  #3215 staking/toke (stakingMath.mjs, tokeReport.mjs), #3219 trips/series/calendar (tripMath.mjs,
  tournamentSchedule.mjs), #3220 ledger (ledgerMath.mjs, ruleViolations.mjs), #3221 reports/tax
  (ledgerReport.mjs, taxMath.mjs, projectionMath.mjs, Badges view), #3225 receipts (receiptGallery.mjs),
  #3235 deleted entry frees receipts. Never override another agent's change without reading why.
- Context already fixed tonight (don't redo): #3190 trend line plots daily points; #3205 added
  src/lib/bankroll/localDates.mjs (localDay, localDayOffset, parseLedgerDay) and switched UTC "today"
  and UTC parsing of YYYY-MM-DD to local in many bankroll files. Reuse those helpers.
- Dan's receipt rules (2026-09-08): a recognised W-2G suggests adding it to the Vault for year-end
  accounting; a buy-in goes to a Trip (start one if none active) and can never be unassigned; an expense
  goes to Expenses; every scanned receipt is saved and assignable later, never abandoned.

## What "fix and enhance" means here
Find real defects first (wrong math, wrong dates, broken wiring, dead buttons, empty/error states that
lie, unhandled failures, mobile overflow at 375px, inaccessible controls), fix them at the root, then add
clear, modest enhancements only where they make the section genuinely more useful and fully work. Do not
restyle sections (design system is #SmarterDesign: thin chrome, no bulky frames; no yellow).

## Report back (final message, concise)
PR numbers + merge SHAs, live deployment ID and live SHA, each defect found and fixed (one line each,
user-visible effect), enhancements, tests added, what you could NOT verify and why.
