# HANDOFF: #SmarterDesign image-header "?" standard + Back To Dashboard placement + Add + black box (World Hub PR #3168)

You are picking up a task mid-flight. Read this whole prompt before doing anything. Dan (owner) wants it FINISHED: merged, published, and verified live on smarter.poker, with nothing claimed until it is verified. Do not send him interim "not done yet" reports. Decide things yourself and report what you did.

## 0. Bookmark (exact state at handoff, Fri 2026-11-27 ~14:07 America/Chicago)

- Repo: `Smarter-Poker/Smarter-Poker-World-Hub` (Next.js, the smarter.poker site; Vercel project `hub-vanguard` / `prj_op66GkZyZcygXQKm76iyycfVFAQx`).
- **PR #3168**: https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/3168, base `main`, OPEN, not merged.
- **Branch**: `agent/claude/agent/header-help-standard` (pushed). The local branch `agent/header-help-standard` in the original clone has the same first 3 commits and is NOT the PR branch; ignore it.
- Commits on the PR branch, oldest first (all on top of main `acd1363`):
  1. `566caef` feat(smarterdesign): one painted "?" in every image header, tucked to the rim; Back To Dashboard above the header
  2. `0072076` fix(smarterdesign): the header "?" focus ring stays clear of the frame on every page
  3. `cd47cb9` fix(smarterdesign): the cobalt Add + no longer sits in a black box over header scenes
  4. `cefb57e` docs(business-hub-guide): re-review bankroll-manager.js after the Back To Dashboard move
  5. (latest, pushed just before handoff) test(smarterdesign): resolve the header-help law's root with fileURLToPath. Its SHA is the PR head; check it with `gh api repos/Smarter-Poker/Smarter-Poker-World-Hub/pulls/3168 --jq .head.sha`.
- **CI status at handoff**: commit 4 had ONE failing required check, `Pre-Deploy Safety Checks`. The only failure was `__tests__/a-test-that-reads-nothing-fails.law.test.mjs` → "no file builds a path from import.meta.url without decoding it" because my new law test used `new URL('..', import.meta.url).pathname`. Commit 5 fixes that (uses `fileURLToPath`), and both tests pass locally. CI on commit 5 had NOT been read yet. Still running on commit 4 were `Vercel Build Parity (webpack)` and `Chromium and WebKit footer contract`. Everything else was green or skipped (TypeScript Check, No New Undefined Identifiers, No Conflict Markers, U4.x, and so on).
- Sandbox paths (only valid if you are in the same cloud container, which is unlikely):
  - original clone `/home/claude/smarter-poker-world-hub`, now on detached `origin/main`, with `node_modules` installed and `core.hooksPath=.husky`
  - owned worktree `/home/claude/trees/claude`, on the PR branch, with `node_modules` symlinked to the clone's
  - screenshots in `/home/claude/shots/`.
- Club Arena repo (`Smarter-Software-PIQ/Smarter-Poker-Club-Arena`): NO changes were made or needed. It is the reference: `src/components/help/PageHelp.tsx` already renders the painted `images/header-help-v4.png` in `src/components/lobby/ArenaWorkspaceHeader.tsx` mastheads (members/record/cashier/data/stats). No "Back To Dashboard" exists in Club Arena src.

## 1. Owner directives (verbatim intent; all binding)

