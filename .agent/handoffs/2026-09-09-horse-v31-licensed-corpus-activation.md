# HANDOFF: Horse V31 licensed corpus activation

**Written:** 2026-09-09
**Scope:** Human-only approval, licensed software, credentials, and physical hosts.
**Software state:** The fail-closed Club Arena control plane and World Hub solver pipeline are published separately. Do not bypass their checks, rewrite their claim/provenance logic, or substitute generated sample inputs.

This handoff exists only because the remaining steps require a human poker-strategy approval, a licensed PioSOLVER executable, three credentials, and two genuinely independent Windows solver machines. It does not ask anyone to push, merge, build, or deploy repository code.

## Never do

- Never use OpenClaw, an LLM, a network call, or Supabase on the horse action clock.
- Never put a Supabase service-role key on M1 or M2.
- Never share a principal's HMAC key with another principal.
- Never approve the disabled example, zero checksums, sample ranges, placeholder payouts, or a suit-only holdout.
- Never label the legacy `gto_postflop_v31` table as the certified corpus.
- Never mark a candidate or promote it until all eight immutable evaluation receipts pass.
- Never print, paste, or commit any credential value.

## Human-only inputs required

1. An authorized horse administrator reviews and approves one real, immutable NLH Phase 4 input package:
   - reviewed 1,326-combo OOP/IP range files and their range-bundle receipt;
   - exact `show_hand_order` bytes from the licensed approved Pio executable;
   - reviewed cash, Spin, tournament chip-EV, and tournament ICM models;
   - a complete suit-aware flop/turn/river scenario matrix with genuine open, facing-bet, facing-raise, check-raise, bet-raise, probe, delayed-c-bet, barrel, multi-size, and all-in nodes;
   - rank-disjoint M1 training and M2 holdout boards for every compact context.
2. A licensed PioSOLVER console executable is installed on two genuinely independent Windows hosts, designated M1 and M2. Record the exact product version and SHA-256, but do not put the executable or license material in Git.
3. Three independently generated 32-byte HMAC credentials are installed by name:
   - Vercel `hub-vanguard`: `HORSE_SOLVER_V31_M1_HMAC_SECRET`, `HORSE_SOLVER_V31_M2_HMAC_SECRET`, `HORSE_SOLVER_V31_COMPACTOR_HMAC_SECRET`;
   - M1 and M2: each machine's corresponding value as `HORSE_SOLVER_V31_HMAC_SECRET`;
   - compactor host: the compactor value as `HORSE_SOLVER_V31_HMAC_SECRET`.

## Exact activation sequence

1. Use a clean checkout at a commit already on `origin/main`. Build the enabled draft from the reviewed inputs, leaving only `input_bundle_id` and `input_bundle_checksum` at their documented placeholders. Every `pipeline_files` receipt must cover exactly `contract.py`, `gateway.py`, `pio_upi.py`, `prepare_bundle.py`, `worker.py`, and `compactor.py`.
2. Run `scripts/horse-solver-v31/prepare_bundle.py` exactly as documented in `scripts/horse-solver-v31/README.md`. It must report `"approved": false`; retain the printed bundle UUID, bundle checksum, and manifest checksum.
3. The authorized horse administrator compares the immutable bytes and submits the generated approval payload unchanged to `ca_gto_v31_approve_input_bundle`. The database-returned UUID and stored checksum must exactly match step 2.
4. On M1 and M2, run `worker.py --preflight-only` before loading a gateway credential. Each host must independently prove the licensed binary checksum, exact solver version, exact hand order, all input receipts, full pipeline bundle, assigned targets, and approved solver self-test. This mode must state that no gateway was contacted and no source row was written.
5. Run the compactor once to register the exact approved dataset. Exit code 2 at this point means both worker copies have not arrived; it is not a seal or failure waiver.
6. Run M1 and M2 with unique credentials and separate work directories. Do not copy one host's artifacts to the other. Both must reach completed liveness with zero invalid rows and exact final artifact receipts.
7. Run the compactor again. It must reject any missing context, mislabeled response node, shared/rank-isomorphic holdout, source mismatch, threshold failure, stale heartbeat, or checksum mismatch. It may seal only after full declared coverage and independent M2 held-out evidence reconcile.
8. Run Club Arena `npm run horse:gto-v31-evaluate -- --dataset=<dataset-uuid>`. Require all eight immutable family receipts, held-out action-frequency/sizing/EV-regret limits, paired replay, action-clock legality, illegal-action, and league gates. Review them before rerunning with `--promote`.
9. Read production after promotion. Phase 4 is complete only when the active dataset and runtime cells are nonzero, M1/M2 and compactor liveness are current and independently distinguishable, `v31_certified_hit` fires, daily decision-level agreement rows reconcile to eligible V31 decisions with source seals and regret, and V30 remains an explicit fallback rather than being relabeled.

## Evidence to return in chat, without secrets

- Approved bundle UUID and all non-secret SHA-256 receipts.
- Licensed solver product/version/checksum and independent M1/M2 host identifiers.
- Dataset UUID, state transitions, declared-versus-built coverage, source/artifact counts, invalid counts, and seal.
- M1/M2/compactor heartbeat timestamps, rates, ETAs, last-artifact checksums, stall state, and compact lag.
- All eight evaluation receipt IDs and metrics, paired replay and league significance, candidate and promotion receipts.
- Active runtime-cell count, certified-hit telemetry, daily eligible/reconciled agreement counts, action regret coverage, and source seal.

Any missing item means Phase 4 remains incomplete. Report the exact failed gate; do not substitute a progress summary for completion evidence.
