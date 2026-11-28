# HANDOFF PROMPT: Preflop Charts #SmarterDesign, final pass (World Hub)

Written 2026-11-27 23:20 Central (America/Chicago) by Claude session
`session_01UxDLnKdQc1Gm6khKaeCB1e`. Copy everything from "MISSION" to the end
into a new chat. State every time to Dan in Central time.

---

## MISSION

You are picking up Dan's order of 2026-11-27 19:53 Central, verbatim:

> "PREFLOP CHARTS https://smarter.poker/hub/club-arena/table/e78717a2-294d-4b8f-a6ce-d42ec54b237f?name=nlh+1%2F2&stakes=1%2F2&code=NLH NEEDS THE SAME #SMARTERDESIGN UPGRADE TO EVERY SINGLE PAGE, SUBPAGE, BUTTON AND EVERYTHING ELSE, EXACTLY LIKE WE'VE DONE FOR EVERY OTHER WORLD HUB PAGE... PLEASE GO THROUGH THEM NOW AND MAKE ANY AND ALL OPTIMIZATIONS, ENHANCMENETS, UPGRADES AND SIMPLIFLICATIONS NOW."

Follow-ups, verbatim: "FINISH UP ANY AND ALL UNFINISHED WORK, AND THEN GO AHEAD AND FULLY BUILD, FIX AND ENHANCE ALL OF THESE AND MAKE SURE THEY ARE FULLY WIRED IN AND TESTED BEFORE CLAIMING SUCCESS. YOU DECIDE THE BUILD ORDER. LAUNCH A SWARM IF IT WILL HELP."

(The Club Arena table URL in the order is only where Dan was when he wrote
it. The surface is the World Hub Preflop Charts app at
`https://smarter.poker/hub/preflop-charts` and its sub pages. Do not touch
Club Arena.)

