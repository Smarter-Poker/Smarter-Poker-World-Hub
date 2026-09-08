# Training Solver Worker Ingestion Threat Model

Date: 2026-09-07  
Scope: M1/M2 to Training solver warehouse; no production secrets or tuples

## Checklist

- [x] Distinct identity: the gateway accepts only `M1` or `M2` and selects a
  different server-side secret for each. Equal configured secrets fail closed.
- [x] Secret containment: workers receive only their own HMAC key. The pinned
  launcher aborts if a Supabase service-role key remains on the host.
- [x] Exact request integrity: HMAC-SHA256 binds protocol, worker id, Unix
  timestamp, UUID-v4 nonce, and SHA-256 of the exact raw UTF-8 request bytes.
- [x] Redirect resistance: the Python client refuses all redirects and accepts
  only `https://smarter.poker/api/training/solver-worker`.
- [x] Replay resistance: five-minute skew is checked at API and database;
  `(machine_id, nonce)` is a durable primary key. Identical ingest retries are
  idempotent; conflicting reuse is rejected.
- [x] Replay truth: an old receipt is never sufficient. Replay success also
  requires the exact current warehouse artifact, current catalog row, and
  active operator-approved provenance tuple.
- [x] Authority binding: every operation must match one exact active machine,
  solver binary, pipeline commit, and manifest tuple that workers cannot edit.
- [x] Least capability: operations are enumerated. Ingest updates one existing
  artifact only; reads are metadata-only and capped at 75/500 rows; heartbeat
  upserts one machine row. No worker delete, arbitrary filter, SQL, or table
  credential exists.
- [x] Payload admission: catalog admission independently validates checksum,
  combo order, full vectors, board-dead mass, live combos, board/street/position,
  legal betting chronology/targets, mandatory Check/Call and facing-wager Fold,
  each probability in `[0,1]`, six-decimal sums within `1 ± 0.00001`, numeric
  summaries, and provenance. The harvester applies the same probability gate
  before creating either a backup or an ingest request.
- [x] ICM boundary: `_icm` artifacts fail closed until payout/objective inputs
  and an input seal are represented and independently verified.
- [x] Resource bounds: raw bodies are capped at 2 MiB, requests are locally and
  durably rate-limited, every database operation has a 12-second abort, board
  discovery is keyset-paginated over the required four-column index, and stale
  receipts are pruned in batches of at most 100 after 24 hours.
- [x] Command boundary: range weights are parsed and re-emitted as one canonical
  single-space line; phase and self-test rake values require an exact four-token
  single-space form before any Pio UPI command is built.
- [x] Missing-row boundary: discovery and ingest operate only on an exact,
  pre-existing warehouse UUID. The protected target ledger must prove one UUID
  per scenario; workers receive no insert or placeholder capability.
- [x] ACL boundary: receipt/authority/catalog tables are private; browser roles
  cannot execute worker RPCs; only the server service role can invoke them.
- [x] Secret hygiene: repository tests reject JWT/service-secret-like literals;
  example configuration contains empty placeholders only.

## Residual Operator-Controlled Risks

Code cannot prove that an endpoint secret was provisioned to the intended
physical host, rotate a historically exposed Supabase credential, independently
attest Windows executables, approve production provenance, disable legacy
scheduled tasks, or observe canary output. Those are mandatory rollout gates,
not deferred code work. Keep both workers stopped/audit-only and the authority
table empty until the admission runbook is completed.
