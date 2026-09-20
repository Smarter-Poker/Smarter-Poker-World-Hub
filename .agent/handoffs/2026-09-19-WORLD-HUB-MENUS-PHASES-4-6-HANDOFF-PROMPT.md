# WORLD HUB MENUS AND FOOTERS, PHASES 4 THROUGH 6

## MILITARY-GRADE EXECUTION HANDOFF PROMPT

Paste this entire document as the first message in a new Codex chat.

Do not summarize it before acting.

Do not ask the owner to repeat context that is already here.

You are the receiving implementation and release agent for the Smarter.Poker World Hub navigation modernization program.

You must recover the current repository state, verify all prior work against current `main`, finish the remaining phases one phase at a time, and own each authorized delivery through protected merge, Vercel publication, and live behavior proof.

This document is an execution prompt. Treat every imperative as an instruction unless a later owner message or a current repository policy supersedes it.

---

# Part 0: Who You Are And What You Are Picking Up

You are continuing the Smarter.Poker World Hub hamburger menu and contextual footer modernization program on the owner's Mac.

The prior work ran from August 29 through September 13, 2026, with a current-state reconciliation on September 19, 2026.

The owner originally described 14 World Hub worlds.

The current production registry has 13 active worlds because Diamond Arena was deliberately retired from World Hub navigation by PR #1701 and replaced by the shared Poker Arena entry.

Do not confuse the historical 14-world contract with the current 13-world production registry.

Do not silently restore Diamond Arena.

The six-release program is at this position:

1. Phase 1 of 6, navigation correctness and resilience: shipped, published, and historically verified.
2. Phase 2 of 6, premium visual individualization and responsive composition: shipped, published, deep-audited, corrected, and historically verified.
3. Phase 3 of 6, dedicated mobile optimization for every non-Social active world while preserving Social Media: shipped, published, corrected, and historically verified.
4. Phase 4 of 6, permissions, live state, failure-state resilience, and exhaustive route-family wiring: not implemented as a unified release.
5. Phase 5 of 6, personalization, discovery, command intelligence, and cross-world continuity: not implemented as a unified release.
6. Phase 6 of 6, observability, governance, rollback, documentation, and final production acceptance: not implemented as a unified release.

The blunt failure you must not repeat is this: prior agents occasionally trusted historical counts, stale routes, or a green merge signal instead of proving the current registry and live behavior.

Your first duty is to re-derive reality from current `main` and production.

Verified baseline at 2026-09-19 08:44 America/Chicago:

- GitHub `origin/main`: `cd317cb306f6e3d972922362e3b66c7b530e2b86`.
- Vercel project: `hub-vanguard`.
- Vercel project ID: `prj_op66GkZyZcygXQKm76iyycfVFAQx`.
- Vercel deployment: `dpl_HkLfZmMMx6cudcptk5tkdkCL2tzB`.
- Vercel status: READY.
- Production health version: `cd317cb306f6e3d972922362e3b66c7b530e2b86`.
- Current active World Hub registry: 13 worlds.
- Current primary command inventory: 78 commands, six per active world.
- Signed-out visual/E2E exclusion: My Clubs, for the documented redirect and staff-only route reason.
- No Phase 4 implementation branch was found or certified by this handoff author.
- No Phase 5 implementation branch was found or certified by this handoff author.
- No Phase 6 implementation branch was found or certified by this handoff author.

Recheck all of those facts before editing.

---

# Part 1: Stop Conditions, Read Before Any Work

## 1.1 Owner Instructions That Must Survive Verbatim

> MAKE SURE THAT HAS NOTHING TO DO WITH THE HAMBURGER MENU ICON. DO NOT REGRESS OR CHANGE THE HAMBURGER MENU ICON'S TO A GEAR SETTING EVER AGAIN, DO NOT TOUCH ANY ICON'S PERIOD!

> AS A NOTE, THE SOCIAL MEDIA HAMBURGER MENU'S SHOULD KEEP THE SAME "FACEBOOK STYLE COLOR SCHEMA". ALL OTHER PAGES SHOULD BE ACCORDING TO SCOPE.

> ALL BUTTONS AND ICON'S NEED TO BE VISIBLY SHOWN ON EVER FOOTER IN FULL, SCALE DOWN TO FIT, THEY SHOULD NEVER BE OFF PAGE OR "SLIDE LEFT OR RIGHT" TO SEE.

> THE FOOTER DOES NOT BELONG ON THE CLUB ARENA LOBBY PAGE.

> THE HUB PAGE SHOULD NOT HAVE A FOOTER.

> YOU NEED TO INSURE THAT YOU'VE REMOVED THE BACKGROUND OF ALL FOOTERS, AND ARE ONLY SHOWING FRAME TO FRAME, AND INSURING THE FOOTER IS TRULY ON THE BOTTOM OF EVERY PAGE AND LOCKED TO THE FOTTER.

> Please pick up where you left off, complete the task in full and do not claim success until you have verified that everything is 100% accomplished for this task.

## 1.2 Meaning Of The Banned Mark

The owner used the phrase "M bars" during the program.

The repository's maintained interpretation is that this means em dashes, Unicode U+2014.

It does not mean the three bars of the approved hamburger icon.

Never remove, redesign, or replace the approved hamburger trigger because of the "M bars" rule.

Run this against every changed user-facing file:

```bash
rg -n --pcre2 '\x{2014}' <changed-files>
```

Healthy result: no output.

Do not use naive replacement across URLs, generated assets, lockfiles, or unrelated content.

## 1.3 Icon And Artwork Freeze

Do not change any hamburger icon.

Do not replace a hamburger with a gear, command grid, dots, logo, or text-only trigger.

Do not redraw, recolor, regenerate, crop, or substitute footer artwork.

Do not alter icon art merely to satisfy layout.

Scale layout around the approved art.

Any product request that truly requires new art must come from a later explicit owner instruction.

## 1.4 Social Media Freeze

Keep Social Media's Facebook-style visual schema.

The current semantic menu scheme is `facebook`.

The current palette uses Facebook blue `#1877F2`, white and light neutral surfaces, and green secondary color `#42B72A`.

Do not apply the dark casino-metal palette to Social Media.

Phase 3 explicitly excluded Social Media from broad mobile redesign and treated it as regression-only.

Future phases may improve wiring, permissions, data truth, accessibility, and resilience without replacing the Facebook-style visual language.

## 1.5 Footer Laws

The root World Hub page `/hub` has no World footer.

The Poker Arena lobby `/hub/club-arena` has no World footer.

World footers must remain locked to the viewport bottom where the existing contract requires it.

Every footer item must remain fully visible at once.

No horizontal carousel is allowed for the six-item World footer.

No swipe-left or swipe-right requirement is allowed.

The image must display frame-to-frame.

Do not render the source image's outer black canvas or padding as part of the visible footer.

Preserve aspect ratio.

Do not stretch icons or labels.

Do not let a fixed footer cover page controls or content.

## 1.6 Current Retirements And Gates

Diamond Arena is retired from the active World Hub registry.

PR #1701, merged as `606a789e16944b8a7bdc63789a46072a01bd4dc2`, made Poker Arena the shared entrance.

Do not restore Diamond Arena because the owner historically said "14 worlds."

If the owner explicitly asks to restore Diamond Arena after being told it is retired, treat restoration as a separate product and route migration with its own approval, inventory, tests, and release.

My Clubs is excluded from signed-out drawer visual tests because `/hub/my-clubs` redirects into Social Media and `/hub/my-venues` is staff-only.

Do not hide that exclusion.

Do not mark My Clubs covered by a signed-out test that never reaches its world.

## 1.7 What You Must Not Do

- Do not edit in the shared canonical clone.
- Do not reuse another agent's worktree.
- Do not reset, clean, or delete another task's files.
- Do not create a new GitHub repository, Vercel project, Supabase project, server, or OAuth client.
- Do not relink the repository to a duplicate Vercel project.
- Do not use a shared `node_modules` symlink.
- Do not bypass hooks, required checks, branch protection, or protected merge.
- Do not force-push `main`.
- Do not read, print, source, copy, or document credential values from `.env` files.
- Do not install or restore the retired external error telemetry provider.
- Do not create a watcher, cron task, scheduled repair agent, or release retry loop.
- Do not use old shared-clone publication scripts, deploy hooks, or local prebuilt Vercel deployments.
- Do not claim pushed means merged.
- Do not claim merged means published.
- Do not claim a healthy endpoint proves the affected behavior.
- Do not claim all 14 worlds pass when current production has 13 active worlds.
- Do not claim 84 commands pass when the current registry has 78.
- Do not silently skip gated, authenticated, or staff-only routes.
- Do not accept `No tests found` as a passing suite.
- Do not edit icons or artwork.

---

# Part 2: Environment Bootstrap, Run These First

