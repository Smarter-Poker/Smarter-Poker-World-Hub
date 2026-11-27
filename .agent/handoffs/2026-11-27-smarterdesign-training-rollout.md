# HANDOFF — #SMARTERDESIGN rollout across the Poker Arena / Training world (2026-11-27)

BOOKMARK: branch `agent/smarterdesign-training-four-pages` in `Smarter-Poker/Smarter-Poker-World-Hub`
(GitHub). Two commits on top of main `3ef4e63`:
- `7928dae` feat(training): #SMARTERDESIGN for ICM Calculator, Preflop Charts, Goals, Training Leaderboard (approved by Dan implicitly; he asked for "these same improvements" everywhere)
- `72f2e94` wip(training): image headers + chrome help icon on every Training page (WIP, NOT visually verified)
+ this handoff file commit. NOTHING is merged or published. Dan's standing rule: show him rendered
screenshots in chat (before/after) BEFORE pushing to main/publishing. After he approves, follow
PUBLISHING.md (protected squash merge, Vercel `hub-vanguard` auto-publish, verify /api/health revision).
Commit author MUST be `Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>` (CHECK 15).

## 0. Owner (Dan) instructions in force — verbatim intent
1. 2026-11-27 #1: Upgrade ICM Calculator (/hub/training/icm-calculator), Preflop Charts (/hub/preflop-charts),
   Goals (/hub/training/challenges), Training Leaderboard (/hub/training/leaderboard) to #SMARTERDESIGN,
   each with its own header image. DONE (commit 7928dae), screenshots shown.
