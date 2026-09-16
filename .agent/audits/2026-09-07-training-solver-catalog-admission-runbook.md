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

### One Active Ingest Scope Per Physical Machine

Before preparing a new approval, inventory the exact active scope on the target
machine. An active provenance row whose scope is `backlog` or `bounded_canary`
is ingest-capable. M1 may have at most one such tuple and M2 may have at most
one such tuple. Held tuples do not ingest and may coexist while being reviewed.
The cap is per physical machine: an active M1 tuple does not block an independent
M2 activation, and an active M2 tuple does not block M1.

```sql
SELECT
  scope.machine_id,
  scope.admission_mode,
  scope.solver_version,
  scope.solver_binary_checksum,
  scope.pipeline_commit,
  scope.manifest_version,
  scope.manifest_checksum
FROM public.training_solver_ingest_scopes scope
JOIN public.training_solver_provenance_authority authority
  USING (
    machine_id, solver_version, solver_binary_checksum, pipeline_commit,
    manifest_version, manifest_checksum
  )
WHERE authority.retired_at IS NULL
  AND scope.admission_mode IN ('backlog', 'bounded_canary')
ORDER BY scope.machine_id, scope.configured_at;
```

The target machine must return zero other ingest-capable rows before its new
held tuple can be activated. Retire every obsolete exact provenance tuple
through the protected withdrawal procedure; never edit an active scope back to
`held`, never repurpose its targets, and never retire by wildcard. The database
serializes `held` to `backlog`/`bounded_canary` transitions per machine and
rejects a conflict with
`TRAINING_SOLVER_MACHINE_INGEST_SCOPE_ALREADY_ACTIVE`. That rejection is a hard
stop, not a reason to disable the guard or broaden a credential.

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
  source_combo_order_sha256,
  training_game_contracts_sha256,
  manifest_contracts,
  approved_by
) VALUES (
  '<M1-or-M2>',
  '<exact-version-from-attested-binary>',
  '<64-lowercase-hex-binary-sha256>',
  '<40-lowercase-hex-protected-commit>',
  '<exact-canonical-manifest-version>',
  '<64-lowercase-hex-manifest-sha256>',
  '<64-lowercase-hex-show-hand-order-sha256>',
  '<64-lowercase-hex-107-game-contract-sha256>',
  jsonb_build_array(
    jsonb_build_object(
      'game_type', '<exact-non-ICM-family>',
      'stack_depth', <exact-positive-integer-bb>,
      'oop_player', '<exact-OOP-position>',
      'ip_player', '<exact-IP-position>',
      'pot_chips', <exact-positive-integer>,
      'eff_chips', <exact-positive-integer>,
      'rake', '<exact-canonical-rake-contract>',
      'accuracy_fraction', <exact-approved-fraction>,
      'oop_range_checksum', '<64-lowercase-hex-sha256>',
      'ip_range_checksum', '<64-lowercase-hex-sha256>',
      'range_combo_order',
        'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
      'source_combo_order_sha256',
        '<64-lowercase-hex-show-hand-order-sha256>',
      'tree_geometry', 'srp_parameterized_v2',
      'streets', jsonb_build_array('flop', 'turn')
    )
    -- Add one independently verified jsonb_build_object per approved manifest
    -- contract. Do not add a family/stack wildcard or copy worker self-report.
  ),
  '<named-human-approver-and-change-ticket>'
);