## 2.1 Read Current Policy Before Any Repository Action

Run:

```bash
node /Users/smarter.poker/Documents/agent-policy.mjs read
```

Read the complete output.

Then read:

```bash
sed -n '1,260p' /Users/smarter.poker/Documents/AGENTS.md
sed -n '1,320p' /Users/smarter.poker/Documents/AGENT-OPERATING-LAW.md
sed -n '1,360p' /Users/smarter.poker/Documents/AGENT-HARDENING-STANDARD.md
sed -n '1,320p' /Users/smarter.poker/Documents/AGENT-REFERENCE-INDEX.md
```

Continue until EOF if any file exceeds the shown range.

At handoff creation, the verified policy receipt was:

```text
policyVersion: 2.9
manifestSHA256: 7663cc909626f7e9966931d27166ad8774addc801f7ad1898a2d7564bc13c378
OWNER-POLICY.md: 76228d75677eb76ca9dcfbf65fd68ddb7aac3941f61154acc456ae8230a9a4fa
OPERATING-LAW.md: a8bc3c04dce3354ebdd51a89c0b7d715af3344edcc794d33f6b3ad64506961d5
HARDENING.md: d5fc451ce5caf6d6b5e64597a13883e1246581678fe53c962339d0a66136993e
REFERENCE-INDEX.md: adce89c3f838f2f373cd504a00329d53906404d1dd42a647f672af6c16f95555
agent-policy.mjs: d5e6189878846064ac60269a41dfc4e6d9a7bda54610110ddc5813230198f36e
agent-policy.test.mjs: 6fa4010b3e02e35fca064cb6fb945861a69869a25fad32e4e773951431fc05ef
```

If current output differs, current policy wins.

Record the new receipt in the task's one checkpoint.

## 2.2 Canonical Repository And Safe Worktree

Canonical clone:

```text
/Users/smarter.poker/Documents/Smarter-Poker-World-Hub
```

Treat that clone as read-only coordination state.

Fetch current `main` there:

```bash
git -C /Users/smarter.poker/Documents/Smarter-Poker-World-Hub fetch origin main --prune
git -C /Users/smarter.poker/Documents/Smarter-Poker-World-Hub rev-parse origin/main
```

Required owned worktree root:

```text
/Volumes/SmarterWork/agent-work
```

Evidence archive root:

```text
/Volumes/SmarterArchives/agent-evidence
```

Check capacity first:

```bash
df -h /Volumes/SmarterWork /Volumes/SmarterArchives
```

At 2026-09-19 08:38 America/Chicago, `/Volumes/SmarterWork` was full with only about 115 MiB free.

The handoff author used a sparse documentation-only worktree at:

```text
/Volumes/SmarterWork/agent-work/world-menu-handoff-20260919
```

That worktree is not suitable for Phase 4 application development.

Before starting Phase 4, safely recover SSD space by identifying only stale worktrees that are positively owned and have no unique unpublished work.

Do not delete a worktree merely because it looks old.

If SSD space is still unavailable, stop before creating a development worktree outside the required root and report the exact capacity blocker.

Create a fresh Phase 4 branch from current `origin/main` after space exists:

```bash
repo=/Users/smarter.poker/Documents/Smarter-Poker-World-Hub
phase4_wt=/Volumes/SmarterWork/agent-work/world-menu-phase4-$(date +%Y%m%d-%H%M%S)
git -C "$repo" fetch origin main --prune
git -C "$repo" worktree add -b "agent/codex/world-menu-phase4-$(date +%Y%m%d-%H%M%S)" "$phase4_wt" origin/main
cd "$phase4_wt"
```

Do not copy the handoff branch into a development branch.

Cut the development branch directly from then-current `origin/main`.

## 2.3 Repository Instructions

Inside the owned worktree, read completely:

```bash
cat AGENTS.md
cat CLAUDE.md
cat AGENT-PLAYBOOK.md
cat PUBLISHING.md
node docs/agent-policy/agent-policy.mjs check --canonical /Users/smarter.poker/Documents
```

Search for deeper instructions before editing:

```bash
find . -name AGENTS.md -o -name CLAUDE.md -o -name PUBLISHING.md
```

Read any instruction file that governs a changed path.

## 2.4 Tool And Shell Facts

Shell: zsh on macOS.

Use `rg` for text and file search.

Use `apply_patch` for manual file edits.

Do not use shell redirection, `cat >`, Python, or generated scripts as a substitute for a small deliberate edit.

Use `mktemp -d` for temporary directories.

Do not repurpose `HOME`, `home`, or `CODEX_HOME` as task variables.

Long-running commands must run in an interactive command session and be polled.

Do not use `nohup`, `disown`, a watcher, a cron job, or an unattended release loop.

If a command exceeds the interactive yield window, preserve its session identifier and poll that same session.

Node and npm are installed.

Vercel CLI was present at `/opt/homebrew/bin/vercel` during handoff creation.

GitHub CLI was authenticated during handoff creation.

Never assume either remains authenticated. Test access without printing secrets.

## 2.5 Dependencies

Install dependencies inside the owned worktree.

Do not symlink another worktree's `node_modules`.

Use the repository's maintained dependency setup and current policy.

Start with:

```bash
npm ci
```

Historical trap: Puppeteer's headless-shell download cache was once corrupt.

If the same exact download failure returns, inspect the current repository setup and use the smallest supported correction.

Do not paper over a general install failure with a shared dependency symlink.

## 2.6 Credentials

Credentials are managed by configured system, GitHub, Vercel, Supabase, and repository-owned clients.

Environment files may contain credential names and wiring.

You may inspect filenames and variable names when necessary.

Never print or copy their values.

Do not paste secret values into commands, documentation, screenshots, tests, or chat.

Use the configured authenticated clients for live verification.

## 2.7 Historical Worktrees, Evidence Only

Historical Phase 2 audit worktree:

```text
/Users/smarter.poker/Documents/.agent-trees/Smarter-Poker-World-Hub/codex-p2audit
```

Historical Phase 3 audit worktree:

```text
/Users/smarter.poker/Documents/.agent-trees/Smarter-Poker-World-Hub/codex-phase3
```

Do not develop in them.

Use current `origin/main` copies of the audit files whenever available.

## 2.8 Original User Inputs And Assets

Master modernization directive:

```text
/Users/smarter.poker/.codex/attachments/1b12cfa6-3d2a-4ecb-9bab-cfd035c2720a/pasted-text.txt
```

Earlier exact-artwork footer directive:

```text
/Users/smarter.poker/.codex/attachments/af0ef023-bd4b-44ab-b14c-7dc3843a8f4e/pasted-text.txt
```

Original task text:

```text
/Users/smarter.poker/.codex/attachments/921719fd-97ba-4714-860e-bc3bca903582/pasted-text.txt
```

Footer source artwork:

```text
/Users/smarter.poker/Downloads/CLUB ARENA FOOTER.png
/Users/smarter.poker/Downloads/FOOTER PERSONAL ASSISTANT.png
/Users/smarter.poker/Downloads/FOOTER TRAINING GAMES.png
/Users/smarter.poker/Downloads/FOOTER POKER NEWS.png
/Users/smarter.poker/Downloads/FOOTER POKER TRIVIA.png
/Users/smarter.poker/Downloads/FOOTER SOCIAL MEDIA.png
/Users/smarter.poker/Downloads/FOOTER DIAMOND ARENA.png
/Users/smarter.poker/Downloads/FOOTER MY CLUBS.png
/Users/smarter.poker/Downloads/FOOTER VIDEO LIBRARY.png
/Users/smarter.poker/Downloads/FOOTER ODDS CALCULAOR.png
/Users/smarter.poker/Downloads/FOOTER BANKROLL MANAGER.png
/Users/smarter.poker/Downloads/FOOTER TOKE TRACKER.png
/Users/smarter.poker/Downloads/FOOTER PREFLOP CHARTS.png
/Users/smarter.poker/Downloads/FOOTER POKER NEAR ME.png
/Users/smarter.poker/Downloads/FOOTER MARKETPLACE.png
```

The misspelling `CALCULAOR` is the actual source filename.

Do not rename or regenerate original assets casually.

---

# Part 3: How The System Actually Works

## 3.1 Menu Identity And Registry Flow

The canonical World identity begins in:

```text
src/config/world-footer-navigation.json
```

That registry owns:

- active World IDs
- World labels
- accent colors
- route prefixes
- the six primary commands
- command labels
- command destinations
- footer artwork associations

The command menu converts that registry into menu definitions in:

```text
src/config/worldMenuNavigation.js
```

That file owns:

- menu key by World
- World purpose text
- premium palette by World
- Social Media Facebook scheme
- route resolution
- longest matching prefix behavior
- capability vocabulary
- primary command mapping

The broader drawer configuration and secondary controls live in:

```text
src/config/hamburgerMenus.js
```