Your job: land the final pass that is sitting on the bookmark branch, finish
the remaining items in section 6, verify live, and report. Do not ask Dan
anything an agent can decide (binding rule: "DON'T EVER ASK THE HUMAN TO DO A
JOB YOU CAN DO"). Merge, wait on checks and verify live yourself.

---

## 1. STATUS AT A GLANCE

| Phase | What | State |
|---|---|---|
| P1 | Chrome layer CSS for the whole Preflop app | MERGED, LIVE (#3216) |
| P2 | Main menu (memory-games.js) copy, colors, cards | MERGED, LIVE (#3216) |
| P3 | Sub pages: Stats, Ranks, Awards, Guide + shared shell | MERGED, LIVE (#3216) |
| P4 | Game screens: Speed, Pressure, Pattern, Local VS, Mixed, Spot Trainer, shared game kit | MERGED, LIVE (#3216) |
| P5 | Review panel, Jarvis dialog, accuracy bar, heatmap, power-ups, share card | MERGED, LIVE (#3216) |
| P6 | Arena 4-color cards in Local VS, Jarvis range-key dialog | MERGED, LIVE (#3240) |
| P6b | Another agent's training rollout: SD dress for the "About" summary on preflop pages | MERGED, LIVE (#3204, not mine) |
| P7 | Signed-in verification + fixes found by it + SEO block fonts | DONE LOCALLY, ON BOOKMARK BRANCH, NOT MERGED, NOT LIVE |
| P8 | Ship P7: real branch, PR, required checks, squash merge, Vercel, live proof | NOT STARTED |
| P9 | Remaining optional items (section 6.3) | NOT STARTED |

Live production at handoff: `https://smarter.poker/api/health` reported
`commitSha 6f0b657d1197716ef4532a14f44322c8b1019f05`,
`deploymentId dpl_83ieeosXyrxiFYqhzLuxewMty6C3` (05:17 UTC = 23:17 Central).
That revision contains #3216 (4853e74b), #3240 (80ba2e4f) and #3204
(e7892a3b). It does NOT contain P7.

---

## 2. WHERE EVERYTHING IS

- Repo: World Hub. GitHub remote used by this session:
  `https://github.com/Smarter-Poker/smarter-poker-world-hub` (GitHub may
  report the owner as `Smarter-Software-PIQ`; the old path worked for REST
  calls here). Vercel project `hub-vanguard` only.
- Cloud clone used this session: `/home/claude/smarter-poker-world-hub`.
  On Dan's Mac use your own worktree, never the shared clone.
- **Bookmark branch (pushed): `bookmark/preflop-charts-sd-final-2026-11-27`**
  holds all P7 work plus this handoff. The `bookmark/` prefix and the
  `bookmark:` subject keep autopilot from opening or merging a PR for it
  (unfinished-work guard). Base: origin/main 6f0b657d.
- This handoff: `.agent/handoffs/preflop-charts-sd-2026-11-27/HANDOFF.md`
- Screenshots: `.agent/handoffs/preflop-charts-sd-2026-11-27/images/` (JPG,
  393px wide phone renders, local dev with fixture data):
  - `before-menu.jpg` / `after1-menu.jpg` - main menu before/after P1-P2
  - `before-stats.jpg` / `after-stats.jpg`, `before-achievements.jpg` /
    `after-achievements.jpg`, `before-leaderboard.jpg` /
    `after-leaderboard.jpg`, `before-tutorial.jpg` / `after-tutorial.jpg`
  - `after-range-game.jpg`, `after-speed-game.jpg`, `after-pressure-game.jpg`,
    `after-pattern-game.jpg`, `after-mixed-game.jpg`, `after-vs-game.jpg`,
    `after-spot-game.jpg` - game screens after P4
  - `live-jarvis.jpg`, `live-vs-cards.jpg` - P6 on production
  - `si-menu-0.jpg`, `si-menu-1.jpg` - SIGNED-IN menu: grade chip "B 84%",
    "1/10 Mastered", Smart Practice with 2 weak spots, "Train BTN Opens",
    3 Jarvis suggestions, level 1 Mastered 92%, level 2 Ready 71%
  - `si-ai-overlay.jpg` - VIP AI Mode on, "Jarvis Is Generating Your
    Scenario..." overlay
  - `si-achievements-0.jpg` - Awards with 3/11 unlocked
  - `s2-stats-0.jpg`, `s2-stats-1.jpg` - My Stats populated AFTER P7 fixes
  - `s2-menu-6.jpg`, `s2-menu-7.jpg` - SEO reference + FAQ after P7 fonts
- Harness scripts: `.agent/handoffs/preflop-charts-sd-2026-11-27/harness/`
  - `signedin.mjs` - fake signed-in session (see section 5) + screenshots of
    menu, AI overlay, stats, achievements. Usage:
    `node signedin.mjs <prefix>` from a scratch folder; it imports Playwright
    from `/home/claude/smarter-poker-world-hub/node_modules/playwright` and
    uses `/usr/bin/google-chrome`; edit both paths for your machine.
  - `fonts.mjs` - lists any text node whose computed font is Orbitron or a
    serif fallback. `node fonts.mjs /hub/preflop-charts /hub/preflop-charts/stats`
    Only `STYLE`/`SCRIPT` entries should remain.
  - `cap.mjs`, `games.mjs` - earlier capture scripts for the sub pages and
    game screens (signed-out).
- Evidence folder the session planned for the Mac (not written, the Mac was
  not used for this): `/Volumes/SmarterArchives/agent-evidence/preflop-charts-smarterdesign-20261127/`.
  Optional: copy the images there when you are on the Mac.

### Key source files (all in World Hub)

| File | Role |
|---|---|
| `pages/hub/memory-games.js` | The whole Preflop Charts app at `/hub/preflop-charts` (body class `world-preflop-charts`). Main menu, levels, Range Lab, Smart Practice, Jarvis suggestions, AI Mode, daily, rankings, mode cards. Renders `<HubPageSummary page="preflop-charts" as="h1" />`, `<PreflopReference />`, `<FaqSection faqs={MEMORY_GAMES_FAQS} />` at the bottom. |
| `pages/hub/memory-games/{stats,leaderboard,achievements,tutorial}.js` | Sub pages `/hub/preflop-charts/stats`, `/leaderboard`, `/achievements`, `/tutorial` |
| `src/components/memory-games/PreflopSubpageShell.jsx` | Shared sub-page shell: BankrollImageHeader with Back To Preflop Charts, metric chip, nav, `preflop-subpage smarterdesign` |
| `src/components/memory-games/PreflopGameKit.jsx` | Shared game kit: GameFrame, GameTopBar, GameIntro, GameResult, GameWeakness, GameNote, GameActions, GameShare, GameCoachTip, GameSuggestedNext, GameNextButton, gradeTone |
| `src/games/{SpeedDrillGame,PressureCookerGame,PatternRecognitionGame,MixedStrategyGame}.js`, `src/games/{TournamentModeGame,SpotTrainerGame}.jsx` | Game screens |
| `src/components/memory-games/EnhancedReviewPanel.jsx`, `JarvisExplanationDialog.jsx` + `.module.css` | Review panel and Jarvis dialog |
| `src/components/training/{AnimatedAccuracyBar,PositionWeaknessHeatmap,PowerUpBar}.jsx`, `src/utils/{powerUps,shareCard}.js` | Shared training widgets |
| `src/styles/worlds/preflop-smarterdesign.css` | THE chrome layer (imported in `pages/_app.js` after `smarterdesign.css`). Every rule is `body.world-preflop-charts.world-preflop-charts ...` (doubled class for specificity). Variables `--pcsd-*` at the top. |
| `src/styles/worlds/memory-games.css` | Legacy base styles for the app; palette already converted (gold/purple -> ice/cobalt, Orbitron -> Rajdhani) |
| `src/components/seo/PreflopReference.js` | Charts-in-words SEO block (used only on this page) |
| `src/components/seo/FaqSection.js` | Shared FAQ (used site-wide, do NOT restyle globally) |
| `src/components/seo/HubPageSummary.js` | Shared "About" summary; `usesSmarterDesignDress()` already returns true for `preflop-charts*` (from #3204) |
| `src/lib/clubArenaTheme.js` | `resolveArenaCardUrl(suit, rank)` -> `/hub/club-arena/cards/4color/{suit}_{rank}.webp` |
| `__tests__/preflop-charts-smarterdesign.law.test.mjs` | My law test (7 tests) |
| `docs/changelog/2026-11-27-preflop-charts-smarterdesign.md` | Changelog for #3216/#3240 |
| `.agent/audits/2026-08-31-training-phase-2-inventory.json` | Generated inventory; regenerate with its script `--write` if it conflicts |

---

## 3. THE #SMARTERDESIGN STANDARD AS APPLIED HERE

- Nine-slice rims (all in `public/images/smarterdesign/`):
  `chrome-readout.webp` 21 / 8px (surfaces, panels),
  `chrome-row.webp` 13 / 4px (rows, buttons),
  `chrome-stat.webp` 11 / 4px (readouts, stat tiles),
  `chrome-active-v2.webp` 11 / 4px (selected / primary, cobalt).
  Pattern: `border: 3px solid transparent; border-radius: 0; border-image: url(...) 13 / 4px stretch;`
- Ink navy: `linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%)`
- Control: `linear-gradient(180deg, #263f58, #112338 39%, #071420 77%, #12283c)`
- Cobalt primary: `linear-gradient(180deg, #1981ec, #0c55c0 26%, #07377e 76%, #125bba)`
- Text: white `#f2f7ff`, silver `#bdd0e2`, ice `#86daff`; warning orange `#ff8a3d`; pass green `#6ef0b5`.
- BANNED in text and chrome: gold, amber, yellow, purple, violet, pink, magenta. (Exception kept on purpose: poker ACTION legend colors for Raise Big / All-In / 3-Bet in `memory-games.js` lines ~278-279, `SpeedDrillGame.js` ~292, `PressureCookerGame.js` ~263, `EnhancedReviewPanel.jsx` 19-23 - they encode action categories in the range grid. Leave unless Dan says otherwise.)
- Title Case on every user-facing string (CI checks it). No emoji in source. Square corners. Condensed display font `var(--font-rajdhani, 'Arial Narrow')`; body `--pcsd-body` (Inter).
- Never call AI players "bots" (they are horses). Mobile first, verify at 393px.

---

## 4. P7: WHAT IS ON THE BOOKMARK BRANCH (done locally, NOT merged)

Found by the signed-in verification (section 5) and fixed:

1. `pages/hub/memory-games/stats.js`
   - "LEGACY LOCAL ARCHIVE" -> "Legacy Local Archive"; "LAST 12 LOCAL ARCHIVE RUNS" -> "Last 12 Local Archive Runs"; "Recent trend" -> "Recent Trend" (Title Case).
   - Focus Stations "5 Archived RunS" bug: React split "Run" + "s" into two text nodes and inherited `capitalize` made "RunS". Now one template string `Archived Run/Runs`.
   - Session time "40S": wrapped in `<span className="preflop-session-time">` with one string; CSS sets `text-transform: none`.
2. `src/styles/worlds/memory-games.css` - removed every remaining gold/purple token found by a hue scan: daily-signal title `#f1e4b5`, session accuracy `#dfb85a`, trend `#d48a6b` -> `#ff8a3d`, weak-bar gradient `#d29658`, award progress `#a97b19`, award strong `#c6b987`, award time `#b89d57`, daily streak `#c9ab5a`, daily mark `#f0d98d`, daily button `#f0da99`, no-match state `#c4a6ff`, a gold primary button (`#ffdc72` / `#d69d21` / `#78500b`) -> cobalt, Jarvis button violet -> cobalt, rank highlight purple, warning amber -> orange, pool filter purple, daily-signal gold button -> control gradient.
3. `src/styles/worlds/preflop-smarterdesign.css` - appended block "Signed-in pass (2026-11-27)":
   - FAQ question/answer were rendering in Times New Roman (shared FaqSection sets no family). Scoped fix: `.faq-section .faq-question` Rajdhani 17px, `.faq-answer` body font.
   - Stats archive notice `.preflop-daily-signal` -> chrome-readout surface, ice label, chrome-row button.
   - Focus Stations rows padded off the rim; bar inset inside the rim.
   - `.preflop-session-time { text-transform: none; }`
4. `src/components/seo/PreflopReference.js` - Orbitron headings ("Facing A Three Bet" etc.) -> Rajdhani; blocks get chrome-row rim + ink navy; labels ice and no uppercase; body text silver. Only used on this page.

Verified locally after the fixes: `fonts.mjs` on `/hub/preflop-charts` shows no Orbitron and no serif text (only STYLE/SCRIPT tags). Tests passing: `__tests__/preflop-charts-smarterdesign.law.test.mjs`, `__tests__/phase2-seo-smarterdesign-fortress-20261127.law.test.mjs` (another agent's; requires no `borderRadius: 10|12|14|16|20` in PreflopReference), `__tests__/the-charts-are-on-the-chart-page.law.test.mjs`, `__tests__/every-lesson-answers-first.law.test.mjs` = 40 pass, 0 fail.

NOT yet run on P7: title-case CI check, module-parse check, the training inventory check, full `__tests__` comparison against main, Vercel build. Run them (section 6.1).

---

## 5. HOW TO VERIFY SIGNED-IN STATES LOCALLY (no real account)

Never use Dan's personal account; never read `.env` values. The harness fakes everything:

- Dev server (cloud container; it OOMs, restart when `ERR_CONNECTION_REFUSED`):
  ```
  pkill -f "next dev"; cd <repo> && (NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS='--max-old-space-size=4500' nohup node node_modules/next/dist/bin/next dev --webpack -p 3000 > /tmp/dev.log 2>&1 &)
  curl -s -o /dev/null -w '%{http_code}\n' --max-time 600 http://localhost:3000/hub/preflop-charts   # first compile takes minutes
  ```
- Session: localStorage `smarter-poker-auth` = `{access_token: <unsigned JWT with sub/exp>, refresh_token, expires_at, user}`.
- Routes faked: Supabase `auth/v1/user`, `auth/v1/token`, `rest/v1/memory_game_sessions` (14 rows), `rest/v1/rpc/get_user_achievements` (3 unlocked); app `/api/user/get-header-stats` (is_vip true), `/api/vip/check-status`, `/api/gto/get-weak-spots`, `/api/gto/lobby-suggestions`, `/api/memory/dashboard*`, `/api/gto/generate-scenario` (6 s delay so the AI overlay is visible).
- Expected console line: `signed-in signals: { smart: 'Train BTN Opens', weak: 2, sugg: 3, grade: true, ... }` and `overlay visible: 1`.
- Note: full-page screenshots paint the fixed bottom nav mid-page. That is an artifact, not a bug (CLAUDE.md rule 15).

---

## 6. WHAT YOU MUST DO NEXT, IN ORDER

### 6.1 Ship P7 (required)
1. `git fetch origin && git checkout -b claude/preflop-charts-sd-signed-in origin/main`
2. Bring the P7 code over WITHOUT the handoff folder:
   `git checkout origin/bookmark/preflop-charts-sd-final-2026-11-27 -- pages/hub/memory-games/stats.js src/styles/worlds/memory-games.css src/styles/worlds/preflop-smarterdesign.css src/components/seo/PreflopReference.js`
   If main moved those files, rebase by hand; keep both sides.
3. Add a test pin to `__tests__/preflop-charts-smarterdesign.law.test.mjs`: no `#f1e4b5|#dfb85a|#d29658|#c9ab5a|#f0d98d|#f0da99|#c4a6ff|#ffdc72|#d69d21|#c6b987|#b89d57` in `memory-games.css`; no `font-orbitron` in `PreflopReference.js`; `preflop-smarterdesign.css` contains `.faq-section`.
4. Add a line to `docs/changelog/2026-11-27-preflop-charts-smarterdesign.md` (or a new `docs/changelog/2026-11-27-preflop-charts-signed-in-pass.md`).
5. Run: `node --test __tests__/preflop-charts-smarterdesign.law.test.mjs __tests__/phase2-seo-smarterdesign-fortress-20261127.law.test.mjs __tests__/the-charts-are-on-the-chart-page.law.test.mjs __tests__/every-lesson-answers-first.law.test.mjs __tests__/preflop-local-practice-authority.test.mjs __tests__/daily-challenges-casino-realism.test.mjs __tests__/_test-guards-exist.test.mjs` plus the title-case and module-parse checks the Build Safety Gate runs (`.github/workflows/build-safety-gate.yml`) and the training inventory check. Known: ~47 `__tests__` files fail identically on unmodified main in a cloud container (environment); compare against main, do not chase those.
6. Commit with author `Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>` (CHECK 15). Message e.g. `fix(preflop-charts): signed-in pass - last gold tokens, stats copy, SEO block fonts`. End with the session attribution lines.
7. `git push -u origin claude/preflop-charts-sd-signed-in`. Autopilot opens the PR and squash-merges on green required checks. If it does not within a few minutes, open it: `gh api repos/Smarter-Poker/smarter-poker-world-hub/pulls -f title=... -f head=claude/preflop-charts-sd-signed-in -f base=main -f body=...` and enable auto-merge `PUT /repos/.../pulls/{n}/ccr/auto_merge`. GraphQL is blocked in cloud sessions; use REST.
8. Do NOT merge the bookmark branch. Delete it after P7 lands (`git push origin --delete bookmark/preflop-charts-sd-final-2026-11-27`), or leave it; it never auto-merges.

### 6.2 Verify live (required)
1. Wait for the Vercel `hub-vanguard` production deployment READY with your merge SHA (Vercel MCP `list_deployments` or the dashboard).
2. `curl -s https://smarter.poker/api/health` -> `commitSha` equals or contains your merge.
3. Check at 393px: `/hub/preflop-charts` (bottom: "Facing A Three Bet" in Rajdhani, FAQ not serif), `/hub/preflop-charts/stats` signed-out gate, `/hub/preflop-charts/achievements`, `/leaderboard`, `/tutorial`. Run `fonts.mjs` against production by changing the base URL.
4. Report to Dan: PR number, merge SHA, deployment id, what changed, in Central time.

### 6.3 Optional improvements noticed but not done
- Level 1 card shows "Mastered" twice (chip at top right and label by the bar). Consider dropping one.
- Grade chip reads "B  84% Across Last 30 Days" with a tiny "B"; could be a bigger letter grade.
- Stats tiles use chrome-stat rims, which read thinner than chrome-row; fine per standard, revisit only if Dan asks.
- Achievements: locked rows show greyed title + lock; unlocked rows have cobalt check. Looks correct.
- `HubPageSummary` "About The Preflop Range Lab" is already SD via #3204 (verified no Orbitron/serif). No action.

---

## 7. RULES YOU MUST OBEY (from repo CLAUDE.md + Dan)

- Owned branch, normal hooks, protected squash merge, verify live yourself. Never call a deploy hook, never `vercel deploy`, never a second Vercel project.
- No emoji, Title Case, no `.single()`, no unused hook imports, no raw supabase-js in API routes.
- Never read env-file values, never print secrets, never print other processes' command lines/env, never use Dan's account.
- Never schedule on the Claude scheduler.
- Every time stated to Dan in Central time.
- Do not end with a question or a handed-off step for work you can do.

## 8. HISTORY OF MERGED PRs (for context)

- #3216 `claude/preflop-charts-smarterdesign` merged 2026-11-28 03:46 UTC (21:46 Central 11-27) squash 4853e74b: P1-P5.
- #3240 `claude/preflop-charts-sd-followup` merged 04:30 UTC (22:30 Central) squash 80ba2e4f: P6.
- #3204 `agent/smarterdesign-training-rollout` (other agent) merged 04:46 UTC squash e7892a3b.
- #3234 `agent/fix/preflop-ranges-single-route` (other agent) merged 04:12 UTC: /tools/preflop-ranges route owner. Unrelated.

Pitfalls hit earlier: CI title-case rejected `This Session&apos;s` (fixed to "Practice Runs This Session"); tests pin the strings "Next Hand →", "Next Question →", "Correct - You Win This Practice Round" - keep them; the inventory JSON conflicts on rebase - regenerate it from main's version with `--write`; a stale `.git/shallow.lock` once blocked fetch - remove only if no git process holds it.
