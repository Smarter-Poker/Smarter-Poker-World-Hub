# Phase 6 M2 direct host audit: blocked

Audit ID: `phase6-direct-M2-20260911T145800Z`. Machine M2, partition 2/1. Observed hostname: `SMARTERPOKER`.

**Stage A is not ready. Canary and production execution remain closed.** This report records a fresh partial host audit and protected-source verification; it is not release authority.

## Release blockers

1. **Legacy database configuration is present.** `C:\PioSOLVER\.env` has nonempty `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_EMAIL`, and `SUPABASE_PASSWORD` assignments. A bounded scan of 231 text files found 19 credential-shaped matches across 18 files, including JWT-shaped literals in legacy scripts and a Supabase secret-shaped literal. Values were never printed, saved to the audit, decoded, authenticated or reused. Credential validity is unknown. `C:\sp-solver\.env` is empty.
2. **PREDECESSOR_PROCESS_UNRESOLVED.** PID 19612 exists as the exact System32 Windows PowerShell executable. Get-Process reports start time `2026-09-11T14:17:20.8463195Z`, inconsistent with the reported approximately 14:34Z attempt. CIM access is denied. The command context, retired-bootstrap hash binding, child context, and absence of a sealed terminal result remain unverified. No process was terminated and no retired directory was removed.
3. **Task Scheduler state remains unverified.** CIM is inaccessible. Task Scheduler COM root inspection fails with `0x80070003`; exact XML queries for `SmarterPokerSolver` and `PokerIQ Sync Done Files` report a missing path. This does not prove the tasks are absent or Disabled. Neither tasks nor services were modified.
4. **Protected release gates remain closed.** Main is still `57e63abfc85cd935d78292f326791a514288c963`. Manifest v4 remains SHA-256 `b214dc133a7c517c0bba25a1673d409b7abd9bb5e83fc863ddc9af46b10ea49a`: solver_ready=false, bounded_canary_ready absent, source-combo and Training-ledger digests zero, Training ledger empty, no bounded-canary contract, four phases with missing range checksums.
5. **Private distribution remains broken.** Protected run_machine.py still downloads private raw GitHub content without authentication. A fresh unauthenticated pinned manifest fetch returned HTTP 404. All four downloaded source files reproduce the declared pipeline-bundle checksum, so source consistency is proven but delivery remains broken. No local workaround was installed.
6. **Parent controller is unavailable.** The exact controller task is missing from this host's available task list. The initial handshake and post-inventory retry both returned “No Codex thread found”; neither message was delivered. No parent-certified M1 production evidence has been received. Live database migration, authority, admission and catalog states remain unverified. The previously reported missing migration is historical input, not a fresh database finding.

## Measured host identity and ranges

| Measurement | Result |
| --- | --- |
| Pio executable | `C:\PioSOLVER\PioSOLVER3-pro.exe` |
| Pio byte length | 1,235,982 |
| Pio SHA-256 | `e21ea7ad1dbc2a9d826c25ac264688f632dd461b92de2bc35a53f6b78bcf5ceb` |
| Authenticode | NotSigned |
| File/product version | No metadata value |
| Fresh runtime version/hand order | Not measured; Pio was not launched |
| Historical hand-order file SHA-256 | `6060be559023a783f7e049826771452b885d3b1a7c3cb0e49d63b96e0f6444c9` |
| Historical space-joined hand-order SHA-256 | `7d1e445d2a9fe34d416ea41adf7f2df2c4319c49141b389be5eb3d6cb2d9618a` |
| Historical combo validation | 1,326 unique unordered combos, no duplicate-card token; not freshly bound to measured binary |
| Range corpus | 450 files under `C:\sp-solver\ranges`, each hashed and parsed |
| Range numerical validation | Every file has 1,326 finite weights in [0,1] and positive total weight |
| Range contract mapping | Unverified; numerical validity does not establish approved Training compatibility |

The three selected process samples were at `2026-09-11T15:07:49.8390603Z`, `2026-09-11T15:09:03.0497274Z`, and `2026-09-11T15:11:19.3351611Z`. Gaps were 73.2106671 and 136.2854337 seconds. No Pio, Python, curl, solver or watchdog named process appeared. PID 19612 persisted. Existing PowerShell command contexts remain unknown, so absence of all legacy launchers and automatic relaunch is not certified. The additional pwsh processes were this task's sampler and audit commands.

