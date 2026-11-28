# HANDOFF PROMPT: CLUB COMMANDER #SMARTERDESIGN + SIGN-IN + HEADER PROGRAMME
Session: https://claude.ai/code/session_01UxDLnL3hqjSoQB9X4GQFwq
Written: Fri 2026-11-27, 11:20 PM Central (America/Chicago). Owner: Dan (Daniel Bekavac), Smarter.Poker.
Handoff file: /Volumes/SmarterArchives/agent-evidence/commander-smarterdesign-01UxDLnL/HANDOFF.md (copy on branch wip/hub-commander-smarterdesign-20261127: docs/handoffs/2026-11-27-commander-smarterdesign-HANDOFF.md)
Bookmark: /Volumes/SmarterArchives/agent-evidence/commander-smarterdesign-01UxDLnL/BOOKMARK.md
Evidence (screenshots, same folder): /Volumes/SmarterArchives/agent-evidence/commander-smarterdesign-01UxDLnL/

---------------------------------------------------------------------------------------------------
## 0. YOUR ORDERS (READ FIRST)

You are taking over a live programme for Dan on Smarter.Poker. Pick it up EXACTLY where it stopped.
Dan's standing rules for you (binding, from his memory and the repos):
- NEVER end with an offer, a question, or a step handed back to Dan for work you can do yourself (opening/merging PRs, running commands, publishing, verifying). Decide, do it with every tool, report it done.
- Never sit idle while CI/deploys run: do other useful work. Do not sleep/poll for hours; for later resumption use the session reminder tool, never the Claude scheduler for platform work (World Hub CLAUDE.md 10.9).
- Every time you tell Dan a time, use Central time (America/Chicago), never UTC.
- Push AND publish yourself; verify the live deployment before claiming success. "Merged is not landed" (hub CLAUDE.md 10.7). One final pass/fail checklist, never call it done while only pushed/green.
- Fix at root cause. No band-aids. No emoji in source. Title Case on every UI label. Never use the words "bots" (horses) or "looks good".
- Commits MUST be authored `Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>` (hub CHECK 15: otherwise Vercel BLOCKS the deploy). End commit messages with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01UxDLnL3hqjSoQB9X4GQFwq` (or your own session line).
- PR bodies end with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)` + session URL.
- Never type or paste Dan's password. Test account: daniel@bekavactrading.com (password only in .env.local; never read env-file values, never print secrets).
- Read at task start: each repo's CLAUDE.md, AGENTS.md, AGENT-PLAYBOOK.md, docs/agent-policy/REFERENCE-INDEX.md, PUBLISHING.md.
- #SMARTERDESIGN canonical standard: World Hub `docs/SMARTERDESIGN.md` + `.agent/skills/smarterdesign/SKILL.md`. Prohibited text colours anywhere: yellow, gold, amber, purple, violet, lavender, pink, magenta. Dan rejected the old painted "bulky frames" ("NO DO NOT USE THOSE BULKY FRAMES, THATS THE OLD STYLE").

---------------------------------------------------------------------------------------------------
## 1. REPOS, PATHS, ACCESS, TOOLING

| Repo | GitHub | Production | Notes |
|---|---|---|---|
| Club Commander app | Smarter-Poker/smarter-poker-commander | https://commander.smarter.poker (Vercel project `smarter-poker-commander`, prj_vIeaVMjyHZIPgBzTZuzcaPwFlpbP) | Next.js 14 Pages Router. Hub rewrites smarter.poker/commander/* here. `/api/health` reports `version` (8-char SHA). |
| commander-shared | Smarter-Poker/commander-shared | source package | Vendored into Commander at `vendor/commander-shared/` and into World Hub at `vendor/commander-shared/`. |
| World Hub | Smarter-Poker/Smarter-Poker-World-Hub | https://smarter.poker (Vercel `hub-vanguard`, prj_op66GkZyZcygXQKm76iyycfVFAQx) | `/api/health` reports full SHA in `version`. Huge repo, ~170 CI checks. |
| Club Arena (art source only) | local: /Users/smarter.poker/Documents/club-arena | — | Cashier art came from here. |

