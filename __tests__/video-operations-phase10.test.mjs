import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { buildAlerts } = require('../lib/videoOperationsAlerts.js');
const { isVideoAdminProfile } = require('../lib/videoAdminAuthorization.js');
const { formatVideoOperationsMetric, isVideoOperationsOperationId } = require('../lib/videoOperationsContract.js');

const migration = readFileSync(new URL('../supabase/migrations/20261004213000_video_operations_analytics_phase10.sql', import.meta.url), 'utf8');
const indexMigration = readFileSync(new URL('../supabase/migrations/20261004222000_video_reels_control_events_actor_index.sql', import.meta.url), 'utf8');
const dueAccuracyMigration = readFileSync(new URL('../supabase/migrations/20261005011200_video_operations_due_job_accuracy_phase10_followup.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../pages/api/admin/video-operations.js', import.meta.url), 'utf8');
const operationsContract = readFileSync(new URL('../lib/videoOperationsContract.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../pages/hub/admin/video-operations.js', import.meta.url), 'utf8');
const pushGuard = readFileSync(new URL('../scripts/guard-merged-branch.sh', import.meta.url), 'utf8');

test('Phase 10 analytics reports complete source, candidate, rights, cost, and mobile aggregates', () => {
  for (const table of ['content_sources','video_source_ingestion_runs','video_source_quota_usage',
    'video_reel_candidates','video_library_videos','video_rights_evidence','video_moderation_cases',
    'video_reels_pipeline_controls','video_enrichment_jobs','video_native_renditions',
    'reels_delivery_metrics','video_learning_events','social_reels']) {
    assert.match(migration, new RegExp(`public\\.${table}`));
  }
  for (const field of ['sources','overdue','candidates','qualified','inserted','duplicates',
    'rejected','quota_units','startup_ms_p95','dropped_frames','decoded_frames','memory_mb_avg',
    'transferred_kb_avg','battery_level_avg','estimated_cost_cents','organic_sessions']) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(migration, /least\(greatest\(coalesce\(p_window_hours, 24\), 1\), 168\)/);
  assert.match(migration, /status IN \('queued','running','retry','dead_letter','succeeded'\)/);
});

test('control event actor foreign key has a valid index in a forward migration', () => {
  assert.match(migration, /actor_user_id uuid NOT NULL REFERENCES public\.profiles\(id\)/);
  assert.match(indexMigration, /CREATE INDEX IF NOT EXISTS video_reels_control_events_actor_idx[\s\S]*ON public\.video_reels_control_events\(actor_user_id\)/);
  assert.match(indexMigration, /i\.indisvalid/);
});

test('due enrichment counts include only jobs the worker can claim', () => {
  const docs = readFileSync(new URL('../docs/video-reels-phase10-operations.md', import.meta.url), 'utf8');
  assert.match(dueAccuracyMigration, /CREATE OR REPLACE FUNCTION public\.fn_video_operations_snapshot\(p_window_hours integer DEFAULT 24\)/);
  assert.match(dueAccuracyMigration, /status IN \('queued','retry'\) AND available_at <= clock_timestamp\(\)\)::bigint AS due/);
  assert.doesNotMatch(dueAccuracyMigration, /FILTER \(WHERE available_at < clock_timestamp\(\)\)::bigint AS due/);
  assert.match(dueAccuracyMigration, /postflight: due count does not match claimable queue states/);
  assert.match(docs, /“Due” counts only queued or retry jobs/);
});

