import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const TEST_STORAGE_HOST = 'test-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${TEST_STORAGE_HOST}`;

const {
  MAX_AUTOMATIC_REEL_PUBLICATION_ATTEMPTS,
  assertUserReelPublicationSlot,
  assertUserReelRecoveryStorage,
  createUserReelPublicationIntent,
  persistUserReelPublicationIntent,
  quarantineInvalidUserReelPublication,
  readUserReelPublicationIntent,
  retryUserReelPublication,
  userReelPublicationStorageKey,
} = await import('../src/lib/userReelPublicationRecovery.mjs');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const VIDEO_URL = `https://${TEST_STORAGE_HOST}/storage/v1/object/public/social-media/reels/${USER_ID}/clip.mp4`;

function pendingIntent(overrides = {}) {
  return createUserReelPublicationIntent({
    intentId: 'intent-1',
    userId: USER_ID,
    videoUrl: VIDEO_URL,
    caption: 'Final table bluff',
    now: 1_000,
    ...overrides,
  });
}

test('publication intents are durable, user scoped, and stale malformed data fails closed', () => {
  const storage = new MemoryStorage();
  assert.doesNotThrow(() => assertUserReelRecoveryStorage(storage));

  const intent = pendingIntent();
  persistUserReelPublicationIntent(storage, intent);

  assert.equal(readUserReelPublicationIntent(storage, USER_ID).status, 'pending');
  assert.equal(readUserReelPublicationIntent(storage, USER_ID).intent.videoUrl, VIDEO_URL);
  assert.equal(readUserReelPublicationIntent(storage, OTHER_USER_ID).status, 'empty');

  const key = userReelPublicationStorageKey(USER_ID);
  storage.setItem(key, '{broken-json');
  const malformed = readUserReelPublicationIntent(storage, USER_ID);
  assert.equal(malformed.status, 'invalid');
  assert.equal(storage.getItem(key), '{broken-json', 'invalid recovery evidence must not be discarded');
});

test('recovery accepts only the exact project host, public object route, and UUID owner namespace', () => {
  assert.throws(
    () => pendingIntent({ videoUrl: VIDEO_URL.replace('test-project', 'attacker') }),
    /owned video object/i,
  );
  assert.throws(
    () => pendingIntent({
      videoUrl: VIDEO_URL.replace(
        `https://${TEST_STORAGE_HOST}/`,
        `https://${TEST_STORAGE_HOST}:444/`,
      ),
    }),
    /owned video object/i,
  );
  assert.throws(
    () => pendingIntent({ videoUrl: `${VIDEO_URL}?redirect=https://attacker.example` }),
    /owned video object/i,
  );
  assert.throws(
    () => pendingIntent({ videoUrl: VIDEO_URL.replace('/object/public/', '/object/sign/') }),
    /owned video object/i,
  );
  assert.throws(
    () => createUserReelPublicationIntent({
      userId: 'not-a-uuid',
      videoUrl: `https://${TEST_STORAGE_HOST}/storage/v1/object/public/social-media/reels/not-a-uuid/clip.mp4`,
    }),
    /user id|owned video object/i,
  );
});

test('corrupt active data is quarantined only by an explicit action and remains recoverable', () => {
  const storage = new MemoryStorage();
  const activeKey = userReelPublicationStorageKey(USER_ID);
  storage.setItem(activeKey, '{broken-json-with-object-url');

  const result = quarantineInvalidUserReelPublication(storage, USER_ID, { now: 5_000 });
  assert.equal(result.status, 'quarantined');
  assert.equal(storage.getItem(activeKey), null);
  assert.match(storage.getItem(result.quarantineKey), /broken-json-with-object-url/);
  assert.doesNotThrow(() => assertUserReelPublicationSlot(storage, USER_ID));
});

test('a second upload cannot replace recovery evidence for an unresolved object', () => {
  const storage = new MemoryStorage();
  const first = pendingIntent();
  persistUserReelPublicationIntent(storage, first);

  assert.throws(
    () => assertUserReelPublicationSlot(storage, USER_ID),
    /finish publishing/i,
  );
  assert.throws(
    () => persistUserReelPublicationIntent(storage, pendingIntent({ intentId: 'intent-2' })),
    /cannot replace/i,
  );
  assert.equal(readUserReelPublicationIntent(storage, USER_ID).intent.id, first.id);
});

