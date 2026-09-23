# Phase 6 Production Delivery-Authority Attestation

Status: public harness and machine administrator collector implemented and
locally contract-tested with fake transports. Neither has been run against
production. A hand-authored JSON summary can never turn this gate green; only
one uninterrupted collector process can pass its module-private proof directly
to the finalizer. This document does not close Phase 6 and does not authorize
PR B.

## Purpose

`scripts/training-phase6-production-delivery-attestation.mjs` supplies the
missing public-API evidence bridge after PR A. It accepts only the immutable
`hub-vanguard-<deployment>-smarter-poker.vercel.app` hostname, requires one
exact 40-character deployed commit, transfers one authenticated storage value
from a trusted Smarter.Poker or loopback origin into only that immutable
origin, and will not make any write until the operator supplies this exact
acknowledgement:

```text
TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_WRITES=I_ACKNOWLEDGE_THIS_CREATES_REAL_TRAINING_ATTEMPTS_AND_ANSWERS
```

The run creates a real `cash-002` Level 8 campaign attempt, served events, and
answer rows for one explicitly designated audit account. The operator must set
`TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID` to that account's canonical
lowercase UUID v4. Before any production write, the harness decodes the saved
access-token subject, checks the saved session user, and requires both to equal
that UUID; the authenticated API probe then makes the server validate the
token. Evidence records only the UUID, never either token. It must only run against the
immutable `*.vercel.app` deployment URL returned by the exact-build deployment
verification.

## Public API coverage

The harness fails closed unless it proves all of the following through the
deployed public API:

1. `/api/health` reports the exact expected 40-character build, a nonempty
   immutable deployment ID, healthy database, and healthy Training receipt
   configuration from the same immutable deployment URL.
2. The saved audit account is authenticated through
   `/api/training/get-sessions`, and its JWT subject and saved session user both
   match the explicit designated audit-account UUID.
3. `/api/training/batch-preload` returns the entire signed 20-hand `cash-002`
   Level 8 campaign attempt, one unique attempt-scoped receipt per hand,
   contiguous hand ordinals, and no practice-only or partial delivery.
4. `/api/training/reissue-questions` recovers that untouched attempt without
   changing its question manifest, public question bytes, attempt, session,
   slot, snapshot, policy checksum, or deterministic submission identity. A
   refreshed receipt envelope may have a new issue timestamp, so byte equality
   is reported instead of falsely required.
5. Every original receipt and every reissued receipt in the 20-hand manifest is
   submitted through `/api/training/record-question`. A changed receipt envelope
   is accepted only when the server verifies it as an exact idempotent replay;
   matching bytes are also replayed through the server instead of being trusted
   locally. Requests are paced to at most 28 per rolling 60 seconds, below the
   endpoint's 30-per-minute production write limit.
6. A real answer response is deliberately discarded at the application
   boundary. The exact retry must return `idempotentReplay: true`, and the
   reissued receipt must return byte-equivalent immutable grading evidence and
   feedback. A changed answer must fail with the exact replay-conflict contract,
   while a changed submission binding must fail with the exact submission-
   mismatch contract. During the bounded public-choice search, the harness
   reaches an actually persisted canonical continuation action without reading
   or inferring a private answer key before submitting each decision.
7. `/api/training/next-street` returns a child bound to the same attempt,
   session, and hand, exactly one decision after its parent, with a different
   snapshot and `countsTowardCompletion: false`. Repeating the parent request
   must recover the same child.
8. The child answer and its exact replay return identical immutable evidence.
9. After the last API operation, the same browser remains open for at least 15
   seconds. The public file records the exact API-complete and settled-through
   timestamps and fails if a page or console error is observed.

