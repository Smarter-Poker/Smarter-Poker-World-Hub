import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Import the real worker's pure authorization gate without starting its poll
// loop or reaching yt-dlp/Supabase. The worker keeps this test-only mode out
// of production execution paths.
process.env.YT_WORKER_TEST_MODE = '1';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
const worker = await import('../scripts/yt-transcode-worker/index.js');
const workerSource = await readFile(
  new URL('../scripts/yt-transcode-worker/index.js', import.meta.url),
  'utf8',
);

const job = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  reel_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  rights_status: 'owned',
  youtube_url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
  source_url: 'https://youtu.be/M7lc1UVf-VE',
  source_type: 'youtube',
  origin_type: 'horse',
  source_asset_id: null,
  canonical_asset_key: 'youtube:M7lc1UVf-VE',
};

const reel = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  author_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  rights_status: 'owned',
  native_processing_requested: true,
  is_deleted: false,
  source_type: 'youtube',
  origin_type: 'horse',
  source_asset_id: null,
  canonical_asset_key: 'youtube:M7lc1UVf-VE',
  youtube_video_id: 'M7lc1UVf-VE',
  video_url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
  original_youtube_url: 'https://youtube.com/embed/M7lc1UVf-VE',
  source_post_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};

test('native YouTube work requires explicit rights on both job and Reel plus an active request', () => {
  assert.equal(worker.isNativeProcessingAuthorized(job, reel), true);

  for (const rightsStatus of ['embed_only', 'user_authorized', 'unknown', 'restricted', null]) {
    assert.equal(
      worker.isNativeProcessingAuthorized({ ...job, rights_status: rightsStatus }, reel),
      false,
      `job rights ${rightsStatus} must be denied`,
    );
    assert.equal(
      worker.isNativeProcessingAuthorized(job, { ...reel, rights_status: rightsStatus }),
      false,
      `Reel rights ${rightsStatus} must be denied`,
    );
  }

  assert.equal(worker.isNativeProcessingAuthorized(job, { ...reel, native_processing_requested: false }), false);
  assert.equal(worker.isNativeProcessingAuthorized(job, { ...reel, is_deleted: true }), false);
  assert.equal(worker.isNativeProcessingAuthorized(job, { ...reel, author_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }), false);
  assert.equal(worker.isNativeProcessingAuthorized({ ...job, user_id: null }, reel), false);
  assert.equal(worker.isNativeProcessingAuthorized(job, { ...reel, author_id: null }), false);
  assert.equal(worker.isNativeProcessingAuthorized({ ...job, reel_id: null }, reel), false);
  assert.equal(worker.isNativeProcessingAuthorized({ ...job, id: 'path/traversal' }, reel), false);
  assert.equal(worker.isNativeProcessingAuthorized(job, { ...reel, rights_status: 'licensed' }), false);
  assert.equal(worker.isNativeProcessingAuthorized(job, { ...reel, source_type: 'native' }), false);
  assert.equal(worker.isNativeProcessingAuthorized(job, { ...reel, source_post_id: null }), false);
  assert.equal(worker.isNativeProcessingAuthorized({ ...job, source_url: 'https://attacker.example' }, reel), false);
});

test('completion URL reconciliation uses the database normalization contract', () => {
  assert.equal(
    worker.normalizeCompletionUrl(' https://cdn.example/reel.mp4?token=old#fragment '),
    'https://cdn.example/reel.mp4',
  );
  assert.equal(worker.normalizeCompletionUrl(null), '');
});