-- The authority-insert trigger created this exact tuple in held mode. Install
-- only the two checksum-sealed, pre-existing target identities while held.
INSERT INTO public.training_solver_bounded_canary_targets (
  machine_id, solver_version, solver_binary_checksum, pipeline_commit,
  manifest_version, manifest_checksum, target_role, artifact_id,
  scenario_hash, street, node, hero_position, approved_by
) VALUES (
  '<M1-or-M2>', '<exact-version-from-attested-binary>',
  '<64-lowercase-hex-binary-sha256>',
  '<40-lowercase-hex-protected-commit>',
  '<exact-canonical-manifest-version>',
  '<64-lowercase-hex-manifest-sha256>',
  'parent', '<exact-pre-existing-parent-uuid>',
  '<exact-parent-scenario-hash>', 'flop', '<exact-parent-node>',
  '<exact-hero-position>', '<named-human-approver-and-change-ticket>'
), (
  '<M1-or-M2>', '<exact-version-from-attested-binary>',
  '<64-lowercase-hex-binary-sha256>',
  '<40-lowercase-hex-protected-commit>',
  '<exact-canonical-manifest-version>',
  '<64-lowercase-hex-manifest-sha256>',
  'child', '<exact-pre-existing-child-uuid>',
  '<exact-turn-child-scenario-hash>', 'turn', '<exact-turn-child-node>',
  '<exact-hero-position>', '<named-human-approver-and-change-ticket>'
);

-- Recheck immediately before activation. The trigger repeats this check under
-- a per-machine transaction lock, so a concurrent activation cannot race it.
DO $single_active_machine_scope$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.training_solver_ingest_scopes other_scope
    JOIN public.training_solver_provenance_authority other_authority
      USING (
        machine_id, solver_version, solver_binary_checksum, pipeline_commit,
        manifest_version, manifest_checksum
      )
    WHERE other_scope.machine_id = '<M1-or-M2>'
      AND other_scope.admission_mode IN ('backlog', 'bounded_canary')
      AND other_authority.retired_at IS NULL
      AND (
        other_scope.solver_version <> '<exact-version-from-attested-binary>'
        OR other_scope.solver_binary_checksum <>
          '<64-lowercase-hex-binary-sha256>'
        OR other_scope.pipeline_commit <>
          '<40-lowercase-hex-protected-commit>'
        OR other_scope.manifest_version <>
          '<exact-canonical-manifest-version>'
        OR other_scope.manifest_checksum <>
          '<64-lowercase-hex-manifest-sha256>'
      )
  ) THEN
    RAISE EXCEPTION 'target machine already has an active ingest scope';
  END IF;
END;
$single_active_machine_scope$;

UPDATE public.training_solver_ingest_scopes
SET admission_mode = 'bounded_canary',
    partition_count = 2,
    partition_index = <0-for-M1-or-1-for-M2>,
    configured_at = clock_timestamp(),
    configured_by = '<named-human-approver-and-change-ticket>'
WHERE machine_id = '<M1-or-M2>'
  AND solver_version = '<exact-version-from-attested-binary>'
  AND solver_binary_checksum = '<64-lowercase-hex-binary-sha256>'
  AND pipeline_commit = '<40-lowercase-hex-protected-commit>'
  AND manifest_version = '<exact-canonical-manifest-version>'
  AND manifest_checksum = '<64-lowercase-hex-manifest-sha256>'
  AND admission_mode = 'held';

DO $approval_scope_assertion$
BEGIN
  IF (SELECT count(*)
      FROM public.training_solver_ingest_scopes
      WHERE machine_id = '<M1-or-M2>'
        AND solver_version = '<exact-version-from-attested-binary>'
        AND solver_binary_checksum = '<64-lowercase-hex-binary-sha256>'
        AND pipeline_commit = '<40-lowercase-hex-protected-commit>'
        AND manifest_version = '<exact-canonical-manifest-version>'
        AND manifest_checksum = '<64-lowercase-hex-manifest-sha256>'
        AND admission_mode = 'bounded_canary'
        AND partition_count = 2
        AND partition_index = <0-for-M1-or-1-for-M2>) <> 1 THEN
    RAISE EXCEPTION 'bounded canary approval did not activate exactly one scope';
  END IF;
END;
$approval_scope_assertion$;