Dan's Mac (device bridge, granted this session): /Users/smarter.poker/Documents, /Volumes/SmarterWork, /Volumes/SmarterArchives (sandbox shell mounts them at `$HOME/mnt/<name>`). New work goes in a unique task dir under /Volumes/SmarterWork/agent-work; evidence under /Volumes/SmarterArchives/agent-evidence. Never overwrite/prune other tasks' dirs. SmarterArchives is 93% full (55 GB free), SmarterWork 81% (178 GB free); SSD1/SSD2 are also allowed.

Tool notes that worked this session:
- Cloud sandbox git push works through the session proxy after `add_repo` (access "push"). `gh` CLI token is INVALID in the sandbox. Use the device GitHub MCP tools: `mcp__remote-devices__github__create_pull_request`, `merge_pull_request` (squash), `list_pull_requests`, `get_pull_request`.
- Check runs: `curl -s https://api.github.com/repos/<owner>/<repo>/commits/<sha>/check-runs` (public repos, unauthenticated). Job steps: `.../actions/jobs/<id>`; annotations: `.../check-runs/<id>/annotations`. Job LOGS need auth (not available).
- Vercel MCP: `mcp__Vercel__list_deployments` with `sha`, `mcp__Vercel__get_deployment`.
- Supabase MCP: project `kuklfnapbkmacvwxktbh`, `mcp__Supabase__execute_sql` (read-only checks). No DDL in :50-:03 UTC break window.
- Built-in browser (`mcp__remote-devices__Claude_Browser__*`) on Dan's Mac is NOT signed in to Commander/hub. Tab id used: `seed`.
- Commander repo commit hook REFUSES commits in a shared clone: create an owned worktree with `bash scripts/agent-workspace.sh <agent-name> <branch-slug> --print-path` (creates `/root/Documents/.agent-trees/smarter-poker-commander/<agent>` on branch `agent/<agent>/<slug>` from origin/main, with node_modules + vendor link). Copy edited files in, commit there.
- World Hub automation (`agent-autopilot.yml`, `agent-open-pr.yml`) auto-opens and auto-merges ANY pushed agent branch unless it is held: branch with `wip/`, `bookmark/` or `handoff/` segment, head commit starting `wip:` / containing `[do-not-ship]`, draft PR, or `do-not-ship` label. The hub WIP is parked that way (see §4).

Local cloud-sandbox clones (gone in a new session; re-clone): /home/claude/smarter-poker-commander, /home/claude/smarter-poker-world-hub, /home/claude/commander-shared, worktree /root/Documents/.agent-trees/smarter-poker-commander/sd.

---------------------------------------------------------------------------------------------------
## 2. PHASE A: COMMANDER RE-LOGIN BUG. STATUS: DONE, LIVE, VERIFIED (signed-out legs)

