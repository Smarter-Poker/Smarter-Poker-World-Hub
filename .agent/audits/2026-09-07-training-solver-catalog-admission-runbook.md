# Training Solver Catalog Admission Runbook

Date: 2026-09-07  
Status: Operator procedure only; no production provenance tuple is seeded by this change

## Non-Negotiable Gate

Do not approve M1 or M2 while either host possesses the legacy/shared Supabase
service-role credential. First deploy the signed gateway, rotate that database
credential, provision one distinct HMAC identity per worker, and independently
attest the binary, protected pipeline commit, and manifest checksums. The
repository cannot perform those operator/host actions. Until then, leave
`training_solver_provenance_authority` empty and keep both workers stopped or
in audit-only mode.

Never copy a value from worker self-reporting alone. Obtain each checksum from
an operator-controlled source and compare it with the protected build artifact
and canonical manifest. Do not approve an ICM tuple: the current warehouse
does not persist the sealed payout/objective inputs needed to serve it.

## Protected Approval Migration

Create a new, reviewed migration through the normal protected pull-request
path. Use one literal row per independently verified worker/build/manifest
tuple; do not use wildcards, `ON CONFLICT`, or an update that can reactivate a
retired tuple.

```sql
BEGIN;

INSERT INTO public.training_solver_provenance_authority (
  machine_id,
  solver_version,
  solver_binary_checksum,
  pipeline_commit,
  manifest_version,
  manifest_checksum,
  approved_by
) VALUES (
  '<M1-or-M2>',
  '<exact-version-from-attested-binary>',
  '<64-lowercase-hex-binary-sha256>',
  '<40-lowercase-hex-protected-commit>',
  '<exact-canonical-manifest-version>',
  '<64-lowercase-hex-manifest-sha256>',
  '<named-human-approver-and-change-ticket>'
);

COMMIT;
```

The approval itself must not populate the serving catalog. A catalog entry is
created only by a later insert/update of one exact solver artifact that passes
the complete payload, identity, legal-node, live-combo, checksum, and active
provenance checks.

## One-Artifact Supervised Admission

1. Keep the second worker disabled. Export exactly one non-ICM artifact from
   the approved worker and retain the local Pio output plus canonical JSON.
2. Independently recompute the source-artifact checksum over
   `scenario_hash` and `strategy_matrix_v2`; verify 1,326-combo order, zero
   strategy mass on board-dead combos, legal cumulative node targets, numeric
   EVs, and the exact family/stack contract.
3. Submit the one artifact through the scoped ingestion path using its explicit
   pre-existing artifact UUID. Never issue a worker-side SQL/REST update.

The worker must submit through
`https://smarter.poker/api/training/solver-worker`. The signed envelope binds
the exact machine id, solver version/binary checksum, protected pipeline
commit, manifest version/checksum, operation, raw artifact body, Unix timestamp,
and UUID nonce. `training_ingest_solver_artifact_v1` then validates and updates
one pre-existing row with the exact UUID/scenario/family/stack/street identity
in one transaction. Do not perform a worker-side SQL/REST update or distribute
the service-role key as a shortcut.

### Pre-Existing UUID Reservation Gate

The signed pipeline deliberately cannot insert a missing warehouse scenario.
`boards_for` discovers only pre-existing family rows, `row_states` requires
exactly one row for each scenario hash, and ingestion updates only the explicit
pre-existing UUID with the same scenario/family/stack/street identity. Before
retargeting, the protected 107-game/25-contract manifest therefore must be
expanded into its complete target ledger and prove that every target maps to
exactly one existing UUID. Zero matches and duplicate matches are both hard
stops. If a genuinely new scenario/family is required, reserve its relational
identity through a separate protected operator migration or a separately
reviewed reservation API design. Never add a placeholder, broaden the update,
or give a worker insert privilege as a shortcut.

4. From a server/service context, call the bounded
   `training_solver_spot_candidates_v1` RPC for that exact family/stack and
   confirm it returns the same artifact and active tuple. Confirm `anon` and
   `authenticated` cannot execute the RPC or read either backing table.
5. Exercise Spot Study once on desktop and mobile. Verify the exact physical
   holding, board, action targets/increments, percentages, provenance display,
   answer-revealed-only behavior, and cache persistence. Only then enable the
   first worker's controlled queue; repeat independently for the second.

## Secret Provisioning And Rotation

1. Keep both workers stopped. Generate two independent secrets with an
   operator-controlled password manager or `openssl rand -hex 32`.
2. Set the server-only Vercel values
   `SOLVER_WORKER_M1_HMAC_SECRET` and `SOLVER_WORKER_M2_HMAC_SECRET`; never use
   `NEXT_PUBLIC_` names. Deploy and verify the gateway health boundary.
3. On M1 set only `SOLVER_WORKER_HMAC_SECRET=<M1 value>`; on M2 set only the M2
   value. Set the exact production API URL on both. Remove
   `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` from both worker environments,
   scheduled-task wrappers, shell profiles, and local config files.
4. Rotate one worker at a time while it is stopped: change the server value,
   change only that host value, deploy, then run the one-heartbeat/one-artifact
   canary. A missing, malformed, or duplicated server key intentionally causes
   a 503 and must never be bypassed.

## Immediate Withdrawal

Retire a compromised or incorrect tuple; do not delete evidence or overwrite
its checksums. The retirement trigger removes all matching catalog rows, and
the candidate RPC independently joins only active authority in the same
database statement.

```sql
UPDATE public.training_solver_provenance_authority
SET retired_at = clock_timestamp()
WHERE machine_id = '<M1-or-M2>'
  AND solver_version = '<exact-version>'
  AND solver_binary_checksum = '<binary-sha256>'
  AND pipeline_commit = '<protected-commit>'
  AND manifest_version = '<manifest-version>'
  AND manifest_checksum = '<manifest-sha256>'
  AND retired_at IS NULL;
```

After retirement, require zero rows from the bounded candidate RPC for the
retired artifact and zero matching rows in the catalog. Preserve the warehouse
row for incident analysis; quarantine it separately if its data is suspect.
