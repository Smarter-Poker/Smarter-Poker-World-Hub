# Training Delivery Authority: Two-Protected-PR Rollout

Status: PR A is the only deployable stage. PR B is held locally and must not be
included in the same protected pull request.

## Safety invariant

The Build Safety Gate applies database migrations before the application is
deployed. Therefore PR A must leave the predecessor application able to write
both initial and continuation answers for an unlimited rollback interval. It
may add attempt-scoped delivery evidence and begin dual-writing, but it must not
replace `fn_validate_training_answer_v2` with the strict validator.

The seven-day legacy receipt window is only a bounded bridge for already-served
predecessor receipts. It is not a deployment timer and it never activates the
strict validator. Only a real call to
`fn_training_attempt_record_served_batch_v1` may create the private deployment
attestation; legacy promotion cannot attest the new application.

## PR A: expand schema and deploy dual-write application

### Mandatory receipt-signing-key gate

Before the PR-A candidate deploys anywhere, provision
`TRAINING_GRADING_RECEIPT_SECRET` as a dedicated Sensitive value in every
serving and certification environment. It must be at least 32 characters, must
not use the retired public sentinel, and must not equal
`SUPABASE_SERVICE_ROLE_KEY`. Follow the no-value-exposure procedure in
`2026-09-08-training-phase-6-production-delivery-attestation.md`; that document
is part of this rollout, not optional follow-up reading.

The runtime predicate also rejects whitespace, obvious placeholder families,
and short repeated units. Passing that predicate is necessary but is not proof
of randomness: release authority must separately confirm that the value came
from at least 32 random bytes, without recording the value, a prefix, or a
digest. High-entropy hexadecimal and base64 encodings remain valid.

Vercel's control plane confirms Sensitive-variable presence and targeting but
does not decrypt the value for local inspection. Therefore the immutable PR-A
Preview must report `checks.trainingGradingReceipt.status = ok` from
`/api/health` before the protected PR may merge. Immediately after the
Production deployment, the same exact-build health check must pass; Production
also evaluates the receipt secret against the loaded service-role key. A
missing or degraded check blocks attestation and requires rollback or an
authorized secret correction. Never print, hash, prefix, or persist either
secret as evidence.

The production delivery run must name one dedicated audit-account UUID through
`TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID` and a new explicit evidence
path. Its access-token subject and saved session user must both match that UUID
before the first write. The path and sibling `.lock` must not already exist.
The audit attempt, answer/event rows, seen-question effects, cache accounting,
and deployment-wide first authority row are intentional immutable records; do
not delete them as cleanup, and exclude the audit account from product
competition/analytics.

PR A is not release-closeable from a hand-authored administrator JSON file.
The reviewed collector in
`scripts/training-phase6-production-delivery-attestation.mjs` binds the exact
public-file SHA, immutable build/URL/deployment ID, database identity and rows,
six rolled-back negative probes, one explicitly classified predecessor proof,
and the post-API settled Vercel runtime-error window. Only that uninterrupted
process can pass a module-private proof directly to the finalizer; importing
its fake-transport test core, editing JSON, or invoking the file-only finalizer
still returns `TRAINING_PHASE6_MACHINE_ADMIN_COLLECTOR_REQUIRED`. Never bypass
this fail-closed state.

The collector requires external, authorized administrator PostgreSQL and
Vercel credentials through environment values or absolute mode-`0600` files
outside the repository. It never prints or persists them. Correlation is a
parameterized repeatable-read read-only transaction. Each reviewed negative
probe runs separately with short timeouts, has no commit path, and is followed
by rollback and restoration verification. Use either an independently signed
authentic predecessor artifact whose trusted public-key fingerprint was
established separately, or the explicitly non-authentic disposable PostgreSQL
rehearsal. See the production attestation document for the exact invocation;
do not improvise fields or reuse output paths.

The exact delivery-authority rollout file set for PR A is:

- `supabase/migrations/20260907200000_training_cache_event_idempotent_replay.sql`
- `supabase/migrations/20260907203000_training_attempt_decision_delivery_authority.sql`
- `src/lib/training/gradingReceipt.mjs`
- `src/lib/training/gradingReceiptSecret.mjs`
- `src/lib/training/trainingAttemptDelivery.mjs`
- `pages/api/health/index.js`
- `pages/api/training/batch-preload.js`
- `pages/api/training/custom-train.js`
- `pages/api/training/get-question.js`
- `pages/api/training/hand-of-the-day.js`
- `pages/api/training/next-street.js`
- `pages/api/training/record-question.js`
- `pages/api/training/reissue-questions.js`
- `scripts/verify-training-cache-replay-postgres.mjs`
- `scripts/training-phase6-production-delivery-attestation.mjs`
- `.agent/audits/2026-09-08-training-phase-6-production-delivery-attestation.md`
- `.env.example`
- `__tests__/deployment-version-stamp.test.mjs`
- `__tests__/leak-engine-wiring.test.mjs`
- `__tests__/training-batch-canonical-replacement.test.mjs`
- `__tests__/training-blind-grading-boundary.test.mjs`
- `__tests__/training-client-endpoint-wiring.test.mjs`
- `__tests__/training-custom-config-contract.test.mjs`
- `__tests__/training-daily-challenge-authority.test.mjs`
- `__tests__/training-grading-receipt.test.mjs`
- `__tests__/training-production-delivery-attestation.test.mjs`
- `__tests__/training-multistreet-hand-manager.test.mjs`
- `__tests__/training-next-street-authority.test.mjs`
- `__tests__/training-question-delivery-authority.test.mjs`
- `__tests__/training-reissue-authority.test.mjs`
- `__tests__/training-runtime-wiring.test.mjs`
- `__tests__/training-single-question-recovery-contract.test.mjs`
- `package.json`
- `.agent/audits/2026-09-07-training-delivery-authority-expand-contract-runbook.md`