Dan (8:14 PM): Commander made you log in again when opened from the hub instead of staying signed in.
Root causes and fixes:
1. World Hub Commander orb (`src/world/WorldHub.tsx`) read `localStorage['smarter-poker-auth'].session.access_token`; supabase-js v2 stores the session FLAT, so the token was always undefined and `/api/auth/commander-sso` never ran. FIX: `src/lib/commander/openClubCommander.js` (uses `supabase.auth.getSession()`), test `__tests__/commander-orb-sso.test.mjs` (wired into CHECK 8 of `.github/workflows/build-safety-gate.yml`). World Hub PR #3203, merged as 555c9dd, live (Vercel dpl_21kj3wrm62eETCxx5py5UyZ2ZfjW READY; smarter.poker/api/health = 555c9dd...).
2. Commander `/commander/login` waited for a click on "Continue As Smarter.Poker" when the commander origin had no local session. FIX in `pages/commander/login.js`: `autoBridgeThroughHub()` redirects to `https://smarter.poker/commander/login?bridge=1` once per tab per 2 min (sessionStorage key `commander_auto_bridge_ts`, loop breaker), on the plain path and on `?expired=1`. Explicit Sign Out (`commander_explicit_logout`) returns first. Law pin in `tests/unit/loginBridge.law.test.js`; e2e updated in `tests/e2e/login-bridge.spec.ts`. Commander PR #163 merged 5b7be05 (dpl_HHk7SsGH1jLXs4crtLWAxKcFJ1mb READY).
3. Follow-ups: PR #164 (a075b1c) pinned `.github/workflows/login-bridge-probe.yml` job "Handshake works in a real browser" to `runs-on: ubuntu-24.04`. GitHub moved ubuntu-latest to Ubuntu 26.04 (Oct 19-Nov 19 2026) and Playwright 1.50-1.60 has no 26.04 browser builds, so that job failed at "Install Chromium" on every run since 2026-11-13. First green run after the fix: run 46102062196 (2026-11-28 03:16 UTC = 9:16 PM Central), both jobs success. PR #165 (76fbbe0) fixed a race in the `?expired=1` e2e test (decide by baseURL).
Verified live: commander.smarter.poker/commander/login with no session hops to smarter.poker/commander/login?bridge=1; second visit within 2 min stays (no loop).
NOT verifiable by me: the signed-in hub -> dashboard no-click hop in a real browser (no signed-in browser; I can't read Actions logs to prove the signed-in Playwright test ran rather than skipped). The probe's HTTP signed-in leg passes.
Background runbook (do NOT start without assignment): `docs/runbooks/cross-subdomain-session.md` (shared cookie design, decided not-now 2026-09-04).

## 3. PHASE B: COMMANDER GLOBAL HEADER PROFILE PHOTO. STATUS: DONE, LIVE

Dan (8:18 PM): Commander header didn't pull the profile image (green "d" tile) and wasn't framed like other headers.
Root cause: Commander guessed the photo from storage; on the commander origin the hub cache `sp-cached-header-user` never exists, so `user_metadata.avatar_url` (Google's letter tile) won. Dan's profile row has an uploaded photo (`profiles.avatar_url` set, `use_avatar_as_profile_pic=false`).
Fix: `src/lib/commander/headerPortrait.js` in commander-shared (`useHeaderPortrait(supabase)`, `resolveHeaderPortrait` = hub rule: profiles avatar_url / arena_avatar_url / use_avatar_as_profile_pic, fallback /default-avatar.png, cache key `commander_header_portrait`). Header geometry = hub's (black disc top 14.58% left 66.98% width 6.8%, slot 72%, 0.5px hairline rgba(0,0,0,.94)). Applied in `CommanderLayout.jsx` (vendored + upstream) and Commander-local `src/components/commander/shared/StandaloneGlobalHeader.jsx` (shim `src/lib/commander/headerPortrait.js`). commander-shared PR #89 (d931116) + Commander PR #163. RLS confirmed: `authenticated` can SELECT those profile columns.

## 4. PHASE C: #SMARTERDESIGN ON EVERY COMMANDER PAGE (STAFF APP). STATUS: DONE, LIVE (2fa3c315)

Dan (9:26 PM): "CLUB COMMANDER NEEDS THE SAME #SMARTERDESIGN UPGRADE TO EVERY SINGLE PAGE, SUBPAGE, BUTTON AND EVERYTHING ELSE, EXACTLY LIKE WE'VE DONE FOR EVERY OTHER WORLD HUB PAGE..."
Delivered:
- commander-shared PR #90 (merged 8758350): `scripts/smarterdesign-palette.mjs` palette migration on 60 files + `src/components/commander/shared/PageHeaderSlot.jsx` (context slot; CommanderLayout renders `<PageHeaderSlot title={title} />` right before `{children}`), test `tests/smarterdesign-palette.test.mjs`.
- Commander PR #166 (merged 2fa3c31; Vercel dpl_G5xm5HoGKuafhamWkJomSGrxCmA3; live 10:26 PM Central; commander.smarter.poker/api/health version 2fa3c315):
  - Palette at source on 198 files (`scripts/smarterdesign-palette.mjs`, same script). Mapping highlights: #18191A->#040D18 ink, #242526->#0A1829 surface, #3A3B3C-> bg #132A42 / border #445E77 / text #7F97B0 / other #2A4560, #E4E6EB->#F2F7FF, #B0B3B8->#BDD0E2, #1877F2-> bg #0C55C0 / text #86DAFF / other #1981EC; amber/gold (#F59E0B #F5A623 #FBBF24 #FFD700 #D4AF37 ...) -> cyan/ice; purples/indigo/pinks -> blues/sky; named Tailwind yellow/amber->cyan, purple/violet/fuchsia/pink->sky. `--check` mode exits 1 if anything would change.
  - Styles: `styles/smarterdesign.css` (copy of World Hub's) + `styles/commander-smarterdesign.css` (Commander skin: steel rim `chrome-readout.webp` on surfaces bg-[#0A1829] with border/rounded, hairline when nested, cobalt bevel `chrome-active-v2.webp` on bg-[#0C55C0] actions, chrome row `chrome-row.webp` on secondary, inline-style overrides for both serialized forms, ink inputs, PIN gate, club page popup, TV display title bars, cashier/kiosk/print-card styles). Imported in `pages/_app.js` with Rajdhani (`next/font/google`, var --font-rajdhani); body gets classes `smarterdesign cmd-sd`.
  - Image headers: `src/components/commander/shared/CommanderImageHeader.jsx`, registry `pageHeaders.js` (89 staff routes -> title, parent, art), `PageHelpHost.jsx` (route-synchronous `hasHeader`; page PageHelp/PageBar register title/summary/steps into the header's one painted "?"), `sdHeaderHelp.js` (`/images/smarterdesign/header-help.webp`). `PageHelp.jsx` (embedded painted icon, delegation), `PageBar.jsx` (toolbar under header). `_app.js` wraps in `PageHelpHost` + `PageHeaderSlotContext.Provider`, and renders the header for standalone routes (`COMMANDER_ROUTES_WITHOUT_SHARED_LAYOUT`).
  - Headerless by design (law list in test): /commander, login, register, onboarding, kiosk, lobby, check-in/[code], dealer/[tableNumber], player/[tableNumber], tablet/[tableNumber], table/[id], waitlist/status/[id], displays/* (except /commander/displays index which HAS a header), tournaments/[id]/{clock-display,public,seating-display,structure-display}.
  - Painted-image UI replaced with real controls: Dashboard (`pages/commander/dashboard.js`: six sd-panel sections w/ seals, 64 lucide-icon feature buttons, `?card=` deep link scrolls, real upgrade dialog), Cashier (`pages/commander/cashier.js`: 6 action buttons + Print New Card buttons; removed cashier-panel.jpg + print-new-card.png usage), Membership Plans (`pages/commander/membership-plans.js`: real plan rows + inline editor), Player Kiosk (`pages/commander/kiosk.js` welcome), club page popup (vendored CommanderLayout, vendor-only code), PIN gate restyled via skin.
  - Bug fix: five effects returned non-functions ("destroy is not a function"; member detail blanked): members/[id], table/[id], tournaments/[id]/settings, tournaments/[id]/clock-display (`return null;` -> `return;`), membership-plans (`return router.push()`). Law `tests/unit/effectCleanup.law.test.js`.
  - Laws: `tests/unit/smarterdesign.law.test.js` (palette check clean, every staff page in registry, art files exist, vault only on Cashier, slot + _app wiring, one painted "?", skin assets). Updated `tests/unit/pageHelp.law.test.js`, `tests/integrity/global-header.test.mjs`.
  - Changelogs: `docs/changelog/2026-11-27-commander-smarterdesign.md`, `docs/changelog/2026-11-27-commander-stays-signed-in-and-header-matches-hub.md`, `docs/changelog/2026-11-27-login-probe-browser-leg-runner-pin.md`.
Verification done: npm test (lint:undef + vitest 325 + auth 39), vendor gate `node scripts/check-vendor-upstream-sync.mjs` PASSED (51 baseline), production build, local production render (next start, fake staff session in localStorage, no Supabase session) of all 89 registry routes at 1280px: 65 header + exactly one "?", rest = retired redirects (tournament-clocks->displays, tournament-registration->tournament-controls, tournaments/[id]->td/[id], break-manager->td/[id]/tables), admin->admin/pin-entry, or PIN gate (staff, analytics, exports, settings, reports/*, close-day, churn-prediction, td/[id]/{index,chips,color-up,dealers}). Phone width 393px checked on dashboard/cashier/members/tables/kiosk. Live: production serves body.smarterdesign + chrome CSS; kiosk shows SD staff-sign-in gate.
NOT verified: signed-in pages LIVE (no signed-in browser). Data-populated states (only empty states rendered locally).

---------------------------------------------------------------------------------------------------
## 5. PHASE D: /hub/commander/* PLAYER PAGES IN WORLD HUB. STATUS: IN PROGRESS, PARKED, NOT SHIPPED

Gap found at 11:10 PM: 37 player pages under `pages/hub/commander/` (route list: /hub/commander, check-in/[venueId], faq, hand-history, hand-history/[handId], history, home-games (+[id], [id]/manage, [id]/roster, create, join), leaderboard/[venueId], leagues (+[id]), notifications, player-card, profile (+achievements, edit, settings), rate-table, responsible-gaming, rewards, services, squads (+[id], create, join/[code]), tournament/[id]/{clock,my-status,register}, tournaments, venue/[id], venues (+[id]), waitlist/[venueId]) were still on the old palette and the old "futuristic" style (rivets, corner lights, glow strips) from `src/styles/commander-futuristic.css`; 36 use `src/components/commander/CommanderPageShell.jsx`.

WIP branch: `wip/hub-commander-smarterdesign-20261127` (work commit 09e3456, plus one docs commit on top holding this handoff) on Smarter-Poker/Smarter-Poker-World-Hub (head commit `wip: [do-not-ship] ...` so automation will NOT auto-merge). Based on origin/main at the time (after 555c9dd). Contents (94 files):
- `scripts/smarterdesign-palette.mjs` (same script) run on `pages/hub/commander`, `src/components/commander`, `vendor/commander-shared/src` (90 files) + `src/styles/commander-futuristic.css` palette.
- `src/styles/commander-futuristic.css`: appended "#SMARTERDESIGN LAYER" (rivets/lights/glow/pipes hidden; `.cmd-header-full` -> steel-rim image header with scene from CSS var `--sd-scene` via ::before; seals = `.cmd-icon-box` chrome circle; `.cmd-panel` steel rim; `.cmd-btn-primary` cobalt; `.cmd-btn-secondary` chrome row; ink `.cmd-input`; badge-warning cyan).
- `src/components/commander/CommanderPageShell.jsx`: route -> scene map (`sceneFor`), wraps children in `<div className="smarterdesign" style={{'--sd-scene': url(...)}}>`, MutationObserver finds `header.cmd-header-full` and portals the painted "?" (`<a href="/hub/commander/faq" className="sd-header-help" data-focus-custom="" aria-label="Help For <h1 text>">`). Keeps `import { Menu } from 'lucide-react'` + `<Menu size={20}` (pinned by `__tests__/hamburger-never-regresses.test.mjs`).
- Title Case h1s: index ("Live Poker"), rewards, tournaments, notifications, home-games, waitlist/[venueId].
- `docs/business-hub-guide-review.json`: refreshed hash for pages/hub/commander/index.js (only title text + colours changed; guide claims unaffected) as `__tests__/business-hub-guide.test.mjs` requires.
Ran: 30 hub tests touching these files + image-header-help-icon + commander-orb-sso: 320 pass after hash refresh; `node scripts/check-vendor-drift.mjs` PASSED.
REMAINING for Phase D (do in order):
D1. Render-verify. Local `next dev -p 3320` returned 500 because of a SANDBOX dev-server font-loader error (`Can't resolve '@vercel/turbopack-next/internal/font/google/font'`), not this change. Use `next build && next start` (heavy: hub build is huge; check memory) or verify on the Vercel preview via the PR. Screenshot every route at 393px and 1280px; check header (scene, seal, title, painted "?" not colliding with each page's own menu/grid button on the right: `.cmd-header-full > * { padding-right: 52px }` reserves room), panels, buttons, inputs, empty/loading/error states.
D2. Per-page review: headers vary (venues/rewards put search/balance cards INSIDE the header; waitlist/[venueId] uses inline `S.headerTitle` styles instead of `.cmd-header-full`, so give it the SD header). Remove leftover subtitle sentences under titles if Dan's "no descriptions" ruling applies (Commander staff app rule 2026-10-17; hub pages follow docs/SMARTERDESIGN.md image header). index.js still uses a `Grid3X3` button in its header (allowed; shell test only).
D3. Add hub law test (e.g. `__tests__/hub-commander-smarterdesign.law.test.mjs`) pinning: palette `--check` clean on these dirs, SD layer present, CommanderPageShell scene map + painted help, no rivets rendered. Wire it into a workflow or npm script (the meta-guard `__tests__/_test-guards-exist.test.mjs` fails on any test file not referenced by a workflow/npm script; I wired commander-orb-sso into CHECK 8 the same way). Test files must use `fileURLToPath(new URL(..., import.meta.url))` (law `__tests__/a-test-that-reads-nothing-fails.law.test.mjs`).
D4. Rename to a shippable branch (e.g. `fix/hub-commander-smarterdesign-20261127`), amend/replace the `wip:` subject, open PR, pass ~170 checks (key: Pre-Deploy Safety Checks incl. CHECK 8 and "Messenger Attachments Render As Attachments" step, Vercel Build Parity, Chromium and WebKit footer contract), squash-merge, verify Vercel hub-vanguard READY + smarter.poker/api/health version = merge SHA, then live check signed-out routes.

---------------------------------------------------------------------------------------------------
## 6. REMAINING BACKLOG (told to Dan at 11:15 PM; none started except Phase D)

2. Colour pickers can reintroduce banned hues: `pages/commander/clock-setup.js` (type="color" lines ~314, ~432), `pages/commander/game-types.js` (~243), `pages/commander/waitlist/desk.js` (~1465 theme editor; defaults `headerColor` now #3A8FC0). Restrict to an approved SD palette (white/silver/ice/cyan/cobalt/blues + semantic green/red) and normalise saved banned values (DB settings) at render to nearest approved colour. Display boards read `c.headerColor` in `pages/commander/displays/waitlist.js` too.
3. Signed-in live proof in CI: extend `.github/workflows/login-bridge-probe.yml` e2e job (secrets PROBE_EMAIL/PROBE_PASSWORD) with a Playwright pass that signs in, opens each staff route in `src/components/commander/shared/pageHeaders.js`, asserts `[data-page-image-header]` and exactly one `[data-page-help]`, uploads screenshots as artifacts. Do NOT add a new `schedule:`; reuse that workflow (hub/commander CI governance).
4. Hydration warnings (React #425/#423) on ~36 Commander pages that render times (grep `toLocaleTimeString|new Date()` in pages/commander) - reproduce on main too. Fix by rendering time client-only after mount (state set in useEffect) so SSR and first client render match.
5. Dead code: retired routes `pages/commander/tournament-clocks.js`, `tournament-registration.js`, `tournaments/[id].js`, `tournaments/[id]/break-manager.js` only redirect - reduce to redirect-only pages (check `next.config.js` redirects and the 113-page count asserted in `tests/integrity/global-header.test.mjs`, which counts pages; update both registry `PAGE_HEADERS` entries and `HEADERLESS` set in `tests/unit/smarterdesign.law.test.js` accordingly).
6. Polish: PIN gate copy "ACCESS RESTRICTED" / sentence-case subtitle -> Title Case (in CommanderLayout vendored AND upstream commander-shared; upstream-first per Commander law 3.5); align page content widths with the header (header wrap max-width 1600px); raise 10-11px body text (Comps, Floor Calls, Incidents) to readable minimum.
7. Not doable without new artwork: a distinct seal+scene per page (library has 37 pairs + cashier; Commander has 89 pages, sections share art). Table graphics `poker-table-black-gold.png` (tables.js, table-tablets.js, tablet/[tableNumber].js, waitlist/desk.js, displays/tables.js) should become the Club Arena table skin (separate rebuild). Club Commander desktop app repo `Smarter-Poker/club-commander-desktop` not reviewed.
8. Pre-existing, not fixed: none beyond #4.

---------------------------------------------------------------------------------------------------
## 7. ARTWORK AND IMAGE LOCATIONS

Commander (public/images/smarterdesign/, added in #166):
- Chrome nine-slices: chrome-readout.webp (slice 21, drawn 8px; painted rim 3.5px), chrome-row.webp (13 / 4px), chrome-active-v2.webp (11 / 4px), chrome-active.webp, chrome-stat.webp (11 / 4px). Painted help: header-help.webp (36x37 render, 44px target, class .sd-header-help).
- Header pairs `headers/<art>-seal.webp` (176x176) + `-scene.webp`: casino_table, players, jarvis, news, bankroll, receipts, toke-shift, goals, staking-profile, rules, tournament-calendar, store-rewards, poker_cash, series, toke-home, toke-venues, export, sports, settings, vip, store-cart, store-diamonds, poker_mtt, tax, toke-analytics, reports, slots, store-orders, cashier.
- cashier-scene.webp = right 70% crop of Club Arena `/Users/smarter.poker/Documents/club-arena/public/images/cashier/cashier-vault-hero-v1.webp` (1672x941); cashier-seal.webp = `club-arena/public/images/club-arena/vault-iris-emblem-v1-320.webp` resized 176.
World Hub source library: `public/images/smarterdesign/headers/` (37 pairs: bankroll casino_table expense export goals jarvis news players poker-odds poker_cash poker_mtt receipts reports rules series settings slots sports staking staking-profile store-cart store-club-shop store-diamonds store-merch store-order-detail store-orders store-rewards store-wishlist tax toke-analytics toke-home toke-shift toke-vault toke-venues tournament-calendar trips vip), plus `vip-crest.webp`, `plates/`, `chrome-*.webp`, `header-help.webp` (master `public/images/header-help-v4.png`). Cashier header reference image: `.agent/skills/smarterdesign/references/cashier-header.webp`.
Old painted UI no longer referenced by Commander (still in `public/images/commander/`): cashier-panel.jpg, print-new-card.png, kiosk-welcome.png, card-*.webp, icons/*.png, /images/upgrade_modal_bg.png. Membership mockup was remote: `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/commander/membership-plans-bg-user-clean.jpg`. Candidates for deletion once you confirm no other references (grep both repos).
Evidence screenshots (this session, copied to /Volumes/SmarterArchives/agent-evidence/commander-smarterdesign-01UxDLnL/): headers-sheet.png (art library contact sheet), cashier.png (vault + emblem), sheet1/2/3.png, grid0/1/2.png (24 staff pages desktop), dash.png (OLD painted dashboard), dash2.png (NEW dashboard), mob.png (393px dashboard/cashier/members), final1.png (kiosk, TV bars, membership plans), headerless.png (displays/kiosk/tablet/login/register).

---------------------------------------------------------------------------------------------------
## 8. HOW TO VERIFY LOCALLY (recipe that worked)

Commander: in an owned worktree, `npm run build`, then `PORT=3311 npx next start -p 3311` (kill the old `next-server` first: `fuser 3311/tcp` then kill, otherwise a stale server serves half-replaced chunks). Playwright (in commander node_modules) with `addInitScript` seeding localStorage: `commander_staff` = {id:'probe', user_id:'probe', venue_id:1, role:'owner', expires_at: +6 days ISO}, `commander_subscription` = {tier:'enterprise', status:'active'}, optional fake `smarter-poker-auth` session (triggers PIN gate; needed for Dashboard). Assert `[data-page-image-header]`, count `[data-page-help]`, `.cmd-sd-header__title` text. Screenshot 1280x900 and 393x860.
Gates: `npm test`; `npm run test:global-header`; `node scripts/check-vendor-upstream-sync.mjs`; `node scripts/smarterdesign-palette.mjs --check pages src vendor/commander-shared/src styles`.
Hub: `node --test` on targeted __tests__ files; `node scripts/check-vendor-drift.mjs`; full `npm ci` takes minutes; dev server font loader fails in the sandbox (see D1).

---------------------------------------------------------------------------------------------------
## 9. MERGED / LIVE LEDGER (all times Central, 2026-11-27)

| Item | PR | Merge SHA | Live |
|---|---|---|---|
| Header photo + hub geometry (upstream) | commander-shared #89 | d931116 | source pkg |
| Hub orb SSO fix | World Hub #3203 | 555c9dd | yes (dpl_21kj3wrm62eETCxx5py5UyZ2ZfjW) |
| Auto-bridge login + header photo/frame | Commander #163 | 5b7be05 | yes (dpl_HHk7SsGH1jLXs4crtLWAxKcFJ1mb) |
| Probe browser job runner pin | Commander #164 | a075b1c | CI only (green 9:16 PM) |
| e2e expired race | Commander #165 | 76fbbe0 | CI only |
| Palette + PageHeaderSlot (upstream) | commander-shared #90 | 8758350 | source pkg |
| #SmarterDesign every staff page + effect fixes | Commander #166 | 2fa3c31 | yes, 10:26 PM (dpl_G5xm5HoGKuafhamWkJomSGrxCmA3) |
| /hub/commander player pages | (no PR) | wip 09e3456 | NO - parked |

NOT PUSHED / NOT PUBLISHED: only Phase D (hub WIP branch above) and backlog items 2-6.
Leftover unmerged local branch in my cloud clone `fix/commander-stays-signed-in-header-20261127` (never pushed; superseded by #163) - ignore.

---------------------------------------------------------------------------------------------------
## 10. FIRST ACTIONS FOR YOU

1. Read the three repos' CLAUDE.md/AGENTS.md/PUBLISHING.md. `add_repo` World Hub (push), clone `--depth 1 --filter=blob:limit=2m`, `git fetch --depth=5 origin wip/hub-commander-smarterdesign-20261127` and check it out; rebase onto current origin/main (fetch depth 50; rebase only your commit).
2. Finish Phase D (D1-D4), ship, verify live.
3. Then backlog 2 -> 3 -> 4 -> 5 -> 6, each through PR, CI, merge, live verify, changelog file per change (Commander: one file per change in docs/changelog/).
4. Report to Dan with a pass/fail checklist and Central times. Do not ask him to do anything you can do.