The rendering path is:

```text
route
  -> UniversalHeader
  -> approved hamburger trigger
  -> HamburgerMenu
  -> resolveWorldMenu(path)
  -> get menu config
  -> primary commands from world-footer-navigation.json
  -> secondary actions and toggles from hamburgerMenus.js
  -> router, hard navigation, action handler, or toggle handler
```

Primary renderer files:

```text
src/components/ui/UniversalHeader.js
src/components/ui/HamburgerMenu.jsx
src/components/ui/WorldCommandMenuBoundary.jsx
```

Fallback/mobile trigger ownership:

```text
src/components/ui/WorldCommandDock.jsx
```

Page shell:

```text
src/components/ui/HubPageShell.jsx
```

Geeves and bug-report portalled surfaces:

```text
src/components/ui/GeevesMenuWidget.jsx
src/components/ui/ReportBugWidget.jsx
```

Navigation state logic:

```text
src/lib/world-menu/navigationState.mjs
```

## 3.2 Ownership Law

Only one visible, interactive drawer owner may exist for a route and viewport.

The Universal Header owns the primary trigger when present.

The World Command Dock may own a fallback trigger only when the header cannot.

Hidden duplicate drawers are still bugs if their controls remain focusable or their handlers remain active.

Reels, fullscreen layers, authenticated shells, and redirects previously exposed ownership races.

Verify one trigger, one drawer, one Escape owner, and one focus return target.

## 3.3 Command Execution Law

A command may be:

- internal client navigation
- internal hard navigation
- action callback
- state toggle
- authenticated destination
- permission-gated destination
- external destination only when explicitly designed

Every command needs a stable identity independent of display copy.

Do not deduplicate commands by label text.

Do not leave a visible command whose handler is absent.

Do not treat a redirect to login as destination success unless redirect return integrity is verified.

Do not treat a redirect into another World as current-World success.

## 3.4 Footer Flow

The same World registry supplies footer identity and six commands.

This prevents the drawer and footer from disagreeing about route ownership.

Footer rendering must honor:

- fixed bottom placement where contracted
- safe-area inset
- full six-item visibility
- no horizontal scrolling
- exact artwork aspect ratio
- cropped outer source canvas
- content bottom clearance
- no footer on `/hub`
- no footer on `/hub/club-arena`

## 3.5 Release Flow

Use this flow only:

```text
owned worktree
  -> exact-candidate local checks
  -> commit with configured identity
  -> push owned branch
  -> existing or new GitHub PR
  -> required checks on exact PR head
  -> protected squash merge
  -> Vercel Git integration
  -> hub-vanguard production deployment READY
  -> /api/health exact or descendant revision proof
  -> affected live behavior proof
```

Do not use a local deployment.

Do not use a deploy hook.

Do not use a duplicate Vercel project.

## 3.6 Healthy Scale

Current active scale, verified from `origin/main` on 2026-09-19:

- 13 active World definitions.
- 78 primary commands.
- Six primary commands per active World.
- 12 non-Social mobile performance budget routes.
- One documented signed-out World exclusion, My Clubs.
- Social Media remains in visual and ownership regression coverage but outside the 12-route non-Social budget set.

Historical scale before Diamond Arena retirement:

- 14 worlds.
- 84 primary commands.

Never mix those baselines in one acceptance statement.

---

# Part 4: Complete State Inventory

## 4.1 Current Active Worlds And Commands

Verified from `src/config/world-footer-navigation.json` on `origin/main` at 2026-09-19 08:45 America/Chicago.

### Personal Assistant

- Prefix: `/hub/personal-assistant`
- Coach -> `/hub/personal-assistant`
- Sandbox -> `/hub/personal-assistant/sandbox`
- Leaks -> `/hub/personal-assistant/leaks`
- Train -> `/hub/training`
- Charts -> `/hub/preflop-charts`
- Odds -> `/hub/poker-tools`
- Scheme: `intelligence`

### Training Games

- Prefixes: `/hub/training`, `/hub/gto-trainer`, `/hub/poker-brain`, `/pokerbrain`
- Library -> `/hub/training`
- Play -> `/hub/training/play-mode`
- Daily -> `/hub/training/daily-challenge`
- Progress -> `/hub/training/progress`
- Goals -> `/hub/training/challenges`
- Ranks -> `/hub/training/leaderboard`
- Scheme: `training-pulse`

### Poker News

- Prefixes: `/hub/news`, `/hub/article`
- Latest -> `/hub/news`
- Videos -> `/hub/news?tab=videos`
- Reels -> `/hub/news?tab=reels`
- Events -> `/hub/news?tab=events`
- Saved -> `/hub/news?filter=bookmarks`
- Sources -> `/hub/news/sources`
- Scheme: `newsroom`

### Poker Trivia

- Prefix: `/hub/trivia`
- Lobby -> `/hub/trivia`
- Daily -> `/hub/trivia/daily`
- Arcade -> `/hub/trivia/arcade`
- PvP -> `/hub/trivia/pvp`
- Stats -> `/hub/trivia/stats`
- Ranks -> `/hub/trivia/leaderboard`
- Scheme: `arcade`

### Social Media

- Prefixes: `/hub/social-media`, `/hub/reels`, `/hub/friends`, `/hub/messenger`, `/hub/social-pages`, `/hub/saved-posts`, `/hub/post`, `/hub/user`, `/u`
- Feed -> `/hub/social-media`
- Create -> `/hub/social-media?compose=1`
- Friends -> `/hub/friends`
- Chat -> `/hub/messenger`
- Reels -> `/hub/reels`
- Pages -> `/hub/social-pages`
- Scheme: `facebook`

### My Clubs

- Current registered prefix: `/hub/my-venues`
- Clubs -> `/hub/my-clubs`
- Arena -> `/hub/club-arena`
- Pages -> `/hub/social-pages`
- Venues -> `/hub/my-venues`
- Games -> `/hub/home-games`
- Hub -> `/hub`
- Scheme: `club-crest`
- Signed-out coverage exclusion is explicit and tested.

### Video Library

- Prefix: `/hub/video-library`
- Videos -> `/hub/video-library`
- Cash -> `/hub/video-library?type=cash`
- Tourneys -> `/hub/video-library?type=tournament`
- Saved -> `/hub/video-library?filter=favorites`
- History -> `/hub/video-library?filter=history`
- Later -> `/hub/video-library?filter=watchlater`
- Scheme: `cinema`

### Odds Calculator

- Prefix: `/hub/poker-tools`
- Odds -> `/hub/poker-tools`
- Equity -> `/hub/training/equity-calculator`
- ICM -> `/hub/training/icm-calculator`
- Preflop -> `/hub/preflop-charts`
- Hand Lab -> `/hub/training/hand-lab`
- Hub -> `/hub`
- Scheme: `analytics`

### Bankroll Manager

- Prefixes: `/hub/bankroll-manager`, `/hub/bankroll`
- Summary -> `/hub/bankroll-manager?view=dashboard`
- Log -> `/hub/bankroll-manager?view=log-session`
- Trips -> `/hub/bankroll-manager?view=trips`
- Reports -> `/hub/bankroll-manager?view=reports`
- Rules -> `/hub/bankroll-manager?view=rules`
- Export -> `/hub/bankroll-manager/export`
- Scheme: `ledger`

### Toke Tracker

- Prefix: `/hub/toke-tracker`
- Tokes -> `/hub/toke-tracker`
- Shift -> `/hub/toke-tracker/shift`
- Stats -> `/hub/toke-tracker/analytics`
- Vault -> `/hub/toke-tracker/vault`
- Taxes -> `/hub/toke-tracker/vault?tab=tax`
- Venues -> `/hub/toke-tracker/venues`
- Scheme: `chip-vault`

### Preflop Charts

- Prefixes: `/hub/preflop-charts`, `/hub/memory-games`
- Charts -> `/hub/preflop-charts`
- Speed -> `/hub/preflop-charts?mode=speed-drill`
- Stats -> `/hub/preflop-charts/stats`
- Ranks -> `/hub/preflop-charts/leaderboard`
- Awards -> `/hub/preflop-charts/achievements`
- Tutorial -> `/hub/preflop-charts/tutorial`
- Scheme: `range-matrix`

### Poker Near Me

- Prefixes: `/hub/poker-near-me`, `/hub/venues`, `/hub/home-games`, `/hub/events-calendar`, `/hub/daily-tournaments`, `/hub/poker-tours`, `/hub/poker-series`, `/hub/series`, `/hub/tours`, `/home-game`
- Nearby -> `/hub/poker-near-me/lobby`
- Venues -> `/hub/poker-near-me/venues`
- Events -> `/hub/poker-near-me/series`
- Games -> `/hub/poker-near-me/live-games`
- Map -> `/hub/poker-near-me/map`
- Saved -> `/hub/poker-near-me/saved`
- Scheme: `casino-realism`