If a wider Phase 6 PR contains other independently reviewed files, those do not
change this rollout split. The held PR-B migration below is never part of PR A.

### Required PR-A checks

Run:

```text
npm run audit:training:delivery-db
node --test __tests__/leak-engine-wiring.test.mjs
node --experimental-vm-modules --test __tests__/training-blind-grading-boundary.test.mjs __tests__/training-question-delivery-authority.test.mjs __tests__/training-single-question-recovery-contract.test.mjs
npm run test:training:phase6-authority
```

The PostgreSQL verifier must apply PR A over an exact predecessor validator and
prove all of the following before any contract migration is considered:

- predecessor initial and continuation answer writes still succeed;
- exact predecessor request keys are accepted: UUID, UUID`:0`, and UUID`:1`;
- the compatibility receipt ID is lowercase RFC 4122 version 4, matching the
  predecessor's `randomUUID()` output, so stable post-cutover receipt IDs cannot
  enter the bridge;
- HMAC envelope and snapshot validation happen in the application before legacy
  promotion is attempted;
- an old initial receipt is bound by the immutable served event or the immutable
  attempt-hand creation time, while a replay receipt without an event requires
  an exact completed-parent incorrect-answer proof;
- null-owner events, answered slots, changed bindings, and never-served
  snapshots fail closed;
- initial and continuation serve recording is atomic, idempotent, and produces
  immutable attempt/hand/decision bindings;
- the cutover and deployment attestation are private and immutable;
- promotion alone cannot create deployment attestation;
- deterministic receipt IDs replay the same signed receipt and RNG rolls;
- a default `get-question` request may recover the exact predecessor
  `{engineType}` config during the bounded overlap, but constrained selections
  never adopt it and every recovered snapshot is revalidated against the
  requested selection.

### Production evidence required after PR A

Do not infer production readiness from migration success. Record all of these:

1. The protected PR merged normally and the deployed build identifies that
   exact merge or a reviewed descendant.
2. Fresh initial and continuation deliveries create attempt-scoped `served`
   events whose metadata binds attempt ID, hand ordinal, decision ordinal,
   snapshot key, question ID, owner, and policy checksum.
3. The private attestation exists with `evidence_kind =
   'attempt_scoped_serve'` and references one of those real events.
4. Fresh answers, an exact response-loss replay, reissue, next-street, and a
   predecessor-format receipt all return the same immutable grading evidence.
5. A never-served snapshot, changed answer replay, changed slot binding,
   non-v4 receipt, null-owner legacy event, and answered-slot promotion are
   refused.
6. The production error stream shows no new delivery-authority, persistence, or
   hydration regression on representative desktop and mobile flows.
7. Rolling back the application to the PR-A predecessor is explicitly tested
   against the expanded schema; predecessor initial and continuation writes
   still succeed.

All seven items must be produced in one machine collector run after the public
artifact exists. Keep its admin/final output and sibling-lock paths unique.
The audit account's attempt, answers, event/cache accounting, and the global
first-attestation row are intentional immutable evidence and are not cleanup
targets. If runtime-log access, database authorization, the designated account,
or approved predecessor mode is unavailable, stop with Phase 6 open rather
than hand-writing an attestation.

## PR B: contract schema after proven dual-write

The exact held PR-B file set is:

- `supabase/migrations/20260907205000_training_attempt_decision_delivery_enforcement.sql`
- `scripts/verify-training-delivery-enforcement-postgres.mjs`

Keep these files untracked or otherwise excluded from PR A. PR B may be opened
only when PR A is merged, its exact dual-write build is verified in production,
and protected `main` itself contains the dual-write predecessor. The migration
then replaces `fn_validate_training_answer_v2` directly; it has no timer,
self-activation path, or legacy-promotion activation path.

The migration itself also fails closed unless the immutable v1 attestation
resolves to its exact non-legacy attempt-scoped `served` event. Verify the held
stage in a disposable PostgreSQL cluster with:

```text
node scripts/verify-training-delivery-enforcement-postgres.mjs
```

That verifier proves missing attestation and legacy-promotion evidence cannot
activate enforcement, while a genuine `fn_training_attempt_record_served_batch_v1`
call can; it then checks unserved initial/continuation rejection, served writes,
exact replay, and idempotent migration reapplication.

Before merging PR B, rerun the PR-A suite plus a contract-stage PostgreSQL
fixture that applies `20260907205000` and proves strict rejection of a missing
attempt-scoped served receipt for initial and continuation decisions, while
preserving exact idempotent answer replay. After deployment, repeat the fresh,
reissue, replay, and next-street production probes and verify that strict
refusals are visible and bounded rather than silently retried.

## Rollback

- Before PR B: roll the application back freely; the PR-A schema preserves all
  predecessor writes indefinitely.
- After PR B: roll back only to the protected-main dual-write predecessor. Do
  not roll back to an application that does not write attempt-scoped served
  evidence.
- Never mutate the cutover or attestation rows, weaken the validator, bypass a
  protected check, or use `--no-verify` to force either stage.
