# HANDOFF: World Hub "Chromium and WebKit footer contract" to green, plus the #SmarterDesign header "?" programme (complete)

You are picking up a task mid-flight. Read this entire document before acting. The owner is Dan (Daniel). He wants everything FINISHED: built, merged, published, and verified live on smarter.poker, with nothing claimed until it is verified.

His standing rules, all binding:
- Never ask him to do work you can do. Decide and act. Never end a reply with an offer or a question about work you can do.
- Never sit idle while CI runs; do other useful work. Use a reminder rather than long sleep loops when the wait is hours.
- Every time you give him is in Central time (America/Chicago), never UTC.
- Fix at the root. No band-aids. Never weaken a test or raise a budget to make it pass.
- Premium 3D metallic UI only (#SmarterDesign).
- Merge your own PRs. Verify live before claiming success.
- Never say "looks good". AI players are "horses", never "bots". No emoji in code.

---

## 0. BOOKMARK: exact state at handoff (Fri 2026-11-27, ~11:20 PM CST)

**Repository and production**
- Repo: `Smarter-Poker/Smarter-Poker-World-Hub` (Next.js pages router; the smarter.poker site).
- Vercel project: `hub-vanguard` / `prj_op66GkZyZcygXQKm76iyycfVFAQx`.
- Live at handoff: `https://smarter.poker/api/health` reports commit `6f0b657d` (deployment `dpl_83ieeosXyrxiFYqhzLuxewMty6C3`). That includes everything this programme merged.
- This handoff, its images and its scripts are pushed on branch **`bookmark/footer-contract-green-2026-11-27`**, under `docs/handoff/footer-contract-green-2026-11-27/`. The `bookmark/` prefix means automation never opens a PR for it or auto-merges it.
  - Read it with: `git fetch origin bookmark/footer-contract-green-2026-11-27 && git show FETCH_HEAD:docs/handoff/footer-contract-green-2026-11-27/HANDOFF.md`
  - Or browse it on GitHub.
  - Never merge that branch.

**Open work at handoff, all held with the `do-not-ship` label so nothing ships unproven:**

| Item | Branch | PR | State |
|---|---|---|---|
| A. Diamond Marketplace Page 1 contract | `agent/claude/marketplace-hero-contract` | #3244 | Pushed, held. Footer job was running on head `27b25ed4` (PR merge sha `6e83b2aa`). Needs: read the footer job's "Verify Diamond Marketplace Page 1 commerce anatomy" step. If success, remove the label and merge. |
| B. Personal Assistant WebKit page error | `agent/claude/pa-webkit-log-hand` | #3245 | Pushed by a swarm agent, held. Branch head `d008d899` (PR merge sha `fb8718fe`). Needs: CI proof, then remove the label and merge. |
| C. Mobile budget: /hub/bankroll-manager + /hub/preflop-charts | `agent/claude/budget-bankroll-preflop` (local only) | none | Swarm agent was mid-edit. UNCOMMITTED changes existed in `/home/claude/swarm/trees/claude` (`pages/_app.js` +50, `src/services/LiveStreamService.js` +11, `__tests__/the-app-shell-stays-light.law.test.mjs` +45). The container will not survive, so treat this as NOT STARTED unless the branch exists on GitHub. |
| D. Poker Near Me: Phase 3 mobile menu contract + PNM JS budget | `agent/claude/pnm-budget-menu` | none at snapshot | Swarm agent was running. Check GitHub. |
| E. Training: LCP + text under 12px + premium World menu snapshot | `agent/claude/training-budget-menu` | none at snapshot | Swarm agent was running. Check GitHub. |

**First commands for the next agent:**
```bash
R=repos/Smarter-Poker/Smarter-Poker-World-Hub
for b in marketplace-hero-contract pa-webkit-log-hand budget-bankroll-preflop pnm-budget-menu training-budget-menu; do
  echo "== $b: $(gh api $R/branches/agent/claude/$b --jq .commit.sha 2>/dev/null | cut -c1-8)"
  gh api "$R/pulls?head=Smarter-Poker:agent/claude/$b&state=all" --jq '.[]|"#\(.number) \(.state) merged=\(.merged_at) labels=\([.labels[].name]|join(","))"'
done
curl -s https://smarter.poker/api/health
```

---

## 1. OWNER DIRECTIVES (verbatim intent, chronological, all binding)

1. **11:45 AM CST (the original assignment).** "MAKE SURE THAT EVERY SINGLE IMAGE DISPLAY HEADER IS USING THIS SAME DYNAMIC QUESTION MARK ICON AS SEEN IN THE FIRST ATTACHED [Club Arena 'KINGS CLUB Cashier' header], AND NEVER ANY OTHER ONE [the flat CSS-circle '?' on Bankroll Manager / Toke Tracker]. REPLACE THEM ALL ... ALWAYS BE TUCKED INTO THE UPPER RIGHT CORNER AS CLOSE TO THE EDGES AS POSSIBLE WITHOUT TOUCHING THE FRAMES. ADD THIS TO THE #SMARTERDESIGN AS A STANDARD. 2, THERE SHOULD NEVER BE A 'BACK TO DASHBOARD' BUTTON INSIDE THE IMAGE HEADER, IT SHOULD BE ABOVE IT."
2. **12:01 PM.** "CHECK EVERY SINGLE PAGE AND SUBPAGE THAT WAS UPDATED AND INSURE THIS HAS BEEN IMPLEMENTED AND UPGRADED."
3. **1:41 PM.** "FINISH UP ANY AND ALL UNFINISHED WORK ... FULLY BUILD, FIX AND ENHANCE ... FULLY WIRED IN AND TESTED BEFORE CLAIMING SUCCESS. YOU DECIDE THE BUILD ORDER. LAUNCH A SWARM IF IT WILL HELP."
4. **4:43 PM.** "YOU OWN THIS CODE BASE AND ANY AND ALL DECISIONS INSIDE OF IT ... LAUNCH A SWARM TO HELP WITH ANYTHING AND EVERYTHING."
5. **7:35 PM.** "APPROVED" (approval of the header "?" work as shipped).
6. **7:41 PM and 9:26 PM.** "WHAT IS LEFT TO DO? HOW ELSE CAN THIS BE IMPROVED, ENHANCED OR OPTIMIZED STILL?" These led to #3191, #3195, #3208 and #3229.
7. **11:09 PM (the CURRENT assignment).** "FINISH UP ANY AND ALL UNFINISHED WORK, AND THEN GO AHEAD AND FULLY BUILD, FIX AND ENHANCE ALL OF THESE [the five failing footer-job gates] AND MAKE SURE THEY ARE FULLY WIRED IN AND TESTED BEFORE CLAIMING SUCCESS. YOU DECIDE THE BUILD ORDER. LAUNCH A SWARM IF IT WILL HELP."
8. **11:16 PM.** Asked for this handoff.

Earlier preference (2026-11-27): "DO NOT USE THOSE BULKY FRAMES, THATS THE OLD STYLE... USE THE #SMARTERDESIGN STYLE." The painted #ClubArenaConsole console frames are the old style for page sections.

---

## 2. PHASE 1: header "?" standard (COMPLETE, merged, live, verified)

### 2.1 Merged PRs, in order (all live in production; current live `6f0b657d` contains all of them)

| PR | Merged (CST) | Merge sha | What |
|---|---|---|---|
| #3168 | 5:53 PM | `905b0e70` | One painted "?" in every image header (asset `public/images/smarterdesign/header-help.webp`, constant `src/components/smarterdesign/headerHelp.js`), corner geometry in `styles/smarterdesign.css` (`.sd-header-help`, vars `--sd-help-rim`, `--sd-help-border`, `--sd-help-gap`, `--sd-help-icon`), Back To Dashboard above the header (`BankrollImageHeader` `back` prop, `[data-header-stack]` > `.sd-header-back` + `header.sd-masthead`), focus ring on `::after`, Add + black box fix (`chrome-active-v2.webp`), standard in `docs/SMARTERDESIGN.md` and `.agent/skills/smarterdesign/SKILL.md`, law test `__tests__/image-header-help-icon.law.test.mjs`, Build Safety Gate step "Image Headers Use The One Painted Help Icon". This session also merged main into it, regenerated the Training inventory, and fixed the e2e fixture `e2e/fixtures/verifyBankrollHeader.ts`, which counted the "?" as a third artwork image (52 failures). |
| #3187 | 6:22 PM | `210479e2` | Training's #3178 brushed-chrome layer boxed the "?" in a chrome square touching the frame on ICM/Hand Lab/Equity. The chrome button rules in `src/styles/worlds/training.css` now exclude `.sd-header-help`. Training mastheads set `--sd-help-border: 2px; --sd-help-rim: 2px` (section "3a"). The law test checks every `.sp-training-page-stage :where(button, …)` skin. SMARTERDESIGN.md lists the per-frame numbers. |
| #3191 | 8:03 PM | `d0fbb200` | The store's VIP tab (`src/components/diamond-store/DiamondStoreShell.module.css`, which has `outline: 2px solid var(--store-focus) !important` and `border-radius: 0 !important`) drew a square cyan outline over the "?" on focus. Root fix: `@layer sd-header-help { … !important }` in `styles/smarterdesign.css`. Layered important declarations beat every unlayered page rule regardless of specificity, and Tailwind 3 passes the custom layer through. Also added the CI step "Verify Bankroll and Toke #SmarterDesign headers" (e2e/029) to `.github/workflows/global-footer-e2e.yml`. |
| #3195 | 8:13 PM | `721d63c0` | The four Video Library qualification steps, Reserve port, Start production server and Wait for server got `if: ${{ !cancelled() && steps.production_build.outcome == 'success' }}`, so one failing check no longer skips every server gate. |
| #3208 | 8:54 PM | `861f38a2` | Real product bug. `pages/_document.js`'s PWA STALE CACHE BUSTER deleted every cache and hard-reloaded whenever any `_next/static/chunks` script failed. Offline, a route prefetch failed, the page reloaded into Chrome's ERR_INTERNET_DISCONNECTED dino page, and the PWA's offline cache was wiped. Now: offline does nothing; online, it probes the chunk with `HEAD` and only a 404/410 busts and reloads. Law test `__tests__/a-dropped-connection-is-not-a-stale-build.law.test.mjs` runs the real script in a VM and is registered in `__tests__/_test-guards-exist.test.mjs`. Found by e2e/029's "Standalone CSV/JSON/PDF export explains offline access" cases. |
| #3229 | 10:08 PM | `2ef93287` | New `e2e/032-image-header-help.spec.ts`, which checks the "?" on every image header outside Bankroll/Toke: `/hub/poker-tools`, `/hub/memory-games` and its stats/leaderboard/achievements/tutorial, `/hub/training/icm-calculator`, `/hub/training/hand-lab`, `/hub/training/equity-calculator`, `/hub/vip-membership/compare`, `/hub/vip-membership/manage` and `/hub/diamond-store?tab=vip`. It runs in CI as "Verify every other image header \"?\"" after 029. Five more gates got the `production_server_ready` guard: Marketplace Page 1, footer routes, premium World menu, Phase 3 World menu and the mobile budget. The Training inventory was regenerated (+1 test). |

The original handoff PR was #3168. Its earlier commits came from a previous chat (`566caef`, `0072076`, `cd47cb9`, `cefb57e`, `98c99d4`).

### 2.2 Verification already done (evidence)
- **Live sweep (#3191, ~8:30 PM).** 38 routes × 393px and 1280px = 76 checks, all pass.
  - Routes: Bankroll dashboard, `?view=` trips, series, players, receipts, staking, toke-tracker, tax, staking-profile, tournament-calendar, reports, settings, rules, goals; `?type=` cash, tournament, casino, slots, sports, expense; `/hub/bankroll-manager/export`; Toke `/hub/toke-tracker`, shift, analytics, vault, venues; `/hub/poker-tools`; Memory Games ×5; Training ICM, Hand Lab, Equity; VIP compare and manage; `/hub/diamond-store?tab=vip`.
  - On each: the icon src is `/images/smarterdesign/header-help.webp` and it loaded. The offset from the header's top-right is 6.1/6.5px, or 4.6/5px on Training. No text "?". No back link inside the header; it sits above it on Bankroll/Toke/Export. No shadow and a 50% radius at rest. On focus, no outline and the thin ring. No 4xx assets.
- **e2e/032.** 72/72 against smarter.poker across 3 repeats. With the `@layer` removed locally, the store case fails (radius `0px`).
- **CI on #3229 (footer job 140856917240).** 029 success, 032 success, all Video Library steps success, footer routes success.
- **e2e/029.** 88/88 locally earlier. In CI it passes on the production build (PR #3208's job, step "Verify Bankroll and Toke").
- **Export offline cases.** 12/12 against smarter.poker after #3208. Before the fix, 4 of 6 failed.

### 2.3 Images (where to find them)
All are in the bookmark branch under `docs/handoff/footer-contract-green-2026-11-27/images/`. They were also sent in chat.
- `live-headers-393.png`: live phone-width contact sheet of 8 headers after #3187 (commit `210479e`).
- `live-handlab-corner.png`: BEFORE #3187. The Training "?" sits inside a chrome square touching the frame.
- `live-handlab-corner2.png`: AFTER #3187. The "?" is tucked into the corner, unboxed.
- `live-tools-corner.png`: Poker Tools corner (reference, correct).
- `store-focus.png`: the store VIP tab "?" on keyboard focus after #3191 (thin round ring only). Before #3191 it showed a square cyan outline.
- `handlab-focus.png`: Hand Lab focus probe.
- Reference art: `public/images/smarterdesign/header-help.webp` (144×147, from `public/images/header-help-v4.png` 598×609). Club Arena's reference is `images/header-help-v4.png` in `Smarter-Software-PIQ/Smarter-Poker-Club-Arena` (`src/components/help/PageHelp.tsx`, `src/components/lobby/ArenaWorkspaceHeader.tsx`). Club Arena needed no change.

### 2.4 Scripts (in the bookmark under `scripts/`; adjust the paths in them)
- `check.mjs`: live check of 8 routes at 393/1280. Run as `node check.mjs <baseURL> <outDir>`. Imports playwright from the repo's node_modules and uses `/usr/bin/google-chrome`.
- `sweep2.mjs`: the 38-route sweep (`WIDTHS=393,1280 node sweep2.mjs https://smarter.poker <outDir>`).
- `crop.mjs`: crops a header's top-right corner at 3× (`node crop.mjs <base> <route> out.png`).
- `probe2.mjs`: lists every CSS rule matching `.sd-header-help` with `border-radius` and screenshots the store focus state (`BASE=… node probe2.mjs`).
- `nav.mjs`: CDP navigation tracer (`Page.frameRequestedNavigation`) used to diagnose the offline reload.
- `BRIEF.md`: the swarm brief, with all repo rules, the machine limits and the CI method. Reuse it.

---

## 3. PHASE 2: make the footer job green (IN PROGRESS, the current assignment)

The job is "Chromium and WebKit footer contract" in `.github/workflows/global-footer-e2e.yml`. It runs on every PR against a production build (`npm run build -- --webpack`, `PWA_ENABLED=1`, placeholder Supabase), then `next start` on a reserved port. It is NOT a required check (the 8 required checks are listed in section 5). Every gate now runs independently after the build.

Baseline (job **140856917240**, PR #3229 head `2f80fbe`):

| Step | Result | Owner at handoff |
|---|---|---|
| 11 Build production application | success | |
| 12 Verify Personal Assistant landing, review and native Sandbox | **FAIL** | B (#3245) |
| 13–17 Video Library (owner tools, pause quizzes, channels, personal, one frame) | success | |
| 18–20 Reserve port / Start server / Wait for server | success | |
| 21 Verify Stable Admin tab and nested navigation (e2e/025) | success | |
| 22 Verify Bankroll and Toke #SmarterDesign headers (e2e/029) | success | |
| 23 Verify every other image header "?" (e2e/032) | success | |
| 24–27 Trivia (performance, evidence, PWA rollback, mounted-account) | success | |
| 28 Verify Diamond Marketplace Page 1 commerce anatomy | **FAIL** | A (#3244) |
| 29 Verify footer routes and geometry | success | |
| 30 Verify premium World menu presentation | **FAIL** | E |
| 31 Verify Phase 3 mobile World menu behavior | **FAIL** | D |
| 32 Mobile performance budget (thirteen World roots) | **FAIL** | C, D, E |

### 3.A Diamond Marketplace Page 1 (#3244)
- **Failure:** `e2e/05-diamond-store.spec.ts` "diamond variable catalog partition stays complete without duplication" expected `background-image` `/diamond-vault-hero/` for an unknown package (Titan). It received `/images/smarterdesign/headers/store-diamonds-scene.webp`.
- **Root cause:** #3201 ("complete #SMARTERDESIGN across the Diamond Store", merge `94cdd303`) deliberately changed `.packageFallback .packageArt` in `src/components/diamond-store/SmarterStoreShowcase.module.css` (line ~320) to the store scene. I confirmed this in #3201's patch.
- **Fix (committed, `27b25ed4`):** the assertion now expects `/\/images\/smarterdesign\/headers\/store-diamonds-scene\.webp/`, with a comment.
- **Proven so far:** both Page 1 cases pass against smarter.poker (`marketplace-audit-chromium` project).
- **TO DO:** read step "Verify Diamond Marketplace Page 1 commerce anatomy" on #3244's footer job. If success and every baseline success is still success, run `gh api -X DELETE repos/Smarter-Poker/Smarter-Poker-World-Hub/issues/3244/labels/do-not-ship`, then let auto-merge run or `gh api -X PUT …/pulls/3244/merge -f merge_method=squash -f sha=<head>`. If mergeable_state stays "unknown", main moved: merge `origin/main` in, then push.

### 3.B Personal Assistant WebKit (#3245, by a swarm agent)
- **Failure:** `e2e/personal-assistant-completion.spec.ts:282` "Log A Hand confirms the save and opens the same Review row after reload using local API fixtures" on project `pa-mobile-webkit390`: "No Runtime Page Errors".
- **Root cause (per the agent's PR):** `router.prefetch()` returns a promise. `src/components/ui/UniversalHeader.js` (profile warm-up) and `src/components/ui/BottomNavBar.jsx` (hover warm-up) wrapped it in a synchronous try/catch, which cannot catch the rejection. WebKit has no `requestIdleCallback`, so the header warm-up fires from `setTimeout(3000)`. The test's reload cancels the `_next/data/.../hub/user/local-study-fixture.json` fetch, and WebKit raises an unhandled rejection: "Fetch API cannot load … due to access control checks".
- **Fix:** `.catch` on every header/footer prefetch promise. Law test added to `__tests__/route-prefetch-waits-for-idle.law.test.mjs`.
- **TO DO:** verify the PR's footer job step 12 is success, and also `.github/workflows/pa-browser-smoke.yml` if it triggered. Then remove the label and merge. Review the diff: it touches the global header and footer, which are LOCKED surfaces (CLAUDE.md 10.4 and rule 15), so make sure nothing visual changed.

### 3.C Mobile budget: Bankroll Manager + Preflop Charts
- **Failure (step 32):** `/hub/bankroll-manager ships 954KB of JS (budget 850KB)` and `/hub/preflop-charts ships 971KB (budget 850KB)`.
- **Spec:** `e2e/mobile-budget.spec.ts`. Read how JS KB is counted (line ~160) and the budget table. NEVER raise a budget.
- **State:** the agent's uncommitted work (lost with the container) was going after `pages/_app.js` (app-shell weight), `src/services/LiveStreamService.js`, and the law test `__tests__/the-app-shell-stays-light.law.test.mjs`. That suggests the agent found global `_app.js` imports inflating every route. `pages/_app.js` affects EVERY page; be careful and prove it across all routes in step 32 and every other gate.
- **New context:** `e7892a3b` "feat(training): #SMARTERDESIGN interiors on every Training page and Preflop Charts sub pag…" merged to main at ~11:15 PM CST and may change Preflop's weight. Re-measure first.
- **Method:**
  - Load the live page in headless Chrome and list JS responses by size.
  - Map the big chunks to modules.
  - Move heavy below-the-fold or interaction-only code (charts, PDF/CSV/scanner, date libs, wholesale icon imports) behind `next/dynamic` or on-demand `import()`, keeping behaviour and first paint identical.
  - Keep e2e/029 green.

### 3.D Poker Near Me: Phase 3 menu contract + PNM budget
- **Failure 1 (step 31):** `e2e/024-world-menu-mobile-phase3.spec.ts:216` "Poker Near Me: Phase 3 mobile menu contract" (chromium and webkit). A `toEqual` deep-equality diff: expected 1 line, received 7. Read the exact diff in job 140856917240's log. Find the PNM menu change that caused it (main is moving fast on PNM; e.g. `6f0b657d` "feat(venues): room counts read live…" #3243). Fix the page if it regressed; update the contract only if the change was deliberate and correct.
- **Failure 2 (step 32):** "/hub/poker-near-me: PNM JavaScript exceeds maintained mobile budget". Reduce first-load JS at the root. Many `__tests__/poker-near-me-*.test.mjs` laws must stay green.

### 3.E Training: LCP, small text, premium menu snapshot
- **Failure 1 (step 32):** `/hub/training LCP 3188ms (budget 2500ms)` and `/hub/training renders 1 text nodes under 12px`.
  - Find the LCP element at mobile size (PerformanceObserver `largest-contentful-paint`) and fix priority/preload/eager loading or blocking work.
  - Bring the tiny text to at least 12px within the #SmarterDesign scale.
  - Likely sources: #3178 (the chrome layer) and `e7892a3b` (Training interiors, merged ~11:15 PM).
- **Failure 2 (step 30):** `e2e/022-world-menu-visual.spec.ts:74` "Training Games premium drawer matches desktop and mobile references". The snapshot `e2e/022-world-menu-visual.spec.ts-snapshots/training-mobile.png` differs.
  - Find which change altered the drawer.
  - If it's a regression, fix the drawer.
  - If it's deliberate and correct, refresh the snapshot from CI's Linux render only, never a local render (fonts differ). The job uploads artifact `global-footer-e2e-results`, but it held only `playwright-report/index.html` when checked. To get `*-actual.png`, extend the upload path in the workflow (`test-results/**/*-actual.png`), fetch it, inspect it, then commit it as the reference.
  - Mind the Training Phase 2 inventory.

### 3.F After all five land
- Run one PR's footer job and confirm EVERY step is success: the job conclusion is `success`.
- Then consider proposing the footer job as a required check (branch rules: `gh api repos/…/rules/branches/main`). Only do it once it is green and stable across several PRs, and note that it takes ~20 minutes.
- Report to Dan with PR numbers, merge SHAs, the footer job id with every step result, and live verification where behaviour changed: the deploy id and the `/api/health` sha.

---

## 4. HOW TO WORK HERE (environment facts that cost hours)

### Setup and committing
- **Clone:** `git clone --depth 1 https://github.com/Smarter-Poker/smarter-poker-world-hub /home/claude/smarter-poker-world-hub`, with a ~10 minute timeout. Shallow; fetch with `--depth`. The session may need `add_repo` (owner `Smarter-Poker`, repo `Smarter-Poker-World-Hub`, access push) and then `register_repo_root`.
- **Read first:** `CLAUDE.md` (it loads as a system reminder after `register_repo_root`), `PUBLISHING.md`, `AGENTS.md`, `docs/agent-policy/REFERENCE-INDEX.md`.
- **Never commit in the plain clone.** The pre-commit hook refuses it. Create an owned worktree with `AGENT_WORKTREE_ROOT=/home/claude/trees bash scripts/agent-workspace.sh claude <slug> --print-path`. That creates branch `agent/claude/<slug>` from origin/main and copies node_modules. Then run `git config core.hooksPath .husky`.
  - Do NOT `ln -s` node_modules into an existing node_modules: a nested symlink loads React twice and breaks every page with "Cannot read properties of null (reading 'useContext')".
- **Dependencies:** `npm ci --ignore-scripts --no-audit --no-fund` in the clone (~3 min) if node_modules is missing.
- **Commit identity:** the author must be `Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>` (CHECK 15; otherwise Vercel blocks the deploy).
- **Commit message attribution:** end with these two lines, using the session line your system reminder gives you:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: <your session URL>
  ```
- **PR body attribution:** end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)` plus your session URL.
- **Before committing:** `git checkout -- next-env.d.ts tsconfig.tsbuildinfo` (next dev and tsc modify them; the hooks refuse the drift). Delete local helper files such as `pw.local.config.ts`; a law ("no local visual harness is routable") fails if one is left.
- **Hooks:** amend is blocked by a hook, so make new commits. `git stash` triggers a hook message about a "hard reset"; the stash still pops fine, but verify with `git status`.
- **Pushing:** `git -c push.negotiate=true push origin HEAD:agent/claude/<slug>`. The pre-push gate runs.

### GitHub and merging
- **REST only:** GraphQL `gh pr …` commands are blocked; use `gh api`.
  - Create a PR: `gh api -X POST repos/Smarter-Poker/Smarter-Poker-World-Hub/pulls -f title=… -f head=… -f base=main -F body=@file`.
  - Merge: `gh api -X PUT …/pulls/<n>/merge -f merge_method=squash -f sha=<head>`.
- **Auto-merge:** a pushed agent branch is auto-proposed and auto-merged (squash) once the 8 required checks pass. Hold unproven work with the `do-not-ship` label (`gh api -X POST …/issues/<n>/labels -f 'labels[]=do-not-ship'`), a `wip:` head-commit subject, or a `bookmark/` / `handoff/` / `wip/` branch prefix. Remove the label when proven.
- **Required checks (8):** No Conflict Markers; No New Undefined Identifiers; Audit-marker registry vs. tree; U4.2: No phantom tables; U4.3: Scheduled jobs actually succeed; TypeScript Check; Pre-Deploy Safety Checks; Top bars own their safe-area inset.
- **If mergeable_state stays "unknown" and no CI starts:** main moved and conflicts. Fetch main with depth, merge, push. The generated `.agent/audits/2026-08-31-training-phase-2-inventory.json` conflicts constantly: `git checkout --theirs` it, then `node scripts/training-surface-inventory.mjs --write` and `--check`. It changes whenever a file in Training's dependency graph changes, including e2e specs that name `/hub/training/*` routes.
- **`docs/business-hub-guide-review.json`:** this stores sha256 hashes of reviewed pages. When a covered page changes, update its hash after reviewing that the guide's claims still hold (`__tests__/business-hub-guide.test.mjs`).
- **New tests under `__tests__`** must be reachable by CI. Add `import './x.test.mjs';` to `__tests__/_test-guards-exist.test.mjs` (the guard "every guard in __tests__ is reachable by CI").
- **Sandbox-only failure:** `__tests__/horse-solver-v31-pipeline.test.mjs` fails because we run as root. ~80 tests in `_test-guards-exist` fail in the sandbox regardless. Compare with and without your change (`comm -23`) rather than against zero.

### Local running and browsers
- **No local production build:** `next build` is OOM-killed on this 8GB box (it needs ~7GB). Production-build proof comes only from the CI footer job.
- **Local dev server:** `NODE_OPTIONS=--max-old-space-size=5120 NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next dev --webpack -p 3000`.
  - It degrades after many route compiles (timeouts, "Target crashed"). Kill it, `rm -rf .next` in YOUR tree, and restart.
  - Dev doesn't prefetch, so prefetch and offline bugs only show on a production build.
  - With parallel agents, serialize dev servers with `flock /tmp/nextdev.lock`.
- **Playwright:** browsers can't be downloaded, so use `/usr/bin/google-chrome` (Chromium only; WebKit proof comes from CI). Use a temporary config that filters projects and sets `launchOptions.executablePath` and `baseURL`; see BRIEF.md.
- **Testing against live:** many specs (029, 032, 05) mock `/api` and `/rest` and abort third-party requests, so they run safely against `PLAYWRIGHT_BASE_URL=https://smarter.poker`. Read-only only.
- **Vercel deployment URLs** return 302 to an SSO wall, so you can't test old deploys by URL.
- **Reading CI logs:**
  - Footer job id for a commit: `gh api "repos/…/commits/<sha>/check-runs?per_page=100" --jq '.check_runs[]|select(.name=="Chromium and WebKit footer contract")|.id'`.
  - Steps: `gh api repos/…/actions/jobs/<id> --jq '.steps[]|"\(.number) \(.conclusion) \(.name)"'`.
  - Logs: `gh api repos/…/actions/jobs/<id>/logs`, then split on `##[group]Run`.
- **Vercel MCP:** `mcp__Vercel__list_deployments` (projectId above, `sha` filter) and `mcp__Vercel__get_deployment`.
- **Publish proof:** the production deploy is READY on the merge sha, and `https://smarter.poker/api/health` `commitSha` equals it, or is a later main that contains it (check with `gh api repos/…/compare/<merge>...<live> --jq .status`, which should be `identical` or `ahead`).

---

## 5. KEY FILES (where everything lives)

**The "?" standard**
- `styles/smarterdesign.css`: `.sd-header-help`, its geometry, the `::after` focus ring, and `@layer sd-header-help`.
- `src/components/smarterdesign/headerHelp.js`: `SD_HEADER_HELP_ICON`.
- `public/images/smarterdesign/header-help.webp`: the icon.
- `src/components/bankroll/BankrollHelp.jsx` and `src/components/vip/VipKit.jsx`: the help triggers.

**Headers and frames**
- `src/components/bankroll/BankrollImageHeader.jsx`: the `back` prop.
- `src/components/vip/VipKit.module.css`: `--sd-help-border: 6px`.
- `src/components/bankroll/toke/DealerReference.module.css`: `--sd-help-border: 0px; --sd-help-rim: -1.5px`.
- `src/styles/worlds/training.css`: the `.sd-header-help` exclusions and section 3a (2px frame numbers).

**Docs**
- `docs/SMARTERDESIGN.md`: "The image-header question mark (standard, Dan 2026-11-27)", including "Frames that are not the steel rim" and "No page skins it".
- `.agent/skills/smarterdesign/SKILL.md`.

**Tests**
- `__tests__/image-header-help-icon.law.test.mjs`
- `__tests__/a-dropped-connection-is-not-a-stale-build.law.test.mjs`
- `e2e/029-bankroll-toke-smarterdesign.spec.ts` and `e2e/fixtures/verifyBankrollHeader.ts`
- `e2e/032-image-header-help.spec.ts`

**CI and app shell**
- `.github/workflows/global-footer-e2e.yml` (the footer job) and `.github/workflows/build-safety-gate.yml`.
- `pages/_document.js`: the PWA stale cache buster.

**The five failing gates**
- `e2e/05-diamond-store.spec.ts`
- `e2e/personal-assistant-completion.spec.ts` and `scripts/qualification/personalAssistantBrowser.mjs`
- `e2e/022-world-menu-visual.spec.ts` (+ `-snapshots/`)
- `e2e/024-world-menu-mobile-phase3.spec.ts`
- `e2e/mobile-budget.spec.ts`

---

## 6. OBSERVED, NOT CHANGED (mention, don't silently expand scope)
- The plain clone `/home/claude/smarter-poker-world-hub` was left on a messy local branch after an aborted merge. It's irrelevant once the container is gone.
- `src/components/diamond-store/DiamondStoreShell.module.css` and the inline styles in `pages/hub/diamond-store.js` still contain store-wide `border-radius: 0 !important` and the square focus outline. These are intentional store styling; the "?" is protected by the layer.
- Training text-only mastheads (TrainingLobbyHeader, TriviaLobby, community-leaderboard, range-builder, session-notes, session-dashboard, reports, category/[categoryId]) have no scene image and no "?". They aren't image headers and were left alone on purpose.
- Club Arena GameConsole bars centre their PageHelp. Those are game console bars, not image headers.
