import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { buildAlerts } = require('../lib/videoOperationsAlerts.js');

const migration = readFileSync(new URL('../supabase/migrations/20261004213000_video_operations_analytics_phase10.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../pages/api/admin/video-operations.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../pages/hub/admin/video-operations.js', import.meta.url), 'utf8');

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
  assert.match(api, /connection\.anon\.auth\.getUser/);
  assert.match(api, /profile\.data\?\.is_admin !== true/);
  assert.match(api, /LIMITS\.read/);
  assert.match(api, /LIMITS\.write/);
  assert.match(api, /fn_video_operations_snapshot/);
  assert.match(api, /fn_set_video_reels_pipeline_control/);
  assert.match(api, /windowHours/);
  assert.doesNotMatch(api, /json\(\{\s*error:\s*error\.message/);
});

test('alert thresholds sort critical data-integrity failures first and report weak metric coverage', () => {
  const healthy = buildAlerts({
    sources: [{ active: 4, overdue: 0 }], ingestion: [], duplicates: { duplicateRows: 0 },
    topicLeakCount: 0, candidates: [], rightsEvidence: [], moderationCases: [],
    controls: ['video_library_discovery','video_library_enrichment','video_library_reel_creation','video_library_reel_publication'].map((control_key) => ({ control_key, enabled: true })),
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
  assert.match(api, /\[1-8\]\[0-9a-f\]\{3\}/);
  assert.match(api, /reason.length < 1 \|\| reason.length > 240/);
});

test('operations console links existing controls and handles alerts, empty states, and mobile reporting', () => {
  for (const path of ['/hub/admin/video-sources','/hub/admin/video-editorial',
    '/hub/admin/video-rights-moderation','/hub/admin/video-native-studio']) assert.ok(page.includes(path));
  for (const label of ['Alerts','Sources and Run Funnel','Candidate Queue','Delivery Quality',
    'Feature Flags and Jobs','Learning Funnel','Usage and Cost']) assert.ok(page.includes(label));
  assert.match(page, /No mobile delivery samples/);
  assert.match(page, /@media\(max-width:600px\)/);
  assert.match(page, /Pause Stage/);
  assert.match(page, /Resume Stage/);
  assert.match(page, /youtube_native_transcode/);
  assert.match(page, /requestSequence = useRef\(0\)/);
  assert.match(page, /token\(\) !== access/);
  assert.match(page, /pendingControlOperations/);
  assert.match(page, /newOperationId/);
  assert.match(readFileSync(new URL('../docs/video-reels-phase10-operations.md', import.meta.url), 'utf8'), /Alert thresholds/);
});
