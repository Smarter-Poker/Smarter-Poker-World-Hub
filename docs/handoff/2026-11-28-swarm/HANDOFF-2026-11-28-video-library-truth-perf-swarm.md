# HANDOFF: World Hub Video Library #SmarterDesign, Truth Sweep, Performance and CI Swarm

Written 2026-11-27 23:20 Central (2026-11-28 05:20 UTC) by the outgoing Claude session (session_01UxDLnLyJhQ4UcGZ3k6pajX).
Owner: Dan (Daniel Bekavac), Smarter.Poker. Every time you give Dan is in Central time (America/Chicago), never UTC.

Read this whole file before touching anything. Then read the repo instruction files named in section 2. Don't ask Dan to re-explain anything written here. Dan has given you full ownership: "YOU OWN THIS CODE BASE AND ANY AND ALL DECISIONS INSIDE OF IT... LAUNCH A SWARM TO HELP WITH ANYTHING AND EVERYTHING". His standing order for this programme: "FINISH UP ANY AND ALL UNFINISHED WORK, AND THEN GO AHEAD AND FULLY BUILD, FIX AND ENHANCE ALL OF THESE AND MAKE SURE THEY ARE FULLY WIRED IN AND TESTED BEFORE CLAIMING SUCCESS. YOU DECIDE THE BUILD ORDER. LAUNCH A SWARM IF IT WILL HELP."

---

## 0. WHERE THIS FILE AND THE BOOKMARK LIVE

- Bookmark branch (pushed, never auto-PRs because of the `handoff/` segment): `handoff/claude/vl-swarm-2026-11-28` in `Smarter-Poker/smarter-poker-world-hub`.
- This file: `docs/handoff/2026-11-28-swarm/HANDOFF-2026-11-28-video-library-truth-perf-swarm.md` on that branch.
- In-progress work saved as patches: `docs/handoff/2026-11-28-swarm/patches/` (section 6).
- Images: `docs/handoff/2026-11-28-swarm/images/` (live after-shots) and `docs/handoff/2026-11-27-images/` (20 before/after shots, already on main; section 9).
- Swarm rules every sub-agent was given: `docs/handoff/2026-11-28-swarm/SWARM-RULES.md`.
- Previous handoff (the one this session started from): `docs/handoff/2026-11-27-video-library-smarterdesign-HANDOFF.md` (on main).
- Do NOT merge this bookmark branch into main. It is evidence and patches only. Pick work out of it into fresh branches.

### First commands for the next agent
```
git clone --depth 50 https://github.com/Smarter-Poker/smarter-poker-world-hub wh && cd wh
git fetch --depth 5 origin handoff/claude/vl-swarm-2026-11-28 && git checkout -b handoff-read FETCH_HEAD
cat docs/handoff/2026-11-28-swarm/HANDOFF-2026-11-28-video-library-truth-perf-swarm.md
git checkout -B work origin/main     # never build on the handoff branch
gh api "repos/Smarter-Poker/smarter-poker-world-hub/pulls?state=all&per_page=30&sort=updated&direction=desc" --jq '.[]|"\(.number) \(.state) \(.merged_at) \(.head.ref) \(.title)"' | head -30
curl -s https://smarter.poker/api/health
```
Cloud sessions: attach the repo with the add_repo tool (`Smarter-Poker` / `smarter-poker-world-hub`, access push) first. The session's git proxy allows only 2 concurrent transfers for this repo, so clone ONCE, give it a ~10 minute timeout, and use `git worktree add` (not more clones) for parallel agents. Push with `git -c push.negotiate=true push -u origin BRANCH`.

---

## 1. MISSION HISTORY: ALL PHASES (what Dan asked for, in order)

