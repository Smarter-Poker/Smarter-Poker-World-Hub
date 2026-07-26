# Training UI Spec — Smarter.Poker

**Status:** canonical. Supersedes ad-hoc styling in every training screen.
**Created:** 2026-07-26
**Why it exists:** `GTO-WIZARD-CLONE-PLAN.md` is an *engine* roadmap — DeckEngine,
BoardTextureEngine, postflop strategy. It contains no visual or interaction
spec at all. That gap is why the training vertical shipped three different
colour schemes, two identical setup screens, and a table that never displayed
the question it was asking.

---

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

## 5. Feedback timing

- Feedback **waits for the player**. Auto-advance is opt-in
  (`trainerConfig.autoAdvance === true`), never the default.
- Feedback renders inline, below the action row, with the table still visible.
  A full-screen opaque overlay is a regression: the hand being explained must
  stay on screen while it is explained.
- Minimum content: classification, EV loss in bb, the solver's frequencies, the
  action taken vs the optimal action, and a one-paragraph reason.

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

1. Load the actual screen. "It compiles" is not verification.
2. Walk one full hand: question visible, answer, read the feedback, advance.
3. Check 375px width.
4. Confirm no second configuration prompt appeared.
