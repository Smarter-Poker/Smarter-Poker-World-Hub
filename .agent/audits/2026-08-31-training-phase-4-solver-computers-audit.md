# Phase 4 Solver Computer Audit

Date: 2026-08-31 (central UTC evidence captured at 09:15; Windows forensic reports received at 10:29)

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

The two user-authorized Windows Codex forensic audits independently confirmed the central verdict. M1 is an active scanner with no PioSOLVER process and no solve/export movement. M2 is powered on but its revoked legacy Supabase credentials force every watchdog relaunch into HTTP 401. Neither machine is safe to restart or retarget.

The correct course is to retarget the farm, but not by blindly adding phase labels. The current worker patches existing rows, the legacy `postflop_complete` hashes do not follow the canonical family-prefixed shape expected by `sp_pending_boards`, and the current RPC/worker contract only plans flop parents for flop/turn completion. Publishing an unvalidated manifest now would create another idle or semantically wrong queue.

## Live Machine Evidence

| Machine | Heartbeat | Phase | Spots Done | Rows Written | Conclusion |
| --- | --- | --- | ---: | ---: | --- |
| M1 | 2026-08-31T09:15:41Z | scanning | 0 | 0 | Process alive; no solve and no export in the current run. |
| M2 | 2026-08-16T00:38:44Z | scanning | 0 | 0 | Stale/offline; no current process evidence and no export. |

Two earlier M1 samples at 08:58:08Z and 08:58:28Z moved the cursor from 515 to 71 with counters still at zero. A later sample at 09:15:41Z reported cursor 399 with the same zero counters. This is an active scanner, not an active solver.

The canonical orchestrator automatically enters solo mode when the partner heartbeat is stale and takes the whole queue. Therefore M2's outage does not explain M1's idle state. M1 is scanning the full available manifest and finding no compatible pending boards.

## Windows Forensic Audit Closeout

### Computer 1 / M1

- Three local samples across 5 minutes 58 seconds moved the cursor `225 -> 29 -> 367` while `spots_done=0`, `rows_written=0`, and `bad=0` never changed.
- The worker logs repeatedly reported `no work`.
- No PioSOLVER process was visible and Python CPU consumption was negligible.
- The last locally and centrally corroborated solve/export was `2026-08-15T09:57:41Z`, spot `turn_sng_hu_BTN_50bb_TsKsQs2s`.
- The installed manifest exposes 529 flop parents with flop/turn targets and zero river phases. It does not contain the eight missing Training contracts or demonstrable ICM payout inputs.
- Additional defects: a plaintext legacy Supabase service-role credential, database timeouts, schema-cache failures, JWT clock errors, no usable Git provenance, and administrator-only inspection gaps.
- The requested `C:\\sp-solver\\audit-results` files could not be written because the Windows Codex sandbox refresh failed after access was approved. This limitation is recorded rather than misrepresented as completed evidence.

Conclusion: `M1 is actively solving and exporting: NO`. It must remain stopped from retargeting until the canonical manifest and pending-query contract pass offline validation and the credential is rotated.

### Computer 2 / M2

- M2 remained powered on. Shutdown, sleep, disk exhaustion, clock drift, and PioSOLVER failure were excluded as the primary outage cause.
- Supabase disabled M2's configured legacy API credentials at `2026-08-16T00:38:16.61147Z`.
- Its watchdog continued relaunching the worker, but every instance reused the revoked credential and entered an HTTP 401 retry loop.
- The last heartbeat was `2026-08-16T00:38:44.304822Z`.
- The last verified solve/export was `2026-08-11T13:36:46Z`, spot `sng_hu_50bb_flop_BTNvsBB`, board `8cJc4h`, 50 targets, `bad=0`.
- No local canonical manifest or Git repository was available for protected-main or checksum verification.
- The installed corpus does not demonstrate coverage for the required ICM contracts, the two local preflop contracts, or `cash-008`'s real four-bet node.
- Windows denied administrator-only scheduled-task inspection and writes to `C:\\sp-solver\\audit-results`; the M2 agent preserved its validated report and JSON within its Codex task output directory.

Conclusion: `M2 is operational: NO`. Credential replacement is necessary but not sufficient; restarting it before deploying a validated canonical pipeline would only revive an HTTP retry loop or a second exhausted scanner.

The normalized central evidence is stored in `2026-08-31-training-phase-4-solver-windows-evidence.json`. Values attributed to Windows are user-relayed outputs from the two separately authorized Codex audits; central database values remain independently reproducible with `training-solver-contract-audit.js --live`.

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
6. The worker's setup commands were parameterized but its exported v2 metadata was not: the harvester stamped every row as a 5.5 BB, 97.5 BB, flop, 6-max cash solve. It now records the phase's actual pot, effective stack, rake, street, family, and stack; action chip counts are no longer mislabeled as percentages of the root pot.
7. The protected worker now supports explicit flop, turn, and river paths, batches row-state reads instead of making thousands of per-river HTTP calls, hashes and verifies the PioSOLVER executable before launch, and writes that binary checksum into the provenance seal. The manifest remains closed, so these capabilities cannot start either computer prematurely.

## Warehouse Reuse And Provenance Audit