1. 2026-11-27 11:45: "MAKE SURE THAT EVERY SINGLE IMAGE DISPLAY HEADER IS USING THIS SAME DYNAMIC QUESTION MARK ICON AS SEEN IN THE FIRST ATTACHED [Club Arena 'KINGS CLUB Cashier' header], AND NEVER ANY OTHER ONE, LIKE IN THE 2ND AND 3RD [Bankroll Manager, Toke Tracker - flat CSS-circle '?']. REPLACE THEM ALL ... ALWAYS BE TUCKED INTO THE UPPER RIGHT CORNER AS CLOSE TO THE EDGES AS POSSIBLE WITHOUT TOUCHING THE FRAMES. ADD THIS TO THE #SMARTERDESIGN AS A STANDARD. 2, THERE SHOULD NEVER BE A 'BACK TO DASHBOARD' BUTTON INSIDE THE IMAGE HEADER, IT SHOULD BE ABOVE IT."
2. 12:01: "CHECK EVERY SINGLE PAGE AND SUBPAGE THAT WAS UPDATED AND INSURE THIS HAS BEEN IMPLEMENTED AND UPGRADED." (Done; see section 4.)
3. 13:41: "FINISH UP ANY AND ALL UNFINISHED WORK, AND THEN GO AHEAD AND FULLY BUILD, FIX AND ENHANCE ALL OF THESE AND MAKE SURE THEY ARE FULLY WIRED IN AND TESTED BEFORE CLAIMING SUCCESS. YOU DECIDE THE BUILD ORDER. LAUNCH A SWARM IF IT WILL HELP." This is the approval to push, merge and publish.
4. Standing preferences:
   - Premium 3D metallic UI only.
   - Show screenshots before publishing (already done; he approved).
   - Merge your own PRs without asking.
   - Never hand Dan a job you can do.
   - Fix at the root, no band-aids.
   - Never claim success before live verification.
   - New preference 2026-11-27: "DO NOT USE THOSE BULKY FRAMES, THATS THE OLD STYLE... USE THE #SMARTERDESIGN STYLE." The painted #ClubArenaConsole console frames are the old style for page sections.

## 2. What was built (every file, and why)

### 2a. The shared "?" control
- `public/images/smarterdesign/header-help.webp` (NEW, 144x147, 8.5KB): a LANCZOS resize of World Hub's full-size master `public/images/header-help-v4.png` (598x609, 304KB). It is the same art as Club Arena's `header-help-v4.png` (118x120).
- `src/components/smarterdesign/headerHelp.js` (NEW): exports `SD_HEADER_HELP_ICON = '/images/smarterdesign/header-help.webp'`. The header comment quotes Dan and explains `data-focus-custom`.
- `styles/smarterdesign.css` (global, imported in `pages/_app.js`), added after `.sd-panel`:
  - `.sd-header-help`: a 44x44 transparent button, absolute, z-index 3. The icon `> img` is 36px with a drop-shadow, and `:active` scales it to 0.94.
  - Geometry: `--sd-help-at: calc(var(--sd-help-rim, 3.5px) - var(--sd-help-border, 5px) + var(--sd-help-gap) - (44px - var(--sd-help-icon)) / 2)` is used for both top and right. `--sd-help-gap: 3px`, `--sd-help-icon: 36px`. The result is -2.5px from the padding edge, so the icon edge lands 6.1px (top) / 6.5px (right) from the header's outer edge, which is about 3px clear of the 3.5px painted chrome.
  - Why 3.5px: `chrome-readout.webp` is 351x95, sliced at 21 and drawn at 8px. Only its first 9 of 21 slice px are opaque, so 9/21*8 = 3.43px. The law test measures this with sharp.
  - Focus ring: `.sd-header-help::after` (inset 4px, `box-shadow: 0 0 0 2px #94deff`, opacity 0). `.sd-header-help.sd-header-help.sd-header-help:focus-visible { box-shadow:none; outline:none }` and `...:focus-visible::after { opacity:1 }`.
    - Why: `src/styles/premium.css:480` puts a global `:focus-visible` box-shadow ring on the 44px target, which spilled over the frame. A global `button:focus { outline:none !important }` kills outlines.
    - On training pages, `src/styles/worlds/training.css:2697` adds a square `!important` outline unless the element has `[data-focus-custom]`, so the control carries `data-focus-custom=""`.
  - `.sd-header-back` (flex row, margin 0 0 8px) and `.sd-header-back > a` (inline-flex, gap 6): the row above the header.
- `src/components/bankroll/BankrollHelp.jsx`: the trigger is now `<button className="sd-header-help" data-focus-custom="" aria-label={`Help For ${title}`} ...><img src={SD_HEADER_HELP_ICON} width=36 height=37/></button>`. The old text "?" is gone.
- `src/components/bankroll/BankrollHelp.module.css`: the `.help` rules were deleted; `.close` is kept.
- `src/components/vip/VipKit.jsx` `VipMasthead`: the help link is now `<a className="sd-header-help" data-focus-custom="" href={helpHref} ...><img .../></a>`, replacing the old `<span>?</span>`.
- `src/components/vip/VipKit.module.css`:
  - the `.help`, `.help span` and media `.help` rules were deleted
  - added `.masthead :global(.sd-header-help) { --sd-help-border: 6px; }`, because the VIP `.frame` has a 6px border with an 8px border-image.