2. 2026-11-27 #2 (the current job):
   a. "GO THROUGH ALL THE REST OF THE POKER ARENA PAGES AND SUB PAGES AND MAKE THESE SAME IMPROVEMENTS".
      Interpretation used: the Training world (the pages Dan sent all live there: footer LIBRARY/PLAY/DAILY/
      PROGRESS/GOALS/RANKS, "Training Arena"): every route under pages/hub/training/**, /hub/training lobby,
      /hub/training/category/[id], and Preflop Charts + its sub pages. (Club Arena itself = separate repo,
      #ClubArenaConsole painted-chassis standard; NOT touched. If Dan meant Club Arena, that is a separate job.)
   b. EVERY image display header must use the SAME dynamic chrome "?" icon as the Club Arena Cashier header
      (1st attachment), NEVER any other (2nd/3rd attachments = Toke Tracker / Bankroll Manager circles = wrong),
      tucked into the UPPER-RIGHT corner as close to the edges as possible WITHOUT touching the frame.
      Add to #SMARTERDESIGN as a standard. DONE in code + docs + law test.
   c. A "Back To Dashboard" button is NEVER inside an image header; it goes ABOVE it. DONE (Bankroll Manager,
      Toke Tracker, Export) + law test.
   d. Fix the 4 pages already done with corrected icon/location. DONE (they inherit the shared component;
      ICM/Leaderboard/Goals now use TrainingPageHead with Back row above).
   e. Make a LIST of every remaining page needing the optimization, enhance them all, and deliver a LIST +
      BEFORE/AFTER screenshots to verify. LIST below (section 4). BEFORE shots captured; AFTER shots NOT yet.
3. Standing prefs (memory): premium 3D metallic, no flat UI; never claim success before end-to-end verify;
   show screenshots before publishing; pushback when Dan is wrong; root-cause fixes; decide yourself;
   "FINISH THE JOB THEN TELL ME" (no interim status reports); never idle waiting on CI; may merge own PRs.
4. #SMARTERDESIGN rules (docs/SMARTERDESIGN.md, .agent/skills/smarterdesign/SKILL.md): ink-navy, one
   continuous steel rim, cobalt selected, white titles, silver copy, ice/cyan emphasis; NO yellow/gold/amber/
   purple/violet/lavender/pink/magenta TEXT anywhere; Title Case; 44px targets; reuse a badge once; each
   page its own seal + scene; Cashier header is the reference composition.

## 1. Repo / environment facts the next agent needs
- Repo: Smarter-Poker/Smarter-Poker-World-Hub (Next.js 16, pages router). Read CLAUDE.md, AGENTS.md,
  PUBLISHING.md first. Club Arena source (for the help icon) = Smarter-Software-PIQ/Smarter-Poker-Club-Arena,
  file `public/images/header-help-v4.png` (git blob c11f1314e07d8496eb882ff264582966d8766775), used by its
  `src/components/help/PageHelp.tsx` (36px wide image in a 44px transparent button).
- Cloud sandbox: 8 GB RAM, 2 cores. `next dev --webpack` is too slow / OOMs. USE TURBOPACK:
  `NEXT_PUBLIC_SUPABASE_URL=https://kuklfnapbkmacvwxktbh.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy
   NODE_OPTIONS='--max-old-space-size=5000' node node_modules/next/dist/bin/next dev -p 3100`
  (first page ~15 s, later pages <1 s). Turbopack rejects a symlinked node_modules; for a second worktree
  hard-link it: `cp -al <main>/node_modules <worktree>/node_modules`.
- `next dev` rewrites next-env.d.ts — `git checkout next-env.d.ts` before committing.
- Playwright: `require('playwright')` from repo; launch with
  executablePath `/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`
  (bundled version mismatch otherwise). Production smarter.poker is NOT reachable from the sandbox (proxy 403).
- Capture tooling written this session (outside repo, recreate if lost):
  * /home/claude/batch.mjs <outdir> <routesFile> [width] — signed-in stub session in localStorage
    `smarter-poker-auth`, aborts *.supabase.co, screenshots viewport, writes report.json with
    {route, header(bool data-header-art), art, help(bool chrome icon present), bad(forbidden-ink text list), h1}.
  * /home/claude/drive3.py SRV OUT ROUTES WIDTH — starts Turbopack server in SRV, runs batch until all routes
    captured (5 passes), merges into OUT/final.json.
  * /home/claude/shot.mjs — 4-page harness with mocked /api/training/challenges and /leaderboard data,
    states: populated|empty|error|signedout|help|ranges, includes forbidden-ink audit.
  * Route list: /tmp/all-routes.txt (91 routes = training pages + lobby + preflop + categories MTT/CASH +
    bankroll export + toke shift + bankroll trips). Pristine BEFORE worktree: /home/claude/wh-before (HEAD 3ef4e63).
  * BEFORE screenshots: /tmp/before-all/*.png (91 of 91, 393px) + /tmp/before/ (4 original pages).
    These /tmp files will NOT survive into a new session — regenerate from a worktree at 3ef4e63.

## 2. What is DONE (code, in the branch)
### 2.1 Shared components / styles
- `src/components/bankroll/BankrollHelp.jsx`: exports `HELP_ICON_SRC = '/images/smarterdesign/help-chrome.png'`;
  the "?" button now renders `<img className={styles.helpIcon} src={HELP_ICON_SRC}>` (no glyph).
- `src/components/bankroll/BankrollHelp.module.css`: `.help` = absolute top:3px right:3px, 44x44, transparent,
  `place-items: start end` (icon hugs corner, hit area grows inward); `.helpIcon` 34px + drop-shadow.
- `public/images/smarterdesign/help-chrome.png` = byte copy of Club Arena header-help-v4.png.
- `src/components/vip/VipKit.jsx` + `VipKit.module.css`: VipMasthead help uses the same icon/placement.
- `src/components/bankroll/BankrollImageHeader.jsx`: added `faqs` passthrough to BankrollHelp.
- `styles/smarterdesign.css` (global, imported in _app): `.sd-back-row`; `.sp-training-head`; `.sp-head-note`;
  hardening so `.sp-training-head` sd-buttons + help icon survive legacy shells (sp-training-command,
  intelligence rail, analysis tool); and an INTERIOR LAYER scoped to
  `.sp-training-page-stage:has(.sp-training-head)` that repaints inline-styled panels (border-radius 10–29px
  with a border) with the chrome-stat steel rim + navy fill and inline-styled buttons with chrome-row rims,
  cobalt when aria-pressed/selected/current. NOT YET VISUALLY VERIFIED — check it on every page.
- `src/components/training/TrainingImageHeader.jsx` — wraps BankrollImageHeader with art=slug, title/help from registry.
- `src/components/training/TrainingPageHead.jsx` — Back row ABOVE + image header + optional `nav`, `note`,
  `children` (actions inside header), `backHref`/`backLabel`/`onBack`; also exports `TrainingDailyNav`
  (Daily family tabs: Hand Of The Day, Daily Goals Vault, Weekly & Monthly Goals, Achievements Vault, Streaks Vault).
- `src/data/trainingImageHeaders.js` — registry slug → {title, help} for every Training page.
- `scripts/design/generate-training-header-art.py` — generates `public/images/smarterdesign/headers/
  <slug>-{seal,scene}.webp` (scene 1080x500 crop of platform renders; seal 352x352 auto-picked "most detailed
  square"; no shared scenes; seals exclude already-used subjects). 86 pairs. Re-run after editing SCENES.
  Hand-made pairs (not in generator): icm, preflop-charts, training-goals, training-leaderboard.
- `src/components/training/TrainingGameEntry.jsx` (18 small game entry pages) — back row + image header
  (art training-<route>) + description panel + Play; removed duplicate game art in body.
- `src/components/training/lobby/TrainingLobbyHeader.jsx` — lobby masthead now TrainingImageHeader
  slug training-lobby, title "Training Games", titleId hero-h, Quick Play/Fix Top Leak as children.
- `src/components/memory-games/PreflopSubpageShell.jsx` — sub pages get own art (preflop-stats/-leaderboard/
  -achievements/-tutorial); subnav moved UNDER the header; "Back To Preflop Charts" stays above.
- `pages/hub/memory-games.js` (Preflop Charts lobby) art preflop-charts + big #SMARTERDESIGN layer appended to
  `src/styles/worlds/memory-games.css` (rims, cobalt, ice accents, no gold/purple).
- `src/components/seo/AiPromptLauncher.js` — gold "Universal Search" link recoloured ice.
- Bankroll: `pages/hub/bankroll-manager.js`, `pages/hub/bankroll-manager/export.js`,
  `src/components/bankroll/toke/TokeWorkspace.jsx` — Back To Dashboard moved to `.sd-back-row` above header.
### 2.2 Pages converted to TrainingPageHead (header art slug = training-<file> unless noted)
achievements, aggregate, autopilot, challenges(training-goals), coach-mode (hero replaced; lesson h1→h2),
community-leaderboard, custom-rake, custom-solve, daily-challenge (countdown child), daily-goals, drill-builder,
famous-finals, flashcards, focus-timer, glossary, gto-news (Saved bookmarks toggle child), gto-preloader,
hand-comparison (Clear All child), hand-history-upload (PA back target), icm-calculator(slug icm),
icm-simulator, jarvis, leaderboard(training-leaderboard), live-hud-sync, mental-journal, milestones (counter),
multi-table (setup screen), multiway-preflop (How It Works child), my-playbook (counter/offline), position-mastery,
preflop-charts (training-range-browser, How It Works child), progress, pvp-lobby, qre-explorer, quick-warmup,
quiz-builder, rake-solutions, range-builder, replay-theater, reports (PA back), risk-analyzer, scenario-demo
(How It Works moved into help; ProgressStrip child), session-dashboard, session-notes, session-warmup (all h1→h2),
short-deck-trainer (How It Works child), skill-tree (mastery readout), spot-trainer (PA back label), streaks
(3 branches), study-group, study-group-finder (+ Create Group child), study-plan (New Plan + status), table-wizard,
tilt-guard, tournament-prep, tournaments, training-calendar, training-feed, weakness-scanner,
category/[categoryId] (art training-category-<id lower>, Play Now quickbar under header),
equity-calculator & hand-lab keep BankrollImageHeader but now own art (training-equity-calculator / training-hand-lab).
Header disclosures preserved as `note=` (e.g. "Transparent Teaching Model • Not A Solver • Not Strategy Advice").
Removed dead back-arrow icon helpers flagged by the inventory; inventory regenerated
(`node scripts/training-surface-inventory.mjs --write` → .agent/audits/2026-08-31-training-phase-2-inventory.json).
Ink sweep: forbidden gold/purple text colours and tints in pages/hub/training/*.js turned ice (#86daff /
rgba(134,218,255,a)). Shared src/components/training/* were deliberately NOT swept (range charts use colour meaning).
### 2.3 Docs/tests
- docs/SMARTERDESIGN.md + .agent/skills/smarterdesign/SKILL.md: two new standards (chrome help icon; Back above header).
- NEW law test `__tests__/smarterdesign-image-header-help-and-back.law.test.mjs` (blob hash of icon, icon markup,
  corner CSS, no Back To Dashboard inside BankrollImageHeader) — registered in `__tests__/_test-guards-exist.test.mjs`.
- Updated tests that pinned retired markup: daily-challenges-casino-realism, training-community-phase-11,
  training-intelligence-phase-10, aeo-traffic-expansion-master, training-analysis-suite-phase-8,
  training-phase-3/4-adversarial, the-home-page-title-and-share-image-are-honest.law, training-runtime-wiring,
  training-reconciled-workflows, training-card-visual-contract, training-casino-realism-catalog,
  training-learning-journey-phase-9. docs/business-hub-guide-review.json hash for bankroll-manager.js updated
  (placement-only change; guide claims unaffected).
- Targeted suite (179 files touching these areas, list via grep of paths) shows ZERO new failures vs main
  (main already has ~102 pre-existing failures in that set). eslint: 0 errors.

## 3. What is NOT done (do these in order)
P1. Start Turbopack server on the branch; run AFTER capture for /tmp/all-routes.txt (393px, and 1280px for a
    sample). For EVERY page check: image header present with own seal/scene; chrome "?" in top-right corner not
    touching rim; Back row above header (never inside); title not duplicated by an old in-page title; no lost
    controls; report.json `bad` (forbidden ink) empty; interior layer did not break layouts (cards/chips,
    tables, range grids, game tables). Fix at source; re-shoot.
P2. Known risks to inspect: interior layer `:has()` selector over-reach (range grids/heatmaps with radius ≥10,
    card pickers); pages whose main container has large top padding above the head (live-hud-sync, pvp-lobby,
    table-wizard, famous-finals, aggregate) — reduce padding; coach-mode lesson views; multi-table playing view;
    session-warmup absolute-positioned layout; category page CSS leftovers (.sp-category-hero-*) now unused —
    delete; scenario-demo `infoOpen` removed (BottomSheet import removed) — verify; study-plan subcomponent
    `{/* Header */}` at line ~288 is a card header (not touched, correct).
P3. Interior #SMARTERDESIGN depth: the first four pages got bespoke interiors (src/styles/training/
    training-smarterdesign.module.css). The other ~80 rely on the shared interior layer only — Dan expects the
    "same improvements"; upgrade the highest-traffic pages' interiors to the module classes (lobby, daily
    family, progress, streaks, achievements, jarvis, reports, flashcards, range-builder, equity calc, hand lab).
P4. Seal quality: auto-cropped seals are scene crops, not iconic emblems; replace weak ones (dark/empty) with
    better crops or purpose-made art; verify uniqueness test (__tests__/bankroll-mobile-upgrades.test.mjs).
P5. Remaining gold/purple text in shared components rendered on these pages (from audit) — fix at source
    carefully (do NOT recolour chart action semantics like 3-bet/call cells; those are fills, not text).
P6. Build the deliverable for Dan: LIST of every page (section 4) with status + BEFORE/AFTER sheets
    (Pillow, before left/after right, 393px on black), send in chat via SendUserFile, then on approval push/merge
    per PUBLISHING.md and verify live (Vercel deployment READY, /api/health revision, live screenshots).
P7. Report found defect (not fixed, product call): /api/training/leaderboard ranks by accuracy with no minimum
    sample (1 question at 100% beats 738 correct). Recommend minimum answers threshold.

## 4. THE PAGE LIST (route → header slug → status)
Status legend: H = image header + chrome ? + back-above done in code; V = visually verified AFTER; I = bespoke interior.
- /hub/training/icm-calculator → icm → H V I
- /hub/preflop-charts → preflop-charts → H V I (lobby CSS layer)
- /hub/training/challenges → training-goals → H V I
- /hub/training/leaderboard → training-leaderboard → H V I
- /hub/training (lobby) → training-lobby → H
- /hub/training/category/{MTT,CASH,SPINS,PSYCHOLOGY,ADVANCED} → training-category-<id> → H
- /hub/preflop-charts/{stats,leaderboard,achievements,tutorial} → preflop-<x> → H
- Game entry pages (TrainingGameEntry) → training-<route> → H: blind-defense, bluff-catcher, bounty-trainer,
  ev-trainer, final-table-sim, frequency-locking, gto-vs-exploitative, icm-final-table, mixed-strategy-lab,
  multiway-postflop, nodelocking, player-profiles, pot-geometry, preflop-advisor, range-advisor, spr-trainer,
  three-way-postflop, villain-range
- Full pages → H: achievements, aggregate, autopilot, coach-mode, community-leaderboard, custom-rake,
  custom-solve, daily-challenge, daily-goals, drill-builder, equity-calculator, famous-finals, flashcards,
  focus-timer, glossary, gto-news, gto-preloader, gto-reports(=reports), hand-comparison, hand-history-upload,
  hand-lab, icm-simulator, jarvis, live-hud-sync, mental-journal, milestones, multi-table, multiway-preflop,
  my-playbook, position-mastery, preflop-charts(range browser), progress, pvp-lobby, qre-explorer, quick-warmup,
  quiz-builder, rake-solutions, range-builder, replay-theater, reports, risk-analyzer, scenario-demo,
  session-dashboard, session-notes, session-warmup, short-deck-trainer, skill-tree, spot-trainer, streaks,
  study-group, study-group-finder, study-plan, table-wizard, tilt-guard, tournament-prep, tournaments,
  training-calendar, training-feed, weakness-scanner
- Also changed (help icon / back row): Bankroll Manager (all sections), Toke Tracker, Export, VIP pages,
  Poker Tools odds calculator, Jarvis Insights (bankroll), Dealer Reference.
- Excluded on purpose: redirects (analyzer, bankroll-coach, ev-heatmap, gto-scorecard, performance-heatmap,
  play-mode, quiz-gauntlet, range-explorer, solutions, daily-goals? NO—daily-goals is a page), dynamic game
  tables /hub/training/arena/[gameId], /play/[gameId], /tournament/[id], /clinic/[clinicId] (table contract).

## 5. Verification commands
- Lint: `npx eslint <files>` (0 errors expected).
- Targeted tests: grep tests referencing pages/hub/training|components/training|BankrollHelp|BankrollImageHeader|
  VipKit|PreflopSubpage|memory-games|smarterdesign|TokeWorkspace|bankroll-manager|worlds/training|
  TrainingLobbyHeader|TrainingGameEntry|SMARTERDESIGN → run `node --test --test-concurrency=1 <files>` on branch and
  on a 3ef4e63 worktree; diff `not ok` names; must be no NEW failures.
- Art: `python3 scripts/design/generate-training-header-art.py` then
  `node --test __tests__/bankroll-mobile-upgrades.test.mjs` (unique seal/scene bytes).
- Inventory: `node scripts/training-surface-inventory.mjs --write` then the two inventory tests.
