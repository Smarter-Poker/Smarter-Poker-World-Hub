# Training Phase 4 Poker Truth And Question Contract Audit

Date: 2026-08-31
Status: In Progress
Scope: 107 canonical games, 12 levels per game, compatible production cache, deterministic engine fallbacks, static Training questions, and shared serving contracts.

## Current Evidence

- The machine-checkable question ledger covers 107 games, 1,284 game-level cells,
  25,958 compatible cached questions, and 1,016 live-engine fallback questions.
- The ledger records every audited question ID, content fingerprint, game, level,
  runtime origin, engine family, declared street, decision type, answer count,
  solver source, chronology repair, validity result, and issue list.
- A total of 269,740 truth assertions currently pass. They cover meaningful
  prompts and explanations, legal concrete cards, card uniqueness, street/board
  agreement, positive numeric state, distinct seats, legal minimum raises,
  unambiguous opening language, and honest solver provenance.
- The existing local generator matrix covers all 107 games and all 1,284 cells.
  It checked 8,520 generated questions with 116,765 passing assertions and zero
  failures. Database-only solver cells remain covered by the read-only live
  ledger rather than being represented as local synthetic solver output.
- Fourteen focused question-contract tests pass, including the strict four-choice
  rule, literal Yes/No and Push/Fold exceptions, non-hinting choices, legal
  postflop node actions, preflop response depth, and explicit manual Next.
- The protected `npm run build` command now includes the Phase 4 truth-ledger
  test as a mandatory release gate. The full repository prebuild, Training,
  leak-engine, marketplace, TypeScript, webpack, and 402-page generation path
  completed successfully on the release candidate.
- The built production server was exercised at 1440×1000 and 390×844. Both
  viewports rendered the Club Arena training table with exactly four meaningful
  actions, zero horizontal overflow, zero broken images, zero scanline elements,
  and zero console errors. Submitting an answer displayed explicit Incorrect,
  Your Answer, Correct Answer, coaching explanation, and one persistent manual
  Next Question control; the question did not advance automatically.

## Defects Found And Repaired

1. Cached and engine questions could carry `Villain checks` even when the hero's
   recorded seat must act first postflop. The shared serving contract now uses
   the canonical seat-order utility, changes an out-of-position node to `You are
   first to act`, and names the checking seat when the hero is in position.
   The current read-only production corpus required more than 20,000 such
   narration normalizations across cached and generated questions.
2. The solver hand concretizer checked only the first rank when choosing a suit
   for an abstract suited hand. On some river boards it could therefore reuse
   the second rank's exact board card. It now requires both ranks to be legal in
   the same suit, searches legal offsuit pairs without a blocked-card fallback,
   rejects impossible abstract combos, and filters them before selection.
3. The live-source audit previously returned only aggregate counts. It now emits
   the complete 1,284-cell and 26,974-question coverage ledger and fails closed
   on answer, chronology, card, state, explanation, or provenance defects.

## Publication Exit Items

- Publish through the protected pull-request pipeline without altering the
  approved global header.
- Verify the exact merged production build and affected gameplay paths.
- Record the protected PR, merge SHA, production SHA, screenshots, and final
  browser evidence before reporting Phase 4 complete and opening Phase 5.