- `src/components/bankroll/toke/DealerReference.module.css`: added `.reference .mast :global(.sd-header-help) { --sd-help-border: 0px; --sd-help-rim: -1.5px; }`. This header has no rim of its own; the steel belongs to its sd-panel (5px border, 3.5px chrome). The result is identical (-2.5px) but now explicit.

### 2b. Back To Dashboard above the header
- `src/components/bankroll/BankrollImageHeader.jsx`: new prop `back={{ href, shallow?, label? }}`. When it is set, the component returns `<div className={className} data-header-stack="">` containing:
  - `<nav className="sd-header-back" aria-label="Back"><Link data-header-back className="sd-button"><ArrowLeft/> {label||'Back To Dashboard'}</Link></nav>`, followed by
  - the header itself.
  The page's spacing `className` moves to the wrapper, so `styles/BankrollManager.module.css` `.mast + .bankroll-main-layout` still works. It imports `next/link` and `lucide-react` ArrowLeft.
- `pages/hub/bankroll-manager.js`:
  - passes `back={isDashboard ? undefined : { href: '/hub/bankroll-manager', shallow: true }}`
  - the old in-header `<Link>Back To Dashboard</Link>` was removed
  - the now-unused `import Link from 'next/link'` was removed.
- `pages/hub/bankroll-manager/export.js`: `<BankrollImageHeader ... back={{ href: '/hub/bankroll-manager' }} />`. The in-header link and the unused Link import were removed.
- `src/components/bankroll/toke/TokeWorkspace.jsx`:
  - `back={{ href: '/hub/bankroll-manager' }}`
  - the headerActions div keeps only the Add + portal target (`BankrollActionTarget`)
  - ArrowLeft was removed from the imports.
- `src/components/bankroll/toke/TokeWorkspace.module.css`: added `.headerActions:empty { display:none; }` and removed `.back` and its font rule.

### 2c. Add + black box (found during the sweep, fixed at the root)
- Cause: `public/images/smarterdesign/chrome-active.webp` (134x66; the rim of every selected/primary sd-button, tab and VIP CTA) had its blue glow painted on opaque navy `#080f1a`, plus a darker vignette at the bottom. Over a header scene it read as a black rectangle around Add +.
- Fix: `public/images/smarterdesign/chrome-active-v2.webp` (NEW, lossless), derived by colour-to-alpha against (8,15,26). Only light added above the navy keeps alpha; anything at or below it becomes transparent. It recomposites onto the original navy with error 0. The original file was left in place.
- Consumers switched to v2:
  - `styles/smarterdesign.css`
  - `src/components/vip/VipManage.module.css`
  - `src/components/vip/VipKit.module.css`
  - `src/components/store/VipMembershipCard.module.css`
  - `src/styles/worlds/trivia-console.css`
  - `__tests__/trivia-console-contract.test.mjs` (asset-exists list).
- `styles/smarterdesign.css` active rule gained `background-clip: padding-box`, so the cobalt fill no longer paints square corners under the rounded rim.
- Regression check: before/after on the Trivia lobby, Toke tabs and store VIP are identical on navy.

### 2d. Standard, docs and tests
- `docs/SMARTERDESIGN.md`:
  - added a bullet in "Image headers": never put a return link inside; use the `back` prop
  - added a new subsection "The image-header question mark (standard, Dan 2026-11-27)" covering asset, control, position arithmetic and clearance
  - the Bankroll paragraph now says "directly above its image header, never inside it".
