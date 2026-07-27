# Training UI Spec — Smarter.Poker

**Status:** canonical. Supersedes ad-hoc styling in every training screen.
**Created:** 2026-07-26 · **Revised:** 2026-07-27
**Why it exists:** `GTO-WIZARD-CLONE-PLAN.md` is an *engine* roadmap — DeckEngine,
BoardTextureEngine, postflop strategy. It contains no visual or interaction
spec at all. That gap is why the training vertical shipped three different
colour schemes, two identical setup screens, and a table that never displayed
the question it was asking.

---

## 0. The feel

**Online poker, inside a video game.** Clean cut, dynamic, with depth.

Read that as a rejection of the obvious alternative. We are not tracing GTO
Wizard's interface. We take its *functionality and performance* — the scoring
model, the solver fidelity, the session controls, all of which are specified in
`GTOW-PARITY-ROADMAP.md` — and we do not take its density. That product answers
every question at once on every screen. The result is a wall, and a wall is not
a game.

Division of authority: **`GTOW-PARITY-ROADMAP.md` owns behaviour. This file owns
look and feel.** When they appear to conflict they do not — parity is measured
in what the trainer *does*, never in how many panels it stacks to do it.

What "video game" buys us, concretely:

- **Depth, not decoration.** Layered surfaces, inset tracks with content sitting
  proud of them, a lit leading edge on anything that fills. Depth comes from
  light and elevation, not from more boxes and more borders.
- **One thing is the hero.** On the hand screen that is the felt. Everything
  else is chrome and must behave like chrome — thin, quiet, out of the way.
- **State is legible at a glance.** A player mid-hand should read their standing
  from colour and motion, not by parsing five numeric readouts.
- **Motion means something.** Animate state changes the player caused. Do not
  animate arrival for its own sake.

What it forbids: diagnostic chips in gameplay chrome (a `SOLVER` or `MEDIUM`
badge is for us, not the player), the same number printed in more than one
place, and any control the player cannot act on from where it sits.

## 1. Palette

One scheme. Cyan on near-black navy. Green is a **semantic success colour
only** — never a brand accent, never a background tint.

| Token | Value | Use |
|---|---|---|
| `--sp-bg-0` | `#060912` | page background |
| `--sp-bg-1` | `#0a0e1c` | raised background |
| `--sp-bg-2` | `#0f1424` | cards, modals |
| `--sp-line` | `rgba(255,255,255,0.07)` | hairline |
| `--sp-line-2` | `rgba(255,255,255,0.12)` | emphasised hairline |
| `--sp-ink-0` | `#f8fafc` | primary text |
| `--sp-ink-1` | `#cbd5e1` | body text |
| `--sp-ink-2` | `#94a3b8` | secondary text |
| `--sp-ink-3` | `#64748b` | disabled / meta |
| `--sp-primary` | `#00D4FF` | brand accent, CTAs, focus rings |
| `--sp-good` | `#22C55E` | correct / best |
| `--sp-warn` | `#F59E0B` | inaccuracy |
| `--sp-bad` | `#EF4444` | wrong / blunder |

Category accents (library cards and badges only, never chrome):
MTT `#FB923C` · Cash `#4ADE80` · Spins `#FACC15` · Psychology `#C084FC` ·
Advanced `#60A5FA`.

**Binding rules**

- Surfaces are neutral glass (`rgba(255,255,255,0.03)`). Never tint a surface
  with the accent hue — it fights the game artwork.
- The global training theme lives in `src/styles/worlds/training.css`
  (`body.world-training`, the `--world-*` tokens). A page must not declare a
  competing `:root` palette; if a token is missing, add it there.
- Classification colours are fixed: best/correct `--sp-good`, inaccuracy
  `--sp-warn`, wrong/blunder `--sp-bad`. Never recolour these per screen.

## 2. Typography

- UI text: **Inter**, via `var(--font-inter)`.
- Numerals and scores: **Orbitron**, via `var(--font-orbitron)`, with
  `font-feature-settings: 'tnum'`.
- Fonts load through `next/font/google` in `pages/_app.js`, which generates a
  hashed family name. **Writing `font-family: 'Orbitron'` does not work** — the
  literal name is not registered and the rule silently falls back. Always go
  through the CSS variable. This exact bug made every numeric stat on
  `/hub/training` render in the fallback face.

## 3. Screen flow

Exactly **one** configuration step between choosing a drill and playing it.

```
/hub/training  (library)
      |  pick a drill
      v
SessionSetupModal        <- difficulty | timer | mode  (the ONLY setup screen)
      |  Start
      v
GodModeArena  gamePhase='playing'
```

- The arena's own splash exists **only** for entry paths that did not collect a
  config (e.g. deep links, `/hub/training/play/[gameId]` via LevelSelector).
  When `initialConfig` is passed, the arena starts at `playing`.
- Never ask for difficulty, timer or mode twice. If a caller collected them, it
  passes them; the callee honours them and does not re-prompt.
- A config screen that discards its own output is worse than no config screen.

## 4. The training table