The evidence output path is mandatory, must not already exist, and is protected
by an exclusive mode-`0600` sibling lock for the entire run. A crash leaves the
lock for deliberate operator inspection; a normal completion removes it. The
harness never silently resumes or overwrites a prior public artifact. Its own
in-progress checkpoints are written atomically with mode `0600` while the lock
is held. The evidence JSON contains the exact
attempt ID, event keys, slot ordinals, snapshot keys, question IDs, policy
checksums, and submission IDs needed for administrator correlation. It never
stores an access token, refresh token, receipt signature, service-role key, or
receipt signing secret. Both field names and string values are scanned for
receipt, JWT, connection-credential, and common provider-secret shapes before
closeout validation.

## Predeploy signing-key gate

PR A must not deploy until `TRAINING_GRADING_RECEIPT_SECRET` is provisioned in
every Vercel environment that will serve or certify the build. Generate an
independent high-entropy value (at least 32 characters; 32 or more random bytes
is preferred). It must not equal `SUPABASE_SERVICE_ROLE_KEY` and must not be the
former public example text
`generate-a-dedicated-32-byte-or-longer-secret`. Record only the environment
name, Vercel scope, provisioning time, and operator confirmation in the release
record—never the value or its reversible encoding.

The runtime predicate is a necessary configuration guard, not proof that an
operator used a cryptographically random generator. It rejects whitespace,
short-repeating material, obvious `changeme`/placeholder families, the retired
sentinel, and the service-role key while continuing to accept high-entropy hex
and base64 encodings. Release authority must separately record an operator
confirmation that at least 32 random bytes were generated; never record the
bytes, a prefix, or a digest.

The operator can validate loaded environment values without printing them:

```text
node --input-type=module -e "import { isDedicatedTrainingGradingReceiptSecret as valid } from './src/lib/training/gradingReceiptSecret.mjs'; if (!valid(process.env.TRAINING_GRADING_RECEIPT_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY)) process.exit(1)"
```

After deployment, `/api/health` on the exact immutable build must report
`checks.trainingGradingReceipt.status = ok`; missing, short, public-placeholder,
or service-role-identical values make global health return HTTP 503. Keep the
same dedicated value during PR-A migration-first rollout and rollback. A key
rotation invalidates unexpired receipts, whose maximum lifetime is 24 hours, so
rotate only in a separately approved drain/maintenance window (or after a
future multi-key verification design), never in the middle of this release.

## Audit-session custody at startup (2026-09-22)

The audit account's Supabase access JWT lives at most one week; its rotating
refresh token keeps the session usable for a 90-day window. The tracked
attestation now performs that rotation itself, once, at startup, through
`src/lib/training/trainingAuditSessionRefresh.mjs`, before its first request
of any kind. It refreshes when and only when the saved access token is expired
or inside the 24-hour threshold; a fresh token makes zero refresh calls. The
browser context and every API request then carry the refreshed token.

Point the run at the mode-`0600` credential env kept outside the repository:

```text
TRAINING_PHASE6_AUDIT_ENV_FILE=/absolute/path/to/phase6/.env
```

That file is the same one the out-of-Git refresher (`refresh-session.mjs`)
maintains, in the same `KEY='value'` format with the same keys
(`TRAINING_PHASE6_AUDIT_ACCESS_TOKEN`, `TRAINING_PHASE6_AUDIT_REFRESH_TOKEN`,
`TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID`,
`TRAINING_PHASE6_DELIVERY_AUTH_STATE`,
`TRAINING_PHASE6_AUDIT_SESSION_STARTED_AT_EPOCH`,
`TRAINING_PHASE6_AUDIT_SESSION_VALID_UNTIL`, `TRAINING_PHASE6_AUDIT_SESSION_MODE`,
`TRAINING_PHASE6_SUPABASE_URL`, `TRAINING_PHASE6_SUPABASE_PUBLISHABLE_KEY`,
`TRAINING_PHASE6_AUDIT_ENV_FILE`). Both tools take the same exclusive
`<env>.refresh.lock`, write temp + fsync + rename in the same directory, keep
both files mode `0600` in a directory that is not group/world accessible, and
never persist a session whose subject differs from the designated audit UUID.
When `TRAINING_PHASE6_AUDIT_ENV_FILE` is set and
`TRAINING_PHASE6_DELIVERY_AUTH_STATE` is not, the auth-state path named inside
the credential env is used, so the two cannot diverge. Never print, source or
copy either file; the harness reads them itself.