### Marketplace

- Prefixes: `/hub/marketplace`, `/hub/diamond-store`, `/hub/merch-store`, `/hub/club-shop`, `/hub/vip-membership`, `/hub/smarter-rewards`
- Market -> `/hub/marketplace`
- Diamonds -> `/hub/diamond-store`
- Merch -> `/hub/merch-store`
- Clubs -> `/hub/club-shop`
- VIP -> `/hub/vip-membership`
- Orders -> `/hub/diamond-store/orders`
- Scheme: `luxury-market`

## 4.2 Retired Historical World

Diamond Arena was in the owner's original 14-world list.

It was removed from the active registry after PR #1701.

Its source footer art still exists in Downloads.

An asset existing does not mean its route is active.

Treat Diamond Arena as historical evidence only unless the owner explicitly commissions restoration.

## 4.3 Phase 1, Shipped

Phase 1 scope:

- correct active detection
- query-aware destinations
- single-flight rapid-tap protection
- error isolation
- fallback safety
- stable destination contracts
- one approved hamburger trigger
- title-case copy protections
- no em dashes in scoped user-facing copy
- footer route and geometry correction
- `/hub` footer exclusion
- `/hub/club-arena` footer exclusion
- fixed and scaled footer behavior
- Events Calendar SSR bounded fallback
- Club Arena artifact and cache correction

Relevant merged PRs:

| PR | Main Commit | Purpose | State |
|---|---|---|---|
| #1125 | `72002b3049384ea7374dbc4e752c213c27d6259b` | Phase 1 navigation resilience | MERGED |
| #1237 | `1c881dd57807b016f2caf8918881252b1387bd51` | Phase 1 fallback and CI closeout | MERGED |
| #1390 | `08b3101642a20ff2be19dec4969b41213ef51ed4` | Marketplace release-contract correction found during closeout | MERGED |
| #1393 | `153ca002a584283d269ebe0299d6a96798cedbb1` | Broken public asset symlink rejection | MERGED |
| #1396 | `e22114113601cb12c3d6e22ea4f14163e181b0c6` | World footer geometry aligned to Club Arena | MERGED |

Historical Phase 1 final production evidence:

- production revision reported then: `c9e490eafd267c2c06ebeca983eb22cf6b837861`
- live menu tests: 40 of 40
- footer suites: 8 of 8
- route inventory then: 202 routes
- command inventory then: 84 commands
- build safety then: 603 of 603
- marketplace tests then: 218 of 218
- lint then: 3930 files

Those numbers are historical.

Do not reuse 84 as the current command count.

## 4.4 Phase 2, Shipped

Phase 2 scope:

- premium individualized drawer surfaces
- one palette and texture per World
- responsive desktop and mobile composition
- Facebook-style Social Media presentation
- active, hover, pressed, focus, pending, and busy states
- modal focus behavior
- fallback owner cleanup
- fullscreen Reels ownership correction
- Social signed-out navigation preservation
- Escape isolation
- return-focus correction
- hidden drawer and hidden header keyboard isolation

Relevant merged PRs:

| PR | Main Commit | Purpose | State |
|---|---|---|---|
| #1407 | `3b41d636b568830ea459fb7316448f5fecdae6e7` | Premium responsive presentation | MERGED |
| #1411 | `42cd05f198fdd893993bc78658f1ec36c16e51bd` | Visual verification hardening | MERGED |
| #1480 | `acbc45f47ca62a3936ffd8afbff76337a7c9b3e4` | Deep Phase 2 audit and fixes | MERGED |
| #1489 | `b911d8d12f675a7a2eb2dcdcd264c0130de2a188` | Visual and footer gate stabilization | MERGED |

Historical Phase 2 final production revision:

```text
03055e5cfe6a3682c1c2a605735f325339a37cb4
```

Historical final evidence:

- desktop: 25 of 25
- mobile Chromium: 25 of 25
- visual plus WebKit: 31 of 31
- live locked footer: 1 of 1
- regression guards: 1278
- build, type, lint, and pre-push: green

Audit:

```text
.agent/audits/2026-09-06-phase-2-world-menu-release-audit.md
```

## 4.5 Phase 3, Shipped

Phase 3 scope:

- dedicated mobile optimization for every then-active non-Social World
- Social Media regression-only preservation
- client-only drawer widgets
- swipe exclusion and touch-cancel handling
- exact body and document modal isolation restoration
- inert and `aria-hidden` discipline
- portalled Report Bug focus, Escape, safe-area, and return-focus behavior
- Geeves disclosure semantics and hidden-state correction
- 44 pixel targets
- 16 pixel input text where needed to avoid mobile zoom
- horizontal overflow containment without breaking fixed elements
- Poker Near Me Events canonical destination correction
- mobile JavaScript and LCP budgets
- header and dock hydration ownership
- Preflop dynamic imports to meet budget
- static, cross-browser, and budget CI
- next/font visibility failsafe
- WebKit Reels ownership race correction

Relevant merged PRs:

| PR | Main Commit | Purpose | State |
|---|---|---|---|
| #1506 | `e99e27b96116f1237a1343811339b5f646546472` | Phase 3 mobile World menus | MERGED |
| #1512 | `2dadf2fa0fb978ef7e9677540f9b860353e767f7` | Phase 3 release race closeout | MERGED |
| #1701 | `606a789e16944b8a7bdc63789a46072a01bd4dc2` | Retire Diamond entry and use shared Poker Arena | MERGED |

Historical Phase 3 evidence immediately after implementation:

- Phase 3 functional: 36 of 36
- visual: 14 of 14
- WebKit: 17 of 17
- mobile budgets: 13 of 13 before current retirement and registry adjustment
- icon and image diff: none

Later post-retirement verification on September 13:

- current-registry Chromium plus WebKit: 32 of 32
- WebKit ownership and containment: 15 of 15
- static laws: 21 of 21
- non-Social mobile budgets: 12 of 12
- live revision at that time: `24cf05fafe756cf3a87c9fc31304e087ef9de3fb`

Audit:

```text
.agent/audits/2026-09-06-phase-3-world-menu-mobile-release-audit.md
```

## 4.6 Current Production, Not A Phase 3 Snapshot

Verified at 2026-09-19 08:44 America/Chicago:

```text
main: cd317cb306f6e3d972922362e3b66c7b530e2b86
deployment: dpl_HkLfZmMMx6cudcptk5tkdkCL2tzB
deployment URL: https://hub-vanguard-hr4w4ibpf-smarter-poker.vercel.app
target: production
status: READY
alias: https://smarter.poker
health status: ok
health version: cd317cb306f6e3d972922362e3b66c7b530e2b86
```

The current production revision is newer than all Phase 1 through Phase 3 revisions and contains them.

Recheck ancestry before relying on that statement later.

## 4.7 Database And Irreversible State

This World menu and footer program did not require a database migration in Phases 1 through 3.

No schema installation is certified by this handoff.

No financial ledger mutation is part of this handoff.

Future permission or personalization persistence may require data work.

Do not create a migration until the current architecture proves one is necessary.

If a migration becomes necessary, follow the current migration safety and hourly DDL rules.

---

# Part 5: The Task That Blocks Everything Else

The next authorized implementation is Phase 4 of 6.

The blocker is not missing permission from the owner.

The blocker is that Phase 4 must begin with a current exhaustive inventory and capability model, not with UI decoration.

## 5.1 What Is Already Done

- The current registry centralizes 13 World identities and 78 primary commands.
- Route resolution uses actual matching prefixes.
- Premium World palettes exist.
- Social Media has a preserved Facebook scheme.
- Phase 1 correctness guards exist.
- Phase 2 visual and ownership guards exist.
- Phase 3 mobile and performance guards exist.
- My Clubs signed-out exclusion is explicit and guarded.
- The protected World Hub publishing route is live.

## 5.2 What Is Not Done

- There is no certified per-command capability matrix covering anonymous, authenticated, profile-complete, club-member, club-staff, and platform-staff states.
- There is no certified live-badge contract for messages, saved items, challenges, orders, events, or pending club actions across all relevant commands.
- There is no certified all-world matrix for loading, empty, error, permission-denied, offline, stale, partial, and success states.
- There is no certified exhaustive deep-route audit against every visible, conditional, and contextual item after current route changes.
- There is no certified authentication return-path matrix for every gated command.
- There is no certified destination-failure recovery matrix.
- There is no current authenticated My Clubs visual and behavior proof included in the signed-out E2E suite.
- There is no unified Phase 4 PR, protected merge, Vercel deployment, or live acceptance record.

## 5.3 Phase 4 Subphases

### Phase 4.0: Recover And Rebaseline

