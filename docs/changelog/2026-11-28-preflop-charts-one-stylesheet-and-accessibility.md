# Preflop Charts: One Stylesheet, Visible Focus, Reduced Motion (2026-11-28)

Preflop Charts was styled by two files: `src/styles/worlds/memory-games.css` (structure, 4,505 lines) and the #SMARTERDESIGN layer `src/styles/worlds/preflop-smarterdesign.css`, which won only because every one of its rules doubled the body class (`body.world-preflop-charts.world-preflop-charts`). Anyone editing the older file could bring back a look the layer forgot to cover; that is how fourteen gold tokens survived the first pass.

## One stylesheet

- `memory-games.css` is folded into `preflop-smarterdesign.css` and deleted. The file has three sections in order: structure, #SMARTERDESIGN dress, accessibility. Source order is the only override mechanism; no rule doubles the body class.
- 96 rules for markup that no longer exists were removed (the old hero, VIP panel, diamond stage, board streaks, coach list and others; every class checked against all page and component source), plus one unused keyframe.
- Base declarations the dress layer already overrode were deleted where dropping the doubled class would have let them win (42 declarations, for example the old cyan border on the current level card). The subpage root no longer sets its own text colour and font, so the shared #SMARTERDESIGN root sets them, as it did before.
- Two equal-specificity cases are now explicit: the command deck's primary call to action keeps its 17px label against `src/index.css`'s phone button rule, and the grade letter keeps its tone.
- Two leftover breakpoints moved onto the 900 / 768 / 600 standard (subpage nav five-across from 601px instead of 700px; circuit stats stack at 600px instead of 560px).

Verified by computed-style comparison in Chromium at 393px across 19 states (signed out and signed in; menu, four subpages, five game intros and their first screen, the Range Lab) and forced :hover / :focus-visible / :active on every control: no difference other than the intended fixes below. A second capture of the unchanged code produced the same residual noise (randomised Pattern grid, link focus carry-over).

## Accessibility (audit at 393px)

- **Keyboard focus is visible.** `src/index.css` removes outlines site-wide with `!important`, and the chrome border-image hides border-colour focus cues, so 16 of 49 Tab stops on the menu showed nothing (mode cards, Daily and Rankings keys, Filter, level actions, the primary call to action). One rule now draws a square ice ring with box-shadow on every Preflop control. The shared World menu keeps its own treatment.
- **Reduced motion.** One `prefers-reduced-motion` rule covers the whole world, including inline animations (power-up pulse, particle bursts). Game screens wrap framer-motion in `MotionConfig reducedMotion="user"`, confetti passes `disableForReducedMotion`, and `EffectsEngine.particles` returns early.
- **Contrast.** Range Lab cell labels are white on the action fills (4.07:1 to about 5:1). Locked awards show as locked through the lock icon and muted type instead of 0.6 opacity (description text was 3.05:1). Pressure Cooker's hands counter is 12px silver (was 10px at 40% white), Local VS's score separator is muted silver, and Pattern Recognition's unrevealed cells read at about 6:1 with square corners.
- **Tap targets.** Power-up keys are 44px tall (were 36px).
- The menu takes grade colours from `src/components/memory-games/gradeTone.js` instead of importing the whole game kit, so the kit and framer-motion stay in the lazy game chunks.

Not changed on purpose: the six Range Lab action colours and the Call / Raise action labels (players learn them); `VipKit` and `SmarterSeoKit` (shared components).

## Guard

`__tests__/preflop-charts-smarterdesign.law.test.mjs` requires one stylesheet after `styles/smarterdesign.css`, no doubled body class, `memory-games.css` gone, and the three sections in order. `__tests__/preflop-accessibility-phase7.test.mjs` pins the focus ring, the reduced-motion rule and its JavaScript counterparts, locked-award opacity, 44px power-up keys and the gradeTone module.
