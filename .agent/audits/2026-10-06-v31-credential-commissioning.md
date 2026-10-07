# Phase 6 V31 credential commissioning

Scope: the existing certified Horse Brain V31 gateway and its independent M1,
M2, and compactor principals. This report records provisioning, not solver
completion. Source fixes were protected-merged in PRs #2187 and #2190.

## Approved inputs and actual host readiness

- Pipeline revision: `5ed0cd6adb80a549105619afa5828a50eec83f39`.
- Input bundle: `107f20cb-8da5-5a18-8c80-a9736b94c914`.
- Input checksum: `107f20cb8da55a182c80a9736b94c914a1608d68a2e7211e7fa79ac99459e016`.
- Manifest checksum: `fba749ca8957624044c7c98eed69f70e84ce188407e0c238fb23315cb9be3ee3`.
- Normal authenticated administrator approval: Actions run `37549952737`,
  successful durable approval postcondition. Dataset registration readback is
  a separate required operation.
- Both licensed physical hosts independently passed their immutable worker
  preflight. Each has 98 assigned harvest targets; neither preflight exported
  source artifacts or registered a production dataset.

## Principal provisioning

Provisioning uses the maintained, explicitly dispatched GitHub Actions
workflow. It rotates only the selected Production-only Sensitive entry,
preserves Preview and unrelated entries, seals the generated secret to the
principal's RSA-4096 recipient with OAEP-SHA256, and records mutation readback.
No plaintext secret is included in this report or repository.

- M1: run `37551117587`, request `v31-m1-20261006-production-v3`, receipt
  `complete`, bound to protected revision
  `a2ca5c37394eab1aa873b2d3a41f89ba40e5e2c8`.
- M1 sealed ciphertext: 512 bytes, SHA-256
  `4f061cc9c1df06a83426c6c242324efa13beba21dad3d86e242c4ed662f2f6cc`.
- M1 ciphertext and sanitized receipt were delivered directly to its recipient
  directory over pinned, key-only SSH. Its private recipient key remains on M1.
- M2: run `37551764412`, request `v31-m2-20261006-production-v4`, receipt
  `complete`, bound to protected revision
  `c6cfabbd3b310acf440a2fbe5d700d4b2af26501`.
- M2 sealed ciphertext: 512 bytes, SHA-256
  `eec847cad96991f8bab4ca03b6d507a8c92e4e1ee607fda10dd714b5d48205fa`.
- M2 ciphertext and sanitized receipt were delivered directly to its recipient
  directory over pinned, key-only SSH. Its private recipient key remains on M2.
- The earlier M2 run `37551686548` was cancelled with zero steps executed:
  concurrent main advancement invalidated its dispatch revision before mutation.
- Compactor: run `37552403736`, request
  `v31-compactor-20261006-production-v3`, receipt `complete`, bound to
  protected revision `c6cfabbd3b310acf440a2fbe5d700d4b2af26501`.
- Compactor sealed ciphertext: 512 bytes, SHA-256
  `577e916e6222c8768da7cb6de66bcaef87d3ed799c4f3417c2362e925348fa09`.
- Compactor ciphertext and sanitized receipt were installed only in the
  controller's private task-owned recipient directory on the external SSD.
- All three provisioning receipts report `plaintextPersisted: false` and
  `deploymentTriggered: false`. No provisioning operation may be replayed.

## Remaining acceptance

The normal Vercel Git-source build must consume all three provisioned
Production credentials. Only then may the compactor register the approved
dataset and the two finite workers harvest their independent assigned source
artifacts. Complete coverage, sealing, eight evaluator family receipts,
explicit guarded promotion, and actual live-worker dataset/checksum evidence
remain required. No Phase 7 readiness or Phase 6 completion is claimed here.