1. Create an owned worktree from current `origin/main`.
2. Read current policy and repository instructions.
3. Run the existing static and E2E World menu suites unchanged.
4. Generate the current route and command inventory from the registry.
5. Crawl all current primary destinations signed out.
6. Crawl authenticated and permissioned destinations with authorized test identities.
7. Record every redirect, gated route, missing route, route-family disagreement, and unsupported state.
8. Write one Phase 4 audit file before implementation.

### Phase 4.1: Capability And Permission Contracts

1. Use `WORLD_NAVIGATION_CAPABILITIES` as vocabulary.
2. Assign required capability to every gated command.
3. Derive visibility, enabled state, hint, and destination behavior from capability.
4. Fail closed when capability is unknown.
5. Preserve useful discovery where product intent favors a visible locked command.
6. Never expose staff-only controls to unauthorized users.
7. Verify both visible UI and direct URL behavior.
8. Preserve login redirect return paths.

### Phase 4.2: Live State And Badges

1. Inventory existing first-party data sources for unread messages, saved items, active challenges, pending orders, event changes, and club actions.
2. Reuse current hooks and clients where they exist.
3. Do not invent fake counts.
4. Define unknown, loading, zero, stale, and error semantics.
5. Cap visual badge text without corrupting accessible names.
6. Prevent a failed badge request from breaking menu opening.
7. Avoid duplicate subscriptions when both header and fallback dock exist.
8. Clean up listeners on drawer close and route change.

### Phase 4.3: Resilience States

Implement and verify:

- drawer loading state
- command data loading state
- empty state where a section truly has no commands
- permission denied state
- offline state
- stale cached state
- partial data state
- destination failure state
- action failure state
- toggle failure and rollback state
- authentication redirect state
- route transition pending state
- rapid repeated activation protection

Do not block the whole menu because one secondary data source failed.

### Phase 4.4: Exhaustive Route-Family Audit

Audit every:

- visible primary command
- secondary drawer command
- conditional command
- contextual command
- toggle
- action
- query-string tab
- query-string filter
- modal launcher
- drilldown
- subpage
- authenticated redirect
- staff-only route
- hard-navigation boundary

Generate a disposition ledger with:

- command identity
- owner World
- source file
- display label
- capability
- destination or handler
- expected signed-out result
- expected signed-in result
- expected staff result
- loading behavior
- offline behavior
- failure behavior
- active-state rule
- test reference
- disposition

### Phase 4.5: Test Gate

Add or update tests for:

- capability visibility
- capability fail-closed behavior
- direct URL authorization
- login return path
- badge truth and error isolation
- stale and offline labeling
- destination failure recovery
- single subscription ownership
- one visible trigger
- focus trap and return focus
- Escape ownership
- no hidden focusable drawer
- all active registry commands
- My Clubs authenticated coverage
- no footer on `/hub`
- no footer on `/hub/club-arena`
- fixed footer geometry
- no horizontal footer scroll
- no icon or artwork changes
- no em dashes in changed user-facing copy

### Phase 4.6: Protected Delivery And Live Proof

1. Run exact-candidate local checks.
2. Commit only Phase 4 scope.
3. Push the owned branch.
4. Reuse an existing PR for the branch or create one if absent.
5. Read exact PR-head required checks.
6. Fix real failures.
7. Protected squash merge.
8. Wait for `hub-vanguard` production READY.
9. Verify `/api/health` reports the merge revision or a newer descendant containing it.
10. Run signed-out and authenticated production behavior checks.
11. Capture desktop, tablet, and mobile proof.
12. Update the Phase 4 audit with actual PR, merge SHA, deployment ID, live SHA, and results.

## 5.4 Diamond Arena Decision Branch

Default branch:

If the owner does not explicitly order restoration, keep Diamond Arena retired and complete Phase 4 against the current 13-world registry.

Restoration branch:

If the owner explicitly orders Diamond Arena restored after being told it was retired:

1. Stop Phase 4 edits that assume 13 worlds.
2. Audit PR #1701 and every route removed or redirected by it.
3. Identify the canonical current Poker Arena architecture.
4. Propose whether Diamond Arena is a distinct World or a branded entry within Poker Arena.
5. Show the owner the route, data, footer, and menu consequences.
6. Obtain the product choice only if the two architectures materially differ.
7. Implement the selected architecture without duplicating Club Arena infrastructure.
8. Restore tests and counts from registry truth, not from historical 14 and 84 constants.
9. Deliver through the protected route.

Do not run the restoration branch on historical wording alone.

---

# Part 6: Full Backlog, Prioritized

## 6.1 High Priority, Phase 4

### Capability Matrix

Evidence: capability constants exist, but no certified all-command matrix is recorded.

Done means every gated command has a tested capability, visibility rule, direct-route rule, and fail-closed behavior.

### Auth Redirect Integrity

Evidence: My Clubs and staff routes are explicitly excluded from signed-out visual coverage.

Done means each gated command returns the user to the intended World and state after successful login, and unauthorized direct access remains closed.

### Live Badge Truth

Evidence: the approved backlog calls for messages, saved items, challenges, orders, events, and pending club actions.

Done means badges use real first-party data, define zero/loading/stale/error, isolate failure, and have deterministic tests.

### Failure-State Matrix

Evidence: earlier phases focused on navigation, presentation, and mobile behavior, not a complete state matrix.

Done means every applicable menu family handles loading, empty, error, permission denied, offline, stale, partial, and success.

### Deep Route And Query Audit

Evidence: prior defects included query values that pages ignored and routes that redirected into a different World.

Done means the disposition ledger covers every visible, conditional, and contextual command and current routes implement their advertised state.

### My Clubs Authenticated Coverage

Evidence: current signed-out tests skip My Clubs for a documented reason.

Done means a separate authenticated or staff-qualified test proves its actual drawer, footer, routes, and permission boundaries.

## 6.2 Medium Priority, Phase 5

### Search Synonyms

Add a canonical synonym registry for common poker terms and World labels.

Done means search finds commands by label, title, purpose, and approved synonym without exposing unauthorized commands.

### Command Palette

Add `Cmd+K` and `Ctrl+K` only if it reuses the same registry, permissions, active state, and execution path.

Done means no duplicate command logic and full keyboard and screen-reader operation.

### Reorderable Pins

Allow users to pin and reorder frequent commands.

Done means safe persistence, cross-device sync when signed in, local fallback when signed out, deterministic conflict behavior, and reset controls.

### Recents

Record recent commands without leaking sensitive route or identity information.

Done means bounded history, privacy-safe storage, deduplication, and permission re-evaluation before display.

### Cross-World Switcher

Add a compact switcher that preserves the existing hamburger icon and does not create a second drawer owner.

Done means keyboard, touch, and screen-reader support plus registry-derived destinations.

### Breadcrumbs

Add nested breadcrumbs for deep World routes.

Done means each breadcrumb maps to canonical route ownership and does not disagree with footer or menu active state.

### Route Transition Continuity

Preserve meaningful context when moving between related subpages.

Done means current filters, selected entity, and return paths survive only where safe and intended.

### Offline Cached Indicators

Show which routes or data are cached and which require a connection.

Done means indicators reflect actual service-worker and data availability, not optimistic guesses.

### Optional Sound And Haptics

Use only restrained feedback and provide a durable mute.

Done means platform support detection, reduced-motion and accessibility respect, and no sound by surprise.

### Admin-Managed Labels And Availability

Only add this after defining a safe first-party configuration contract.

Done means validation, rollback, capability protection, audit history, and no arbitrary route injection.

## 6.3 Medium Priority, Phase 6

### Privacy-Safe Analytics

Measure drawer open, command activation, failure, abandonment, and slow interaction without recording sensitive content or identities unnecessarily.

Done means documented event schema, consent and privacy review, sampling, and first-party ownership.

### Performance Monitoring

Track drawer-open latency, route-transition latency, asset transfer, and mobile budget drift.

Done means thresholds, dashboards or first-party reports, and an actionable regression gate.

### Automated Broken-Link Monitor

Use the current registry count dynamically.

Done means every active command is checked, gated routes are interpreted correctly, and retired worlds do not remain as stale constants.

Do not create a release watcher or autonomous repair loop.

### Visual Asset Budgets

Guard image dimensions, transfer size, crop metadata, and aspect ratio.

Done means oversized or altered footer assets fail before merge.

### Localization And Long Labels

Prove layout with expansion, wrapping, large system text, and locale-aware title casing.

Done means no clipping, no overflow, and no destructive text transformation of proper nouns.

### Permanent Accessibility Gate

Cover keyboard, screen reader, focus, contrast, reduced motion, forced colors, reduced transparency, and large text.

Done means no serious or critical violations and deterministic interaction tests.

### Feature Flags And Rollback

Allow per-World controlled rollout without bypassing permissions or creating divergent registries.

Done means documented owner, default, expiry, rollback, and test matrix.

### Component Documentation

Document registry fields, ownership, execution, permissions, badges, states, and testing.

