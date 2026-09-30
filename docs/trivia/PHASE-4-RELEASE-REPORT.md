# Trivia Phase 4 Release Report: Design System, Shell and Unique Art

Date: 2026-09-30. Owner: p4-art (Trivia Casino Realism program).
Release: PR #2050, squash merge `cbb9d9b882761850d842b3bf833e254238581157`, Vercel `hub-vanguard` production deployment `dpl_2rAn2wYgmMVPz6FTdYwxfUFARdLL` (READY; `https://smarter.poker/api/health` reports the merge commit).

## Summary

The owner-directed Console redesign (PR #2021) had already delivered Phase 4's visual system, shell and core primitives. The remaining gap was the unique art program: every Trivia destination printed its own lobby thumbnail as its central picture, which non-negotiable requirement 2 forbids. All sixteen families (the lobby and the fifteen modes) now open on their own art, delivered responsively with reserved space and previews, and the service worker keeps Trivia art in a cache named for the exact art set, so replaced or rejected art cannot survive on an installed phone. The accessibility and layout gates were automated at every width the plan names; the defects they found in Trivia were fixed in the same release.

Phase 4 is delivered with one human gate open: Dan's design review of the art and states. The packet is `$T/evidence/p4-art/review/trivia-phase4-design-review.pdf` (program evidence folder on the external SSD).

## Audit of Phase 4 against main

| Phase 4 item | Found on main (after the Console redesign, #2021) | This release |
|---|---|---|
| Tokens, inks, focus ring, black canvas | Met by the owner-directed Console redesign; its master inks replace the plan's token names | Unchanged |
| Type (plan: Rajdhani/Orbitron + Inter) | Owner law substitutes Roboto Condensed for chrome type, Inter for copy | Unchanged |
| Frames, rails, wells, states | Painted spade chassis and five frame families; hover is banned by owner law | Forced-colours edge added to the two banner buttons |
| Scoped styles | Console CSS modules and `trivia-console-*` sheets; large inline `<style>` blocks remain in the lobby and pages | Not changed (restyle risk; page owners) |
| Shell with header/footer/safe areas | TriviaConsole + world sheets | Verified: no control hidden behind header, footer or safe area at any tested width |
| Typed registry with art key | Registry owns id, route, copy, entry/reward, thumbnail | Intro art keyed by the same family id in `src/config/triviaIntroArt.mjs`; rules version, SEO and analytics id still absent (see Pending) |
| Shared primitives | TriviaConsole, TriviaConsoleDialog (dialog + focus manager), TriviaFrameCard, TriviaAnswerOption, useFitText | New `ResponsiveModeArt`; fit hook fixed; others listed under Pending |
| Mobile image above copy and action | Met | Verified at 320-430 |
| Desktop distinct composition | Console law caps every console at 1000px with black margins | Intro art switches to a 12:5 cinematic band from 768px |
| Daily header and Quick Stakes footer identity | Met, pinned by hash | Untouched (hashes still pass) |
| Unique art per family | **Gap**: every destination printed its own lobby thumbnail | Sixteen new destination masters |
| 640/960/1440 AVIF/WebP, sizes, crops, alt, priority, hashed names | Single 1024px WebP per picture | Met for all destination art |
| Service-worker migration | Generic 30-day CacheFirst `static-assets`; only the page's Cache Buster cleared caches | Dedicated `trivia-art-<digest>` cache with activation purge |
| Automated gates | None for Trivia at the plan's widths | `scripts/trivia-ui/a11y-pass.mjs`, `state-pass.mjs` |

## Unique art program

- Sixteen destination masters, one per family (lobby, daily, arcade, history, rules, pro, mtt, cash, icm, gto, endless, mixed, survival, time attack, pvp, tournaments), in the modes-console-v1 art language: the redesign's style block reused verbatim, positive-only wording, 1536x1024 masters.
- Model: Tongyi-MAI Z-Image-Turbo, Apache-2.0, run locally with mflux 0.19.2 (MIT) on mlx 0.32.3 (9 steps, no guidance, bf16). Three seeds per family (4101/4202/4303); picks recorded with prompt text, seed, source hash, grade, crop boxes and file hashes in `docs/trivia/evidence/p4-art-intro-art-manifest.json`. Pipeline: `scripts/trivia-art/`.
- Grade: the redesign's hue-selective desaturation (electric blue kept; PvP also keeps its crimson). Text-free, no logos, no real people, no brand marks; all essential copy stays in HTML.
- Distinctness (`docs/trivia/evidence/p4-art-intro-art-proof.json`): 1,056 pairs of every new crop against every lobby thumbnail (13 cards, Daily header, Quick Stakes footer, World Hub Trivia card, the two retired intro scenes) and against every other family. Criterion: 64-bit DCT pHash >= 12 and 256-bit dHash >= 48. Results: pHash minimum 18 overall and 26 against a family's own thumbnail; 256-bit dHash minimum 51. The 64-bit dHash (minimum 4) is recorded but not a criterion: on black-first, centre-lit art its 9x8 grid measures the shared lighting falloff, not the picture.
- Quiet gameplay backgrounds were produced for every family (blurred, 30% exposure, edges to black) but not shipped: the owner's console law keeps the canvas and glass black and never lays art behind art. They are in the review packet for Dan's decision (provisional, owner may change).
- Result accents: none shipped. Results already carry the prize wheel and ledger; a picture there would push the data down or sit art on art.

## Delivery

- `src/components/trivia/console/ResponsiveModeArt.jsx`: a `<picture>` with a 16:10 crop below 768px and a 12:5 band from 768px, each as AVIF then WebP at 640/960/1440 with intrinsic width and height. File names carry the first 10 hex of the file's sha256 (`public/images/trivia/intro-v1/<family>-<crop>-<width>.<hash>.<ext>`), so a changed picture is always a new URL.
- Reserved space: the box's aspect ratio is fixed before a byte arrives and painted with the picture's own 32x20 preview (inline, about 200 bytes), so a slow network, a fast scroll or a failed file never shows an empty panel; a failed file is hidden and the preview stays. Lobby card wells now paint a preview of their thumbnail the same way.
- Alt behaviour: decorative (`alt=""`, hidden from assistive technology) because the title, description and terms beside it are live HTML; `alt` can be passed where a picture is the sole content.
- Priority: eager with `fetchpriority=high` only for the hero of the current page (every destination intro); the lobby art stays lazy because the Daily header is the lobby's hero.
- Wired into: `[mode].js` (daily, arcade, history, rules, pro), `StrategyTrivia.jsx` (mtt, cash, icm, gto), endless, mixed, survival-game (and the /survival alias), time-attack, pvp, tournaments, and the lobby above "Choose Your Game". Dead hero CSS removed.
- Superseded files deleted: `modes-console-v1/daily.webp` and `arcade.webp` (used only by the old intros) and three orphaned `public/trivia/panels/*.jpg` (no reference anywhere).

## Service-worker migration

Before: Trivia pictures shared the generic 30-day CacheFirst `static-assets` cache; only the page's Cache Buster (which needs working localStorage) ever cleared it. Now `next.config.js` routes every same-origin `/images/trivia/` request to its own CacheFirst cache named `trivia-art-<first 10 hex of the digest of every file under public/images/trivia>` (currently `trivia-art-32d8d51ff2`), ahead of the generic rule. On activate, `worker/index.js` deletes every other `trivia-art-*` cache and any Trivia picture still held by `static-assets`, and never fails activation (push lives in the same worker). `__tests__/trivia-intro-art.test.mjs` recomputes the digest: changing any Trivia art without renaming the cache fails the build, so replaced or rejected art cannot survive on an installed phone. The prior intro mapping is kept in `docs/trivia/evidence/p4-art-prior-intro-art.json`.

## Public asset budget

`scripts/ci/check-public-budget.mjs` was raised explicitly by this change's net only: `BUDGET_BYTES` 272,000,000 -> 275,750,000 and `BUDGET_FILES` 1,850 -> 2,037. Added 192 files (4,342,047 bytes); removed 5 superseded Trivia files (593,027 bytes); net +3,749,020 bytes and +187 files. main was already over budget before this change (297.9 MB across 1,961 files against 272.0 MB / 1,850); that excess belongs to other areas and is not absorbed here. CHECK 21 in `build-safety-gate.yml` still cannot fail because its `node ... | tee` pipeline runs without `pipefail`; reported, not changed.

## Accessibility and layout gates

Tools: `scripts/trivia-ui/a11y-pass.mjs` and `scripts/trivia-ui/state-pass.mjs` (system Chrome, Playwright 1.62.1, axe-core 4.13.0, reduced motion emulated, signed out, every Supabase call answered in the browser so nothing is written). Routes: all 21 Trivia URLs. Viewports: 320, 375, 390, 430, 768, 1024, 1280, 1440, landscape 844x390, 200% zoom (640x450) and 400% reflow (320x256). Counts are pages with the issue (`docs/trivia/evidence/p4-art-a11y-summary.json`).

| Check (231 page loads) | Production before | Final candidate |
|---|---:|---:|
| Horizontal overflow | 0 | 0 |
| Not exactly one h1 | 0 | 0 |
| Broken images | 0 | 0 |
| Trivia controls under 44px | 0 | 0 |
| Controls hidden behind header, footer or safe area | 4 (400% zoom) | 0 |
| Axe serious or critical in Trivia content | 11 (arcade leaderboard) | 0 |
| Keyboard stops not visible or without the focus ring | 0 | 0 |
| Labels cut by their painted rim | intermittent (re-check) | 0 (and 0 in 3 repeat runs) |
| Intro art present | 0 | 187 |

State scenarios, final candidate: 15/15 pass. The lobby's Diamond Entry dialog takes focus, keeps Tab inside, closes on Escape and returns focus to the card; a failed intro picture and a 6-second-slow one keep the reserved box and preview on phone and desktop; a fast scroll with slow pictures leaves no empty picture well; forced colours keep a visible boundary on every Trivia control; 40-character names with 9-digit scores cause no overflow at 320 and 390; signed-in Mixed, PvP and Tournaments intros render their art at 390 and 1440.

Defects the gates found and this release fixed: fitted labels could be cut by their rim under reduced motion (the world sheet's 0.01ms transition on every element made the fit hook measure a stale font size; `useFitText` now exempts fitted labels from transitions and also re-fits on late font loads); the arcade leaderboard's loading and empty rows sat in a list without being list items; at 400% zoom the lobby's sticky filter rail covered the cards; the Daily and Quick Stakes banner buttons had no boundary in forced colours.

## Live verification (production, `cbb9d9b`)

- `https://smarter.poker/api/health`: status ok, commit `cbb9d9b882761850d842b3bf833e254238581157`, deployment `dpl_2rAn2wYgmMVPz6FTdYwxfUFARdLL`, database ok.
- New art is served with the right types (`image/avif`, `image/webp`); a retired file (`modes-console-v1/daily.webp`) now answers 404; PvP and Tournaments still redirect to the lobby (release flags off).
- Live pass on all 21 URLs at 390 and 1440 (42 loads): 0 flagged, 0 labels cut, every destination shows its own art; the signed-in Mixed intro (fixture session answered in the browser) shows its art at 390 and 1440.
- Service-worker migration on a real installed profile (`sw-proof-before.json` / `sw-proof-after.json`): before the release the worker's `static-assets` cache held 8 Trivia pictures; after the new worker activated it held none (its 3 other entries untouched) and `trivia-art-32d8d51ff2` held the 16 Trivia pictures in use. The page-level Cache Buster was disabled for this experiment, so the purge is the worker's own.

## Evidence

In the repository: `docs/trivia/evidence/p4-art-intro-art-manifest.json` (prompts, seeds, model, licence, crops, grades, file hashes), `p4-art-intro-art-proof.json` (distinctness), `p4-art-prior-intro-art.json` (rollback record), `p4-art-a11y-summary.json` (gate counts and scenario results). Tools: `scripts/trivia-art/`, `scripts/trivia-ui/`. Regression tests: `__tests__/trivia-intro-art.test.mjs` (in `prebuild`) and additions to `__tests__/trivia-console-contract.test.mjs`.

On the program evidence SSD (`$T/evidence/p4-art/`): generation candidates and exports (`art/`), per-page results and screenshots before, after and live (`a11y-before/`, `a11y-after/`, `a11y-live/`), service-worker proofs, build logs, and the design-review folder `review/` (combined `trivia-phase4-design-review.pdf`, 15 pages, 5.6 MB; per-family comparisons; state shots; live shots; quiet-background candidates).

## Pending and why

- **Design review (human gate).** Dan reviews the packet: per family, lobby thumbnail against the new phone and desktop art, destinations before and after at 390 and 1440, key states, and the unshipped quiet backgrounds.
- **Real screen reader and real devices.** The automated passes check names, roles, focus order and visibility; a VoiceOver/TalkBack run and real-phone checks need a person.
- **Owner-law conflicts, not changed:** (1) the plan puts the image above the title on mobile intros, but the approved chassis prints title and status in its painted head above the body; (2) the plan asks for 12-column desktop layouts with side rails, but the console law stops every console at 1000px with black margins; (3) quiet gameplay backgrounds would lay art behind the black glass. Each needs Dan's ruling.
- **Registry fields owned elsewhere:** rules version (Phase 2 rules registry), SEO and analytics id are not in `triviaModeRegistry.mjs`.
- **Named primitives not yet shared:** TriviaQuestionStage, TriviaProgress, TriviaResultLedger, TriviaDataBoard, StateBanner, DiamondValue, TransactionReceiptLink, HouseHorseBadge. They belong to the surfaces Phases 7-10 are rebuilding (p810-ui for solo, knowledge and progress pages; Phase 2 for receipts).
- **Lobby thumbnails** remain single 1024px WebP files (unique and text-free since #2021); converting them to responsive sets would add 156 files for pictures shown at 190-340px.

## Outside this phase (reported, not fixed)

- `src/world/components/ReturnBurst.tsx` references `/cards/{trivia,social,club,training,diamond,friends}-card.png`; none of those files exist.
- `public/cards/trivia.png` (1.0 MB) has no reference anywhere; the World Hub orb uses `trivia.webp`.
- The shared site header has 8 controls under 44px at phone widths (every page).
- CHECK 21 (`public/` budget) never fails in CI (no `pipefail`), and main is 25.9 MB over its budget from other areas.
- The world sheet's reduced-motion rule sets `transition-duration: 0.01ms !important` on every element, which turns elements with no transition into `all` transitions; Trivia's fitted labels are now exempt, but other worlds using the same pattern could hit the same stale-measurement bug.

## Rollback

Revert the squash-merge commit: it restores the previous intro images, page code and the old cache rule in one step. Deploying the revert changes the art digest again, so the next worker activation deletes the `trivia-art-*` cache and installed clients re-fetch. To replace rejected art instead, re-run `scripts/trivia-art/` for the family, run `node scripts/trivia-art/art-cache-name.mjs`, and put the new name in `worker/index.js` and `next.config.js` (the test enforces it).
