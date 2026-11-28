# Swarm brief: make the World Hub "Chromium and WebKit footer contract" job green

Owner: Dan (Daniel). He has granted full authority over this codebase: decide and act, never ask him to do work you can do. All times you report are Central (America/Chicago). Never say "looks good". AI poker players are "horses", never "bots". No emoji in code.

## Repo and rules (read before touching anything)
- Repo: Smarter-Poker/Smarter-Poker-World-Hub (Next.js pages router, smarter.poker, Vercel project hub-vanguard). Clone: /home/claude/smarter-poker-world-hub (shared; NEVER commit there, its pre-commit hook refuses).
- Read /home/claude/smarter-poker-world-hub/CLAUDE.md first (deployment, rules, Section 10 working rules). PUBLISHING.md governs delivery.
- Make your OWN worktree: `cd /home/claude/smarter-poker-world-hub && git fetch -q --depth=60 origin main && AGENT_WORKTREE_ROOT=/home/claude/swarm/trees bash scripts/agent-workspace.sh claude <your-slug> --print-path` (it creates branch agent/claude/<slug> from origin/main and copies node_modules). Then `git config core.hooksPath .husky`. Do NOT symlink node_modules into node_modules (a nested node_modules/node_modules symlink loads React twice).
- Commit author must be `Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>` (`git config user.name Smarter-Poker; git config user.email 254329056+Smarter-Poker@users.noreply.github.com`). End every commit message with exactly:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01UxDLnKPUCMCKa6JqUzrwLs
- PR bodies end with:
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  https://claude.ai/code/session_01UxDLnKPUCMCKa6JqUzrwLs
- Before every commit: `git checkout -- next-env.d.ts tsconfig.tsbuildinfo` (dev/tsc drift is refused). Commit explicit paths only. Never commit local helper files (e.g. a pw.local.config.ts) - delete them first.
- Amending is blocked by a hook; make new commits. Push with `git -c push.negotiate=true push origin HEAD:agent/claude/<slug>`.
- GitHub: use REST via `gh api` (GraphQL `gh pr` commands are blocked). Create PRs with `gh api -X POST repos/Smarter-Poker/Smarter-Poker-World-Hub/pulls -f title=... -f head=agent/claude/<slug> -f base=main -F body=@file`.
- A pushed agent branch is auto-proposed and squash AUTO-MERGED once the 8 required checks pass - and the footer job is NOT required. So to stop an unproven fix shipping: make your FIRST commit subject start with `wip:` OR add the label `do-not-ship` to your PR immediately after opening it (`gh api -X POST repos/.../issues/<n>/labels -f 'labels[]=do-not-ship'`). Only after the footer job proves your gate green, remove the label (`gh api -X DELETE repos/.../issues/<n>/labels/do-not-ship`) and, if you used `wip:`, push a normal final commit. Then let auto-merge (or `gh api -X PUT repos/.../pulls/<n>/merge -f merge_method=squash -f sha=<head>`) merge it.
- If GitHub shows mergeable_state "unknown" for minutes and no CI starts, main moved and conflicts: `git fetch --depth=60 origin main && git merge origin/main`, resolve, push. The generated file `.agent/audits/2026-08-31-training-phase-2-inventory.json` conflicts often: take theirs, then `node scripts/training-surface-inventory.mjs --write` and `--check`.
- Required local checks before pushing: the node tests that touch your files (`node --test <file>`; find them with `grep -rln <path> __tests__ tests`). `__tests__/horse-solver-v31-pipeline.test.mjs` fails in this sandbox because we run as root - ignore it. If you add a test under __tests__, register it (an `import './x.test.mjs';` line at the end of the import list in `__tests__/_test-guards-exist.test.mjs`) and run that guard.

## Machine limits (8GB RAM, shared by 5 agents)
- NEVER run `next build` / `npm run build` locally: it is OOM-killed. The production build is only proven in CI.
- `next dev` only while holding the shared lock, and stop it when done:
  `flock /tmp/nextdev.lock bash -c '<start next dev on YOUR port, test, kill it>'` - one dev server on the whole box at a time. Use `NODE_OPTIONS=--max-old-space-size=4096 NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next dev --webpack -p <port>`. Never `rm -rf .next` in anyone else's tree. Note: dev does not prefetch and does not reflect prod bundle sizes.