The custody step is one bounded execution with an authoritative outcome,
recorded under `auditSession` in the public evidence (identifiers, timestamps
and counts only, never a token):

| `auditSession.outcome` | Meaning | Operator action |
| --- | --- | --- |
| `fresh` | Token outlives the threshold; zero refresh calls | none |
| `refreshed` | Exactly one refresh; both files rotated atomically | none |
| `reused_persisted` | Another holder rotated while this run waited; nothing rotated twice | none |
| `refused` | Fail-closed before any refresh call (90-day window ended, identity mismatch, malformed state, lock held by a live process, in-repository or loose-permission files) | read `failure.code` / `failure.operatorAction`; re-establish the session if the window ended |
| `failed` | The refresh call answered but was rejected or malformed, or named another user; nothing persisted | re-establish the audit session with a fresh sign-in |
| `unknown` | No response within the 20-second bound; the refresh token may already have rotated server-side | do not retry blindly; inspect the credential store, then run the out-of-Git refresher once, deliberately |

On every non-`fresh`/`refreshed`/`reused_persisted` outcome the attestation
exits before its first API request, the evidence file records
`status: failed_closed` with the outcome, and the old credential files remain
intact. A lock held by a live process is waited for at most three bounded
attempts and then refused; a lock whose owning process is gone is removed
once. A live lock is never deleted by the harness.

Without `TRAINING_PHASE6_AUDIT_ENV_FILE` the plain auth-state flow below still
works for a token that will outlive the run (at least 20 minutes remaining); an
expired or nearly expired token is refused with an explicit message naming the
variable, instead of failing later at the authenticated probe.

## Step 1: create immutable public evidence

Run this only after PR A is the deployed build:

```text
TRAINING_PHASE6_DELIVERY_BASE_URL=https://<immutable-deployment>.vercel.app \
TRAINING_PHASE6_DELIVERY_EXPECTED_BUILD=<exact-40-character-sha> \
TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID=<dedicated-audit-account-uuid-v4> \
TRAINING_PHASE6_AUDIT_ENV_FILE=/absolute/path/to/phase6/.env \
TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_WRITES=I_ACKNOWLEDGE_THIS_CREATES_REAL_TRAINING_ATTEMPTS_AND_ANSWERS \
TRAINING_PHASE6_DELIVERY_EVIDENCE=/tmp/phase6-pr-a-delivery-attestation.json \
node scripts/training-phase6-production-delivery-attestation.mjs
```

(`TRAINING_PHASE6_DELIVERY_AUTH_STATE=<path>` may still be given explicitly; it
must then name the same file the credential env names.)

Choose a new, run-specific evidence path. If either that path or its `.lock`
file exists, stop and inspect the earlier artifact; do not delete or reuse it
merely to make the harness run.

`publicApiSuccess: true` means the public-API portion passed. The harness
deliberately leaves `success: false`, `releaseGateReady: false`, and every
administrator item below as `pending`. A nonzero exit after writing evidence
with `status: public_api_verified_admin_correlation_pending` is therefore the
expected successful result of Step 1, not permission to suppress the exit.
Preserve that exact public file: Step 2 binds its SHA-256 over the complete file
bytes, including whitespace and the trailing newline.

## Step 2: machine administrator collection

Using authorized administrator access, the machine collector correlates every `publicApi.parent` and
`publicApi.continuation` field to production:

- All 20 parent `training_question_events.event_key` values and the one
  continuation event key exist exactly once (21 served events total) with
  `event_type = 'served'`, the audit account owner, and metadata matching its
  attempt ID, hand ordinal, decision ordinal, snapshot key, question ID, and
  policy checksum.
- The private singleton `training_delivery_authority_attestations` row has
  `contract_version = 'training-attempt-decision-authority-v1'`,
  `evidence_kind = 'attempt_scoped_serve'`, and references a genuine non-legacy
  served event with a non-null owner. Because this row records the first
  deployment-wide attestation, it is not required to reference this audit
  attempt; a real user may legitimately have created it first.
