# HANDOFF: #SMARTERDESIGN Training follow-ups (seals, leaderboard minimum, Live HUD title)
Written 2026-11-27 23:20 Central (2026-11-28 05:20 UTC). Continue from here. Do not start over.

## 0. Bookmark
- Repo: GitHub `Smarter-Poker/Smarter-Poker-World-Hub` (Next.js 16 pages router). Attach with push access.
- Branch with ALL of this work: `bookmark/training-followups-2026-11-28`, one commit on top of main
  `6f0b657d`. The `bookmark/` prefix keeps the agent autopilot from opening or auto-merging it
  (CLAUDE.md section 11.4, `.github/scripts/unfinished-work-guard.sh`).
- **NOTHING in this follow-up is merged or live. The database migration is NOT applied.**
- When finished, ship it from a branch WITHOUT `bookmark/`, `handoff/` or `wip/` in the name (for example
  `agent/training-followups`). The autopilot opens the PR and squash-merges it when the required checks pass.
  Any push to a non-bookmark agent branch counts as a release.
- Commit author MUST be `Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>` (CHECK 15).
  End commit messages with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01UxDLnLwQMGfYtuspZWhkeh`.

## 1. Owner (Dan) orders in force
1. 2026-11-27 19:34 Central: "APPROVED" (the #SMARTERDESIGN Training rollout sheets). DONE: it shipped as PR #3204,
   merge `e7892a3b`, Vercel `dpl_GJTgcsgd9sGG4rVCzctKr1jdYATQ` READY, live on smarter.poker from 22:52 Central.
   /api/health reported `e7892a3b`, and 91 routes were checked live (see section 6).
2. 2026-11-27 23:08 Central: "FINISH UP ANY AND ALL UNFINISHED WORK, AND THEN GO AHEAD AND FULLY BUILD, FIX AND
   ENHANCE ALL OF THESE AND MAKE SURE THEY ARE FULLY WIRED IN AND TESTED BEFORE CLAIMING SUCCESS. YOU DECIDE THE BUILD
   ORDER. LAUNCH A SWARM IF IT WILL HELP." "These" = the three open items:
   A. The Training header seals (round emblem on the left of each image header) were murky scene crops. They need
      purpose-made iconic emblems.
   B. The Training leaderboard ranks by accuracy with no minimum sample (1 correct answer at 100% outranks 738 correct).
   C. The Live HUD Sync page header said "Hand History Import".
3. Standing preferences: decide yourself, never hand Dan a step an agent can do, never idle (work while CI runs),
   give every time in Central, finish and verify end to end before claiming success, premium 3D metallic look,
   no gold/yellow/amber/purple/pink text anywhere (#SMARTERDESIGN).

## 2. State of each item (on the bookmark branch)
### C. Live HUD Sync title: CODE DONE, not live
- `src/data/trainingImageHeaders.js` `training-live-hud-sync`: the title is now 'Live HUD Sync', and the help text
  explains that beacon/Bluetooth are not connected and that Hand History Import brings hands into reports.
- `pages/hub/training/live-hud-sync.js` line ~203: the panel h2 was a duplicate "Live HUD Sync" and is now
  "Not Connected Yet".
- TODO: screenshot /hub/training/live-hud-sync after shipping.

### A. Seals: CODE AND ART DONE, needs a visual check in the pages, then ship
- New `scripts/design/render-training-seals.mjs`. It renders each seal as one bold lucide icon (lucide-react is
  already a dependency, ISC licence). The look is polished chrome stroke with a specular bevel, a dark outline,
  a cobalt glow and a drop shadow on the ink-navy radial field. Output is 352x352 webp at
  `public/images/smarterdesign/headers/<slug>-seal.webp`.
  - `SEAL_ICONS` maps the 86 slugs to icons. Duplicates are refused. The four hand-made seals
    (icm, preflop-charts, training-goals, training-leaderboard) and the Bankroll family are NOT touched.
  - Run `node scripts/design/render-training-seals.mjs` (all) or `... <slug> <slug>` (some).
  - Alias icons such as `pie-chart` and `circle-help` are re-export files with no `__iconNode`. Always name the
    real icon (`chart-pie`, and so on); the test checks this.
  - quiz-builder uses `puzzle`, because a "?" emblem would clash with the header help "?".
- All 86 seals were re-rendered and are in the branch (the 86 modified `*-seal.webp` files).
- `scripts/design/generate-training-header-art.py` no longer writes seals unless run with `--crop-seals`;
  it only writes scenes.
- New guard test `__tests__/training-header-seals-are-emblems.test.mjs`, registered in
  `__tests__/_test-guards-exist.test.mjs`. It checks that every registry slug has a seal file, every non-hand-made
  slug is declared, there are no duplicate icons, no alias icons, and the generator does not overwrite emblems.
  It passes (4/4). `__tests__/bankroll-mobile-upgrades.test.mjs` (unique bytes) passes (11/11).
- Images for review (in the branch):
  - `.agent/handoffs/2026-11-28-training-followups/seals-new-emblems.webp`: contact sheet of all 86 new seals with labels.
  - `.agent/handoffs/2026-11-28-training-followups/seals-old-scene-crops.webp`: the old crops, for comparison.
  - `.agent/handoffs/2026-11-28-training-followups/seal-render-sample.webp`: 4 at full size.
- Tried and failed: Vercel AI Gateway image generation (`mcp__Vercel__generate_ai_gateway_image`, team
  `team_SVD8r7AOPH065G3usBxVvrBc`) returns 401 for this connection, and nothing was billed. Do not retry; the lucide
  render is the shipped approach.
- TODO A1: render a few pages at 393px and 1280px and confirm the seal reads well inside the round chrome frame
  (BankrollImageHeader `.seal`). Check the ones whose icons are thin: three-way-postflop `triangle`,
  pot-geometry `triangle-right`, session-notes `sticky-note`. Swap any weak icon in `SEAL_ICONS` and re-run.

### B. Leaderboard minimum sample: CODE DONE + tests updated, MIGRATION NOT APPLIED, not live
- New `src/lib/training/leaderboardQualification.mjs`:
  - `LEADERBOARD_MIN_QUESTIONS = { daily: 20, weekly: 50, monthly: 100, alltime: 100 }`;
    `minQuestionsForPeriod(period)`; `qualificationFor(answered, period)` returns
    `{minQuestions, qualified, questionsToQualify}`.
  - These thresholds were my decision under Dan's "you decide".
- `pages/api/training/leaderboard.js`:
  - Read 1, RANKED: rows with questions_answered >= min, ordered by accuracy desc, questions_correct desc,
    user_id asc, limit N.
  - Read 2, PROVISIONAL (only if read 1 did not fill N): rows with questions_answered < min, ordered by
    questions_correct desc, accuracy desc, user_id asc.
  - Every entry gets `qualified` and `questionsToQualify`; the response gets `minQuestions`.
  - The viewer's rank now calls `fn_training_verified_leaderboard_rank_v3` with `p_min_questions`.
- New migration `supabase/migrations/20261128060000_training_leaderboard_minimum_sample.sql`:
  - Additive, Tier 2. Creates `fn_training_verified_leaderboard_rank_v3(uuid,text,text,text,text,integer)` with
    the same two-tier order and the same myEntry as v2, plus `qualified` / `minQuestions` / `questionsToQualify`.
  - EXECUTE is service_role only (revoked from PUBLIC, anon and authenticated). It ends with a DO-block assertion
    and has a rollback note. v2 is untouched.
  - **NOT APPLIED.** Until it is applied, the deployed API would 500 for signed-in viewers, because the RPC is
    missing. So APPLY THE MIGRATION BEFORE MERGING.
  - How to apply:
    1. Use the Supabase MCP `apply_migration` (project `kuklfnapbkmacvwxktbh`), name
       `training_leaderboard_minimum_sample`.
    2. Do it OUTSIDE :50-:03 UTC. The database refuses DDL then; never loop retries (CLAUDE.md 1.2).
    3. Then read back with `execute_sql`:
       `SELECT to_regprocedure('public.fn_training_verified_leaderboard_rank_v3(uuid, text, text, text, text, integer)')`
       and
       `SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5`.
    4. Smoke-test it: `SELECT public.fn_training_verified_leaderboard_rank_v3('<a real user id from
       training_verified_leaderboard>','alltime','alltime','overall','overall',100)`.
- `pages/hub/training/leaderboard.js`:
  - Imports Fragment and `LEADERBOARD_MIN_QUESTIONS`. The SWR result carries `minQuestions`.
  - The heading says "Ranked By Accuracy · N+ Answers". A divider row
    (`data-provisional-divider`, class `sd.boardDivider`) appears before the first provisional row.
  - Provisional rows have `data-provisional="true"`, no podium cobalt, the aria "Provisional place N" and
    " · X More To Rank".
  - When the viewer is provisional, the top metrics read "Your Place (Provisional)" and "Answers To Rank";
    otherwise "Players Ranked" counts only ranked rows.
  - The TRAIN-LEADERBOARD-A11Y-1 audit marker comment is kept (CI guards it).
- `src/styles/training/training-smarterdesign.module.css`: adds `.boardDivider`,
  `.boardRow[data-provisional='true'] .rankBadge` and `.provisionalNote`.
- `src/lib/training/publicLeaderboardSeed.mjs`: the server-rendered seed keeps `qualified`, `questionsToQualify`
  and `minQuestions` (only when it is an integer, so existing deep-equal tests hold).
- Tests updated:
  - `__tests__/training-verified-leaderboard.test.mjs`: the mock supports gte/lt/order/limit. There are new tests
    for "738 ranked above 1-of-1 provisional", the v3 migration and its grants, and the threshold values. The rpc
    name is now v3 with `p_min_questions: 50` for weekly.
  - `__tests__/training-legacy-authority-boundary.test.mjs`: the read route may call v2 or v3, and the
    qualification module is stubbed.
  - These tests need `node --experimental-vm-modules --test ...`; without the flag, SourceTextModule fails.
  - Result: the leaderboard set (6 files) passes 58/58; the leaderboard-related set passes 188 of 190, and both
    failures were the seed shape, now fixed (a-leaderboard-shows-its-leaders 9/9).

## 3. Exact next steps, in order
1. Check out `bookmark/training-followups-2026-11-28`.
2. Set up the sandbox (`.agent/handoffs/2026-11-27-smarterdesign-tools/README.md`):
   - `npm ci --ignore-scripts --no-audit --no-fund`
   - `npm install --no-save --ignore-scripts @next/swc-linux-x64-gnu@16.3.3`
   - apply the local `setup-dev-bundler.js` sed patch from that README
   - start the Turbopack dev server on :3100 with the dummy anon key
3. Run the full targeted suite on the branch AND on a main worktree (`git worktree add ../wh-main origin/main`
   + `cp -al node_modules`), then diff the `not ok` names. There must be no new failures.
   - File list: `grep -rlE "pages/hub/training|components/training|smarterdesign|trainingImageHeaders|leaderboard|header-help|image-header" __tests__ tests`.
   - Command: `node --experimental-vm-modules --test --test-concurrency=1 <files>`.
   - The main baseline has about 99 pre-existing failures; that is normal.
4. TODO A1: visual check of seals and the Live HUD Sync title. Capture with
   `node .agent/handoffs/2026-11-27-smarterdesign-tools/batch.mjs <outdir> <routesFile> 393`
   (signed-in stub, Supabase aborted). Route list: every route in
   `.agent/handoffs/2026-11-27-smarterdesign-screenshots/after-all-393/report.json`. The batch audit accepts the
   `header-help` icon.
5. Leaderboard UI check: there is no live data in the sandbox. Mock `/api/training/leaderboard` with
   Playwright `page.route` returning one ranked and one provisional row, and confirm the divider and labels.
6. Apply the migration (section 2B) outside :50-:03 UTC, and read it back.
7. Run `node scripts/ci/check-title-case.mjs` (it passed at handoff),
   `node scripts/training-surface-inventory.mjs --write` (regenerate the inventory after page edits) and eslint on
   the changed files.
8. Rebase or merge onto current origin/main. Other agents land Training changes constantly (#3213, #3216, #3228);
   the inventory JSON usually conflicts, so take theirs and regenerate. Then push to `agent/training-followups`
   (NOT bookmark).
   - Watch the PR checks. "Chromium and WebKit footer contract" fails on every PR, including main's recent ones,
     because of video-library and personal-assistant specs; that is pre-existing and not ours.
   - Pre-Deploy Safety Checks, Vercel Build Parity, the audit-marker registry and TypeScript must be green.
9. After the merge: confirm the Vercel `hub-vanguard` production deployment is READY for the merge sha (Vercel MCP
   `list_deployments` with projectId `prj_op66GkZyZcygXQKm76iyycfVFAQx`), and that
   `curl https://smarter.poker/api/health` shows the sha. Live-screenshot /hub/training/leaderboard,
   /hub/training/live-hud-sync and a sample of seals (smarter.poker IS reachable from the sandbox with curl or
   Playwright; WebFetch needs approval).
10. Report to Dan with Central times, live screenshots, and what changed.

## 4. Context from the rollout (already shipped)
- Previous handoff: `.agent/handoffs/2026-11-27-smarterdesign-training-rollout.md` (sections 0-6) and the
  page list `.agent/handoffs/2026-11-27-smarterdesign-page-list.md`.
- Screenshots:
  - `.agent/handoffs/2026-11-27-smarterdesign-screenshots/`: `before-all-393/` (true before, from 3ef4e63 with
    the soundManager fix), `after-all-393/` (main-integrated tree), `after-1280/`, `sheets/rollout/sheet-01..11.webp`
    (before/after), and `reference/` (Dan's attachments; CORRECT/WRONG "?" icons).
  - The live-site sheets were sent in chat and are not saved in the repo. Regenerate with `/tmp/livebatch.mjs`
    logic: Playwright against https://smarter.poker, 393px, `img[src*="header-help"]` audit.
- Shared pieces you will touch:
  - `src/components/training/TrainingPageHead.jsx` (Back row above + image header)
  - `src/components/bankroll/BankrollImageHeader.jsx` (seal/scene/help; `back` prop from #3168)
  - `SD_HEADER_HELP_ICON` in `src/components/smarterdesign/headerHelp.js`; `.sd-header-help` in
    `styles/smarterdesign.css`
- Known leftovers, not in scope unless Dan asks:
  - `src/styles/worlds/training.css` `[data-stats-grid]` phone rule forces 2 columns globally.
  - training.css ~2702 sd-button background rules use high-specificity !important.
  - The RangeGrid header pill is still rounded.
  - Unused `public/images/training/lobby/arena-{mode,filter,row-rim}.webp`.
  - Quiz Builder select accessible names are swapped (pinned by training-phase-3-adversarial).
  - Mental Journal says "1 Cups".
  - CHECK 21 (public/ budget) is already over on main; it does not block merges and is pre-existing.
- Do NOT: force-push (the classifier denies it); edit `docs/business-hub-guide-review.json` hashes without a real
  guide review (the classifier denied an automatic bump); create Claude scheduled tasks (CLAUDE.md 10.9).

## 5. Files changed on the bookmark branch (stage exactly these)
- pages/api/training/leaderboard.js
- pages/hub/training/leaderboard.js
- pages/hub/training/live-hud-sync.js
- src/lib/training/leaderboardQualification.mjs (new)
- src/lib/training/publicLeaderboardSeed.mjs
- src/styles/training/training-smarterdesign.module.css
- src/data/trainingImageHeaders.js
- supabase/migrations/20261128060000_training_leaderboard_minimum_sample.sql (new)
- scripts/design/render-training-seals.mjs (new)
- scripts/design/generate-training-header-art.py
- public/images/smarterdesign/headers/*-seal.webp (86 re-rendered)
- __tests__/training-header-seals-are-emblems.test.mjs (new)
- __tests__/_test-guards-exist.test.mjs
- __tests__/training-verified-leaderboard.test.mjs
- __tests__/training-legacy-authority-boundary.test.mjs
- .agent/handoffs/2026-11-28-training-followups/* (review images)
- .agent/handoffs/2026-11-28-training-followups-HANDOFF.md (this file)
- .agent/handoffs/2026-11-27-smarterdesign-tools/batch.mjs (audit accepts the header-help icon)

## 6. Live verification of the shipped rollout (for reference)
- Of 91 routes checked on https://smarter.poker (signed out, 393px), 90 show an image header with the chrome "?"
  in the corner and the Back row above it. Table Wizard redirects to the arena by design. There is no horizontal
  overflow.
- A sign-up banner appears for signed-out visitors (main's #3236 growth work); this is expected.
- PR #3171 (the old branch) was closed as superseded by #3204.

## 7. Status update 2026-11-28 (continuation session)

- A (seals) and C (Live HUD Sync title) SHIPPED: PR #3273, merge 4504861d,
  Vercel dpl_FuVNbjYcx94jAoV7A1846oRPX1eL READY, /api/health reported
  4504861d at 02:29 Central. Live seal bytes match the repo files. All 91
  routes were captured at 393px before shipping, a sample at 1280px; every
  emblem reads as one subject-matched icon, so no icon was swapped.
- Preflop Charts Stats gold text: fixed on main by another agent in the
  same hour; their version was kept.
- B (leaderboard minimum) ships as its own PR. The database now also refuses
  DDL during a nightly release schema freeze, 23:45-04:15 America/Chicago
  (smarter_private.fn_ca_release_freeze_ddl_guard), in addition to the hourly
  :50-:03 UTC window. The v3 migration is applied after 04:15 Central and
  verified BEFORE the leaderboard PR is pushed.