- Playwright: browsers cannot be downloaded. Use a local config that sets `launchOptions: { executablePath: '/usr/bin/google-chrome' }` (Chromium only; WebKit is not available locally - WebKit proof comes from CI). Example config (create, use, delete before commit):
  ```ts
  import base from './playwright.config';
  export default { ...base, webServer: undefined, retries: 0, reporter: 'line',
    projects: (base.projects || []).filter((p: any) => ['chromium','mobile-chrome'].includes(p.name)).map((p: any) => ({
      ...p, dependencies: [], use: { ...p.use, baseURL: process.env.PLAYWRIGHT_BASE_URL, launchOptions: { executablePath: '/usr/bin/google-chrome' } } })) };
  ```
  Many specs can run against live `https://smarter.poker` (PLAYWRIGHT_BASE_URL) when they mock /api and /rest. Read-only only - never write production data.

## The CI job you are fixing
Workflow `.github/workflows/global-footer-e2e.yml`, job "Chromium and WebKit footer contract", runs on every PR against a production build (`PWA_ENABLED=1`, placeholder Supabase). Every gate now runs independently. Latest full run: job id 140856917240 (PR #3229, head 2f80fbe). Read it: `gh api repos/Smarter-Poker/Smarter-Poker-World-Hub/actions/jobs/140856917240/logs > /tmp/<you>-baseline.log` and split by `##[group]Run` lines. Results there:
- 11 Build OK; 13-17 Video Library OK; 21-27 Horses, Bankroll/Toke (029), header "?" (032), Trivia OK; 29 footer routes OK.
- 12 FAIL Personal Assistant: `e2e/personal-assistant-completion.spec.ts:282` "Log A Hand confirms the save and opens the same Review row after reload using local API fixtures" on project pa-mobile-webkit390: "No Runtime Page Errors" (expected none, received some).
- 28 FAIL Diamond Marketplace Page 1 (owned by the coordinator, not you).
- 30 FAIL World menu premium: `e2e/022-world-menu-visual.spec.ts:74` "Training Games premium drawer matches desktop and mobile references": snapshot `e2e/022-world-menu-visual.spec.ts-snapshots/training-mobile.png` differs.
- 31 FAIL World menu Phase 3: `e2e/024-world-menu-mobile-phase3.spec.ts:216` "Poker Near Me: Phase 3 mobile menu contract" (chromium and webkit): toEqual deep-equality diff.
- 32 FAIL Mobile budget `e2e/mobile-budget.spec.ts`: /hub/bankroll-manager 954KB JS (budget 850), /hub/preflop-charts 971KB (850), /hub/poker-near-me "PNM JavaScript exceeds maintained mobile budget", /hub/training LCP 3188ms (2500) and "renders 1 text nodes under 12px".
Read the spec and its budget table before changing anything: the budget numbers are the owner's standard - fix the PAGES, never raise a budget or weaken an assertion. A visual snapshot may be refreshed only if the change behind it was deliberate (find the PR that changed the drawer) and the new render is correct; snapshots must come from CI's Linux render, not a local one (fonts differ).

## How to prove your fix
Push your branch, open the PR (held with `do-not-ship`), wait for the footer job on YOUR head commit, and read YOUR step's conclusion: `gh api repos/.../actions/jobs/<id> --jq '.steps[]|"\(.number) \(.conclusion) \(.name)"'`. Your gate must be `success`, and every step that was success in the baseline must still be success. Do not use sleep loops longer than needed; while CI runs, keep working (review your diff, run related tests). Fix at the root - no band-aids, no skips, no `test.fixme`, no budget increases.

## Report back
When merged (or if genuinely blocked), reply with: PR number, merge SHA, the footer job id and the exact step results proving your gate, what you changed and why (root cause), and anything you observed but did not change. Do not claim success without the CI step result.