- All 20 persisted parent answers and the one child answer match the evidence
  JSON (21 answers total), and the child continuation row binds its parent
  snapshot and parent submission.

The collector loads and SHA-binds the preserved public bytes, connects using
authorized administrator credentials without printing or persisting them, set
database work read-only except for explicitly scoped transactions that always
roll back, query exact events/answers/continuation/singleton rows, and bind
`current_user`, database, server version, audit UUID, build, immutable URL,
deployment ID, and the full settled error-review window. It must produce its
summary atomically to a new mode-`0600` path.

Database correlation uses a parameterized `REPEATABLE READ READ ONLY`
transaction and explicitly rolls it back. Six allowlisted negative probes run
one at a time with a two-second lock timeout and 15-second statement timeout;
there is no general SQL input. The changed-answer and changed-slot probes rely
on immutable triggers, the never-served probe temporarily removes exactly one
audit served event, and every transaction is rolled back and followed by a row
restoration check. No probe has a commit path.

Vercel runtime error and fatal logs are collected with the installed Vercel CLI
for the exact deployment ID, project, public start timestamp, and settled
completion timestamp. The token is passed only in the child environment, never
in argv. A command failure, malformed JSONL, cross-deployment record, any
relevant error, or reaching the conservative 10,000-row ceiling fails closed.
The immutable health endpoint is verified both before and after collection.

The predecessor gate has two deliberately distinct modes:

- `authentic_artifact` requires an out-of-repository mode-`0600` artifact, an
  Ed25519 detached signature, an independently pinned public-key SHA-256, exact
  audit-account binding, and two immutable production legacy-promotion events.
  Only artifact/key digests are persisted; receipt identifiers and signatures
  remain in memory.
- `controlled_rehearsal` runs the repository's production migration contract in
  a disposable local PostgreSQL cluster. Its output says
  `controlled_rehearsal_not_authentic`, stores the verifier source digest, and
  can never be relabeled as authentic production predecessor evidence.

Use a new public/admin/final path set and either direct environment credentials
or absolute credential files outside the repository. Credential files must not
be group/world accessible. The file form keeps credentials out of shell
history:

```text
TRAINING_PHASE6_ADMIN_COLLECT=1 \
TRAINING_PHASE6_DELIVERY_EVIDENCE=/secure/evidence/phase6-public.json \
TRAINING_PHASE6_DELIVERY_ADMIN_EVIDENCE=/secure/evidence/phase6-admin.json \
TRAINING_PHASE6_DELIVERY_FINAL_EVIDENCE=/secure/evidence/phase6-final.json \
TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID=<dedicated-audit-account-uuid-v4> \
TRAINING_PHASE6_EXPECTED_SUPABASE_PROJECT_REF=<exact-20-character-project-ref> \
TRAINING_PHASE6_ADMIN_DATABASE_CREDENTIAL_FILE=/secure/credentials/phase6-postgres-url \
TRAINING_PHASE6_VERCEL_TOKEN_FILE=/secure/credentials/phase6-vercel-token \
TRAINING_PHASE6_VERCEL_PROJECT=<exact-project-id-or-name> \
TRAINING_PHASE6_VERCEL_SCOPE=<exact-team-scope> \
TRAINING_PHASE6_PREDECESSOR_MODE=controlled_rehearsal \
TRAINING_PHASE6_PREDECESSOR_REHEARSAL_ACKNOWLEDGEMENT=I_ACKNOWLEDGE_CONTROLLED_REHEARSAL_IS_NOT_AUTHENTIC_PRODUCTION_PREDECESSOR_EVIDENCE \
TRAINING_PHASE6_ADMIN_COLLECT_ACKNOWLEDGEMENT=I_ACKNOWLEDGE_PHASE6_ADMIN_COLLECTION_RUNS_ROLLBACK_ONLY_NEGATIVE_PROBES \
TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_ADMIN_CLOSEOUT=I_ACKNOWLEDGE_THE_ADMIN_CLOSEOUT_EVIDENCE_IS_COMPLETE_AND_ACCESS_CONTROLLED \
node scripts/training-phase6-production-delivery-attestation.mjs
```