test('the worker processes only database-created rights-cleared claims', () => {
  assert.match(workerSource, /loadNativeTranscodeControl/);
  assert.match(workerSource, /control_key['"], ['"]youtube_native_transcode/);
  assert.match(workerSource, /cancelUnauthorizedJob\(job, `before_download:\$\{initialAuthorization\.reason\}`\)/);
  assert.match(workerSource, /cancelUnauthorizedJob\(candidate, `claim:\$\{authorization\.reason\}`\)/);

  for (const sweep of [
    'orphanedQueuedSweep',
    'cookieRecoverySweep',
    'transientFailureRetrySweep',
    'strandedReelRecoverySweep',
    'failedYoutubeFallbackSweep',
    'nativePosterRepairSweep',
    'iframeThumbnailRepairSweep',
    'deadVideoRepairSweep',
  ]) {
    assert.doesNotMatch(workerSource, new RegExp(`function\\s+${sweep}\\b`));
  }
  assert.doesNotMatch(workerSource, /makeQueuedYoutubeJob/);
  assert.doesNotMatch(workerSource, /\.from\('video_transcode_jobs'\)\.insert\(/);
  assert.doesNotMatch(workerSource, /['"]--remote-components['"]/);
  assert.doesNotMatch(workerSource, /['"]--cookies(?:-from-browser)?['"]/);
  assert.match(workerSource, /['"]--ignore-config['"]/);
  assert.match(workerSource, /['"]--no-plugin-dirs['"]/);
  assert.doesNotMatch(workerSource, /\.\.\.process\.env/);

  const claimBody = workerSource.slice(
    workerSource.indexOf('async function claimJob'),
    workerSource.indexOf('async function renewJobLease'),
  );
  assert.match(claimBody, /\.eq\('status', 'queued'\)/);
  assert.match(claimBody, /claim_token: claimToken/);
  assert.match(claimBody, /loadNativeAuthorization\(candidate\)/);
});

test('startup preflight checks schema plus completion and verdict RPC behavior', () => {
  const preflightBody = workerSource.slice(
    workerSource.indexOf('async function runStartupPreflight'),
    workerSource.indexOf('async function loadNativeAuthorization'),
  );
  for (const relation of [
    'video_transcode_jobs',
    'social_reels',
    'social_posts',
    'youtube_embed_failures',
  ]) {
    assert.match(preflightBody, new RegExp(`\\.from\\('${relation}'\\)`));
  }
  assert.match(preflightBody, /verifyBundledRuntime\(\)/);
  assert.match(preflightBody, /complete_rights_cleared_youtube_transcode/);
  assert.match(preflightBody, /expectedBehaviorCode = control\.state === 'enabled' \? '40001' : '55000'/);
  assert.match(preflightBody, /record_youtube_embed_failure_verdict/);
  assert.match(preflightBody, /String\(verdictProbeError\?\.code \|\| ''\) !== '22023'/);
  assert.match(workerSource, /--preflight-only/);
});

test('active work is stopped on control uncertainty and subprocess trees are reaped', () => {
  assert.match(workerSource, /const CONTROL_WATCH_MS = 5_000/);
  assert.match(workerSource, /const CONTROL_REQUEST_TIMEOUT_MS = 4_000/);
  assert.match(workerSource, /abortActiveStorageUploads\(`native_transcode_\$\{leaseState\}`\)/);
  assert.match(workerSource, /process\.kill\(-proc\.pid, signal\)/);
  assert.match(workerSource, /signalProcessTree\('SIGTERM'\)/);
  assert.match(workerSource, /signalProcessTree\('SIGKILL'\)/);
  assert.match(workerSource, /proc\.on\('close'/);
  assert.match(workerSource, /node:\/usr\/bin\/node/);
  assert.match(workerSource, /'\/usr\/bin\/python3'/);
  assert.match(workerSource, /'\/usr\/bin\/ffmpeg'/);
  assert.match(workerSource, /PYTHONPATH: VENDORED_YT_DLP_ROOT/);
});

test('publication replay and cleanup are scoped to the immutable claim', () => {
  assert.match(workerSource, /youtube-\$\{job\.id\}-\$\{job\.claim_token\}\.mp4/);
  assert.match(workerSource, /youtube-\$\{job\.id\}-\$\{job\.claim_token\}\.jpg/);
  assert.equal((workerSource.match(/upsert: false/g) || []).length, 2);

  assert.doesNotMatch(workerSource, /\.neq\('id', job\.reel_id\)/);
  assert.match(workerSource, /complete_rights_cleared_youtube_transcode/);
  assert.match(workerSource, /rows\[0\]\.social_post_id === completionAuthorization\.reel\.source_post_id/);

  const reconciliationBody = workerSource.slice(
    workerSource.indexOf('async function reconcileCompletionAck'),
    workerSource.indexOf('async function releaseClaimForRetry'),
  );
  assert.match(reconciliationBody, /persistedJob\.status === 'completed'/);
  assert.match(reconciliationBody, /persistedJob\.claim_token === job\.claim_token/);
  assert.match(reconciliationBody, /normalizeCompletionUrl\(persistedJob\.output_url\)/);
  assert.doesNotMatch(reconciliationBody, /\.from\('social_reels'\)/);
  assert.doesNotMatch(reconciliationBody, /\.from\('social_posts'\)/);
});

test('failure handling establishes claim ownership and never transiently requeues via a Reel update', () => {
  const failureBody = workerSource.slice(
    workerSource.indexOf('} catch (err) {'),
    workerSource.indexOf('} finally {', workerSource.indexOf('} catch (err) {')),
  );
  const failedJobWrite = failureBody.indexOf(".from('video_transcode_jobs').update({");
  const reelWrite = failureBody.indexOf(".from('social_reels')");
  assert.ok(failedJobWrite >= 0);
  assert.ok(reelWrite > failedJobWrite);
  assert.match(failureBody, /retryBudgetExhausted/);
  assert.match(failureBody, /if \(terminal && job\.reel_id\)/);
  assert.match(failureBody, /native_processing_requested: false/);

  const cancellationBody = workerSource.slice(
    workerSource.indexOf('async function cancelUnauthorizedJob'),
    workerSource.indexOf('// ═', workerSource.indexOf('async function cancelUnauthorizedJob')),
  );
  assert.doesNotMatch(cancellationBody, /\.from\('social_reels'\)/);

  const staleResetBody = workerSource.slice(
    workerSource.indexOf('async function resetStaleProcessing'),
    workerSource.indexOf('// ═', workerSource.indexOf('async function resetStaleProcessing')),
  );
  assert.doesNotMatch(staleResetBody, /\.from\('social_reels'\)/);
});
