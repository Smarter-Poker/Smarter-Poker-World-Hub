# Training Phase 4 Poker Truth And Question Contract Audit

Date: 2026-08-31
Status: In Progress
Scope: 107 canonical games, 12 levels per game, compatible production cache, deterministic engine fallbacks, static Training questions, and shared serving contracts.

## Current Evidence

- The final read-only production ledger covers all 107 games and all 1,284
  game-level cells: 223 cache-backed cells and 1,061 deterministic-engine
  cells. It audited 5,895 compatible cache questions and 4,244 freshly
  generated questions while rejecting 21,242 rows from the wrong subject,
  family, stack, street, or provenance contract.
- The ledger records every audited question ID, content fingerprint, game, level,
  runtime origin, engine family, declared street, decision type, answer count,
  solver source, chronology repair, validity result, and issue list.
- A total of 101,390 truth assertions pass with zero failures. They cover meaningful
  prompts and explanations, legal concrete cards, card uniqueness, street/board
  agreement, positive numeric state, distinct seats, legal minimum raises,
  unambiguous opening language, and honest solver provenance.
- The final ledger applied 607 chronology repairs before validation. Every
  repair is fingerprinted and every repaired question is revalidated rather
  than being accepted by source label.
- Ninety focused Phase 4 contract, runtime-wiring, adversarial, warehouse, and
  question-integrity tests pass. They include the strict four-choice rule,
  literal Yes/No and Push/Fold exceptions, non-hinting choices, legal node
  actions, preflop response depth, exact multi-street continuation, and
  persistent manual Next.
- The exhaustive warehouse pass audited 516,973 rows across all 25 Training
  Pio family/stack contracts: 409,307 matrices are structurally reusable and
  107,666 require replacement. River alone contains 189,679 audited rows,
  including 169,401 reusable matrices and 20,278 replacements. Reusability is
  never misrepresented as exact runtime certification.
- Production now has all nine provenance columns, both provenance constraints,
  `sp_require_solver_write_provenance`, and the write trigger. A transactional
  probe proved that an unsealed material write is rejected. The fixed cache
  snapshot remains at zero exact-state, provenance-complete runtime rows, so
  Training fails closed to audited curriculum instead of claiming solver exact.
- The final candidate passed the complete production build. The Training build
  suite passed 122/122, the leak suite 105/105, Marketplace 200/200, Trivia 7/7,
  and Next.js compiled and generated all 403 static pages.
- The rebuilt candidate passed all 192 browser route checks: 96 Training routes
  at desktop and mobile widths, with zero route, overflow, broken-image,
  scanline, page, or relevant console failures.
- The authenticated runtime matrix passed all 428 surfaces: all 107 canonical
  games through both `/play` and `/arena` on desktop and mobile. This includes
  174 Club Arena poker surfaces, 40 psychology surfaces, and persistent explicit
  Correct/Incorrect feedback with manual Next for `cash-001` and `psy-001`.

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
   the complete 1,284-cell and 10,139-question coverage ledger and fails closed
   on answer, chronology, card, state, explanation, or provenance defects.
4. Multi-street play could round the pot, treat chip-denominated Pio actions as
   percentages, deal a different runout, or advance after an off-tree action.
   It now advances only for the exact exported continuation, preserves the
   unrounded pot, validates hand class against concrete cards, requires exact
   positions and board length, and ends honestly when no certified continuation
   exists.
5. A context filter could restore actions it had just proven illegal. It now
   rejects the row and uses the curated curriculum. Approximate next-street
   board matching was removed; exact cards, positions, actor, and pot are
   required.
6. Historical solver writers could add legacy rows without machine or artifact
   identity. Production now rejects new or materially changed solver artifacts
   unless they carry a complete validated v2 provenance seal. Historical rows
   remain explicitly unverified and neither M1 nor M2 is credited for them.
7. The Training table demo referenced a retired hashed Club Arena felt asset and
   produced the only two failures in the first 192-check route pass. Both table
   implementations now use the current shipped Carbon Ion asset; the rebuilt
   route matrix then passed 192/192 with no broken image.
8. The exhaustive runtime audit assumed its authenticated browser state lived in
   the current worktree. It now accepts an explicit local auth-state path, so
   credentials remain outside the branch while the guarded authenticated UI is
   still exercised.

## Publication Exit Items

- Publish through the protected pull-request pipeline without altering the
  approved global header.
- Verify the exact merged production build and affected gameplay paths.
- Record the protected PR, merge SHA, production SHA, screenshots, and final
  browser evidence before reporting Phase 4 complete and opening Phase 5.
