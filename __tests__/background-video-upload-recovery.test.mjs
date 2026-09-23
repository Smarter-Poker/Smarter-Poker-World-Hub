import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_UPLOAD_INTENT_STORAGE_KEY,
  REEL_PUBLICATION_KIND,
  clearUploadIntentForUser,
  isOwnedUploadObject,
  probeUploadRecoveryCandidate,
  quarantineUploadIntentForUser,
  readUploadIntentForUser,
  uploadIntentQuarantineKey,
  uploadIntentStorageKey,
  writeUploadIntentForUser,
} from '../src/lib/uploadRecoveryIdentity.mjs';

const SUPABASE_URL = 'https://project-ref.supabase.co';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = 2_000_000_000_000;
const STORAGE_PATH = `reels/${USER_ID}/upload.mp4`;
const validCandidate = {
  publicationKind: REEL_PUBLICATION_KIND,
  storageCandidate: true,
  storageCommitted: false,
  userId: USER_ID,
  folder: 'reels',
  bucket: 'social-media',
  storagePath: STORAGE_PATH,
  publicUrl: `${SUPABASE_URL}/storage/v1/object/public/social-media/${STORAGE_PATH}`,
  candidateCreatedAt: NOW - 1_000,
};

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

test('upload recovery accepts only one exact authenticated owner object', () => {
  assert.equal(isOwnedUploadObject(validCandidate, { supabaseUrl: SUPABASE_URL }), true);
  for (const hostile of [
    { ...validCandidate, userId: '22222222-2222-4222-8222-222222222222' },
    { ...validCandidate, storagePath: `reels/${USER_ID}/nested/upload.mp4` },
    { ...validCandidate, publicUrl: 'https://evil.example/storage/v1/object/public/social-media/x' },
    { ...validCandidate, publicUrl: `${validCandidate.publicUrl}?download=1` },
    { ...validCandidate, publicUrl: `${SUPABASE_URL}/storage/v1/object/public/stories/${STORAGE_PATH}` },
    { ...validCandidate, bucket: 'stories' },
  ]) {
    assert.equal(isOwnedUploadObject(hostile, { supabaseUrl: SUPABASE_URL }), false);
  }
});

test('a lost final upload ACK is recovered by a no-store HEAD without a second upload', async () => {
  const calls = [];
  const result = await probeUploadRecoveryCandidate(validCandidate, {
    userId: USER_ID,
    supabaseUrl: SUPABASE_URL,
    now: NOW,
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true, status: 200 };
    },
  });
  assert.equal(result.status, 'committed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], validCandidate.publicUrl);
  assert.deepEqual(calls[0][1], {
    method: 'HEAD',
    cache: 'no-store',
    credentials: 'omit',
    headers: { 'Cache-Control': 'no-cache' },
  });
});

test('old singleton upload state migrates only for its owner and cannot block another account', () => {
  const otherUserId = '22222222-2222-4222-8222-222222222222';
  const legacy = JSON.stringify(validCandidate);
  const storage = new MemoryStorage({ [LEGACY_UPLOAD_INTENT_STORAGE_KEY]: legacy });

  assert.equal(readUploadIntentForUser(storage, otherUserId), null);
  assert.equal(
    storage.getItem(LEGACY_UPLOAD_INTENT_STORAGE_KEY),
    legacy,
    'another account must not erase the original owner recovery evidence',
  );

  const migrated = readUploadIntentForUser(storage, USER_ID);
  assert.equal(migrated.publicUrl, validCandidate.publicUrl);
  assert.equal(storage.getItem(LEGACY_UPLOAD_INTENT_STORAGE_KEY), null);
  assert.equal(storage.getItem(uploadIntentStorageKey(USER_ID)), legacy);

  writeUploadIntentForUser(storage, { ...validCandidate, timestamp: 1 }, { now: NOW });
  assert.equal(JSON.parse(storage.getItem(uploadIntentStorageKey(USER_ID))).timestamp, NOW);
  clearUploadIntentForUser(storage, USER_ID);
  assert.equal(storage.getItem(uploadIntentStorageKey(USER_ID)), null);

  const hostile = new MemoryStorage({ [LEGACY_UPLOAD_INTENT_STORAGE_KEY]: '{broken' });
  assert.equal(readUploadIntentForUser(hostile, USER_ID), null);
  assert.equal(hostile.getItem(LEGACY_UPLOAD_INTENT_STORAGE_KEY), '{broken');
});

test('hostile, cross-user, stale, missing, and offline recovery states fail closed', async () => {
  let fetchCalls = 0;
  const neverFetch = async () => {
    fetchCalls += 1;
    return { ok: true, status: 200 };
  };
  const crossUser = await probeUploadRecoveryCandidate(validCandidate, {
    userId: '22222222-2222-4222-8222-222222222222',
    supabaseUrl: SUPABASE_URL,
    now: NOW,
    fetchImpl: neverFetch,
  });
  const stale = await probeUploadRecoveryCandidate(
    { ...validCandidate, candidateCreatedAt: NOW - 8 * 24 * 60 * 60 * 1000 },
    { userId: USER_ID, supabaseUrl: SUPABASE_URL, now: NOW, fetchImpl: neverFetch },
  );
  const hostile = await probeUploadRecoveryCandidate(
    { ...validCandidate, publicUrl: 'https://evil.example/video.mp4' },
    { userId: USER_ID, supabaseUrl: SUPABASE_URL, now: NOW, fetchImpl: neverFetch },
  );
  assert.equal(crossUser.status, 'invalid');
  assert.equal(stale.status, 'invalid');
  assert.equal(hostile.status, 'invalid');
  assert.equal(fetchCalls, 0);

  const missing = await probeUploadRecoveryCandidate(validCandidate, {
    userId: USER_ID,
    supabaseUrl: SUPABASE_URL,
    now: NOW,
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  const offline = await probeUploadRecoveryCandidate(validCandidate, {
    userId: USER_ID,
    supabaseUrl: SUPABASE_URL,
    now: NOW,
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.equal(missing.status, 'missing');
  assert.equal(offline.status, 'indeterminate');
});

test('an invalid owner-scoped candidate is quarantined once and stops blocking uploads', () => {
  const invalid = { ...validCandidate, candidateCreatedAt: 'not-a-timestamp' };
  const storage = new MemoryStorage({
    [uploadIntentStorageKey(USER_ID)]: JSON.stringify(invalid),
  });

  assert.equal(quarantineUploadIntentForUser(storage, USER_ID, {
    reason: 'invalid timestamp',
    now: NOW,
  }), true);
  assert.equal(storage.getItem(uploadIntentStorageKey(USER_ID)), null);
  const evidence = JSON.parse(storage.getItem(uploadIntentQuarantineKey(USER_ID)));
  assert.equal(evidence.userId, USER_ID);
  assert.equal(evidence.reason, 'invalid timestamp');
  assert.equal(evidence.quarantinedAt, NOW);
  assert.equal(JSON.parse(evidence.raw).candidateCreatedAt, 'not-a-timestamp');
  assert.equal(evidence.truncated, false);
  assert.equal(quarantineUploadIntentForUser(storage, USER_ID), false);
});