A `PioWatchdog.vbs.disabled` file remains in Startup. Examined Run entries and profiles exposed no further solver match. Service, Startup and environment observations reflect the sandbox-readable scope, not a privileged whole-host attestation.

## Protected provenance

GitHub comparisons independently verified each required commit is an ancestor of current main:

| Required commit | Resolved ancestor |
| --- | --- |
| e628f15542 | e628f15542c8948ab2b94482a0a6e6ea424b019c |
| 7a5651cc0f | 7a5651cc0ff76bff53adf0cb2a62576453b4fc85 |
| 85a048b9d5 | 85a048b9d52672c6c244d416fca1c3cf9cfd4afb |
| 88f1b67cc3 | 88f1b67cc3ccb5e2ee7b997a610c09b7acddc2f2 |

The protected pipeline bundle recomputes to `264f94e175ea4ac3137dadf0cd9ecb10ba04f5d9c3075d24c93e1374078809ea`, matching the manifest. Per-file SHA-256:

- run_machine.py: `c32d5c5f818dde192a2e24d9fa674321497dd17788b04b9e203bd396fedad03b`
- tree_gen.py: `f38072c0888bff9204345c582e61fc35bda899ec5ca769c413d2a49e020753d4`
- pio_harvest.py: `371da761a2a529b2fb6508750aeff2f84d7950b02176806a07bfa382d60598a7`
- orchestrate.py: `bbc262f0cdb58fe211c89d363ac3c04db3e908374b59f5ed0359f2e653ea41ea`

The existing GitHub connector supplied authorization. No local token was restored, no new checkout was written over the legacy solver root, and no protection was bypassed. Live branch-protection settings were not separately read.

## Coverage and retained evidence

The credential scan covered root-level solver/Pio text and top-level Pio settings. It skipped two files over 8 MB, nested generated files, activation data and binary/archive contents. A file inventory counted 5,951,329 matching Pio text candidates. Broad enumeration was stopped. No whole-host secret-absence claim is made. No HMAC literal candidate was found in the bounded scope, and no matching nonempty credential/HMAC environment values were found in the session-readable Process/User/Machine environment.

Seventeen sanitized evidence files were saved under `C:\sp-solver\audit-results\phase6-direct-M2-20260911T145800Z`, and every copied file passed a SHA-256 comparison. They include `M2-audit.json`, `M2-audit.md`, the full 450-file range inventory, selected process samples, source checksums, credential-presence flags, and historical hand-order data. `checksums.json` records their digests. This PR publishes the summary; the complete machine-checkable packet is retained locally. Subsequent shell creation failed with a host-helper setup-refresh error, preventing a direct byte-for-byte upload of that packet; no evidence was reconstructed or invented to replace it.

No Pio invocation, canary attempt, continuous solve, legacy automation restoration, credential change, token recovery, HMAC provisioning, database access or output admission occurred. Existing credential-bearing files were left unchanged during this inventory-only audit.

A read-only Codex follow-up checks controller availability and relevant protected-release changes every 30 minutes, remains quiet while unchanged, and cannot launch the solver. All original gates remain mandatory: completed Stage A acceptance, protected release and fixed delivery, controller-certified M1 production evidence, exactly one authorized M2 canary with two independently verified admissions, then a separately approved backlog release.

```json
{
  "schema": "phase6-direct-M2-published-summary.v1",
  "audit_id": "phase6-direct-M2-20260911T145800Z",
  "machine": "M2",
  "partition_count": 2,
  "partition_index": 1,
  "stage_a_ready": false,
  "canary_closed": true,
  "canary_attempt_count": 0,
  "legacy_database_configuration_present": true,
  "predecessor_process_resolved": false,
  "tasks_disabled_verified": false,
  "protected_release_authorized": false,
  "m1_independent_production_certification_received": false,
  "m2_production_solving_verified": false,
  "secret_values_in_evidence": false
}
```