- `.agent/skills/smarterdesign/SKILL.md`: items 8 and 9 were updated the same way.
- `__tests__/image-header-help-icon.law.test.mjs` (NEW, `node:test`). Its four tests cover:
  - the asset and the constant
  - BankrollHelp and VipKit render the painted icon with `data-focus-custom`, and no image header in `src/` or `pages/` has a text "?" control
  - the CSS geometry: the formula, the 3.5px measured from the slice with sharp, the ::after focus ring, the VIP 6px override, and the retired `.help` rules staying deleted
  - no "Back To Dashboard" inside any `<BankrollImageHeader>` or sd-masthead/VIP `<header>`, and `back={` is used in the three pages.
  It fails on main and passes on the branch.
- `.github/workflows/build-safety-gate.yml`: new step "Image Headers Use The One Painted Help Icon", inserted before "An API Error Names Its Route".
- `e2e/029-bankroll-toke-smarterdesign.spec.ts`: the Player Notes test now asserts there is no back link inside the header and clicks `[data-header-back]`. The category cases assert `[data-header-stack] > .sd-header-back + header.sd-masthead` and that the back link is visible. The other `workspace.getByRole('link',{name:'Back To Dashboard'})` uses still work because `workspace` is the whole `.smarterdesign` root. Playwright e2e was NOT run (it needs the Supabase env); the hosted CI runs it.
- `docs/business-hub-guide-review.json`: the `pages/hub/bankroll-manager.js` hash was updated after review. The guide's Bankroll claims are unaffected. This is required by `__tests__/business-hub-guide.test.mjs`.

## 3. What remains (do in this order)

1. **Read CI on the PR head** (commit 5):
   ```
   gh api "repos/Smarter-Poker/Smarter-Poker-World-Hub/commits/<head>/check-runs?per_page=100" --jq '.check_runs[] | "\(.status) \(.conclusion) \(.name)"'
   ```
   For a failure: get the job id, read `gh api repos/.../actions/jobs/<id>/logs`, grep for `✖` / `##[error]`, fix the actual cause in an owned worktree, commit and push.
   - Watch `Vercel Build Parity (webpack)` and `Chromium and WebKit footer contract`, plus any e2e job that runs spec 029.
   - GraphQL `gh pr` commands are blocked in this environment; use REST (`gh api`). For merge/auto-merge, use the CCR routes: `PUT /repos/{owner}/{repo}/pulls/3168/ccr/auto_merge`, or `gh api -X PUT repos/Smarter-Poker/Smarter-Poker-World-Hub/pulls/3168/merge -f merge_method=squash`.
   - A check run named "Queue this PR for protected squash merge" already succeeded, so a merge queue/auto-merge path may handle it.
2. **Protected squash merge** of #3168 once the required checks are green (per `PUBLISHING.md`). Dan pre-approved merges.
3. **Verify the publish.**
   - Vercel `hub-vanguard` production deployment must be READY on the merge commit. The Vercel MCP is available (`mcp__Vercel__list_deployments` / `get_deployment`, team/project known).
   - `https://smarter.poker/api/health` must report that commit (or a later main containing it).
4. **Live behavior check** at 393px and desktop, on these pages:
   - `/hub/bankroll-manager?view=trips`
   - `/hub/toke-tracker/shift`
   - `/hub/bankroll-manager/export`
   - `/hub/poker-tools`
   - `/hub/vip-membership/compare`
   - `/hub/training/hand-lab`

   On each: the img src is `/images/smarterdesign/header-help.webp`, the icon is about 6px from the top-right of the header, Back To Dashboard is above the header, there is no black box behind Add +, and keyboard focus shows the thin ring hugging the icon. Use the built-in browser or Chrome tools, or headless Playwright with `/usr/bin/google-chrome`.
5. **Report to Dan.** List: PR, merged SHA, deployment id, health SHA, live screenshots, the list of pages verified, and what changed.

## 4. Verification already done (local dev, before merge)

