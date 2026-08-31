# Personal Assistant Phase 2 Of 8 — Durable Audit Operations

Date: 2026-08-31

## Outcome

Leak Finder audits are server-owned, checkpointed, owner-private, resumable across reloads and device changes, and reconciled against persisted evidence before completion. The browser is now a viewer/controller rather than the audit executor.

## Delivered

- `pa_leak_audit_jobs` persists queue, stage, signed continuation cursor, cumulative coverage, result, reconciliation, attempts, lease, heartbeat, and failure state.
- Advisory locking and a partial unique index converge concurrent starts on one active job per account.
- Atomic claim/checkpoint RPCs use worker tokens and expiring leases; stale workers cannot overwrite a newer claim.
- The App Router worker runs after the acceptance response, processes bounded Club Arena pages, checkpoints every page, retries transient failures, and self-chains until complete.
- Internal worker credentials are HMAC signed, purpose-bound, owner/job-bound, expiring, and verified before database work.
- Middleware admits the signed worker only on the exact worker/detection endpoints; anonymous browser access still requires a JWT.
- Leak Finder restores the latest owner-scoped job at mount, polls persisted progress, renders the complete evidence funnel, and survives unmount/reload without cancelling server work.
- Final reconciliation compares the completed cursor, scanned-hand snapshot, assistant statistics, and persisted verified/unpriced decisions.
- Completion notifications are unique per audit job.
- A confirmed legacy iPhone push endpoint pair was consolidated after proving one notification/outbox row had fanned out to two registrations. One active iPhone endpoint remains; no subscription history was deleted.

## Production Evidence Before Release

- Migration `20260831143000` applied and recorded.
- Migration `20260831151000` applied and recorded.
- Atomic lifecycle transaction: duplicate start converged, double claim rejected, checkpoint persisted, failure resumed; transaction rolled back.
- Authenticated account audit: 1,347 Club Arena hands, seven persisted batches, completed after 54,107 ms of server processing.
- Reconciliation: complete cursor, 1,347 assistant-stat hands, 1,570 persisted decisions, consistent=true.
- Server restart: completed job and receipt restored; cursor/worker token/lease absent from the public projection.
- Replayed completion kick: rejected as already completed; exactly one completion notification row.
- Push incident: one notification, one outbox row, two active iPhone endpoints. Confirmed pair consolidated to one active iPhone endpoint.

## Verification Gates

- Deterministic leak engine: 98/98.
- Repository prebuild: 539/539.
- Personal Assistant API/security/durable contracts: green.
- TypeScript: green.
- Next.js webpack production build: green, 403 static pages, both durable endpoints present.
- Personal Assistant desktop/mobile Playwright matrix: 23 passed, 2 intentionally skipped because the assertions apply only to mobile geometry.
- Production deploy: revision `b262cb2b` contains the Phase 2 merge and nested-projection hardening.
- Live authenticated API: completed 1,347-hand/seven-batch receipt restored with `consistent=true`; owner GET 200, anonymous GET 401, forged worker POST 401.
- Live privacy projection: zero nested ownership, cursor, lease, or worker-token keys returned.
- Live push reconciliation: one audit-completion notification, one matching outbox row, and one active iPhone endpoint.
- Live Personal Assistant desktop/mobile Playwright matrix: 23 passed, 2 intentionally desktop-inapplicable checks skipped.

## Production Closeout

PR [#1112](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1112) merged the durable workflow at `255f661e`. Live probing then found nested owner identifiers in otherwise owner-scoped result rows; PR [#1122](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1122) added recursive public projection hardening at `b262cb2b`. Vercel health reported that exact revision before the final API, browser, reconciliation, and duplicate-push probes passed.

## Final Closeout Addendum

The final Phase 2 audit reopened the notification evidence instead of relying on the earlier endpoint count. Notification generation remained correct at one `notifications` row and one `push_outbox` row per audit job, but the authenticated account had accumulated five active browser subscriptions: two iPhone and three Mac rows. Three were older, never-confirmed rows with the same account, device label, and user agent as a newer receipt-confirmed endpoint.

- Migration `20260831162000` adds one atomic, service-role-only receipt RPC. A confirmed endpoint retires only older, never-confirmed rows with the same account/device signature; it preserves all history and any newer candidate device.
- The live migration retired three recoverable duplicate endpoints and left exactly one receipt-confirmed iPhone plus one receipt-confirmed Mac subscription.
- The audit-completion notification unique index and active-device unique index were inspected directly in production.
- Every Personal Assistant route now installs one shared copy policy. It capitalizes every rendered word across route content, portals, sheets, toasts, fields, and placeholders, and replaces em-dash characters in dynamic text and accessible attributes. SEO titles use the approved middle-dot separator directly.
- Regression coverage checks route installation, dynamic mutations, accessible copy, browser titles, responsive layout, and every primary/secondary Personal Assistant surface.

Closeout verification before release: 103 deterministic/Personal Assistant/push tests passed, TypeScript passed, the full webpack production build passed with 403 generated pages, and the local desktop/mobile Personal Assistant matrix passed every unauthenticated-compatible case. The authenticated durable-job browser case is reserved for the production-origin fixture after deployment.

## Final Published Verification

- PR [#1129](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1129) merged the copy policy, receipt reconciliation, route wiring, and regression coverage at `176c214d`.
- Vercel health reported a deployed revision descended from `176c214d` before the final live probes.
- After refreshing the production-origin authenticated fixture, the complete desktop/mobile Personal Assistant matrix finished with 22 passing checks and two intentionally skipped desktop-inapplicable mobile geometry checks.
- The owner audit endpoint returned 200 and restored completed job `7a9364fa-a910-480b-8cdd-d9f0bda35734`: seven batches, 1,347 scanned hands, 1,570 persisted decisions, and `consistent=true`. Anonymous access and a forged worker token both returned 401. The public projection exposed zero owner, cursor, lease, or worker-token keys at any nesting depth.
- Production contained exactly one audit-completion notification, one matching outbox event, zero duplicate notification/outbox groups, one confirmed active iPhone endpoint, and one confirmed active Mac endpoint. Three older unconfirmed duplicates remain preserved as inactive history.
- Follow-up migration `20260831173000` reconciled production privileges after deployment: `anon=false`, `authenticated=false`, and `service_role=true` for the receipt-confirmation RPC. The migration is recorded in remote migration history.
