# Screenshots and reference images: #SMARTERDESIGN Training rollout (2026-11-27)

All images are WebP, 393px wide phone shots unless noted. They were captured locally with Playwright
(signed-in stub session, Supabase calls aborted), so data panels show empty, error or sign-in states.

| Folder | What it holds |
| --- | --- |
| `reference/` | Dan's attachments. `dan-ref-1-cashier-help-icon-CORRECT` is the only allowed "?" icon. `dan-ref-2-…-WRONG` and `dan-ref-3-…-WRONG` are the icons that must never appear. `dan-before-*` are his screenshots of the first four pages before the redesign. |
| `before-all-393/` | BEFORE shots of all 91 routes in `/tmp/all-routes.txt`, taken from main `3ef4e63`. File name = route with `/hub/` removed and `/` turned into `_` (for example `training_glossary.webp`, `preflop-charts_stats.webp`). `report.json` has per-route data: header present, help icon present, forbidden-ink text, h1. |
| `first-four-pages/` | ICM Calculator, Preflop Charts, Goals, Training Leaderboard. `before-*` = main, `after-*` and `final-*` = commit `7928dae`, at 393px and 1280px (desktop shots resized to 640px), in populated, empty, error, signed-out, help and ranges states. |
| `sheets/` | Before/after comparison sheets shown to Dan (`compare-phone-1`, `compare-phone-2`, `desktop-after`), the generated seal contact sheet (`seals`), the art sheet (`art`), and other review sheets. |

**AFTER shots for the 87 remaining routes do not exist yet.** That is the next agent's job P1 in
`../2026-11-27-smarterdesign-training-rollout.md`. Save them as `after-all-393/<same file name>.webp` so
every before shot pairs by name with its after shot.

Production art (committed, served by the site):
- `public/images/smarterdesign/help-chrome.png` is the approved chrome "?" (byte copy of Club Arena's `header-help-v4.png`).
- `public/images/smarterdesign/headers/<slug>-seal.webp` and `<slug>-scene.webp` are the header art for each page.
  `scripts/design/generate-training-header-art.py` regenerates everything except the four hand-made pairs
  (`icm`, `preflop-charts`, `training-goals`, `training-leaderboard`).