test('the durable intent is removed only after both post and Reel IDs are confirmed', async () => {
  const storage = new MemoryStorage();
  persistUserReelPublicationIntent(storage, pendingIntent());
  const calls = [];
  const supabase = {
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      return {
        data: [{ social_post_id: 'post-1', social_reel_id: 'reel-1' }],
        error: null,
      };
    },
  };

  const result = await retryUserReelPublication({
    supabase,
    storage,
    userId: USER_ID,
    intentId: 'intent-1',
    attemptKind: 'initial',
    now: () => 2_000,
  });

  assert.equal(result.status, 'published');
  assert.deepEqual(result.publication, { socialPostId: 'post-1', socialReelId: 'reel-1' });
  assert.equal(readUserReelPublicationIntent(storage, USER_ID).status, 'empty');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'publish_user_video_reel');
  assert.equal(calls[0].payload.p_video_url, VIDEO_URL);
});

test('incomplete lineage and a mid-flight response drop retain the same uploaded object for retry', async () => {
  const storage = new MemoryStorage();
  persistUserReelPublicationIntent(storage, pendingIntent());
  let now = 2_000;
  let invocation = 0;
  const submittedUrls = [];
  const supabase = {
    rpc: async (_name, payload) => {
      submittedUrls.push(payload.p_video_url);
      invocation += 1;
      if (invocation === 1) {
        // The database may have committed even though the response was dropped.
        return { data: null, error: new Error('connection dropped after commit') };
      }
      return {
        data: { social_post_id: 'post-stable', social_reel_id: 'reel-stable' },
        error: null,
      };
    },
  };

  const first = await retryUserReelPublication({
    supabase,
    storage,
    userId: USER_ID,
    intentId: 'intent-1',
    attemptKind: 'initial',
    now: () => now,
  });
  assert.equal(first.status, 'failed');
  const retained = readUserReelPublicationIntent(storage, USER_ID);
  assert.equal(retained.status, 'pending');
  assert.equal(retained.intent.videoUrl, VIDEO_URL);
  assert.match(retained.intent.lastError, /connection dropped after commit/);

  now = retained.intent.nextAttemptAt;
  const second = await retryUserReelPublication({
    supabase,
    storage,
    userId: USER_ID,
    intentId: 'intent-1',
    attemptKind: 'automatic',
    now: () => now,
  });
  assert.equal(second.status, 'published');
  assert.deepEqual(submittedUrls, [VIDEO_URL, VIDEO_URL], 'retry must not upload a second object');
  assert.equal(readUserReelPublicationIntent(storage, USER_ID).status, 'empty');
});

test('automatic retries are bounded while the recovery evidence remains available for a manual retry', async () => {
  const storage = new MemoryStorage();
  const intent = {
    ...pendingIntent(),
    automaticAttemptCount: MAX_AUTOMATIC_REEL_PUBLICATION_ATTEMPTS,
    nextAttemptAt: 0,
  };
  persistUserReelPublicationIntent(storage, intent);
  let rpcCalls = 0;

  const result = await retryUserReelPublication({
    supabase: { rpc: async () => { rpcCalls += 1; } },
    storage,
    userId: USER_ID,
    intentId: intent.id,
    attemptKind: 'automatic',
    now: () => 100_000,
  });

  assert.equal(result.status, 'exhausted');
  assert.equal(rpcCalls, 0);
  assert.equal(readUserReelPublicationIntent(storage, USER_ID).status, 'pending');
});

test('another user cannot publish an old user-scoped intent', async () => {
  const storage = new MemoryStorage();
  persistUserReelPublicationIntent(storage, pendingIntent());
  let rpcCalls = 0;
  const result = await retryUserReelPublication({
    supabase: { rpc: async () => { rpcCalls += 1; } },
    storage,
    userId: OTHER_USER_ID,
    attemptKind: 'automatic',
  });
  assert.equal(result.status, 'empty');
  assert.equal(rpcCalls, 0);
  assert.equal(readUserReelPublicationIntent(storage, USER_ID).status, 'pending');
});

