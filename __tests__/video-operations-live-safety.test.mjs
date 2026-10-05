import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AUTH_ORIGIN, validateConfiguration, validateOperationsSnapshot, validateReceipt } from '../scripts/ci/video-operations-live-check.mjs';

const workflow = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
const controls = ['video_library_discovery', 'video_library_enrichment', 'video_library_reel_creation', 'video_library_reel_publication', 'video_library_editorial_gate']
  .map(control_key => ({ control_key, enabled: true }));
const payload = { alerts: [], snapshot: {
  generatedAt: '2026-10-05T00:00:00Z', windowHours: 24, sources: [{ topic: 'poker', active: 1 }],
  ingestion: [], quota: [], candidates: [{ topic: 'poker', status: 'published', count: 1 }],
  rightsEvidence: [], moderationCases: [], controls, controlHistory: [], jobs: [], nativeCosts: [],
  delivery: [], learningFunnel: [], organicSessions: 0, topicLeakCount: 0,
  duplicates: { duplicateRows: 0, duplicateCanonicalKeys: 0 },
} };
const liveEnvironment = {
  TEST_USER_EMAIL: 'fixture@example.invalid', TEST_USER_PASSWORD: 'local-fixture-value',
  NEXT_PUBLIC_SUPABASE_URL: AUTH_ORIGIN, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-fixture-key',
  VIDEO_OPERATIONS_EXPECTED_SHA: 'a'.repeat(40),
};

test('Video Operations live proof is explicit, read-only, and uses the protected test identity', () => {
  assert.match(workflow, /video-operations-live/);
  assert.match(workflow, /run: node scripts\/ci\/video-operations-live-check\.mjs/);
  assert.match(workflow, /TEST_USER_PASSWORD: \$\{\{ secrets\.TEST_USER_PASSWORD \}\}/);
  assert.match(workflow, /VIDEO_OPERATIONS_EXPECTED_SHA: \$\{\{ inputs\.expected_sha \}\}/);
  assert.doesNotMatch(workflow, /video-operations-live[\s\S]{0,1400}workflow_run|video-operations-live[\s\S]{0,1400}schedule:/);
});

test('Video Operations live proof refuses missing configuration and private fields', () => {
  assert.throws(() => validateConfiguration({}), /TEST_USER_EMAIL/);
  assert.throws(() => validateConfiguration({ ...liveEnvironment, NEXT_PUBLIC_SUPABASE_URL: 'https://other-project.supabase.co' }), /Unexpected authentication origin/);
  assert.equal(validateOperationsSnapshot(payload).sourceGroups, 1);
  const hostile = structuredClone(payload);
  hostile.snapshot.sources[0].provider_cursor = 'private';
  assert.throws(() => validateOperationsSnapshot(hostile), /private field provider_cursor/);
});

test('Video Operations live receipt binds production SHA, deployment, sources, candidates, and controls', () => {
  const sha = 'a'.repeat(40);
  assert.doesNotThrow(() => validateReceipt({ status: 'passed', expectedSha: sha, observedSha: sha, deploymentId: 'dpl_fixture', snapshot: { sourceGroups: 1, candidateGroups: 1, controlStates: controls.map(row => ({ key: row.control_key, enabled: true })) } }, sha));
  assert.throws(() => validateReceipt({ status: 'passed', expectedSha: sha, observedSha: 'b'.repeat(40), deploymentId: 'dpl_fixture', snapshot: { sourceGroups: 1, candidateGroups: 1, controlStates: [] } }, sha));
});
