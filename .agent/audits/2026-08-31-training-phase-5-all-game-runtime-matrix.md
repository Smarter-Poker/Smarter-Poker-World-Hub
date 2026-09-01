# Training Phase 5 All-Game Runtime Gameplay Matrix

Date: 2026-08-31
Status: Local implementation and production-build verification complete; protected publication and live production verification pending
Scope: 107 canonical games through campaign and arena routes on mobile and desktop

## Outcome

The production-build browser matrix certifies all 214 game/viewport pairs. Each
pair exercises the campaign route and arena route, then completes a 20-question
passing run and a 20-question failing run. The complete matrix executed 8,560
graded answer interactions and passed all 214 instances of:

- transient batch-preload failure recovery;
- explicit Correct feedback;
- explicit Incorrect feedback;
- persistent feedback with manual Next;
- session completion;
- passing-level transition to Level 2;
- failed-level retry at Level 1; and
- campaign resume state from authenticated progress.

The combined certificate records 642 successful surfaces: 214 campaign checks,
214 arena checks, and 214 full lifecycle checks. All 174 poker arena instances
used the Club Arena table surface and all 40 psychology instances used the
psychology scenario surface.

## Defects Found And Repaired

1. `LevelSelector` returned a bare `Response` from its deadline helper and read
   the JSON after the helper aborted its controller in `finally`. Valid progress
   responses could therefore be interrupted between headers and body parsing,
   making returning players appear `Not Attempted`. Game and progress JSON are
   now fully consumed inside the deadline.
2. `useGTOTrainer` immediately demoted a transient batch 429/5xx response to the
   one-question fallback. That could leave a session fetching one hand at a
   time against the original completion target. Batch preload now retries only
   transient responses up to three times before using the existing fail-closed
   fallback; auth and contract failures are never retried as success.
3. The prior surface matrix proved only route rendering and used representative
   feedback checks. It now supports the exhaustive lifecycle mode, 20-question
   mastery contracts, deterministic pass/fail mastery responses, explicit
   lifecycle counters, and a machine-checkable output path.
4. The first exhaustive run allowed five mobile jobs to be withheld when
   unrelated Supabase profile/avatar enrichment returned transport 503s. The
   harness now isolates PostgREST enrichment and every Training API. The exact
   withheld pairs were rerun successfully and reconciled into the combined
   214/214 certificate. No successful persistence mutation was used by the
   audit.

## Verification Evidence

- Focused runtime wiring: 36/36 tests passed.
- Complete production build: passed; 403/403 static pages generated.
- First exhaustive matrix: 209/214 lifecycle pairs passed. Five pairs were
  withheld solely by external profile/avatar 503 console errors.
- Exact supplemental rerun: 5/5 withheld mobile pairs passed with zero failures.
- Combined certificate: 107 games, 214 game/viewport pairs, 642 surfaces,
  8,560 answer interactions, and zero remaining failures.
- Approved global header source and styling were not changed.

Machine-checkable artifacts:

- `2026-08-31-training-phase-5-all-game-runtime-matrix.json`
- `2026-08-31-training-phase-5-all-game-runtime-matrix-retry.json`
- `2026-08-31-training-phase-5-all-game-runtime-matrix-combined.json`
- `scripts/training-phase5-evidence-merge.mjs`

## Publication Exit Items

- Publish the implementation and evidence through the protected pull-request
  pipeline without bypassing required checks.
- Verify production serves the merged commit.
- Run the affected campaign-resume and transient-recovery paths on production,
  plus representative poker and psychology lifecycle checks.
- Record the PR, merge SHA, production SHA, and live evidence before declaring
  Phase 5 complete and opening Phase 6.

Phase 6 is Club Arena one-to-one gameplay parity: table geometry, avatars, hero
cards, seat markers, pot, community cards, HUD, action rail, feedback layers,
and responsive pixel baselines across every gameplay state.