Done means a new engineer can add a command without duplicating configuration or weakening a law.

### Internal Naming

Evaluate renaming the internal system from `HamburgerMenu` to `WorldCommandMenu` only after Phase 4 and Phase 5 behavior is stable.

Do not change the visible hamburger icon.

Done means a mechanical internal rename, no public visual change, no stale imports, and complete tests.

## 6.4 Low Priority Or Conditional

### Foldable And Exotic Viewports

Test after primary phone, tablet, desktop, landscape, iOS Safari, Android Chrome, Firefox, and WebKit coverage is green.

Done means no hinge, notch, safe-area, keyboard, or fixed-layer collision in supported targets.

### Color-Blind State Review

Ensure active, error, pending, and disabled states do not rely on color alone.

Done means iconography, copy, or shape supplies a second signal without changing approved artwork.

## 6.5 Done Differently Than Originally Specified

The owner originally referred to 14 worlds and 84 commands.

Current production deliberately has 13 worlds and 78 commands after Diamond Arena retirement.

The correct implementation is registry-derived counts, not preservation of stale constants.

Social Media was not broadly restyled for Phase 3 because the owner explicitly required its Facebook-style schema to remain.

The correct implementation was mobile regression protection, not forced visual uniformity.

## 6.6 Declined, Do Not Build

Do not restore the retired external error telemetry provider.

If a future agent "fixes" missing telemetry by restoring it, that is a mistake.

Do not create an autonomous release watcher, scheduler, retry service, or repair loop.

If a future agent "fixes" delivery latency by building one, that is a mistake.

Do not duplicate World Hub infrastructure.

If a future agent creates another Vercel project or repository, that is a mistake.

Do not create fake badge counts or simulated live data in production.

If a future agent makes the menu look active with fabricated counts, that is a mistake.

## 6.7 Blocked On A Human

Diamond Arena restoration is blocked on an explicit later owner decision because current production deliberately retired it.

New icon or artwork design is blocked on explicit owner authorization because the current instruction freezes icons and artwork.

Material changes to the Social Media visual identity are blocked on explicit owner authorization because the Facebook-style scheme is binding.

Everything else in Phases 4 through 6 is already authorized within the described scope, subject to current policy and technical safeguards.

---

# Part 7: Every Important Defect Found And Its Lesson

## 7.1 Hamburger Was Misread As A Banned Mark

Symptom:

```text
Hamburger icon was changed toward a gear/settings interpretation.
```

Cause: "M bars" was interpreted as the hamburger bars instead of em dashes.

Fix: restore and permanently protect the approved hamburger icon; codify U+2014 as the banned mark.

Lesson: resolve ambiguous owner terminology against explicit later corrections and repository law before changing visual identity.

## 7.2 Duplicate Drawer Owners

Symptom:

```text
Hidden fallback drawers remained mounted and could retain focus or handlers.
```

Cause: header and fallback dock ownership were treated as visual presence rather than interactive ownership.

Fix: centralize owner selection, hide and inert non-owners, and restore exact prior document state.

Lesson: invisible interactive surfaces are still live defects.

## 7.3 Social Routes Lost Navigation Signed Out

Symptom:

```text
Friends or Messenger could land without a usable World drawer for a signed-out visitor.
```

Cause: route-specific shells and auth behavior bypassed the assumed header owner.

Fix: provide a Facebook-style fallback owner without duplicating the active header owner.

Lesson: test real route families and auth states, not only canonical landing pages.

## 7.4 Reels Trigger Was Behind A Fullscreen Layer

Symptom:

```text
The menu trigger existed but could not be activated because a fullscreen layer owned the top stack.
```

Cause: z-index and ownership were validated separately.

Fix: test actual pointer and keyboard activation in the final stacking context.

Lesson: rendered is not reachable.

## 7.5 Escape Navigated Instead Of Closing The Active Surface

Symptom:

```text
Escape could trigger page-level behavior while the drawer or portal was open.
```

Cause: multiple route and component handlers reacted to one key.

Fix: give the topmost active modal one Escape owner and stop propagation appropriately.

Lesson: keyboard behavior needs ownership just like pointer behavior.

## 7.6 Focus Was Not Restored Reliably

Symptom:

```text
Closing a drawer or bug-report portal could leave focus lost or on a hidden element.
```

Cause: return target was captured too late or unmounted during navigation.

Fix: capture a valid opener before activation, restore only when still connected, and choose a deterministic fallback.

Lesson: focus restoration is a state machine, not one `.focus()` call.

## 7.7 Query Commands Pointed To States Pages Did Not Read

Symptom:

```text
Several different menu labels landed on the same default page state.
```

Cause: configuration advertised query parameters such as filters while target pages ignored them.

Fix: wire the target page, change the destination, or remove the unsupported command after product review.

Lesson: a valid URL can still be an unwired command.

## 7.8 Route Resolver And Footer Could Disagree

Symptom:

```text
Overlapping prefixes could cause the menu and footer to identify different Worlds.
```

Cause: resolver ranked a World's unrelated longest prefix rather than the longest prefix that actually matched the path.

Fix: score only matching prefixes.

Lesson: registry order and prefix length are not route ownership unless evaluated against the current path.

## 7.9 My Clubs Test Timed Out Without Explaining The Redirect

Bad output shape:

```text
expect.poll timed out after ten seconds
```

Real condition: `/hub/my-clubs` redirected into Social Media, so the requested World could not render its own drawer.

Fix: make the fixture compare the landing path against every route prefix the World claims and emit a diagnostic sentence.

Lesson: test failures must say what happened, not merely "timeout."

## 7.10 Stale Diamond Route Produced A False Release Failure

Symptom:

```text
Historical Phase 3 rerun hit a retired Diamond route and returned 404.
```

Cause: a stale hand-written route list survived after the registry changed.

Fix: derive cases from `world-footer-navigation.json` and maintain explicit exclusions.

Lesson: duplicate inventories rot.

## 7.11 A Historical Branch CI Rerun Failed A Stale Club Arena Probe

Symptom:

```text
A rerun on an old merged branch failed even though current production and current main were healthy.
```

Cause: the historical branch retained an obsolete external probe.

Fix: qualify current source and current release inputs instead of treating an old rerun as a current release verdict.

Lesson: a failing old instrument does not automatically invalidate a newer release, but it must be explained.

## 7.12 Puppeteer Cache Broke Dependency Installation

Symptom:

```text
npm ci failed while downloading or resolving the Puppeteer headless shell cache.
```

Cause: corrupted local browser cache.

Historical workaround attempted: `PUPPETEER_SKIP_DOWNLOAD=1`.

Current rule: diagnose the exact current failure and use the repository-supported dependency path.

Lesson: do not solve dependency ownership with a shared `node_modules` symlink.

## 7.13 Footer Source Canvas Covered The Page

Symptom:

```text
Large black source-image padding appeared as page content around the footer.
```

Cause: the full source canvas was rendered instead of the visible frame crop.

Fix: store and render crop metadata or a correctly prepared asset while preserving the frame and art.

Lesson: transparent-looking black image padding is not layout spacing.

## 7.14 Fixed Header And Footer Covered Content

Symptom:

```text
World cards and controls were cut off by tall fixed chrome.
```

Cause: fixed element dimensions and page clearance drifted independently.

Fix: compact chrome, use shared dimensions, safe areas, and verified content clearance.

Lesson: fixed positioning requires a global clearance contract.

## 7.15 Shared Shape Of The Defects

The common failure shape is duplicated authority.

Examples:

- duplicate route inventories
- duplicate drawer owners
- duplicate Escape handlers
- menu configuration separate from target-page behavior
- fixed chrome dimensions separate from content clearance
- historical counts separate from current registry truth

Remove duplicate authority before adding more features.

---

# Part 8: Traps And Instruments That Lie

## 8.1 A Merge Tick Is Not File Proof

Detection:

```bash
git fetch origin main --prune
git cat-file -e origin/main:src/components/ui/HamburgerMenu.jsx
git cat-file -e origin/main:.agent/audits/2026-09-06-phase-3-world-menu-mobile-release-audit.md
```

Healthy result: each command exits zero.

## 8.2 A Push Is Not A Merge

Detection:

```bash
gh pr view <PR_NUMBER> --repo Smarter-Poker/Smarter-Poker-World-Hub --json state,mergeCommit,headRefOid,statusCheckRollup
```

Healthy result for delivered work: `state` is `MERGED`, merge commit is non-null, and required PR-head checks succeeded before merge.

## 8.3 A Merge Is Not A Deployment

Detection:

```bash
vercel inspect <DEPLOYMENT_ID> --scope smarter-poker
curl -fsS https://smarter.poker/api/health
```

Healthy result: production target is READY and health reports the merged revision or a newer descendant that contains it.

## 8.4 A Healthy Endpoint Is Not Behavior Proof

