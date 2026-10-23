# V31 controller migration to the existing M2 computer

The owner directed the existing Windows M2 computer to take over the controller
role and explicitly confirmed replacing the Mac controller's COMPACTOR
credential. M2 retains its distinct worker identity and its existing sealed
worker credential. No M1 workload is authorized by this migration.

## Owning operation

- Protected provisioning workflow: `provision-horse-v31-hmac.yml`.
- Request: `v31-compactor-m2-controller-20261023-r1`.
- Owning run: `40029839582`, attempt 1.
- Dispatch revision: `f28fb3fef992098b2c25efe1c866c101acfeb76c`.
- Recipient: a new RSA-4096 key generated on the Windows controller, stored in
  a separate private directory restricted to the owner account and SYSTEM.
- Public SPKI SHA-256:
  `09f6672e0bc9eb1109c9c7e76a0a877adffe2989aeb087631db2e3f54f001e6e`.
- Python and Windows RSA-OAEP-SHA256 recipient round-trip checks passed.

The operation completed successfully at `2026-10-23T21:53:52Z`. The retained
artifact digest is
`222f2a873071629fa8b7c4f4d12a74e527f7feb39e1d3f7e825bada48b6fa770`.
The installed 512-byte ciphertext SHA-256 is
`b311afd48e36fe1664763b409b35de75914d634fb252edbeb111d5ae48dc8078`.
The sanitized receipt reports `complete`, `mutationKind: rotate`,
`plaintextPersisted: false`, and `deploymentTriggered: false`. Its run,
principal, public-key fingerprint, artifact digest, and ciphertext digest were
verified before installation. Do not replay this completed provisioning run.
No secret value belongs in this report.

## Activation and finite workload

The existing workflow changes only the Production COMPACTOR environment entry
in the canonical `hub-vanguard` project. M1, M2, Preview, and unrelated entries
must remain unchanged. Provisioning does not itself deploy the gateway.

After a complete provisioning receipt, the ordinary protected merge and Vercel
Git-source build must consume the new environment value. A signed COMPACTOR
operation then proves the running gateway accepts the new controller identity.
The Mac's old COMPACTOR credential is superseded by that deployment.

The separately approved bundle is `89d084eb-76fd-5998-811d-315b0e98d812`,
dataset key `horse-v31-hu-order-m2-recovery-20261023-r1`. Approval run
`40016226690` completed successfully. Its immutable inputs and licensed M2
preflight evidence remain unchanged. Registration is limited to the exact
approved manifest; the following worker run is limited to its 16 M2 targets.
Registration is distinct from harvesting, compaction, sealing, evaluation,
promotion, and live corpus certification. Those later results are not claimed.
