# Video operations console

The Video Operations page at `/hub/admin/video-operations` is an admin-only overview of the managed video pipeline. It reads complete database aggregates for a 24-hour, 72-hour, or 7-day window. Responses are `private, no-store`; raw provider errors, cursors, media identifiers, learner identifiers, and session identifiers are not returned.

## Dashboard sections

- **Sources and run funnel:** active and overdue sources, per-topic ingestion attempts, candidates found and qualified, inserts, duplicates, rejects, sanitized failure classes, and quota units. Failure classes are allowlisted categories; raw provider error text is never returned.
- **Candidate queue and rights:** generating, proposed, approved, published, rate-limited, and rejected candidate counts, stale proposals, topic mismatches, open takedowns/moderation cases, expired rights evidence, and dead-letter jobs. Use the linked editor and rights consoles for item-level review.
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

The editorial gate supports a guarded canary through reviewed candidates and publication controls. This console does not assign randomized users, schedule releases, or perform automatic rollback. A human admin chooses and audits each reversible switch change; existing rights, quality, and publication transaction guards remain active.