test('Phase 10 aggregates redact raw errors and never return user, session, asset, or cursor identities', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.fn_video_operations_snapshot');
  const end = migration.indexOf('CREATE OR REPLACE FUNCTION public.fn_set_video_reels_pipeline_control');
  const body = migration.slice(start, end);
  assert.match(body, /CASE WHEN failure_code IS NULL THEN 'none'[\s\S]*ELSE 'other' END AS failure_class/);
  assert.match(body, /count\(DISTINCT session_id\)[\s\S]*AS organic_sessions/);
  assert.match(body, /organic_qualified IS TRUE AND rejection_code IS NULL/);
  assert.match(body, /'organicSessions', v_organic_sessions/);
  assert.match(body, /'controlHistory', v_control_history/);
  for (const forbidden of ["'failure_code'", "'failure_detail'", "'source_name'", "'provider_cursor'", "'user_id'", "'session_id'", "'video_id'", "'canonical_asset_key'"]) {
    assert.doesNotMatch(body, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(body, /'duplicateCanonicalKeys'/);
  assert.match(body, /'topicLeakCount'/);
});

test('Phase 10 admin snapshot and writes require admin authorization and stay private', () => {
  assert.match(api, /Cache-Control', 'private, no-store'/);
  assert.ok(api.indexOf("res.setHeader('Cache-Control', 'private, no-store')") < api.indexOf('applyRateLimit(req, res'), 'rate-limited responses must remain private and uncached');
  assert.match(api, /connection\.anon\.auth\.getUser/);
  assert.match(api, /isVideoAdminProfile\(profile\.data\)/);
  assert.match(api, /LIMITS\.read/);
  assert.match(api, /LIMITS\.write/);
  assert.match(api, /fn_video_operations_snapshot/);
  assert.match(api, /fn_set_video_reels_pipeline_control/);
  assert.match(api, /windowHours/);
  assert.doesNotMatch(api, /json\(\{\s*error:\s*error\.message/);
});

test('every Video admin subpage honors the platform administrator role contract', () => {
  assert.equal(isVideoAdminProfile({ is_admin: true, role: 'member' }), true);
  for (const role of ['admin', 'superadmin', 'god', ' GOD ']) {
    assert.equal(isVideoAdminProfile({ is_admin: false, role }), true);
  }
  for (const profile of [null, {}, { is_admin: false, role: 'member' }, { role: 'operator' }]) {
    assert.equal(isVideoAdminProfile(profile), false);
  }
  for (const path of ['../pages/api/admin/video-operations.js', '../pages/api/admin/video-sources.js',
    '../pages/api/admin/video-editorial.js', '../pages/api/admin/video-native-studio.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /select\('is_admin, role'\)/);
    assert.match(source, /isVideoAdminProfile\(profile\.data\)/);
  }
});

test('alert thresholds sort critical data-integrity failures first and report weak metric coverage', () => {
  const healthy = buildAlerts({
    sources: [{ active: 4, overdue: 0 }], ingestion: [], duplicates: { duplicateRows: 0 },
    topicLeakCount: 0, candidates: [], rightsEvidence: [], moderationCases: [],
    controls: [...['video_library_discovery','video_library_enrichment','video_library_reel_creation','video_library_reel_publication'].map((control_key) => ({ control_key, enabled: true })), { control_key: 'video_library_editorial_gate', enabled: false }],
    jobs: [], delivery: [{ samples: 5, startup_ms_p95: 2999, dropped_frames: 20, decoded_frames: 1000, surface: 'standalone', feed_mode: 'for-you' }],
    quota: [{ daily_budget: 1000, remaining: 110, usage_date: '2026-10-04' }],
  });
  assert.deepEqual(healthy, []);

  const alerts = buildAlerts({
    sources: [{ active: 2, overdue: 1 }], ingestion: [{ status: 'failed', runs: 3 }],
    duplicates: { duplicateRows: 2 }, topicLeakCount: 1, candidates: [{ stale: 2 }],
    rightsEvidence: [{ expired: 1 }], moderationCases: [{ status: 'submitted', count: 1 }],
    controls: [], jobs: [{ status: 'dead_letter', count: 4 }],
    delivery: [{ samples: 4, startup_ms_p95: 4000, dropped_frames: 90, decoded_frames: 100, surface: 'social', feed_mode: 'latest' }],
    quota: [{ daily_budget: 100, remaining: 5, usage_date: '2026-10-04' }],
  });
  assert.equal(alerts[0].key, 'duplicate_publication');
  assert.ok(alerts.some((alert) => alert.key === 'topic_leakage' && alert.severity === 'critical'));
  assert.ok(alerts.some((alert) => alert.key === 'playback_metrics_coverage' && alert.count === 4));
  assert.ok(alerts.some((alert) => alert.key === 'provider_quota'));
  assert.ok(alerts.every((alert) => !alert.message.includes('uuid') && !alert.message.includes('video-id')));

  const publicationAlerts = buildAlerts({
    sources: [], ingestion: [], duplicates: {}, candidates: [{ status: 'approved', count: 3, published_in_window: 0 }],
    controls: [{ control_key: 'video_library_reel_publication', enabled: true }],
  });
  assert.ok(publicationAlerts.some((alert) => alert.key === 'publication_stall' && alert.count === 3));

  const missingCanary = buildAlerts({ controls: [] });
  assert.ok(missingCanary.some((alert) => alert.key === 'missing_video_library_editorial_gate' && alert.severity === 'critical'));
  const disabledCanary = buildAlerts({ controls: [...['video_library_discovery','video_library_enrichment','video_library_reel_creation','video_library_reel_publication'].map((control_key) => ({ control_key, enabled: true })), { control_key: 'video_library_editorial_gate', enabled: false }] });
  assert.ok(!disabledCanary.some((alert) => alert.key === 'pipeline_circuit_breaker'));
});

test('pipeline switch writes are versioned, replay-safe, actor-audited, and rights-gated', () => {
  assert.match(migration, /CREATE TABLE public\.video_reels_control_events/);
  assert.match(migration, /operation_id uuid PRIMARY KEY/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_operation_id::text, 0\)\)/);
  assert.match(migration, /operation replay payload mismatch/);
  assert.match(migration, /current_control\.updated_at<>p_expected_updated_at/);
  assert.match(migration, /enabled_before,enabled_after,reason,control_updated_at/);
  assert.match(migration, /'video_library_editorial_gate'/);
  assert.doesNotMatch(migration, /NOT IN[^;]*youtube_native_transcode/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.fn_set_video_reels_pipeline_control[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.fn_set_video_reels_pipeline_control[\s\S]*TO service_role/);
  assert.match(api, /expected_updated_at/);
  assert.match(operationsContract, /\[1-8\]\[0-9a-f\]\{3\}/);
  assert.match(api, /const operationId = typeof req\.body\?\.operation_id === 'string' \? req\.body\.operation_id : ''/);
  assert.match(api, /!isVideoOperationsOperationId\(operationId\)/);
  assert.doesNotMatch(api, /randomUUID/);
  assert.match(api, /reason.length < 1 \|\| reason.length > 240/);
  assert.equal(isVideoOperationsOperationId('f1b242f4-76a2-45b5-a0b1-8a6d3a0f4c11'), true);
  assert.equal(isVideoOperationsOperationId(undefined), false);
  assert.equal(isVideoOperationsOperationId('not-an-operation-id'), false);
  assert.equal(isVideoOperationsOperationId('f1b242f4-76a2-05b5-a0b1-8a6d3a0f4c11'), false);
});

test('operations console links existing controls and handles alerts, empty states, and mobile reporting', () => {
  for (const path of ['/hub/admin/video-sources','/hub/admin/video-editorial',
    '/hub/admin/video-rights-moderation','/hub/admin/video-native-studio']) assert.ok(page.includes(path));
  for (const label of ['Alerts','Sources And Run Funnel','Candidate Queue','Delivery Quality',
    'Feature Flags And Jobs','Learning Funnel','Usage And Cost']) assert.ok(page.includes(label));
  assert.match(page, /No Mobile Delivery Samples/);
  assert.match(page, /@media\(max-width:600px\)/);
  assert.match(page, /Pause Stage/);
  assert.match(page, /Resume Stage/);
  assert.match(page, /youtube_native_transcode/);
  assert.match(page, /requestSequence = useRef\(0\)/);
  assert.match(page, /token\(\) !== access/);
  assert.match(page, /supabase\.auth\.onAuthStateChange\(invalidateSession\)/);
  assert.match(page, /window\.addEventListener\('storage', handleStorage\)/);
  assert.match(page, /event\.key === null/);
  assert.match(page, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(page, /failureClasses/);
  assert.match(page, /row\.statuses\.generating/);
  assert.match(page, /row\.statuses\.rate_limited/);
  assert.match(page, /adjustableControls\.has\(control\.control_key\)/);
  assert.match(page, /Not adjustable in this console/);
  assert.match(page, /pendingControlOperations/);
  assert.match(page, /newOperationId/);
  assert.match(readFileSync(new URL('../docs/video-reels-phase10-operations.md', import.meta.url), 'utf8'), /Alert thresholds/);
});

test('operations metrics preserve preformatted cost labels without rendering NaN', () => {
  assert.equal(formatVideoOperationsMetric('$12.34'), '$12.34');
  assert.equal(formatVideoOperationsMetric(1234), '1,234');
  assert.equal(formatVideoOperationsMetric('1234'), '1,234');
  assert.equal(formatVideoOperationsMetric(undefined), '0');
  assert.equal(formatVideoOperationsMetric(Number.NaN), '0');
  assert.equal(formatVideoOperationsMetric('NaN'), '0');
  assert.equal(formatVideoOperationsMetric('Infinity'), '0');
  assert.equal(formatVideoOperationsMetric('$NaN'), '0');
  assert.match(page, /formatVideoOperationsMetric\(value\)/);
});

test('protected push guard uses configured credentials and public readback without reading environment files', () => {
  assert.match(pushGuard, /gh auth token/);
  assert.match(pushGuard, /Public pull-request metadata needs no token/);
  assert.match(pushGuard, /https:\/\/api\.github\.com\/repos\/\$SLUG\/pulls/);
  assert.doesNotMatch(pushGuard, /read_key|CANDIDATE_FILE|git-common-dir|\.env/);
});