For `authentic_artifact`, replace the mode/rehearsal acknowledgement with
`TRAINING_PHASE6_PREDECESSOR_ARTIFACT`,
`TRAINING_PHASE6_PREDECESSOR_PUBLIC_KEY`, and the independently established
`TRAINING_PHASE6_PREDECESSOR_PUBLIC_KEY_SHA256`. Do not derive the trusted
fingerprint from the supplied artifact in the same approval step.

The admin and final outputs each have an exclusive sibling lock, are atomically
created mode `0600`, and are never overwritten. The preserved public-file hash
is checked again immediately before output commit. A crash may leave a lock or
an admin-only artifact; inspect it rather than deleting it reflexively. Only the
private in-process collector proof can make `releaseGateReady: true` and a zero
exit. File-only finalization still fails with
`TRAINING_PHASE6_MACHINE_ADMIN_COLLECTOR_REQUIRED` by design.

The public attempt, 20 parent answers, continuation answer, served events,
seen-question entries, cache-accounting events, and the deployment-wide first
authority attestation are intentional immutable audit effects. Do not delete or
rewrite them as cleanup. Keep the dedicated audit account excluded from product
analytics/competition and never use it for normal play. Preserve the authority
singleton even when its first genuine event belongs to another user.

## External authority still required

The repository contains no production administrator database credential, Vercel
runtime-log credential, already-run public evidence, designated audit-account
selection, or independently trusted predecessor signing key. The collector
cannot manufacture any of them. An authorized operator must supply those
inputs (preferably through mode-`0600` files), or explicitly choose the
non-authentic controlled rehearsal when that is the approved release evidence.
The operator must also make the separate signing-key randomness confirmation;
runtime source cannot prove how a secret was generated.

Until the public run and the machine collector both execute successfully
against the exact deployed build, the honest state remains unverified and
Phase 6 stays open.

## Local verification

```text
node --test __tests__/training-production-delivery-attestation.test.mjs
node --experimental-vm-modules --test __tests__/training-audit-session-refresh.test.mjs
node --check scripts/training-phase6-production-delivery-attestation.mjs
```

`training-audit-session-refresh` (21 tests, in the permanent
`test:training:phase6-authority` gate) proves the startup custody contract with
synthetic tokens and a fake transport: one refresh for an expired or
near-expiry token and zero for a fresh one, identity-mismatch and malformed
state/response fail-closed with nothing persisted, atomic mode-`0600`
persistence with private-directory and outside-repository checks, exclusive
lock with bounded retry and no double rotation across concurrent callers,
timeout reported as an authoritative `unknown` with the old state intact, the
90-day window refusal, the attestation's first API request carrying the
refreshed token, evidence staying mode `0600`, and the absence of every seeded
secret from thrown messages, records and evidence JSON.

The current source contract passes 42/42 focused attestation tests, including immutable-host and
deployment-ID checks through a fake fetch transport, explicit audit-account
JWT-subject/session binding, write acknowledgement, exclusive mode-`0600`
run locking, malformed-signature and canonical-JTI binding, exact Standard
difficulty, full-manifest and dual-receipt verification, replay-conflict
refusal, continuation receipt-byte identity, sliding-window pacing, the 15-
second settling contract, complete public-structure adversaries, and honest
predecessor-census reporting. Closeout tests also cover exact
21-event/21-answer correlation claims, singleton first-event semantics, exact
six-probe and settled time-window contracts, secret-bearing field and value
rejection, source-file digest binding, malformed evidence, synthetic green
objects, and the mandatory failure of every file-only finalization path. The
machine-core tests exercise success, administrator denial, rollback failure,
log incompleteness, account/deployment mismatch, false predecessor provenance,
parameter binding, and credential-safe Vercel subprocess behavior without
touching production or reading real credentials.
