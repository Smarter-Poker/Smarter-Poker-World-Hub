# Training Solver Worker Attestation Gate

Date: 2026-09-07
Status: External credential action required before M1 or M2 may publish Training-serving artifacts

## Code-Side Boundary Completed

- Spot Study now has a durable pre-authentication IP bucket and a durable
  authenticated-user bucket before any catalog or 80 GB warehouse lookup.
- Browser roles cannot execute `analyze_spots_by_game_type(text, integer)`;
  the server-only function is invoker-rights with a fixed `pg_catalog` search
  path.
- A future warehouse row reaches `training_solver_artifact_catalog` only when
  its full 1,326-combo payload, action metadata, node chronology, board/street/
  position identity, numeric summaries, canonical checksum, and exact Training
  family/stack contract validate.
- The exact machine, solver binary, pipeline commit, and manifest tuple must be
  active in the migration-owned `training_solver_provenance_authority` table.
  The current migration intentionally seeds no tuple. Retirement immediately
  removes matching serving rows.
- ICM artifacts remain ineligible until payout, field, stack-vector, objective,
  and input-seal fields exist and are bound to the artifact.
- `POST /api/training/solver-worker` is the only worker transport. M1 and M2
  sign the exact raw body and approved provenance tuple with distinct 32-byte
  HMAC keys, a five-minute timestamp, and a UUID nonce. The server keeps the
  Supabase service-role key; neither solver receives it.
- Durable receipts reject nonce reuse. A byte-identical ingest retry returns
  its original receipt only while the warehouse row, catalog admission, and
  active authority still match. Stale receipts are pruned in bounded batches
  after 24 hours, long after their signatures become unusable.
- The gateway exposes four fixed operations: one-artifact transactional ingest,
  up to 75 exact row states, a 500-row keyset board page backed by the existing
  four-column production index, and one worker heartbeat. Every database call
  has a 12-second cancellation deadline and durable worker rate limit.
- The pinned Windows pipeline aborts if `SUPABASE_SERVICE_ROLE_KEY` is present,
  refuses redirects, and accepts only the exact HTTPS endpoint on
  `smarter.poker`. No HMAC secret is committed.

## External Gate — Do Not Restart Either Worker Yet

The code-side trust boundary is complete, but the Windows workers historically
held a Supabase service-role credential. Repository code cannot revoke that
credential, provision HMAC keys on Vercel/Windows, approve a host binary, or
perform production canaries without an operator-controlled trust root.
The checked-in `phases.json` is still an explicit closed hold and contains the
legacy `6max_cash` family rather than an approved exact Training family/stack
manifest. Changing only `solver_ready` cannot launch it: worker validation will
reject that family and missing approval inputs. A protected replacement
manifest and exact checksum approval are mandatory.

Before either worker is enabled:

1. Rotate the exposed/legacy Supabase service-role credential centrally during
   an authorized maintenance window. Do not place the replacement service-role
   key on M1 or M2.
2. Generate two independent 32-byte HMAC keys. Provision both server-side as
   `SOLVER_WORKER_M1_HMAC_SECRET` and `SOLVER_WORKER_M2_HMAC_SECRET`. Provision
   only the corresponding value on each host as `SOLVER_WORKER_HMAC_SECRET`,
   plus `SOLVER_WORKER_API_URL=https://smarter.poker/api/training/solver-worker`.
   Never place both worker keys or any Supabase credential on one solver host.
3. Deploy the signed-ingress migration and API through protected checks. Confirm
   the endpoint intentionally returns 503 for a worker whose server key is
   absent or malformed and that identical M1/M2 server keys fail closed.
4. Independently checksum the deployed PioSOLVER binary, protected pipeline
   commit, and canonical 107-game/25-contract manifest. Expand the manifest's
   target ledger and prove every target already has exactly one warehouse UUID;
   a missing or duplicate scenario requires a separate protected reservation/
   cleanup change because workers have no insert privilege. Add only the exact
   attested tuples to `training_solver_provenance_authority` through a protected
   migration with a named approver.
5. Start one supervised worker, prove one fresh signed heartbeat and one
   correctly signed solve/export/catalog admission, then repeat for the other
   worker. Remove/disable any legacy task or script that talks to Supabase
   directly before either canary.

Until all five steps pass, the safe state is `safe_to_restart: false`,
`safe_to_retarget: false`, and an empty serving catalog. No credential, worker,
scheduled task, Supabase service, chip ledger, or wallet was changed by this
code-side hardening.