Detection: run the affected production browser flow, activate each changed command, and assert the destination and state.

Healthy result: the user-visible behavior works at required viewports and auth states.

## 8.5 `No Tests Found` Can Exit In A Misleading Way

Detection: inspect test discovery count before trusting a green wrapper.

Healthy result: expected tests are discovered and executed.

Fail the gate when zero tests are found for a required suite.

## 8.6 Hidden Elements Can Pass Visual Checks

Detection:

- tab through the page
- inspect active element
- press Escape
- activate the trigger by keyboard and pointer
- count visible and mounted drawer owners

Healthy result: one reachable trigger, one active drawer, no focus in hidden surfaces.

## 8.7 Redirects Can Look Like Route Success

Detection:

```text
Compare the final pathname with every route prefix claimed by the intended World.
```

Healthy result: final path remains in the intended World unless the tested contract explicitly expects login or cross-World navigation.

## 8.8 Query Strings Can Look Wired While Being Ignored

Detection: assert the target page's selected tab, filter, modal, or view after navigation.

Healthy result: the visible state matches the command's advertised purpose.

## 8.9 Historical Counts Can Look Authoritative

Detection:

```bash
jq '{worlds:(.worlds|length),commands:([.worlds[].items[]]|length)}' src/config/world-footer-navigation.json
```

Healthy result at handoff: 13 worlds and 78 commands.

If it changes later, update tests and audit from current registry truth.

## 8.10 A Static Asset Existing Does Not Mean A World Is Active

Detection: inspect registry, route ownership, and retirement history.

Healthy result: only registered Worlds count as active.

The Diamond footer source file does not restore Diamond Arena.

## 8.11 An Old Branch Rerun Is Not A Current Release Gate

Detection:

```bash
git merge-base --is-ancestor <tested-sha> origin/main
git diff <tested-sha>..origin/main -- <affected paths>
```

Healthy interpretation: use the test only for the exact source and inputs it exercised.

## 8.12 Immutable Vercel URLs May Require Authentication

Use authorized Vercel inspection for deployment state and the public `smarter.poker` alias for behavior unless the immutable URL is publicly accessible.

Do not call an authentication redirect a failed production deployment without checking provider state.

## 8.13 Main Check Runs Can Include Skipped Follow-Up Jobs

Read job intent and dependency graph.

A skipped failure-notification job after successful prerequisites is not a failed release.

A skipped required test because its dependency never ran is not a pass.

## 8.14 SSD Capacity Can Fail Mid-Task

Detection:

```bash
df -h /Volumes/SmarterWork
```

Do this before dependency install, build, screenshots, and browser downloads.

Do not delete unknown work to make space.

---

# Part 9: Verification Commands

Run these against the exact final candidate from the owned Phase worktree.

Adapt only when current repository scripts supersede them.

## 9.1 Verify Current Source And Policy

```bash
node /Users/smarter.poker/Documents/agent-policy.mjs read
node docs/agent-policy/agent-policy.mjs check --canonical /Users/smarter.poker/Documents
git fetch origin main --prune
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
```

Healthy result:

- policy check exits zero
- worktree is owned
- no unrelated changes
- branch base is known

## 9.2 Verify Prior Work Exists By File

```bash
for path in \
  src/components/ui/HamburgerMenu.jsx \
  src/components/ui/WorldCommandDock.jsx \
  src/components/ui/UniversalHeader.js \
  src/components/ui/WorldCommandMenuBoundary.jsx \
  src/config/hamburgerMenus.js \
  src/config/worldMenuNavigation.js \
  src/config/world-footer-navigation.json \
  e2e/020-hamburger.spec.ts \
  e2e/022-world-menu-visual.spec.ts \
  e2e/023-world-menu-webkit.spec.ts \
  e2e/024-world-menu-mobile-phase3.spec.ts \
  scripts/ci/mobile-budget.json \
  .agent/audits/2026-09-06-phase-2-world-menu-release-audit.md \
  .agent/audits/2026-09-06-phase-3-world-menu-mobile-release-audit.md
do
  git cat-file -e "origin/main:$path" || exit 1
done
```

Healthy result: no output and exit zero.

## 9.3 Verify Registry Counts

```bash
jq '{worlds:(.worlds|length),commands:([.worlds[].items[]]|length),perWorld:[.worlds[]|{id,commands:(.items|length)}]}' src/config/world-footer-navigation.json
```

Healthy baseline at handoff:

```text
worlds: 13
commands: 78
each commands value: 6
```

If different, determine whether a protected product change intentionally changed the registry.

Do not force it back to historical values.

## 9.4 Static World Menu Laws

```bash
node --test \
  __tests__/world-menu-mobile-phase3.test.mjs \
  __tests__/world-menu-presentation.test.mjs \
  __tests__/world-command-destinations.test.mjs \
  __tests__/world-command-menu-law.test.mjs \
  __tests__/fallback-menu-safety.test.mjs \
  __tests__/the-footer-gate-tests-a-world-that-exists.law.test.mjs \
  __tests__/hamburger-never-regresses.test.mjs \
  __tests__/fixed-elements-stay-fixed.test.mjs \
  __tests__/the-footer-keeps-its-artworks-shape.law.test.mjs
```

Healthy result: exit zero, no skipped required cases, no zero-test discovery.

Counts may grow after handoff.

Record exact counts.

## 9.5 Registry And Route Coverage

```bash
node scripts/ci/world-menu-coverage.mjs
node scripts/generate-world-menu-audit.mjs
```

Read the current script usage before running if it requires flags.

Healthy result: registry, route inventory, exclusions, and generated audit agree.

Do not commit generated noise unless it is an intended audit artifact.

## 9.6 Type And Lint

```bash
npx tsc --noEmit
npm run lint
```

Healthy result: both exit zero.

If the current repository uses a scoped type command, use that maintained command and document it.

## 9.7 Production Build

```bash
npm run build
```

Healthy result: exit zero with all prebuild, build, and postbuild contracts passing.

Do not ignore a failure because the changed files look unrelated.

Classify it and compare with current protected `main` using the same environment.

## 9.8 Playwright Menu Suites

```bash
npx playwright test e2e/020-hamburger.spec.ts --project=chromium
npx playwright test e2e/022-world-menu-visual.spec.ts --project=chromium
npx playwright test e2e/023-world-menu-webkit.spec.ts --project=webkit
npx playwright test e2e/024-world-menu-mobile-phase3.spec.ts --project=chromium
npx playwright test e2e/024-world-menu-mobile-phase3.spec.ts --project=webkit
npx playwright test e2e/mobile-budget.spec.ts --project=chromium
```

Healthy result:

- all discovered tests pass
- no flaky retry is needed to create a green result
- current registry-derived counts are used
- My Clubs exclusion is explicit in signed-out tests
- authenticated My Clubs coverage exists separately by Phase 4 closeout

## 9.9 Required Viewports

At minimum verify:

```text
1440x900
834x1112
390x844
375x812
```

Also verify supported landscape, safe-area, and virtual-keyboard behavior.

Healthy result:

- one trigger
- no horizontal page overflow
- no footer horizontal scroll
- all six footer commands visible
- 44 pixel touch targets
- readable labels
- no content hidden by fixed chrome
- no layer collision

## 9.10 Accessibility

Verify:

- keyboard open and close
- focus trap
- focus return
- Escape ownership
- tab order
- accessible trigger name
- dialog semantics
- active-state announcement
- disabled-state announcement
- badge accessible name
- reduced motion
- forced colors
- large system text
- contrast
- no serious or critical automated findings

Healthy result: no hidden focus targets, no focus loss, and no inaccessible command path.

## 9.11 No Em Dash In Changed User-Facing Files

```bash
git diff --name-only origin/main...HEAD | while read -r file; do
  [ -f "$file" ] && rg -n --pcre2 '\x{2014}' "$file" && exit 1 || true
done
```

Review the loop carefully if modifying it.

Healthy result: no prohibited mark in changed user-facing source.

## 9.12 Artwork And Icon Integrity

```bash
git diff --name-status origin/main...HEAD -- public src | rg -i '(footer|icon|hamburger|\.png$|\.webp$|\.svg$)' || true
```

Healthy result for Phases 4 through 6: no unintended artwork or icon file changes.

Any intentional asset change needs explicit owner authority and visual proof.

## 9.13 PR And Required Checks

```bash
gh pr view <PR_NUMBER> \
  --repo Smarter-Poker/Smarter-Poker-World-Hub \
  --json number,state,headRefOid,mergeCommit,statusCheckRollup,url
```

Healthy result before merge: every required exact-head check succeeded.

Healthy result after merge: state is MERGED and merge commit is recorded.

## 9.14 Production Identity

```bash
curl -fsS https://smarter.poker/api/health | jq .
vercel inspect <DEPLOYMENT_ID> --scope smarter-poker
```

