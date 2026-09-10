# Certified Horse V31 NLH Solver Pipeline

This directory is the source-artifact producer for Horse Brain Phase 4. It is
offline infrastructure. Nothing here is imported by the horse action clock,
and it has no OpenClaw dependency.

## Security and release boundary

- M1 and M2 receive different 32-byte HMAC keys. They never receive a
  Supabase service-role key.
- Signed ingress rejects duplicate keys, non-finite numbers, and integers that
  JavaScript cannot preserve exactly. Contract-side JSON failures, excessive
  nesting, and numeric overflow stop as controlled validation errors.
- The compactor receives a third key. It can register, build, and seal a
  dataset, but it cannot mark a candidate or promote one.
- PostgreSQL validates each raw Pio node, derives compact cells, computes all
  seals, scores M2 as the independent holdout, and rejects incomplete
  coverage.
- The Club Arena offline evaluator owns paired replay and league evidence.
  Promotion remains a separate, explicit `--promote` operation after review.
- `manifest.disabled.example.json` is intentionally non-runnable. Zero
  checksums, missing scenarios, or `enabled: false` always stop the pipeline.

## Required approved inputs

Create one immutable input directory containing:

1. A range-bundle JSON whose file receipts cover every OOP/IP 1,326-combo
   range used by the manifest.
2. `combo-order.txt`, byte-pinned to the exact 1,326-token output of the
   approved executable's `show_hand_order`. The worker attests that live order
   at startup and remaps every range, strategy, reach, EV, and matchup vector
   to the canonical V31 artifact order. The repository deliberately does not
   ship a substitute order file: capture it from the licensed, approved binary
   and approve those exact bytes with the rest of the input bundle.
3. A reviewed ICM/payout model bundle using contract
   `smarter-poker.horse-solver-v31-icm-model.v1`. Each model names the OOP/IP
   starting stacks and monotone interpolation points for both players. Every
   ICM scenario references one model by `icm_model_id`; the worker derives
   `reset_icm_tables`, `set_icm`, and every `set_icm_point` command from those
   pinned bytes. Chip-EV and cash-EV scenarios must use `icm_model_id: null`.
4. A complete enabled scenario manifest. Each target declares its exact Pio
   node, board, role, facing kind, size bucket, ordered child topology, and
   owning `machine_id`. M1 is the training split and M2 is the holdout split;
   every compact context must have targets on both hosts, and their board-rank
   signatures must be disjoint. Changing only suits or flop-card order produces
   the same strategic board under suit isomorphism, so it is reproducibility
   evidence rather than held-out evidence and is rejected by the compactor.

The input bundle approved through `ca_gto_v31_approve_input_bundle` must include
file receipts for the range bundle, combo-order file, ICM model, and the exact
scenario manifest. The dataset registration is rejected unless the approved
scenario-manifest checksum equals `APPROVED_MANIFEST_CHECKSUM`.
Identity fields and file receipts must remain real JSON strings; numeric
coercion, empty path components, dot components, and parent traversal all fail
closed on both the preparer and PostgreSQL sides.

The bundle identity uses contract
`smarter-poker.horse-solver-v31-input-bundle.v2`. It hashes the immutable
range/combo-order/ICM receipts but deliberately not the final scenario-manifest
receipt or human approval note. Its UUID is deterministically derived from
that checksum. This is required because the manifest carries the bundle UUID
and checksum; including the manifest receipt in the same checksum would create
an impossible hash cycle. PostgreSQL separately binds the exact final manifest
receipt at dataset registration, so no provenance is omitted.

`pipeline_files` must name exactly the six executable Python files in this
directory: `contract.py`, `gateway.py`, `pio_upi.py`, `prepare_bundle.py`,
`worker.py`, and `compactor.py`. Omitting a file or adding an unreviewed file
fails closed.

## Deployment order

1. From a clean checkout whose exact commit is already on `origin/main`, fill
   an enabled copy of `manifest.disabled.example.json`. Keep only
   `input_bundle_id` and `input_bundle_checksum` at their documented zero
   placeholders, then prepare the immutable final files:

   ```bash
   python scripts/horse-solver-v31/prepare_bundle.py \
     --manifest-draft /approved/v31-manifest.draft.json \
     --input-root /approved/inputs \
     --manifest-output manifests/v31-manifest.json \
     --approval-output approvals/v31-input-approval.json \
     --bundle-key horse.v31.phase4.20260909 \
     --bundle-version v31.1 \
     --approval-note "Reviewed immutable Phase 4 NLH inputs"
   ```

   The command verifies every input, the complete executable bundle, a clean
   Git checkout, and that the pinned commit is present on `origin/main`. It
   writes files once, prints only non-secret checksums, and reports
   `"approved": false`.
