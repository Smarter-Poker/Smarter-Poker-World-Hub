# Stable Admin Phase 11 Closeout

Status: Candidate validated locally. Protected merge, database installation and
production proof are recorded here only after they occur.

Policy receipt: version 2.9, manifest
`a659f31c5c1c2b0864889508079a635dd5fe2fc98decfbfc9d3f9c80dd45ec3b`.
Resumption receipt: the four canonical sources under
`/Users/smarter.poker/Documents` were emitted and read at
`2026-10-06T03:00:50.166Z` from candidate
`e89824385ac81f67200bf29548b02f5edf01602e`.

## Scope Completed

- O1 and O2: the Live Floor and Tournament pages resolve club and union names,
  link to the actual owner management surfaces, use exact registration counts,
  disclose bounded overlay evidence and show recorded refund entitlements and
  payments without creating a second writer.
- I3: Integrity has a bounded, ranked Identity Links view over four recorded
  evidence sources. Horses are included. Raw IP, device, fingerprint, email and
  user-agent values never leave the database function. Correlation is not a
  verdict, and the existing case and observation paths remain the only actions.
- C7: Platform Operations has an append-only incident ownership overlay with
  acknowledgement and release events. It never changes source incident status,
  resolution or health.
- E7: daily closes, weekly digest runs and recipients, club or union profit and
  loss snapshots, and browser export preparation receipts are durable records.
  Daily close binds the exact journal manifest hash and follows maker-checker.
- O7 boundary: browser exports now record actor, request, filters, row count,
  completeness, bytes and SHA-256 before asking the browser to download. The UI
  explicitly says this is a prepared receipt, not proof of browser delivery.

## Database Files

- `20261006024310_stable_admin_phase11_incident_acknowledgements_canonical.sql`
- `20261006022120_stable_admin_phase11_finance_records.sql`
- `20261006022123_stable_admin_phase11_identity_links.sql`

All three are additive, service-role-only and RLS-enabled where they add tables.
No migration moves chips, changes a seat or suppresses horse evidence.

## Verification Before Submission

- Stable Admin and migration regression set: 1,127 passed, 0 failed.
- Dedicated Phase 11 tests cover identity privacy and paging, incident ownership
  immutability/idempotency, finance records, maker-checker close signing and
  hash-bound export receipts.
- Full repository production build: passed, including the Phase 9 bundle budget.
- `/horses` initial JavaScript: 57,924 bytes; gzip: 19,435 bytes.
- Diff whitespace check and targeted lint: passed.

## Boundaries That Are Not Admin-Page Stubs

- P3 needs authoritative transfer, social, logout and paid-tournament enforcement
  in their owning runtimes before the operator switch can honestly govern them.
- C2 needs a new authenticated engine maintenance command and state machine.
- C4 needs an inventory and fail-closed guard at every authoritative money and
  engine consumer before global switches can be exposed.
- A browser cannot prove that a prepared CSV was saved or delivered. A true
  asynchronous artifact service still requires a private object store and worker.

The admin pages disclose these ownership boundaries. They do not present fake
controls, silently exclude horses or claim unavailable evidence is healthy.

## Delivery Record

| Layer | Evidence |
| --- | --- |
| Source | Pending protected PR and merge revision. |
| Database | Pending exact migration ledger versions, hashes and object/grant readback. |
| Publication | Pending READY Vercel deployment and `/api/health` revision. |
| Live behavior | Pending authenticated desktop and 375px route proof. |

No pending row may be rewritten as complete without its direct evidence.


## Authorized continuation, 2026-10-08

Owner: Stable Admin resumption. Owned branch
`agent/codex/stable-admin-final-resumption-20261008`, checkout
`/Volumes/SmarterWork/agent-work/stable-admin-resumption-20261008/world-hub`.
Scope: recover the Phase 11 certificate and footer gate, repair connected
support behavior, qualify and publish through protected World Hub delivery,
complete the 28-tab/nested audit and final documentation using direct evidence.
No engine replacement or installed migration replay.

Canonical policies freshly emitted/read at `2026-10-08T13:52:32.125Z`, version
2.9, manifest `a659f31c5c1c2b0864889508079a635dd5fe2fc98decfbfc9d3f9c80dd45ec3b`.
Owner hash `b9478d0331314413d8e12c41210b63479cdcabc1f86ed3fdcb3251efa36e6349`;
operating `a8bc3c04dce3354ebdd51a89c0b7d715af3344edcc794d33f6b3ad64506961d5`;
hardening `d5fc451ce5caf6d6b5e64597a13883e1246581678fe53c962339d0a66136993e`;
reference `adce89c3f838f2f373cd504a00329d53906404d1dd42a647f672af6c16f95555`.
Repository AGENTS, CLAUDE, AGENT-PLAYBOOK, PUBLISHING, storage guide and existing
checkpoint were read. Base `1dcecd9a78a38d6e1e8e94ab9f5358f8401b8255`.

Inherited closeout source and full continuation patches are preserved under
`/Volumes/SmarterArchives/agent-evidence/stable-admin-phase11/resumption-20261008`.
Final delivery assertions/docs are separated until actual production proof.
Original worktree remains untouched. PR #2162 was closed as fully superseded.

Prepared fixes: four named stable-admin reads use GET with unchanged action
permissions and GET writes refused before database access; support ticket status
sends the API's `id`, with a connected failing-before/passing-after regression;
footer PWA builds use explicit `PWA_ENABLED=1`, preserving production CSP while
avoiding local WebKit HTTPS upgrades; failed certificates retain bounded redacted
diagnostics. 109 Stable Admin and 52 footer/certificate/CSP/state checks passed,
with targeted lint and diff checks. No new repair is published yet.

Two full builds previously failed ENOSPC after successful compilation. Direct
APFS readback identifies the 256 GiB SmarterWork quota at 99.3%, while the same
external container has 746 GB unallocated. A task-owned case-sensitive volume
`StableAdminBuild20261008` (UUID/device to be verified before cleanup) was created
on that external container with 10 GB reserve/25 GB quota. It is mounted at
this task's `build-storage`; ignored `.next` links to its `next` subdirectory.
A first mount at `.next` exposed protected macOS volume metadata to Next's scan
and was immediately relocated before retry. No existing volume, quota or other
task's files changed. Remove only this created allocation after delivery.

Configured GitHub access and production certificate secret/variable names are
available; no values were extracted. Full build, integration, required hosted
checks, protected merge, Vercel READY/health, genuine certificate, full surface
audit and final protected documentation remain pending.