Governed by `DEALER_BUTTON_AND_CHIP_POSITIONS_LAW.md` (canonical) for seat,
dealer-button and chip-stack coordinates. `DEALER_BUTTON_LAW.md` and
`CHIP_STACK_LAW.md` are superseded.

Required on screen at all times during a hand:

1. **The question being asked**, in plain language, above the felt. A context
   strip (`UTG · vs BB · VILLAIN CHECKS · FLOP`) is not a question.
2. Hero seated bottom-centre; villains rotated around from hero.
3. Dealer button, and a chip stack in front of every seat with money committed.
4. Board clamped to the street: preflop 0, flop 3, turn 4, river 5.
5. Pot, including the blinds preflop.
6. Action buttons showing **only actions the solver actually returned.** If the
   node has two actions, show two. Padding to a fixed count with invented
   options makes the frequency bars lie — that is worse than a short row.

Seat furniture — nameplates, stacks, hole cards, speech bubbles, chip stacks —
belongs **inside the felt's bounds at every table size**. Two ways to get this
wrong, and the trainer has shipped both: clip the container and lose the
furniture, or free the container and let the furniture bleed onto the HUD above
and the stats strip below. Neither is acceptable. The felt must reserve room
for its own furniture, and shrink to fit rather than push past its edges.

### 4.1 HUD budget (binding)

Between the question and the felt there is **one** rail. Not two, not six.

This is a hard cap because the alternative already happened: the hand screen
grew a progress bar, a classification mini-bar with its own legend row, a
position/street accuracy row of up to ten pills, a leak ticker, a mode-toggle
strip, and a second progress bar for session EV — six full-width strips, in
sequence, before a single card was visible. On a phone that is most of the
screen spent on chrome.

- Progress and quality are **the same object**: the rail fills with session
  progress, and the fill is segmented by move classification.
- Per-position, per-street, leak and distribution numbers are **session
  analytics**. They belong on the review screen, which has room to present them
  properly. They are not gameplay HUD.
- A toggle the player uses once per session does not deserve a full-width row.
  Fold it into the HUD cluster as a lit switch — lit means on, so the word
  "OFF" never has to be printed to announce that nothing is happening.
- Anything the player cannot act on is not HUD.

## 5. Feedback timing

- Feedback **waits for the player**. Auto-advance is opt-in
  (`trainerConfig.autoAdvance === true`), never the default.
- Feedback renders inline, below the action row, with the table still visible.
  A full-screen opaque overlay is a regression: the hand being explained must
  stay on screen while it is explained.
- Minimum content: classification, EV loss in bb, the solver's frequencies, the
  action taken vs the optimal action, and a one-paragraph reason.

### 5.1 Depth on request, not depth in the way

Above the fold, after a hand, a player needs four things: **the grade, the
cost, what the solver preferred, and the mix.** That is the whole default view.

Everything deeper — per-action EV tables, range matrices, strategic-why
drawers, structured explanation cards, coaching insights, the 13×13 grid — sits
behind **one** switch that starts closed on every new hand.

The failure this prevents: the feedback panel rendered twenty-five sections
unconditionally after every hand and printed the EV number in five separate
places. All of that work is good and none of it was deleted; it was simply
being shown to someone who wanted to play the next hand. Study is a mode the
player enters, not a tax on finishing a hand.

## 6. Motion

- Card deal: stagger ≤ 250ms total; cards already on the felt must not re-deal
  when a street is added. Key board cards by hand identity, not by question
  number.
- Every `exit` animation must live under an `AnimatePresence` whose *condition*
  is outside the animated component, otherwise the component never unmounts and
  the exit never runs.
- One sound per event. Do not schedule a sound in an effect and again in
  `onAnimationComplete`.
- Respect `prefers-reduced-motion`.

## 7. Accessibility and mobile

- 375px first. Touch targets ≥ 44px.
- Never rely on a keyboard-only affordance (the psychology games were
  unfinishable on touch because advancing required the spacebar).
- Keyboard shortcuts must resolve against the **same** option list the buttons
  render, and must not fire while a text input is focused or outside the
  playing phase.

## 8. Definition of done for any training UI change

1. **Foreground the browser tab before you believe anything you see.** A
   backgrounded Chrome tab stops `requestAnimationFrame` entirely — measured at
   0 frames in 3 seconds. Every framer-motion animation freezes part-way, and
   because the arena's phase switch sits inside `AnimatePresence mode="wait"`,
   the pending phase never mounts and **"Start Training" looks permanently
   dead.** It is not. On 2026-07-27 an agent "verified in production" against
   exactly this artifact and shipped a fix for a bug that did not exist. If the
   automation drives Chrome, switch to the tab first, then assert
   `document.visibilityState === 'visible'` and that rAF is ticking near 60fps.
2. Load the actual screen. "It compiles" is not verification.
3. Walk one full hand: question visible, answer, read the feedback, advance.
4. Measure, do not eyeball: compare `getBoundingClientRect()` of seat furniture
   against the felt and against the HUD. Overlap is invisible in a screenshot
   at the wrong zoom and obvious in the numbers.
5. Check 375px width.
6. Confirm no second configuration prompt appeared.