| # | Dan's ask (Central time, 2026-11-27) | Status |
|---|---|---|
| P0 | Club Arena Player Stats page clean-up (remove "Cash"/"Tournament" tags inside boxes, "BB/100 Hands", bigger centred stats, explanations behind "?") | DONE in an earlier session. Club Arena PR #12227, merge e3197d5, published. Live page never eyeballed by an agent (WebFetch was blocked). |
| P1 | Video Library (https://smarter.poker/hub/video-library and all sub pages) done "THE SAME WAY AND SAME STYLE" as Player Stats | DONE, LIVE. Section 3. |
| P2 | 16:43 "YOU OWN THIS CODE BASE... LAUNCH A SWARM" | Authority grant. Applies to everything below. |
| P3 | 19:36 "APPROVED" (Video Library screenshots) | Approved. |
| P4 | 19:56 Round 2: finish unfinished work + build all suggested improvements | DONE, LIVE. Section 4. |
| P5 | 22:21 Round 3: finish unfinished + build all new suggestions | PARTLY DONE. Section 5 has the exact state of every lane. |
| P6 | 23:17 This handoff + bookmark | This file. |

---

## 2. RULES YOU MUST FOLLOW (Dan's, plus the repo's)

Repo instruction files (read at task start): `CLAUDE.md`, `AGENTS.md`, `AGENT-PLAYBOOK.md`, `docs/agent-policy/REFERENCE-INDEX.md`, `PUBLISHING.md`. Key repo facts:
- Production: Vercel project `hub-vanguard` (`prj_op66GkZyZcygXQKm76iyycfVFAQx`), auto-deployed from a protected squash merge to main. Verify with `https://smarter.poker/api/health` (`commitSha`) plus the Vercel MCP (`list_deployments`, projectId above). Never create a second Vercel project or a deploy hook.
- Supabase project `kuklfnapbkmacvwxktbh` (shared with Club Arena). NO DDL in the hourly break window :50 to :03 UTC (triggers refuse it). Migrations follow `.agent/workflows/migration-safety.md`: prove in a rolled-back transaction, assert counts, apply once, read back history with `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC`. Never edit an installed migration file (the schema-lineage check compares bytes).
- Commit author MUST be `Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>` (CHECK 15; otherwise the Vercel deploy is BLOCKED). Use `git -c user.name=Smarter-Poker -c user.email=254329056+Smarter-Poker@users.noreply.github.com commit ...`.
- Commit message trailer:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: <your session URL>
  ```
  PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)` plus your session URL.
- Never `--no-verify`, never `git stash`, never print secrets or env values, never read `.env*` values, never use Dan's personal account for probes.
- No emoji in source. Title Case for every player-visible word. No em dashes in UI text. No "$" in UI text. Never call AI players "bots" (they are horses).
- Code safety rules in CLAUDE.md section 3 (`.maybeSingle()` not `.single()`, no raw supabase-js in API routes, and so on).
- Footer is `position: fixed; bottom: 0` (CLAUDE.md rule 15). The header portrait ring is masked (10.4).
- New tests must be registered in `__tests__/_test-guards-exist.test.mjs`, or Pre-Deploy Safety Checks fails ("a test nothing runs"). Agents hit this repeatedly.
- `.agent/audits/2026-08-31-training-phase-2-inventory.json` often goes stale when files change. Regenerate it with its script's `--write` (the CI error names the script).

Dan's rules for this programme:
- **Release automation is LIVE, so pushing an agent branch means shipping.** The autopilot (`.github/workflows/agent-branch-proposal.yml`, `agent-open-pr.yml`, `agent-autopilot.yml`) opens a PR for a pushed agent branch within about a minute and squash auto-merges it once required checks pass. To park work WITHOUT shipping it, use one of: a branch with a `wip/`, `bookmark/` or `handoff/` path segment; a head commit subject starting `wip`, `[wip]`, `bookmark:`, `bookmark(`, `handoff:`, `handoff(` or `do-not-ship:`; a subject containing `[do-not-ship]`; a draft PR; or the `do-not-ship` label (`do-not-merge`, `hold` and `wip` labels also hold). Guard: `.github/scripts/unfinished-work-guard.sh`; test: `tests/unfinished-work-is-never-auto-merged.test.mjs`; documented in CLAUDE.md 11.4.
- #SmarterDesign: thin chrome border-image frames, ONE frame per section, never a framed card inside a framed section (stat readout tiles excepted). Never the bulky painted #ClubArenaConsole chassis for page sections. Centred, larger type. Explanations live behind the page's chrome "?" help tour; a line stays on screen only if it's a truthful, state-dependent warning the player needs right now.
- Every image header uses the Club Arena Cashier chrome "?" in its upper-right corner. "Back To Dashboard" goes above the header, never inside it.
- The Video Library index feed stays a plain YouTube-style grid (2026-10-11 ruling, test-enforced).
- The watch page MUST render a visible, non-autoplaying youtube-nocookie iframe in the server HTML (Google video indexing). No click-to-play facade. Pinned by `__tests__/video-library-watch-pages.test.mjs` (around line 102), `e2e/026` line ~118 and `e2e/028` line ~55 (`.vl-play-facade` count 0).
- Never fabricate data shown to players. If real data doesn't exist, don't invent it. Remove or reword instead.
- "FINISH THE JOB THEN TELL ME": no interim status reports, never idle while CI runs, never hand Dan a step an agent can do, never end with "want me to...". Decide and do.
- "DON'T JUST AGREE WITH ME, IF IM WRONG TELL ME." Fix at the root, harden against regression with a test.
- Dan's memory notes are in the session memory file `/areas/smarter-poker.md`, which the next chat should load automatically.

---

## 3. PHASE P1: VIDEO LIBRARY #SMARTERDESIGN (DONE, LIVE)

How it reached production: the earlier session's bookmark branch `bookmark/video-library-smarterdesign-2026-11-27` was auto-opened and auto-merged by the autopilot as **PR #3170** (merge `307eb2a5`, 2026-11-27 14:20 Central) WITHOUT Dan's approval and with an unfinished WIP pass. This session fixed forward rather than reverting; Dan later approved ("APPROVED", 19:36).

Shipped (all merged to main and live):
- **#3170** `307eb2a5`: shared mast `src/components/video-library/VideoLibraryWorkspaceHeader.jsx` + `.module.css` (Cashier chrome "?", props `title, eyebrow|context, helpSteps, helpTitle, helpId, art, emblem (play|channel|player|playlist|owner), id, children`), index redesign, sub-page redesign (`src/styles/worlds/video-library-pages.css`, scoped `.vl-console-page`, imported in `pages/_app.js`), and the WIP explanation/de-nest pass. Also merged the 20 handoff images to `docs/handoff/2026-11-27-images/`.
- **#3181** `ce886da0`: watch page meta chips and About facts de-nested (one frame per section); removed dead `text-transform: uppercase` (a site-wide capitalize rule overrides it).
- **#3188** `387ba16e`: watch meta line stacks under 520px; CLAUDE.md 11.4 corrected (the autopilot IS active).
- Live verification done at 375px and 1280px on index, channels, channel, players, player and watch: no framed box inside a framed section (stat readouts excepted), no horizontal overflow.

Pages and files:
- Index: `pages/hub/video-library.js` (also hosts Saved, History, Later, Cash and Tourneys bottom-nav views; they are NOT separate routes), `src/styles/worlds/video-library.css`, `src/components/video-library/{StudyStatus,MemberClipUpload,LiveNow}.jsx`.
- Sub pages: `pages/hub/video-library/channels/index.js`, `channels/[channelId].js`, `players/index.js`, `players/[playerId].js`, `playlists/[playlistId].js`, `owner.js`, `watch/[videoId]/[[...slug]].js`.
- Components: `WatchPlaybackTools.jsx`, `PauseQuiz.jsx`, `WatchTracking.jsx`, `ChannelFollow.jsx`, `VideoThumbnail.jsx`, `DeferUntilNear.jsx` (new, #3197).
- Chrome art: now served once from `public/images/smarterdesign/*` (duplicates under `public/assets/video-library/mast/` and `console-pages/` were deleted in #3197). Mast art: `public/assets/video-library/mast/video-library-mast-v1.webp`; the Cashier "?" is `header-help-chrome-v1.png`.

---

## 4. PHASE P4: ROUND 2 (DONE, LIVE)

| Item | PR / merge | What it does | Tests |
|---|---|---|---|
| Autopilot hole that shipped #3170 | #3182 `209ea636` | Guard script used by all three autopilot workflows; branch-segment, wip-subject and draft holds | `tests/unfinished-work-is-never-auto-merged.test.mjs` |
| Guard refinement | #3193 `70e1a57e` | Bare words "bookmark"/"unfinished" no longer hold work; explicit markers plus the `do-not-ship` label (created, colour b60205); labelled/unlabelled triggers | same test, 11/11 |
| Fake GTO decision table | #3194 `cc3fd612` | Removed the invented "04:18 Flop Check-Raise IP / Call 68%" style tables from `src/components/seo/SmarterAccountUnlockGate.jsx` (all 7 presets, about 160 pages); honest locked-feature list instead; removed false "715+", "Live Waitlists", "40/100/200BB" claims in the panel; "107 Free GTO Drills" verified (TRAINING_LIBRARY) | `__tests__/unlock-gate-shows-no-fabricated-data.law.test.mjs` |
| Watch page speed | #3197 `9da5c3f8` | Chrome art deduplicated, sign-up gate and CTA mount near the viewport (`DeferUntilNear.jsx`); about 125 KB less before scroll on phones (102 to 98 requests, 2.06 MB to 1.94 MB). No facade, by rule. | `__tests__/video-library-watch-performance.test.mjs` |
| Creator chapters | #3198 `0ac8edad` | Parser in `scripts/video_source_registry_ingest.py` (YouTube chapter format: 0:00 first, at least 3 entries, ascending, at least 10s apart), stored in `video_enrichment_records.chapters` with `source:'creator_description'`; worker never writes the fake "Video Start" again; watch page "Chapters" list on the Hand Timeline + "Pause At The Creator's Chapters"; `src/lib/videoLibraryChapters.mjs`; backfill via `deploy-openclaw.yml` dispatch input `creator_chapter_backfill_videos` (runs on Hetzner with the existing key; 6,160 scanned, 443 have chapters, 124 quota units). Migration `20261128030000_video_chapters_placeholder_cleared.sql` cleared 21,699 placeholder rows (its header says 22,131; correction recorded in `.agent/audits/2026-11-28-video-chapters-placeholder-cleared.md`). deploy-openclaw runs 46099487036 and 46099719295 succeeded. | `scripts/test_video_creator_chapters.py` (18), `__tests__/video-library-creator-chapters.test.mjs` (8) |
| Watch tracking e2e | #3206 `c3b648d2` | e2e/028 waits for "Resume Saved Position" and asserts the ready state is silent; `WatchTracking.jsx` renders nothing for unlabelled states | e2e/028 passes in all 3 browsers |
| False "715+ rooms" | #3210 `ed41e283` | Single source `src/lib/venueCount.mjs`; 63 files fixed; "Live Rooms" became "Poker Rooms" | `__tests__/the-room-count-is-real.law.test.mjs` |
| Video Library e2e copy contracts | #3211 `ec132380` | e2e/026 (quiz asserts "No Correct Answer Is Assigned To This Hand..."; player-page explanation absent from body) and e2e/023 (study readouts 2 Days / 7 / Counted) | all pass in chromium, mobile-chrome and mobile-webkit |
| Help tour standard + one-frame check | #3212 `1e995803` | `src/lib/videoLibraryHelpSteps.mjs` (frozen per-page steps, shared steps defined once); `data-tutorial="viewer"` on the index player; e2e `e2e/029-video-library-one-frame.spec.ts` via `scripts/qualification/videoLibraryOneFrameBrowser.mjs`, a step in `.github/workflows/global-footer-e2e.yml` (8 pages x 375/1280 = 16 cases); fixed the playlist position badge frame | `__tests__/video-library-help-steps.test.mjs` (9) |
| Venue claims truth | #3224 `43f8faf3` | "Verified" only beside the 69 verified; real state count; per-game floors; US wording; "Listed Rooms" column; `approxLiveRooms` deleted; ai-facts gains `venuesWithRecordedVerificationCount`, `venueStatesCount`; `usStatesCoveredCount` 51 = number of state guides (50 + DC), legitimate | `__tests__/the-venue-claims-are-real.law.test.mjs` (8) |

Also verified live by this session: tapping the "38:05 Phone Call With Tom Dwan" chapter on https://smarter.poker/hub/video-library/watch/21qPXhZqfs8 in a real browser jumped actual YouTube playback to 38:05 and kept playing; the chapter was highlighted.

---

## 5. PHASE P5: ROUND 3 (CURRENT STATE OF EVERY LANE)

Production at handoff: `/api/health` commitSha `6f0b657d1197716ef4532a14f44322c8b1019f05` (#3243).

### 5.1 Room counts maintain themselves + state pages: DONE, LIVE (#3243, merge `6f0b657d`)
- Headline is now "470+" (473 listed rooms in 40 states). The old 564 included 77 `series` + 13 `tour` rows + excluded duplicate id 3109.
- Single room filter: `src/lib/poker-near-me/listedRooms.mjs` (listed = is_active AND NOT is_suppressed AND venue_type NOT IN ('tour','series') AND the directory's exclusions). Used by `venueDirectoryServer.js` and the stats module.
- Live stats: `src/lib/server/venueStats.mjs` (via supabaseServerClient; 5 min cache; 5 s timeout; snapshot fallback). `getStateRooms()` for state pages.
- Snapshot + label rule: `src/lib/venueCount.mjs` (round DOWN: 473 gives "470+"; under 10 shows exact). Snapshot set to 471 so the pending reclassification migration can't push it above live.
- Live on request: `/poker-rooms`, `/poker-rooms/by-game/[game]`, `/facts`, `/api/ai/facts`, `/api/ai/freshness-ledger`. Hourly ISR: `/poker-rooms/states`, `/poker-rooms/states/[state]` (top rooms now live; the 473-row `data/poker-venue-directory-snapshot.json` is outage-only).
- Static crawler files rewritten at build by `scripts/refresh-venue-claims.mjs` (runs in `build:vercel` before `next build`; writes nothing if the DB doesn't answer).
- CI: `scripts/check-venue-count-snapshot.mjs` runs inside existing CHECK 25 (`scripts/ci/check-live-contracts.mjs`); fails if the snapshot is above live, warns if behind; `--print` emits replacement constants.
- ai-facts: `listedVenuesCount` (473) and `listedVenuesLabel` added; `verifiedVenuesCount` kept, deprecated.
- Test: `__tests__/the-room-counts-maintain-themselves.law.test.mjs` (11).
- Remaining gap: the AI markdown corpus (`src/lib/seo/markdownIngestion.mjs`, the `.md` URLs and `llms-*.txt` routes) and client-only labels still use the snapshot (never above live, but lagging). Optional follow-up: wire them to live stats.

### 5.2 Unchecked claims (research and guide figures): DONE, LIVE (#3246, merge `e01ac60f`)
- Merged 2026-11-27 ~23:25 Central; `/api/health` reported `e01ac60fa0f1ce4c31e847c5c489e4c12317defa` right after merge.
- Removes survey/audit/simulation results that never existed ("84% Of Surveyed Rooms", "92% Of Surveyed Rooms", "185,000+ Logged Hands", "50,000+/120,000+/250,000+ Simulated", waitlist "11.4 to 4.1 Min", "18% To 34% Overhead", every VPIP/3-bet/BB/100 figure). No survey, hand sample, waitlist log or simulation exists in the repo, the DB or the Zenodo deposit (the deposit is about 10 KB of page-text JSON per report).
- 15 research pages (`src/content/research/reports.js`) now declare a basis: 9 editorial guides, 4 computed (re-verified by enumeration in the law test; short deck corrected: 7-card flush 2.10% vs full house 7.58%, AA vs JTs 62.5%/66.8%, OESD 45.6%), 1 statute (W-2G: IRS W-2G instructions, IRS Topic 419, FinCEN CTR, P.L. 119-21 incl. the 2026 90% loss-deduction cap), 1 directory (tournament index from `venue_daily_tournaments`: 824 events, 147 venues, 29 states, week 2026-11-28 to 12-04, median buy-in 80).
- Whitepaper: 10 figures with basis (was 25); "AA Vs KK 85.20%" corrected to 81.3%. `/research/benchmarks`: invented scores and ranking removed. "4,500+ weekly tournaments" (about 40 instances, 8 languages) is now `WEEKLY_TOURNAMENT_LABEL` "800+". "10M+ Simulated Hands" removed.
- Dead DOI 10.5281/zenodo.15129481 (404, about 87 citations) replaced by the real deposit 10.5281/zenodo.24115647, labelled as an archive of earlier page text.
- Guides: room counts via `listedVenueLabel()` (live via #3243); market table totals removed; per-venue table counts only where `poker_tables` has data (`src/lib/research/venueTablesOnFile.mjs`, 24 venues; DB wins: Borgata 85, Bellagio 40, Talking Stick 25, WinStar 46).
- New modules: `src/lib/research/{tournamentDirectoryFacts,shortDeckFacts,holdemFacts,venueTablesOnFile}.mjs`, `scripts/research/short-deck-math.mjs`. Law test `__tests__/the-research-figures-are-real.law.test.mjs` (10/10, registered).
- Market page Indiana 2026 income tax 2.95%: verified by this session against the Indiana Department of Revenue (in.gov/dor rates page: "2026 is 2.95% and will adjust in 2027 to 2.90%").
- Left open: the Zenodo deposit itself still contains the old fabricated figures (it is labelled superseded on the site; publishing a new Zenodo version would fix it, and needs Dan's Zenodo account). Not reviewed: room house rules (rake/buy-in caps), tax rates and legal ages elsewhere, learn-content stats in non-research datasets (e.g. "OMC 8% To 13% VPIP"), platform feature counts (52 calculators, 70 MCP tools, 107 games; 107 is verified).

### 5.3 Site-wide load performance: IN PROGRESS, NOT COMMITTED (saved as a patch)
- **UPDATE 23:30 Central:** the sub-agent pushed `agent/claude/r3-perf2` (head f527182f) as **PR #3252** (open merged=null head=f527182f6 labels=). Prefer the PR over the patch: check its state and CI; if merged, verify live and re-measure; if open or red, finish it on that branch. The patch below is only a fallback if that branch is lost.
- Worktree was `/home/claude/wt-perf2`, branch `agent/claude/r3-perf2` (NOT pushed), base sha in `patches/r3-perf2-BASE-SHA.txt`.
- Saved state: `patches/r3-perf2-uncommitted-tracked.patch` (tracked-file diff, binary-safe) + `patches/r3-perf2-untracked-files.tgz` (new files).
- Files touched: `next.config.js`, `pages/_app.js`, all 8 Video Library pages, `public/default-avatar.png`, `src/audio/SoundEngine.ts`, `src/components/ui/ToastContainer.js`, `src/components/ui/UniversalHeader.js`, `src/world/components/CinematicIntro.tsx`, `__tests__/_test-guards-exist.test.mjs`, `__tests__/video-library-owner-panel.test.mjs`, the training inventory. New: `__tests__/site-wide-payload-budget.test.mjs`, `public/images/global-header/global-header-desktop-{824,1200,1648}.*.avif`, `public/images/global-header/header-default-avatar-192.*.png`, `src/components/ui/ToastStack.js`, `src/lib/build/`.
- Goal and brief: production measured about 245 KB shared _app JS, about 196 KB global CSS (includes ALL Video Library CSS on every page), a 115 KB default-avatar.png, a 132 KB header image and audio/main-intro.mp3 (63 KB) on every page. Move world CSS out of `_app` (keep cascade order; check Next docs in `node_modules/next/dist/docs/` on global CSS), re-encode avatar/header images with visual parity (don't change the header composition or the masking disc, CLAUDE.md 10.4), load the intro audio only when it plays, then add budget tests and re-measure live.
- NEXT AGENT, to resume:
  ```
  git checkout -b agent/claude/r3-perf2 $(cat docs/handoff/2026-11-28-swarm/patches/r3-perf2-BASE-SHA.txt)   # fetch that sha with --depth if needed
  git apply --binary docs/handoff/2026-11-28-swarm/patches/r3-perf2-uncommitted-tracked.patch
  tar -xzf docs/handoff/2026-11-28-swarm/patches/r3-perf2-untracked-files.tgz
  ```
  (Copy the patch files out of the handoff branch first.) Then review EVERYTHING, because this was mid-edit and unverified. Measure, test (`node --test` the header law tests, global header/footer tests, video-library tests, smarterdesign tests, the new budget test), rebase on main, and ship. If the sub-agent pushed later, prefer its pushed branch: check `git ls-remote origin 'refs/heads/agent/claude/r3-perf2'`.

### 5.4 Broken e2e from other workstreams: COMMITTED LOCALLY, NOT PUSHED (saved as a patch)
- Worktree `/home/claude/wt-e2e`, branch `agent/claude/r3-e2e` (NOT pushed), base in `patches/r3-e2e-BASE-SHA.txt`.
- Saved: `patches/r3-e2e-commit-ff1bd2bb.patch` (format-patch of commit ff1bd2bb, 13 files) + `patches/r3-e2e-uncommitted.patch` (one further edit to `e2e/fixtures/personalAssistantBrowser.ts`, unfinished).
- Commit ff1bd2bb "fix(ci): Global Footer E2E gates report real breakage again":
  - Training: the open World command menu painted beneath the portaled header and guest bar; the shell now rises above them while its drawer is open; e2e/022 measures the layers (`src/components/ui/HamburgerMenu.jsx`, `src/styles/worlds/training.css`, `__tests__/the-open-command-menu-paints-above-the-header.law.test.mjs`).
  - Poker Near Me: Report A Bug lost its 48px floor in #3209 (34px) (`src/styles/worlds/poker-near-me-console-menu.css`).
  - Every page: GlobalPiPManager no longer imports LiveStreamService, so the LiveKit SDK (527 KB decoded) stays off pages that never stream (`src/components/social/GlobalPiPManager.jsx`, `src/services/LiveStreamService.js`, `src/services/activeLiveStream.js`, `__tests__/the-live-stream-sdk-stays-off-pages-that-never-stream.law.test.mjs`).
  - SEO kit and Video Library eyebrows no longer render under 12px (`SmarterSeoKit.module.css`, `VideoLibraryWorkspaceHeader.module.css`).
  - e2e/05 Diamond Store: the fallback package art is the #3201 header scene.
- Failures it targets (job "Chromium and WebKit footer contract" in `.github/workflows/global-footer-e2e.yml`): `e2e/022-world-menu-visual.spec.ts:74` (Training drawer visual), "Verify Diamond Marketplace Page 1 commerce anatomy", `e2e/029-bankroll-toke-smarterdesign.spec.ts:465` (CSV/PDF offline export, mobile-chrome), intermittent `e2e/personal-assistant-completion.spec.ts:261` (WebKit), intermittent 028 mobile-webkit `pauseVideo`.
- NEXT AGENT: `git am` the commit patch onto a fresh branch from main (resolve conflicts against #3243/#3246), `git apply` the uncommitted patch and finish that PA fixture fix, check the bankroll export failure (not addressed in ff1bd2bb), push, and get the footer contract job GREEN on the PR head and on main. Check `git ls-remote` first in case the sub-agent pushed later. Note: the perf lane also touches UniversalHeader/_app, so coordinate if you run both.

### 5.5 Venue directory data quality: BUILT AND TESTED, NOT INSTALLED (needs Dan's approval)
- Branch `wip/claude/r3-data` (pushed, head `1cdc699b`; the `wip/` segment means it never auto-PRs).
- Files: `supabase/migrations/20261128050500_venue_games_from_pokeratlas_catalog.sql` (maps the PokerAtlas catalog in `venue_live_tables` (source='pokeratlas', observation_kind='catalog', bravo_slug='pa-'||pokeratlas_slug) into `poker_venues.games_offered` (tokens NLH, PLO, Limit HE, Mixed, Big O, 7-Stud, new `Limit Omaha`); trigger fills only empty rows, logs to `venue_directory_enrichment_log`, never writes last_verified_at, turns its own failure into a warning; backfill asserts 58 rows / 43 listed), `supabase/migrations/20261128050600_touring_series_rows_are_not_rooms.sql` (CSOP id 2834 and Poker For Good id 2835 become venue_type 'series'; CHECK constraint `poker_venues_touring_marker_is_not_a_room`; asserts exactly 2 rows), `__tests__/venue-directory-data-root-postgres.test.mjs` (3 tests on a scratch PostgreSQL 16; skips as root).
- Why not installed: the Supabase MCP write path needs an interactive confirmation; the sub-agent couldn't answer it. This session asked Dan (message 2026-11-27 ~23:00 Central): reply "apply the venue migrations" to approve. **At handoff Dan had NOT replied.** Don't apply without Dan's explicit approval in the new chat; the approval prompts will appear to him.
- When approved: outside :50 to :03 UTC, `apply_migration` with the exact content of 20261128050500, then 20261128050600 (if the catalog changed, the first aborts with new counts; update its two constants and re-run once); read back the history; rename files to installed versions if they differ; push to `agent/claude/r3-data` (no wip segment) so it ships; then run `node scripts/check-venue-count-snapshot.mjs --print` and bump the snapshot in `src/lib/venueCount.mjs` if it's behind (rooms 473 to about 471/472 after reclassification; NLH etc. rise).
- Expected after: rooms with games 402 to 442; rooms without games 72 to 30; tour/series 90 to 92; verified 69 (unchanged; nothing sets last_verified_at automatically; only human admin RPCs do).
- Findings left for later: 5 rooms with likely wrong PokerAtlas slugs (Jamul 3352, FireKeepers 3383, Seminole Hard Rock Hollywood 3397, Texas Card House Houston 3398, Hollywood Park 3413); likely duplicate rooms (Daytona 3402/2037, Silks 3454/1948, Bally's Lincoln 3467/1892, maybe Aggieland 3353/3088); old games_offered disagrees with the catalog on many rows (NLH agrees 138/196, PLO 130/196), not overwritten.

### 5.6 Chapter taps on a real device: DONE (verified this session, section 4).

---

## 6. PATCH INVENTORY (`docs/handoff/2026-11-28-swarm/patches/`)
| File | What |
|---|---|
| `r3-perf2-BASE-SHA.txt` | base commit of the perf worktree |
| `r3-perf2-uncommitted-tracked.patch` | all tracked edits (binary-safe, includes the re-encoded default-avatar.png) |
| `r3-perf2-untracked-files.tgz` | new files (budget test, AVIF headers, ToastStack.js, src/lib/build/) |
| `r3-e2e-BASE-SHA.txt` | merge-base of the e2e branch |
| `r3-e2e-commit-ff1bd2bb.patch` | `git am`-ready commit (13 files) |
| `r3-e2e-uncommitted.patch` | unfinished edit to `e2e/fixtures/personalAssistantBrowser.ts` |
The data lane is on GitHub as `wip/claude/r3-data`; no patch needed.

---

## 7. BLOCKED ITEMS (cannot be done from a session like this one)
1. **Club Arena copy of the do-not-ship guard.** `add_repo` for `Smarter-Software-PIQ/Smarter-Poker-Club-Arena` was denied by this session's permission classifier. A session started with that repo as source must check whether Club Arena has the same `agent-branch-proposal` / `agent-open-pr` / `agent-autopilot` chain and port `.github/scripts/unfinished-work-guard.sh`, the workflow wiring and the test from World Hub (#3182 + #3193).
2. **Branch deletions.** The proxy refuses `DELETE git/refs` (HTTP 403). Delete these from a session or person with GitHub write access: `agent/claude/handoff-probe-guard-2026-11-27`, `agent/claude/guard-probe-2-2026-11-27`, `wip/claude/vl-help-oneframe`, and later `wip/claude/r3-data` (after its work ships) and this `handoff/claude/vl-swarm-2026-11-28` (when the work is done). The old bookmark branch `bookmark/video-library-smarterdesign-2026-11-27` is already gone.
3. **Owner Control Panel signed-in check** (`/hub/video-library/owner`). No approved test identity is available in-session, and CLAUDE.md forbids using Dan's account. Its e2e (`e2e/027-video-library-owner-tools.spec.ts`) passes in all browsers.
4. **Venue migrations** need Dan's approval (5.5).

---

## 8. OPEN FOLLOW-UPS / IDEAS NOT YET STARTED
- Wire the AI markdown corpus (`src/lib/seo/markdownIngestion.mjs`) and client-only count labels to live stats (5.1 gap).
- Fix the 5 wrong PokerAtlas slugs and merge the likely duplicate rooms (5.5 findings), with migrations plus Dan's approval for writes.
- Re-check `games_offered` disagreements against the PokerAtlas catalog and decide a source-of-truth rule.
- "Chromium and WebKit footer contract" is not a required check; once green (5.4), consider asking Dan to make it required so regressions block merges.
- Earlier noted and still true: global payload items beyond the perf lane (any leftover after 5.3).

---

## 9. IMAGES AND WHERE TO FIND THEM
On main (merged via #3170), `docs/handoff/2026-11-27-images/` (20 files; reference only, never ship as product):
- Player Stats: `stats-cash-before-after.jpg`, `stats-cash-perf-before-after.jpg`, `stats-tournament-before-after.jpg`.
- Video Library before/after (state at the earlier session's 02933bc/d07fdb9, before the cleanup): `video-library-index-phone-before-after.jpg`, `video-library-index-desktop-before-after.jpg`, `video-library-index-help-393.jpg`, `video-library-{channels,channel,players,player,playlist,watch,owner}-{393,986}-before-after.jpg`.
On the bookmark branch, `docs/handoff/2026-11-28-swarm/images/` (live production captures this session):
- `video-library-index-375-live.jpg` (index at phone width, new mast and chrome controls)
- `video-library-watch-live-after-1.jpg`, `video-library-watch-live-after-2.jpg` (watch page after de-nesting; meta line and About facts)
- `video-library-watch-375-meta-stacked-live.jpg` (after #3188, meta facts stacked on phone)
- `video-library-watch-1280-live.jpg`, `video-library-index-1280-live.jpg`, `video-library-channel-1280-live.jpg` (desktop checks)

---

## 10. ENVIRONMENT GOTCHAS (learned the hard way)
- Cloud container: about 8 GB RAM. Full `next build` and long `next dev` get OOM-killed when several agents run. Use targeted `node --test`, static analysis, CI runs (dispatch on a `wip/` branch) and the live site.
- Turbopack refuses symlinked `node_modules` (worktrees). Use a real install or don't run dev there.
- `npm ci --ignore-scripts` works on main now (it failed on an older lockfile).
- Chromium for Playwright: `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` (pass executablePath).
- WebFetch is often blocked for smarter.poker (not on the allowlist). `curl` from the container worked late in this session; Dan's desktop app built-in browser (mcp__remote-devices__Claude_Browser__*) works for real-browser checks, including real YouTube playback.
- gh GraphQL may be blocked; use `gh api` REST.
- Checking CI: `gh api repos/Smarter-Poker/smarter-poker-world-hub/commits/<sha>/check-runs?per_page=100`. Job logs: `gh api repos/Smarter-Poker/smarter-poker-world-hub/actions/jobs/<job_id>/logs`.
- Required checks (8) gate the auto-merge. "Chromium and WebKit footer contract", "shared-schema-lineage" (red for any new migration) and "Installed and merged migrations agree" are NOT required.
- A shallow clone may show "forced update" on fetch; that's just shallow history, not a force-push.
- Supabase MCP: read-only `execute_sql` works; writes (apply_migration, INSERT/UPDATE) prompt the user for confirmation, so sub-agents can't do them.

---

## 11. MERGED PR LEDGER (this session, all on main and live unless noted)
#3170 307eb2a5 (autopilot-merged VL redesign) · #3173 (evidence screenshots, autopilot) · #3181 ce886da0 · #3182 209ea636 · #3188 387ba16e · #3193 70e1a57e · #3194 cc3fd612 · #3197 9da5c3f8 · #3198 0ac8edad · #3206 c3b648d2 · #3210 ed41e283 · #3211 ec132380 · #3212 1e995803 · #3224 43f8faf3 · #3243 6f0b657d · #3246 e01ac60f · PR #3252 (r3-perf2, state at handoff above) · NOT PUSHED: r3-e2e · PARKED: wip/claude/r3-data.

---

## 12. DEFINITION OF DONE FOR THE NEXT AGENT
1. #3246: DONE (verify live once more with curl on 2 research pages).
2. Perf lane resumed from the patch, verified, merged, live, re-measured (report before/after per page).
3. e2e lane resumed from the patch, the footer contract job green on main.
4. Venue migrations installed IF Dan approves; otherwise leave parked and say so.
5. All tests registered and green; every claim verified live (`/api/health` commitSha contains each merge).
6. Report to Dan once at the end, in plain language, with Central times, listing anything still blocked (section 7).