The absence of river phases in the active 529-phase manifest does not mean the
warehouse lacks river solves. The final read-only evidence snapshot counted
8,924,796 total rows and 5,668,373 river rows. Existing rivers must therefore
be validated and reused before any new river queue is authorized.

The exhaustive fixed-cutoff pass is complete for every matching row in all 25
Training family/stack contracts on flop, turn, and river:

| Street | Rows Audited | Matrix Validated | Matrix Replacement Required |
| --- | ---: | ---: | ---: |
| Flop | 7,900 | 6,124 | 1,776 |
| Turn | 319,394 | 233,782 | 85,612 |
| River | 189,679 | 169,401 | 20,278 |
| **Total** | **516,973** | **409,307** | **107,666** |

The 107,666 defective rows collapse to 106,431 unique canonical scenario
hashes; 1,235 are duplicate defective imports. Five family/stack/street cells
are absent and require canonical seed inputs rather than invented hashes. This
is recorded in the exact replacement manifest.

“Matrix validated” is intentionally narrower than “safe to serve.” It proves
board legality plus strategy/EV structure. It does not prove that a historical
row carries the exact current-node pot, facing amount, actor, positions,
subject, or attributable artifact provenance required by the question runtime.
At the evidence snapshot the provenance columns did not exist and zero cache
rows had a complete v2 provenance seal. Consequently zero existing warehouse
rows are certified as exact runtime decisions, including the 169,401
matrix-salvageable river rows. Those rivers are real and should be reused after
exact-state reconstruction and certification; new river solving must target
only missing or defective canonical decisions.

The runtime now fails closed unless the v2 node path can be replayed into the
exact current pot and facing amount, the node actor matches the declared hero
seat, positions are complete, subject/family/stack/street match the requested
game, hand EVs are real, and the export carries a validated machine, binary,
pipeline, manifest, artifact checksum, and audit seal. Legacy matrices remain
auditable source material but cannot impersonate solver-exact runtime answers.

The deep audit wrote atomic checkpoints after every bounded range and refused
to resume if the fixed hash set changed. This replaced the original
exported-snapshot approach after Supabase terminated that long-lived read-only
connection with SQLSTATE `57P01`.

Database statement statistics also prove an unidentified legacy writer is
active. Since the statistics reset at `2026-08-31T01:15:48.663Z`, a
`service_role` PostgREST client has issued more than 19,000 one-row INSERTs.
The statement writes `game_type`, `scenario_hash`, `stack_depth`,
`strategy_matrix`, and `street`; it does not write `strategy_matrix_v2` or
`solved_v2_at`. No matching database cron job exists. M1 and M2 cannot be
credited with those rows because their local evidence shows no current solve
or export, and `solved_spots_gold` has no solver version, machine ID, manifest
checksum, source artifact checksum, quality status, or audit timestamp columns.

Machine-checkable evidence is recorded in
`2026-08-31-training-solver-writer-provenance.json`,
`2026-08-31-training-solver-runtime-readiness.json`, and the per-street
warehouse evidence files. The Phase 4 migration adds a fail-closed provenance
write gate for future exports; historical rows remain unverified until they
are explicitly reconstructed and sealed.

## Approved Retarget Plan

Before either machine resumes productive solving:

1. Define one canonical Training solver contract shared by runtime, manifest generation, and cache reseeding.
2. Decide whether the eight legacy family names are migrated to canonical farm families or supported as first-class families. Do not alias ICM to ChipEV or `postflop_complete` to an unrelated cash family.
3. Add validated range, pot, effective-stack, rake, position, and payout/ICM inputs for every new phase. ICM phases cannot be represented honestly without their payout state.
4. Validate the new river-capable target expansion against each approved tree and seed exact river rows explicitly. A boolean named `p_turn` is not sufficient evidence of river completeness.
5. Seed exact canonical scenario hashes before workers run, because the current worker patches existing rows rather than inventing missing scenarios.
6. Run the solver self-test gate, then a one-board canary for each new family. Verify `strategy_matrix_v2`, action-frequency sums, EVs, exploitability, positions, board legality, and export timestamps.
7. Assign both computers to the validated Training priority queue. M1 should take slot 0/2 and M2 slot 1/2; M1's automatic solo mode remains the outage fallback.
8. Run the strict 12-level cache reseed only after warehouse exports exist. No cross-stack, cross-street, or cross-family fallback is allowed.
9. Re-run the 107-game Phase 4 truth ledger and representative desktop/mobile production flows before Phase 5 begins.

## External Action Still Required

Direct GUI/process inspection was completed through the two user-authorized
Windows Codex audits; the remaining administrator-only scheduled-task and
credential boundaries could not be crossed. Database heartbeats and export
counters remain authoritative for pipeline activity. Do not start M2's task,
reboot it for this purpose, or retarget M1 yet: doing so would restore an HTTP
401 loop or a second scanner on the exhausted/misaligned manifest.

Both Windows computers also require an administrator-authorized maintenance window after central implementation is complete. That window must rotate the exposed/revoked credentials without transmitting them through Codex output, inspect the actual scheduled-task definitions, remove duplicate launch paths if present, deploy the protected canonical worker/manifest artifact, and enable exactly one supervised process per host. A fresh heartbeat is not sufficient for certification: each machine must complete a canary solve and write a validated `strategy_matrix_v2` export before the farm is declared restored.

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