- All 40 image headers that host the "?" were rendered at 393px, and 6 of them also at 1280px. Every one had the shared icon loaded, top 6.1 / right 6.5px (Dealer Reference 1.1 / 1.5px inside its panel, which is correct for its geometry), 36px wide, no text "?", help opening (dialog) or linking (VIP → `#vip-faq`, target exists), no back link inside, the back link directly above on every subpage, and no missing assets.
- Pages covered:
  - **Bankroll:** dashboard; `?view=` trips, series, players, receipts, staking, toke-tracker, tax, staking-profile, tournament-calendar, reports, settings, rules, goals; `?type=` cash, tournament, casino, slots, sports, expense; `/export`; Jarvis Insights.
  - **Toke:** `/hub/toke-tracker`, plus shift, analytics, vault and venues; Dealer Reference.
  - **Tools:** `/hub/poker-tools`; `/hub/memory-games` with stats, leaderboard, achievements and tutorial; `/hub/training/icm-calculator`, hand-lab and equity-calculator.
  - **VIP:** `/hub/vip-membership/compare` and manage; `/hub/diamond-store?tab=vip`.
- Local tests green:
  - the new law test
  - trivia-console-contract
  - module-parse-and-bindings
  - first-paint-never-waits-for-javascript
  - trivia-smarterdesign-lobby-laws
  - business-hub-guide
  - a-test-that-reads-nothing-fails
  - the pre-push gate (all CHECKs, tsc 0 new errors, check-ui-text, check-title-case).
- Text-only sd-mastheads with no scene image and no "?" were left alone on purpose, because they are not image headers: TrainingLobbyHeader, TriviaLobby, training community-leaderboard, range-builder, session-notes, session-dashboard, reports and category/[categoryId].

## 5. Environment gotchas (save yourself hours)

- **Never commit in the shared clone.** The pre-commit hook refuses it. Create an owned worktree:
  ```
  AGENT_WORKTREE_ROOT=<dir> bash scripts/agent-workspace.sh claude <slug> --print-path
  ```
  This creates branch `agent/claude/<slug>` from origin/main. Then `git reset --hard <your branch>`, symlink `node_modules`, commit and push there.
- Hooks only run with `git config core.hooksPath .husky`. `npm ci --ignore-scripts` skips husky install.
- `next dev` and tsc modify `next-env.d.ts` and `tsconfig.tsbuildinfo`. Run `git checkout` on both before committing or pushing; the pre-push gate refuses tracked changes and the trivia contract test flags dev drift.
- Commit author must be `Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>` (CHECK 15). End commit messages with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013U37bWkKfgS9Qg7BjVPuDk
  ```
- The local dev server (`node node_modules/next/dist/bin/next dev --webpack -p 3000`, `NODE_OPTIONS=--max-old-space-size=5120`) dies after many route compiles on an 8GB box. After a crash, `rm -rf .next` before restarting or it hangs.
- No Supabase env is used locally (never hardcode keys; never read .env). Pages render as guest.
- Playwright browsers cannot be downloaded (cdn blocked); use `executablePath: '/usr/bin/google-chrome'`.
- Tests: `node --test __tests__/<file>`. Any test path from `import.meta.url` must use `fileURLToPath`, never `.pathname`.
- The sweep script logic (re-create it if needed): for each route, find `header.sd-masthead, header[data-vip-masthead]`, measure `.sd-header-help img` against the header rect, count text "?" buttons, check `Back To Dashboard` in non-dialog anchors inside the header, check that `previousElementSibling` is `.sd-header-back`, click the help and expect `dialog[open]`, and record 4xx image/css responses.

## 6. Pre-existing items observed (not caused by this work; mention, do not silently expand scope)

- VIP Compare/Manage help links to `/hub/vip-membership#vip-faq`. The target exists.
- Club Arena GameConsole headers centre the PageHelp vertically. These are game console bars, not image headers, so they were not changed.

## 7. Where every image is saved

All screenshots, Dan's three original attachments, and the measured sweep data are committed on branch
`agent/claude-evidence/evidence/header-help-2026-11-27` of `Smarter-Poker/Smarter-Poker-World-Hub`, under
`.agent/evidence/2026-11-27-image-header-help/` (see its README.md for the folder index). Fetch with:
`git fetch --depth=1 origin agent/claude-evidence/evidence/header-help-2026-11-27 && git checkout FETCH_HEAD -- .agent/evidence/2026-11-27-image-header-help`.
This evidence branch is NOT meant to merge into main; it is an archive. The same HANDOFF.md lives there.
