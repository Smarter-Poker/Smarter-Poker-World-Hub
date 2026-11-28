# Preflop Charts: every page, subpage, game and button in #SmarterDesign (2026-11-27)

Dan, verbatim: "PREFLOP CHARTS NEEDS THE SAME #SMARTERDESIGN UPGRADE TO EVERY SINGLE PAGE, SUBPAGE, BUTTON AND EVERYTHING ELSE, EXACTLY LIKE WE'VE DONE FOR EVERY OTHER WORLD HUB PAGE... MAKE ANY AND ALL OPTIMIZATIONS, ENHANCMENETS, UPGRADES AND SIMPLIFLICATIONS NOW."

Preflop Charts (`/hub/preflop-charts`, also opened inside Club Arena's "+" tab) kept its image header but everything under it was the older console: hairline boxes, gold and violet kickers, a purple Smart Practice panel, pill-shaped gold and pink game buttons, emoji icons and the Orbitron face. It now uses the same vocabulary as Bankroll Manager, Training and Trivia (`docs/SMARTERDESIGN.md`, `styles/smarterdesign.css`).

## What changed

- **One chrome layer**, `src/styles/worlds/preflop-smarterdesign.css`, loaded after `memory-games.css` and `styles/smarterdesign.css`: every surface sits in the `chrome-readout` nine-slice rim on ink navy, rows use `chrome-row`, readouts use `chrome-stat`, controls are steel keys and the selected or primary control is cobalt in `chrome-active-v2`. White titles in the condensed face, silver body, ice-blue kickers.
- **Menu:** section nav as steel keys with the current page lit; Daily Local Practice, Smart Practice (chrome Jarvis medallion instead of the violet halo), Jarvis Suggestions, the mode picker (one ice accent, cobalt selection), Daily and Rankings keys, launch cards, the level path (current station lit cobalt, mastered green, locked dimmed), the 85% Mastery Gate, the matrix primer and recent sessions.
- **Scenario filter, Range Lab, results and review:** chrome cases and keys, dark field wells, wrapped action labels ("Raise Small" no longer truncates), the review panel's grade card, readouts, jump list, solution toggle and mistake rows.
- **Game screens:** Speed Drill, Pressure Cooker, Pattern Recognition, Local VS and Mixed Strategy now render one shared `src/components/memory-games/PreflopGameKit.jsx` (frame, top bar, intro, result card, weakness list, actions, share, coach tip, suggested next, next button) instead of five inline-styled copies. Spot Trainer's launcher uses the same rims. Emoji icons became Lucide icons; the accuracy bar, position weakness map and power-up keys are chrome.
- **Subpages (My Stats, Ranks, Awards, Guide):** Back To Preflop Charts sits above the image header (`BankrollImageHeader` `back` prop), the section nav sits below it, and each page's readout is a chrome chip inside the header instead of a stray "-", "PAUSED", "0%" or "GUIDE" under it. Kickers are title case.
- **Colour:** gold, amber, yellow, violet, purple, pink and magenta type removed at the source (CSS tokens, inline styles, grade colours, power-up colours). Grades read S ice, A green, B blue, C silver, D red. The six Range Lab action colours are data fills and are unchanged.
- **Honest copy:** the menu's rankings panel said "Top Scores Win Prizes!" next to "No Account Reward"; it now says these local rankings carry no prizes, rewards or account rank. The suggested-next card no longer offers "VS Ranked" for a simulated local drill.

No behaviour, data reads, scoring, timers, routes or keyboard shortcuts changed. Every animation still plays.

## Guard

`__tests__/preflop-charts-smarterdesign.law.test.mjs` pins the layer order, the banned hues on every Preflop Charts surface, the shared game kit, the subpage header order and the no-emoji rule. `__tests__/daily-challenges-casino-realism.test.mjs` now requires Preflop Charts to carry no gold token (the later #SmarterDesign colour rule), the same way it already treats Daily Trivia.
