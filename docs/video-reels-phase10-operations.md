# Video operations console

The Video Operations page at `/hub/admin/video-operations` is an admin-only overview of the managed video pipeline. It reads complete database aggregates for a 24-hour, 72-hour, or 7-day window. Responses are `private, no-store`; raw provider errors, cursors, media identifiers, learner identifiers, and session identifiers are not returned.

## Reel identity quarantine visibility

Unresolved Reel reconciliation conflicts are a visibility boundary, not a resolution. Mixed-author, mixed-source, and other identity conflicts stay unresolved until independent ownership and rights review confirms a safe disposition. The forward migration records each row's previous public/native-processing flags, hides all existing members atomically, and guards later inserts, visibility changes, processing requests, and quarantine-group updates. It preserves Reel IDs, authorship, engagement history, and rights evidence. It does not select a canonical Reel or restore media when a case is marked resolved.

The operations API adds a service-role-only aggregate with counts by sanitized reason code, involved/suppressed rows, public or native-requested rows, missing snapshots, and missing Reel references. It never returns Reel IDs, canonical asset keys, operation payloads, creator/user identities, or evidence details. Missing aggregate data fails the admin snapshot closed with HTTP 503. The console shows open cases and guard state; any public/native-requested row or ledger gap raises a critical alert, while safely hidden unresolved cases remain a warning pending independent review.

## Dashboard sections

- **Sources and run funnel:** active and overdue sources, per-topic ingestion attempts, candidates found and qualified, inserts, duplicates, rejects, sanitized failure classes, and quota units. Failure classes are allowlisted categories; raw provider error text is never returned.
- **Candidate queue and rights:** generating, proposed, approved, published, rate-limited, and rejected candidate counts, stale proposals, topic mismatches, open takedowns/moderation cases, expired rights evidence, and dead-letter jobs. Use the linked editor and rights consoles for item-level review.
- **Enrichment jobs:** status counts include queued, running, retry, succeeded, and dead-letter work. “Due” counts only queued or retry jobs whose `available_at` time has arrived; completed and running rows are not due work.
- **Learning funnel:** organically qualified impressions, plays, progress, completions, saves, and distinct sessions grouped by event and discovery source. Automated and rejected learning events are excluded.
- **Delivery quality:** startup p95, dropped and decoded frames, memory, transferred bytes, battery, and data-saver samples by surface and feed mode. Small sample counts are reported as insufficient evidence.
- **Usage and cost:** YouTube quota remaining and estimated native rendition costs/output bytes. Rendition cost is an estimate, not a provider invoice.
- **Switch history:** the newest 20 operator changes, with before/after state and the operator-entered reason. Actor and operation identifiers stay in the audit table.

## Alert thresholds

- An active source is overdue after three times its configured cadence, with a one-hour minimum cadence.
- Duplicate public Reel rows sharing a canonical asset key and candidate/source topic mismatches are critical integrity alerts.
- Rights evidence past its validity date and enrichment dead letters are critical alerts.
- Playback startup p95 above 3,000 ms is reported when at least five samples exist for that surface/feed group. Dropped frames above 8% require at least 100 decoded frames.
- Fewer than five delivery samples in the full window raises a coverage alert; missing measurements are not treated as healthy playback.
- Quota at or below 10% of its daily budget is a warning.

## Pipeline switches and recovery

An admin may pause or resume discovery, enrichment, Reel creation, Reel publication, or the editorial canary gate. Each change requires a valid UUID operation ID, the version shown in the current snapshot, and a reason of 1–240 characters. The database applies the switch and writes its audit event in one transaction. If two operators act on the same version, the later request receives a conflict and must refresh. A retried operation ID with the same actor and payload returns its durable prior result. Missing or malformed operation IDs are rejected so retries cannot silently become new operations.

Use a disabled stage as a circuit breaker when its downstream behavior needs containment. Resume it only after the affected queue or source has been reviewed. The native YouTube transcode control cannot be changed here; its existing rights-cleared service path remains authoritative. Retry enrichment from the versioned editorial queue, where replay creates the existing bounded durable job.

The console verifies the session on refresh and on same-tab auth or cross-tab storage changes. It clears the displayed snapshot when the session changes or the API rejects authorization. Only the five supported pipeline controls are adjustable; unknown controls remain read-only until the API contract explicitly supports them.

For a published read-only verification, dispatch the `E2E Tests (Playwright)` workflow with suite `video-operations-live` and provide the exact deployed commit SHA. It signs in only with the designated `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`, verifies production health and the authenticated admin snapshot, checks the private response headers and required controls, and stores a sanitized receipt. It does not change pipeline switches. A non-admin test identity fails the probe rather than falling back to another account.

The editorial gate supports a guarded canary through reviewed candidates and publication controls. This console does not assign randomized users, schedule releases, or perform automatic rollback. A human admin chooses and audits each reversible switch change; existing rights, quality, and publication transaction guards remain active.