COMMIT;
```

The three manifest authority fields are mandatory in the live schema. The
`source_combo_order_sha256` must equal the protected manifest's attested
`show_hand_order` digest, `training_game_contracts_sha256` must equal its exact
107-game ledger digest, and every object in `manifest_contracts` must be copied
as a literal from the independently reviewed manifest. Omitting any of these
fields is not a partial approval; the migration must fail review before it is
allowed to run.

Every future provenance insert is server-created in `held` scope. The same
protected transaction must add exactly one Flop parent and one exact Turn child
and transition `held` to `bounded_canary`. The transition is one-way, the
target set is immutable after activation, and M1/M2 are fixed to `2/0` and
`2/1`. A backlog approval is a separate explicit `held` to `backlog`
transition and is valid only with zero canary targets. Never reuse or widen a
bounded-canary tuple for backlog work; retire it and approve a new tuple.

The protected manifest also seals an explicit execution scope. A supervised
canary uses `execution_scope: bounded_canary`, keeps `solver_ready` false, and
contains only phases referenced by the exact M1 and M2 canary contracts. Its
107-game ledger remains complete, but games outside those canary phase pairs
truthfully carry no runnable phase. A production backlog uses
`execution_scope: training_backlog` and must contain all 18 approved chip-EV
family/stack contracts. Changing a release-gate boolean can never convert the
partial canary manifest into backlog authority.

The v2 gateway and operation-scope migration are an intentional fail-closed
cutover, not a mixed-version compatibility window. Keep M1 and M2 stopped while
the protected database migration and application deployment converge. The old
v1 RPC grants are removed, and the v2 API cannot return work until the scoped
RPCs exist. Activate a held scope only after production proves both the exact
served application commit and the v2 database function/ACL postconditions.

An UPDATE may not move a target's machine, provenance tuple, manifest tuple, or
parent/child role—even into another held scope. Target repair is allowed only
in place while its original exact scope is held.

The approval itself must not populate the serving catalog. A catalog entry is
created only by a later insert/update of one exact solver artifact that passes
the complete payload, identity, legal-node, live-combo, checksum, and active
provenance checks.

## One Parent/Child Supervised Admission

1. Keep the second worker disabled. Run `run_machine.py M1 2 0 --canary`
   against the protected manifest's exact M1 target. It must export only that
   non-ICM Flop parent and its exact Turn child, then exit. Retain the local Pio
   output and canonical JSON for both artifacts.
2. Independently recompute each source-artifact checksum over
   `scenario_hash` and `strategy_matrix_v2`; verify 1,326-combo order, zero
   strategy mass on board-dead combos, legal cumulative node targets, numeric
   EVs, and the exact family/stack contract.
3. Require the bounded runner to submit exactly the two checksum-sealed
   artifacts through the scoped ingestion path using their two explicit
   pre-existing artifact UUIDs. Never issue a worker-side SQL/REST update.

The checksum-sealed target must bind M1 to partition `2/0` or M2 to partition
`2/1`, and the launch command must match that tuple exactly. If a prior attempt
stopped after one successful admission, rerunning the same protected tuple may
ingest only the missing artifact. An existing admission may be skipped only
after its UUID, scenario, machine, manifest, pipeline, solver, and binary
provenance all match the active tuple; foreign, stale, or ambiguous rows stop
the canary. Before Pio starts, the caller-bound state RPC must also prove
`bounded_canary` mode, the exact machine partition, target role, UUID,
scenario, street, authorized node, and authorized hero position for both
identities. If both are already exact-current, the launcher re-verifies both,
emits a zero-write completion heartbeat, and exits before Pio starts.

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
`boards_for` discovers only pre-existing family rows, the caller-bound
`training_solver_worker_row_states_v2` requires exactly one row for each
scenario hash, and ingestion updates only the explicit
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
   confirm both catalog identities resolve under the same active tuple. Confirm
   `anon` and `authenticated` cannot execute the RPC or read either backing table.
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
   change only that host value, deploy, then run the heartbeat plus sealed
   parent/child canary. A missing, malformed, or duplicated server key
   intentionally causes a 503 and must never be bypassed.

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
