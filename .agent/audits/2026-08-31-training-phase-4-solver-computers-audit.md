# Phase 4 Solver Computer Audit

Date: 2026-08-31 (UTC evidence captured at 09:15)

Scope: Computer 1 (`M1`), Computer 2 (`M2`), the published 529-phase solver manifest, Training's 107-game runtime contract, the post-solve cache export path, and the Phase 4 requirement that solver provenance be exact and honest.

## Verdict

Phase 5 is blocked.

- Computer 1 is online and running the canonical unattended pipeline, but it is not solving or exporting. Its live counters remain `spots_done=0` and `rows_written=0` while its persisted cursor continues to advance and wrap through the manifest.
- Computer 2 is offline or disconnected from the canonical pipeline. Its last heartbeat is `2026-08-16T00:38:44.304822+00:00`, more than 15 days stale at the time of this audit.
- Neither computer is currently exporting solver rows.
- The active manifest is a broad warehouse manifest, not an exact Training manifest. It covers only 17 of Training's 25 PioSOLVER family/stack contracts.
- Eight missing contracts affect 43 of the 84 games labelled `PioSOLVER` in Training.
- All 529 manifest phases harvest flop and turn. Zero phases harvest river, while every level-derived postflop game requests river questions at levels 8-12 and `cash-012` explicitly requires river at every level.
- The manifest phases sampled through `sp_pending_boards` (`hu_cash|100`, `mtt_6max_chipev|100`, `spin_3max_chipev|20`, and `6max_cash|100`) returned zero pending boards. M1's continuously advancing full-manifest scan corroborates that its assigned work is exhausted or does not match the outstanding warehouse hashes.

The correct course is to retarget the farm, but not by blindly adding phase labels. The current worker patches existing rows, the legacy `postflop_complete` hashes do not follow the canonical family-prefixed shape expected by `sp_pending_boards`, and the current RPC/worker contract only plans flop parents for flop/turn completion. Publishing an unvalidated manifest now would create another idle or semantically wrong queue.

## Live Machine Evidence

| Machine | Heartbeat | Phase | Spots Done | Rows Written | Conclusion |
| --- | --- | --- | ---: | ---: | --- |
| M1 | 2026-08-31T09:15:41Z | scanning | 0 | 0 | Process alive; no solve and no export in the current run. |
| M2 | 2026-08-16T00:38:44Z | scanning | 0 | 0 | Stale/offline; no current process evidence and no export. |

Two earlier M1 samples at 08:58:08Z and 08:58:28Z moved the cursor from 515 to 71 with counters still at zero. A later sample at 09:15:41Z reported cursor 399 with the same zero counters. This is an active scanner, not an active solver.

The canonical orchestrator automatically enters solo mode when the partner heartbeat is stale and takes the whole queue. Therefore M2's outage does not explain M1's idle state. M1 is scanning the full available manifest and finding no compatible pending boards.

## Training Contracts Missing From The Active Manifest

| Family / Stack | Training Games |
| --- | ---: |
| `postflop_complete|100` | 27 |
| `mtt_6max_icm|20` | 2 |
| `mtt_6max_icm|40` | 4 |
| `mtt_9max_icm|40` | 1 |
| `mtt_9max_icm|60` | 5 |
| `spin_3max_icm|20` | 2 |
| `spin_3max_icm|25` | 1 |
| `spin_hu_icm|10` | 1 |

Total: 8 missing family/stack contracts and 43 affected games.

Two additional PioSOLVER-labelled games (`cash-001` and `cash-008`) are explicitly preflop. They must remain on the audited local range engine and must not be sent to this postflop PioSOLVER farm. `cash-008` additionally requires a true 4-bet node.

## Export And Cache Wiring Findings

1. The Windows farm publishes accuracy-gated `strategy_matrix_v2` payloads into `solved_spots_gold`.
2. Training serves `training_question_cache` first and falls back to the deterministic runtime engine when a compatible cache row is unavailable.
3. Solving alone therefore does not land new Training questions. A strict cache reseed must run after warehouse exports.
4. The reseeder had drifted from runtime: it covered 100 rather than 107 games, treated `cash-010` as ICMIZER instead of PioSOLVER, lost the declared preflop/river routing for `cash-001`, `cash-008`, and `cash-012`, stopped at level 10, preferred legacy matrices, and silently substituted different stacks, streets, or game families.
5. This audit removes those semantic fallbacks, adds all 107 configs and levels 11-12, prefers `strategy_matrix_v2`, skips postflop reseeding for the two preflop games, and applies the same four-answer/question-truth contract before any row can be written.

## Approved Retarget Plan

Before either machine resumes productive solving:

1. Define one canonical Training solver contract shared by runtime, manifest generation, and cache reseeding.
2. Decide whether the eight legacy family names are migrated to canonical farm families or supported as first-class families. Do not alias ICM to ChipEV or `postflop_complete` to an unrelated cash family.
3. Add validated range, pot, effective-stack, rake, position, and payout/ICM inputs for every new phase. ICM phases cannot be represented honestly without their payout state.
4. Extend pending-board planning and row seeding to include river targets explicitly. A boolean named `p_turn` is not sufficient evidence of river completeness.
5. Seed exact canonical scenario hashes before workers run, because the current worker patches existing rows rather than inventing missing scenarios.
6. Run the solver self-test gate, then a one-board canary for each new family. Verify `strategy_matrix_v2`, action-frequency sums, EVs, exploitability, positions, board legality, and export timestamps.
7. Assign both computers to the validated Training priority queue. M1 should take slot 0/2 and M2 slot 1/2; M1's automatic solo mode remains the outage fallback.
8. Run the strict 12-level cache reseed only after warehouse exports exist. No cross-stack, cross-street, or cross-family fallback is allowed.
9. Re-run the 107-game Phase 4 truth ledger and representative desktop/mobile production flows before Phase 5 begins.

## External Action Still Required

Direct GUI/process inspection was attempted but macOS Computer Use permission is not granted, and neither solver PC is reachable through the local SSH configuration. Database heartbeats and export counters are authoritative for pipeline activity, but restoring M2 requires access to that computer: start its canonical scheduled task/`C:\\sp-solver\\solver_tick.cmd` launcher or reboot it, then require a fresh M2 heartbeat before calling it online.

M2 should not be restarted onto new work until the validated Training manifest and river-capable pipeline are published. Restarting it now would only restore a second scanner to the same exhausted/misaligned manifest.

## Reproduction

Static, credential-free contract audit:

```text
node scripts/training-solver-contract-audit.js
```

Read-only live machine/manifest audit (with the normal Supabase environment loaded):

```text
node scripts/training-solver-contract-audit.js --live
```

The static audit currently passes with 107 configs, 84 PioSOLVER games, 2 chart games, 21 scenario games, 25 PioSOLVER family/stack contracts, two explicit preflop games, and one forced-river game. Live mode reports the machine states and the 17/25 manifest coverage without writing to any table.