2. A horse administrator reviews the exact bytes and submits the generated
   approval JSON unchanged to `ca_gto_v31_approve_input_bundle`. The returned
   UUID and stored checksum must equal the values printed by the preparer.
   Approval is a human gate; generating files does not approve them.
3. Deploy the World Hub gateway and configure three distinct secrets:
   `HORSE_SOLVER_V31_M1_HMAC_SECRET`,
   `HORSE_SOLVER_V31_M2_HMAC_SECRET`, and
   `HORSE_SOLVER_V31_COMPACTOR_HMAC_SECRET`.
   Never reuse one principal's key for another principal.
4. On the compactor host, set `HORSE_SOLVER_V31_HMAC_SECRET` to the compactor
   secret and register the dataset:

   ```bash
   python scripts/horse-solver-v31/compactor.py \
     --manifest /approved/v31-manifest.json \
     --input-root /approved/inputs
   ```

   An exit code of 2 means registration succeeded but both worker copies have
   not arrived yet. It does not seal or activate anything.
5. On each Windows solver host, configure the same manifest and inputs plus
   that host's unique secret, licensed console executable, and exact pins:

   Before installing or reading any gateway secret, prove that the local
   licensed binary, hand order, full input bundle, pipeline bytes, and solver
   self-test agree:

   ```powershell
   python scripts/horse-solver-v31/worker.py M1 `
     --manifest C:/approved/v31-manifest.json `
     --input-root C:/approved/inputs `
     --preflight-only
   ```

   This mode contacts no gateway and writes no database or artifact row. Run it
   independently on M1 and M2, changing only the machine argument.

   ```powershell
   python scripts/horse-solver-v31/worker.py M1 `
     --manifest C:/approved/v31-manifest.json `
     --input-root C:/approved/inputs `
     --work-directory C:/solver-state/v31
   ```

   Required environment variables are `HORSE_SOLVER_V31_GATEWAY_URL`,
   `HORSE_SOLVER_V31_HMAC_SECRET`, `APPROVED_MANIFEST_CHECKSUM`, `PIO_EXE`,
   `APPROVED_PIO_BINARY_CHECKSUM`, and `PIPELINE_COMMIT`.
6. Run the compactor again. It builds only declared cells and seals only when
   M1 training evidence, M2 holdout evidence, full coverage, source receipts,
   error thresholds, and all provenance checks pass.
7. On Club Arena, run:

   ```bash
   cd server
   npm run horse:gto-v31-evaluate -- --dataset=<dataset-uuid>
   ```

   This writes eight immutable paired-replay/league family receipts and leaves
   the passing dataset in `candidate`. Review the receipts, then use the same
   command with `--promote`. The database independently rechecks every gate.

## Pio semantics pinned by the worker

- Startup must acknowledge `set_end_string END` and `is_ready`; `show_version`
  and `show_hand_order` must exactly match the approved manifest and pinned
  order file. Solver and manifest identity text must already be canonical; the
  worker never trims one identity for attestation while publishing another.
  State-changing commands require their exact UPI acknowledgement, and
  asynchronous `SOLVER:` updates cannot consume a command response.
- `show_children`, `show_strategy`, `show_range`, and both vectors from
  `calc_ev` must all return complete 1,326-combo data.
- Policy EV comes from `calc_ev PLAYER node`; every action EV comes from
  `calc_ev PLAYER node:action`. Reach weighting comes from `calc_ev`'s second
  matchup vector, not the visually similar `show_range` vector.
- `c` is check or call according to the reconstructed node state. Pio wagers
  are only `bNNN` cumulative street targets.
- A bet size is target / pot-before-bet. A raise size is raise-increment /
  pot-after-call, matching Club Arena's live sizing contract.
- All-in identity is proven against remaining effective stack, not inferred
  from a large size label.
- Every tree clears inherited ICM state before a cash/chip-EV rake model is
  installed. An ICM tree explicitly uses `set_rake 0 0` to disable inherited
  rake before resetting and installing its complete pinned ICM table; Pio does
  not permit active rake and ICM at the same time.
- Convergence is `set_accuracy <fraction> fraction`, then argument-free `go`
  and `wait_for_solver`. `go <accuracy>` would mean seconds/steps, not an
  accuracy target. `calc_results` is parsed as named fields and the approved
  non-ICM self-test independently checks achieved exploitability.
- The worker emits no node checksum. PostgreSQL canonicalizes JSON numbers and
  owns that checksum.

## Recovery

Artifacts are written atomically beneath `--work-directory` before upload.
Restarting a worker reuses exactly those bytes and deterministic artifact IDs;
changed manifests cannot reuse the checkpoint. Gateway retries use fresh
nonces, while database operations remain idempotent. Any malformed output,
changed topology, bad EV identity, stale provenance, or shared/invalid key
fails closed and is visible in worker/compactor liveness.
