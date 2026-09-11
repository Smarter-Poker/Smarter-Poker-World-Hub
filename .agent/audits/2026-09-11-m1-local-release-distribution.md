# M1 protected release distribution remediation

The Windows runner fetched private repository files with unauthenticated raw
GitHub requests. It could not reach its solver gates reliably. The proposed
transport reads a controller-delivered directory and verifies the externally
pinned manifest, four protected per-file hashes, the aggregate hash, and its
own launcher bytes before importing the pipeline. It never obtains a GitHub
credential or falls back to a network download.
The orchestrator's separate manifest fetch path uses launcher-injected bytes
and rechecks their approved checksum throughout canary and backlog execution.

The manifest remains version 4 with solver_ready=false. No bounded-canary gate,
target UUID, 107-game ledger approval, range approval, or database authority is
introduced. This PR must pass the protected path before installation on M1.

## M2 comparison

At this audit, protected main was
57e63abfc85cd935d78292f326791a514288c963. The visible M2 branch,
phase6-m2-attestation-upload-20260911, resolved to
88f1b67cc3ccb5e2ee7b997a610c09b7acddc2f2: zero commits ahead and three behind.
It provided no newer runner or canary admissions. No M2 task was visible through
this machine's task connection. The user's report that M2 is running is recorded
as a report, not independently verified solving or production admission.

## M1 evidence and remaining authority

Fresh M1 measurements confirm both legacy tasks Disabled, quarantined Startup
launchers, no matching solver services or Run/RunOnce entries, and three CIM
samples with only WebView GPU-watchdog flag false positives. The Pio executable
is 1,235,982 bytes, unsigned, with SHA-256
e21ea7ad1dbc2a9d826c25ac264688f632dd461b92de2bc35a53f6b78bcf5ceb.
An identity-only process returned PioSOLVER-pro 3.8.0 (Sep 22 2025, 11:05:45),
1,326 unique valid combinations, and hand-order SHA-256
7d1e445d2a9fe34d416ea41adf7f2df2c4319c49141b389be5eb3d6cb2d9618a.
All 450 ranges passed numeric structural validation. Their meaning and approval
for the Training contracts are not established by that check.

The agent shell inherits database environment settings; user and machine
persistent scopes did not contain them. No values are included in evidence.
The future worker must receive a minimal explicit environment, and the
existing database-variable rejection is preserved. No HMAC was provisioned.
The parent task could not be reached, so its independent acceptance is pending.

A real Python child, launched with the existing explicit Windows runtime
allowlist, confirmed database_present=false and hmac_present=false and exited
zero. This verifies child-process isolation; it does not remove the agent
parent's settings or certify whole-host credential absence.

## Validation

- New hermetic release-bundle suite: 17 tests passed, including altered manifest,
  each altered source file, aggregate mismatch, missing/extra entries, invalid
  hashes, reparse paths, oversized files, launcher self-attestation and no
  network/process calls during bundle installation.
- Existing bounded-canary Python suite: 12 tests passed.
- Existing Node bounded-canary suite plus the wired bundle test: 6 passed.
- Three existing focused Node provenance/manifest/transport tests passed.
- Python compilation passed. No src/ application code or SQL changed.
- Windows test adapter selected the installed python executable for existing
  python3 subprocess calls; no assertion or test source was weakened.

The unchanged tree generator and harvester match protected main byte-for-byte.
No --no-verify option or branch-protection change was used. The connector
publication uses an atomic Git tree and a review branch, not a write to main.

No solve, bounded canary, ingestion, database mutation, legacy task activation,
or release-gate opening was performed. Stage A acceptance remains pending.
