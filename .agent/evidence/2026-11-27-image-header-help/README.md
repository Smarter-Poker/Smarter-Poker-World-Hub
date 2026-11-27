# Evidence: #SmarterDesign image-header "?" standard (2026-11-27)

Every image from the session that built World Hub PR #3168
(https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/3168, branch
`agent/claude/agent/header-help-standard`). Start with `HANDOFF.md`, which
holds the full handoff prompt. All images were converted PNG → WebP (q88) to
keep the repo small.

| Folder | What it holds |
|---|---|
| `dan-attachments/` | Dan's three screenshots from 11:45 Chicago: (1) the Club Arena "KINGS CLUB Cashier" header, which is THE reference "?"; (2) Bankroll Manager with the old flat CSS "?"; (3) Toke Tracker with the old "?" and Back To Dashboard inside the header. |
| `before-after/` | `header-help-before-after.webp`: before/after sheet shown to Dan (Toke Shift, Export, VIP Compare). `all-image-headers-393.webp`: contact sheet of all 40 headers after the fixes. `before_*/after_*`: the individual crops. |
| `sweep-393/` | One crop per page from the page-by-page sweep at 393px (and `*-1280` desktop). `results-393.json` / `results-1280.json`: measured data per header (icon src, top/right px from the header edge, text-"?" count, back-inside/back-above, help opens, missing assets). Notes: `focus-zoom` shows the keyboard focus ring hugging the icon after the fix; `recheck` is the training-page focus ring before the `data-focus-custom` fix; `dealer-ref` is the Jarvis Dealer Reference panel. |
| `regression/` | Full-viewport before (main) / after (branch) of pages using `chrome-active` (Trivia lobby, Toke Shift tabs, store VIP, Bankroll dashboard, VIP manage). `cmp_*` = side by side. They are identical on navy. |
| `zooms/` | `addz` / `addz-corner`: Add + after the chrome-active-v2 fix (no black box). `active-art`: the old `chrome-active.webp` on magenta, showing the opaque navy halo that caused the black box. `zoom_shift*`: the "?" corner clearance. |

Sweep pages (ids in `sweep-393/`):
- `bm-*` = `/hub/bankroll-manager` with `?view=` / `?type=` (`bm-export` = `/hub/bankroll-manager/export`)
- `toke-*` = `/hub/toke-tracker/*`
- `poker-tools` = `/hub/poker-tools`
- `memory-games`, `mg-*` = `/hub/memory-games/*`
- `icm`, `hand-lab`, `equity` = `/hub/training/*`
- `vip-compare`, `vip-manage` = `/hub/vip-membership/*`
- `store-vip` = `/hub/diamond-store?tab=vip`