Healthy result:

- status `ok`
- target production
- status READY
- live SHA equals merge SHA or is a newer descendant containing it

Verify descendant locally:

```bash
git fetch origin main --prune
git merge-base --is-ancestor <MERGE_SHA> <LIVE_SHA>
```

Exit zero means the live revision contains the merge.

## 9.15 Live Behavior

Run the affected browser matrix against `https://smarter.poker`.

For every changed command assert:

- trigger is visible and approved
- drawer opens
- correct World style appears
- command is visible only at correct capability
- badge is truthful
- activation is single-flight
- final route and page state match intent
- login return path works where gated
- error state is recoverable
- drawer closes or remains open according to contract
- focus lands correctly
- footer remains correct

Do not close the phase without authenticated production proof for authenticated changes.

---

# Part 10: File Map

| Path | State | Purpose |
|---|---|---|
| `src/config/world-footer-navigation.json` | LIVE, canonical | Active Worlds, prefixes, six primary commands, footer identity |
| `src/config/worldMenuNavigation.js` | LIVE | Menu keys, purpose, palettes, route resolution, capability vocabulary |
| `src/config/hamburgerMenus.js` | LIVE | Secondary menu sections, toggles, actions, handlers, common icons |
| `src/components/ui/HamburgerMenu.jsx` | LIVE | Main drawer renderer, sign-out ownership, interaction behavior |
| `src/components/ui/UniversalHeader.js` | LIVE | Approved primary hamburger trigger and header owner |
| `src/components/ui/WorldCommandDock.jsx` | LIVE | Fallback/mobile trigger owner |
| `src/components/ui/WorldCommandMenuBoundary.jsx` | LIVE | Ownership and failure boundary |
| `src/components/ui/HubPageShell.jsx` | LIVE | World shell and overflow/fixed-layout containment |
| `src/components/ui/GeevesMenuWidget.jsx` | LIVE | Geeves disclosure and mobile interaction |
| `src/components/ui/ReportBugWidget.jsx` | LIVE | Portalled bug-report modal and focus behavior |
| `src/lib/world-menu/navigationState.mjs` | LIVE | Active and pending navigation state helpers |
| `pages/_app.js` | LIVE | Global application shell and providers |
| `pages/_document.js` | LIVE | Document-level boot and visibility behavior |
| `e2e/fixtures/world-menu-cases.ts` | LIVE | Registry-derived World test cases and route diagnostics |
| `e2e/fixtures/world-menu-signed-out-exclusions.json` | LIVE | Explicit signed-out exclusions and evidence |
| `e2e/020-hamburger.spec.ts` | LIVE | Core drawer behavior |
| `e2e/022-world-menu-visual.spec.ts` | LIVE | Premium visual snapshots |
| `e2e/023-world-menu-webkit.spec.ts` | LIVE | WebKit ownership and interaction |
| `e2e/024-world-menu-mobile-phase3.spec.ts` | LIVE | Phase 3 mobile laws |
| `e2e/mobile-budget.spec.ts` | LIVE | Mobile transfer and LCP budget gate |
| `scripts/ci/mobile-budget.json` | LIVE | Current 12 non-Social route budgets |
| `scripts/ci/world-menu-coverage.mjs` | LIVE | Registry and suite coverage verification |
| `scripts/generate-world-menu-audit.mjs` | LIVE | Audit inventory generator |
| `__tests__/world-menu-mobile-phase3.test.mjs` | LIVE | Static mobile contracts |
| `__tests__/world-menu-presentation.test.mjs` | LIVE | Palette and presentation contracts |
| `__tests__/world-command-destinations.test.mjs` | LIVE | Destination contracts |
| `__tests__/world-command-menu-law.test.mjs` | LIVE | Structural menu laws |
| `__tests__/fallback-menu-safety.test.mjs` | LIVE | No unsafe fallback controls |
| `__tests__/the-footer-gate-tests-a-world-that-exists.law.test.mjs` | LIVE | Exclusion evidence and real-world gate |
| `__tests__/hamburger-never-regresses.test.mjs` | LIVE | Approved hamburger regression law |
| `__tests__/fixed-elements-stay-fixed.test.mjs` | LIVE | Fixed chrome behavior |
| `__tests__/the-footer-keeps-its-artworks-shape.law.test.mjs` | LIVE | Footer artwork aspect-ratio law |
| `.github/workflows/global-footer-e2e.yml` | LIVE | Hosted footer and World navigation E2E gate |
| `.agent/audits/2026-08-31-world-command-menu-phase-1.md` | HISTORICAL EVIDENCE | Phase 1 audit |
| `.agent/audits/2026-08-31-world-hub-menu-modernization.md` | HISTORICAL EVIDENCE | Early modernization audit |
| `.agent/audits/2026-08-31-world-hub-menu-route-inventory.json` | HISTORICAL EVIDENCE | Earlier route inventory, rederive before use |
| `.agent/audits/2026-09-06-phase-2-world-menu-release-audit.md` | HISTORICAL EVIDENCE | Phase 2 final audit |
| `.agent/audits/2026-09-06-phase-3-world-menu-mobile-release-audit.md` | HISTORICAL EVIDENCE | Phase 3 final audit |
| `/Users/smarter.poker/Downloads/FOOTER DIAMOND ARENA.png` | DORMANT SOURCE ASSET | Retired World artwork, not wired by existence |
| `/Users/smarter.poker/.codex/attachments/1b12cfa6-3d2a-4ecb-9bab-cfd035c2720a/pasted-text.txt` | OWNER SOURCE | Full modernization directive |

Before editing, use `git ls-tree -r --name-only origin/main` to confirm every live path.

Files move.

Registry authority and behavior matter more than this table's age.

---

# Part 11: How To Behave On This Work

Lead with current evidence.

Read real command output before interpreting it.

Treat source, local tests, hosted checks, protected merge, provider publication, live identity, and live behavior as separate evidence layers.

Fix a demonstrated root cause.

Do not suppress or weaken a guard merely to make a run green.

Measure counts from the current registry.

Never pad a number to match 14 or 84.

Preserve other agents' work.

Keep one task checkpoint.

Write one phase audit or changelog that records:

- baseline SHA
- changed files
- command inventory
- capability matrix
- tests and exact counts
- known exclusions
- PR
- merge SHA
- deployment ID
- live SHA
- live behavior proof
- unresolved gaps

Use second-order checks.

When a tool gives a surprising result, verify the instrument before declaring the product broken or healthy.

Do not touch icons or artwork.

Do not change the Social Media visual identity.

Do not broaden Phase 4 into Phase 5.

Finish, publish, and verify one phase before starting the next.

At each closeout, report:

```text
Phase N of 6 is complete.
Source: <result>
Local tests: <result>
Hosted checks: <result>
Protected merge: <PR and SHA>
Publication: <deployment ID and READY state>
Live identity: <SHA>
Live behavior: <matrix result>
Remaining: <truthful list>
Ready to start Phase N+1 of 6.
```

Do not use that wording unless every listed layer is actually proven.

If a provider is pending, say pending and retain the exact operation identity.

Do not create a polling automation.

Use bounded waits and continue independent work.

Ask the owner only when a material product choice falls outside the existing scope.

Diamond Arena restoration is such a choice.

Routine implementation details are not.

---

# Part 12: Opening Moves, In Order

1. Run the canonical policy reader and read the four current policies completely.
2. Check `/Volumes/SmarterWork` capacity and safely resolve the worktree-space blocker without deleting unknown work.
3. Fetch `origin/main`, record its SHA, and create a fresh owned Phase 4 worktree from it.
4. Read root and path-specific repository instructions plus `PUBLISHING.md`.
5. Recheck production with Vercel inspection and `https://smarter.poker/api/health`.
6. Recompute current World and command counts from `src/config/world-footer-navigation.json`.
7. Run the unchanged static, Chromium, WebKit, visual, and mobile-budget menu suites and record exact discovered counts.
8. Read the original modernization directive and the Phase 1, Phase 2, and Phase 3 audits.
9. Generate the Phase 4 command, route, capability, auth, and state disposition ledger before editing UI.
10. Implement Phase 4.1 through Phase 4.5 in the smallest coherent change set.
11. Run exact-candidate build and E2E gates.
12. Push, pass required checks, protected-merge, verify Vercel READY, verify live SHA, and run live signed-out and authenticated behavior proof.
13. Close Phase 4 with evidence and only then begin Phase 5.

While blocked on SSD capacity, you may safely read policy, current source via `git show origin/main:<path>`, current production health, PR history, and audits.

While blocked on an authenticated test identity, you may finish static contracts, signed-out coverage, fixture design, and local unit tests, but you may not claim authenticated completion.

The hardest prohibition remains absolute: do not alter, replace, or reinterpret the approved hamburger icon or any approved icon artwork.
