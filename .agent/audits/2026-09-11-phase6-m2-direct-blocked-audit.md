# PHASE 6 SOLVER M2: remediation update

**Host remediation advanced. Stage A and canary execution remain blocked.**

- Independently verified both scheduled tasks Disabled, including XML Enabled=false. No matching solver/watchdog service was found. No task or service was changed.
- Removed legacy credential-shaped literals and emptied database configuration values in 10 root-level legacy files. Readback passed; a subsequent dry run proposed zero further removals. Three checked database configuration files have zero nonempty database values. No secret values were recorded and no plaintext backups were created. This is a bounded cleanup, not whole-host secret-absence certification.
- Rehashed all 450 range files: all match the previously validated corpus. Reverified the Pio binary as 1,235,982 bytes, SHA-256 e21ea7ad1dbc2a9d826c25ac264688f632dd461b92de2bc35a53f6b78bcf5ceb, Authenticode NotSigned. Pio was not launched.
- Collected three fresh CIM process samples more than 61 seconds apart. No Pio, Python or curl process appeared.
- PID 19612 references bootstrap SHA-256 21c36b632ca447f52140d13acd66181a58a915bbddb0baba0e6d1faed76936c9, which differs from the expressly authorized retired hash. It has no direct child. The required response is PREDECESSOR_PROCESS_UNRESOLVED: it was not killed and its directory was not removed.
- A pre-existing elevated PowerShell process, PID 13844, remains unreadable. A narrowly scoped read-only Windows elevation request did not launch successfully. It was not retried automatically.
- Protected main and the production public health endpoint still identify 57e63abfc85cd935d78292f326791a514288c963. The manifest remains closed with no bounded-canary gate or contract and an empty Training ledger. The protected private raw distribution path remains unfixed; a host-side unauthenticated probe had a transport error.
- The parent task remains unavailable; direct status delivery failed again. No independently certified M1 production evidence has arrived.

The complete initial JSON evidence is now in draft PR 1741 and passed an exact readback comparison. This remediation packet adds current host checks and the exact sanitized file-change ledger. Neither evidence publication nor credential cleanup authorizes a canary.

Saved evidence: C:\sp-solver\audit-results\phase6-direct-M2-20260911T153100Z. The 30-minute follow-up remains read-only. No canary attempt, continuous solve, HMAC provisioning, credential authentication, direct database access, automation restoration, or production admission occurred.

Machine-checkable records in this PR:

- `2026-09-11-phase6-m2-direct-initial-evidence.json`: immutable initial snapshot and full 450-file range ledger.
- `2026-09-11-phase6-m2-direct-remediation.json`: cleanup ledger, refreshed CIM/task checks and remaining gates.