test('the upload, recovery banner, identity gating, and atomic Story UI are wired', () => {
  const uploadModal = read('../src/components/reels/UploadReelModal.jsx');
  const recoveryBanner = read('../src/components/reels/ReelPublicationRecoveryBanner.jsx');
  const reelsPage = read('../pages/hub/reels.js');
  const socialPage = read('../pages/hub/social-media/index.js');
  const composer = read('../src/components/social/SharedPostCreator.jsx');
  const stories = read('../src/components/social/Stories.jsx');
  const backgroundUpload = read('../src/lib/backgroundVideoUpload.js');
  // Main retired the unreachable duplicate composer in #1720; the live composer
  // must retain the same error handling and publication ownership below.
  assert.equal(existsSync(new URL('../src/components/social/EnhancedPostCreator.jsx', import.meta.url)), false);
  assert.match(socialPage, /<SharedPostCreator\b/);
  assert.doesNotMatch(socialPage, /EnhancedPostCreator/);

  assert.match(uploadModal, /persistUserReelPublicationIntent/);
  assert.match(
    uploadModal,
    /onStorageCommitted:\s*\(\{\s*publicUrl[\s\S]{0,900}persistUserReelPublicationIntent[\s\S]{0,900}onComplete:\s*\(\{\s*publicUrl/,
    'the intent must become durable synchronously when Storage completes',
  );
  assert.match(uploadModal, /retryUserReelPublication/);
  assert.match(recoveryBanner, /MAX_AUTOMATIC_REEL_PUBLICATION_ATTEMPTS/);
  assert.match(recoveryBanner, /Retry Now/);
  assert.match(reelsPage, /ReelPublicationRecoveryBanner/);
  assert.match(socialPage, /ReelPublicationRecoveryBanner/);

  assert.match(composer, /canShareToPokerReels/);
  assert.match(composer, /canFeaturePokerReel/);
  assert.match(composer, /isSingleVideoDraft/);
  assert.match(composer, /postVisibility === 'public'/);
  assert.doesNotMatch(composer, /\.\.\.\(shareToPokerReels \? \{ topic: 'poker' \} : \{\}\)/);

  assert.match(stories, /supabase\.rpc\(['"]fn_create_story['"]/);
  assert.doesNotMatch(stories, /(?:setS|s)aveAsPokerReel/);
  assert.doesNotMatch(stories, /\.from\(['"]social_reels['"]\)[\s\S]{0,160}\.insert\(/);

  const commitSection = backgroundUpload.match(
    /await _uploadWithTus[\s\S]*?_emit\(['"]onComplete['"]/,
  )?.[0] || '';
  assert.match(commitSection, /_emitStorageCommitted/);
  assert.ok(
    commitSection.indexOf('_emitStorageCommitted') < commitSection.indexOf('_clearUploadIntent'),
    'Storage commit listeners must persist recovery before the upload intent is cleared',
  );
  assert.match(backgroundUpload, /storageCommitted:\s*true/);
  const startReset = backgroundUpload.match(
    /async start\(\{[\s\S]*?_state = 'uploading';/,
  )?.[0] || '';
  assert.match(startReset, /REEL_PUBLICATION_RECOVERY_REQUIRED/);
  assert.ok(
    startReset.indexOf('REEL_PUBLICATION_RECOVERY_REQUIRED') < startReset.indexOf('_clearUploadIntent'),
    'a prior committed session object must block reset before the intent can be cleared',
  );
  assert.match(uploadModal, /bgUpload\.start\([\s\S]{0,500}\.catch\(reject\)/);
  assert.match(composer, /bgUpload[\s\S]{0,120}\.start\([\s\S]{0,500}\.catch\(reject\)/);
  assert.match(composer, /publicationKind:\s*shouldPublishPokerReel\s*\?\s*['"]poker_reel['"]\s*:\s*null/);
  assert.match(
    backgroundUpload,
    /retry\(\)[\s\S]{0,900}REEL_PUBLICATION_RECOVERY_REQUIRED[\s\S]{0,500}toast\.action/,
    'background upload retry must turn the recovery guard into a visible recovery action',
  );
  assert.match(recoveryBanner, /quarantineInvalidUserReelPublication/);
  assert.match(recoveryBanner, /Save For Support (?:&amp;|&) Continue/);
  assert.match(recoveryBanner, /candidate-invalid[\s\S]*quarantineCandidateAndContinue/);
  assert.match(backgroundUpload, /await bgUpload\.reconcileDanglingIntent\(\{ userId \}\)/);
  assert.match(backgroundUpload, /recovery\.status === 'missing'[\s\S]*allowStorageCandidate: true/);
  assert.match(backgroundUpload, /recovery\.status === 'invalid'[\s\S]*quarantineDanglingIntent/);
});
