/**
 * Players share to Sports Reels exactly as horses do.
 *
 * Horses publish Poker and Sports Reels through publish_horse_video_reel with
 * an explicit topic. A player attests the same topic in the composer and the
 * same database boundary (publish_user_video_reel) records it, so a Sports
 * Reel never says who made it. The composer offers Sports only once the
 * database lists it (public.user_reel_topics()), so this client is correct
 * before and after the migration that adds it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const TEST_STORAGE_HOST = 'test-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${TEST_STORAGE_HOST}`;

const {
  USER_REEL_TOPICS,
  createUserReelPublicationIntent,
  persistUserReelPublicationIntent,
  retryUserReelPublication,
  userReelPublicationStorageKey,
} = await import('../src/lib/userReelPublicationRecovery.mjs');
const {
  DEFAULT_USER_REEL_TOPIC,
  USER_REEL_TOPIC_LABELS,
  acceptedUserReelTopics,
  loadUserReelTopics,
  normalizeUserReelTopic,
  resetUserReelTopicsCacheForTests,
} = await import('../src/lib/userReelTopics.mjs');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const COMPOSER = read('../src/components/social/SharedPostCreator.jsx');
const SOCIAL_PAGE = read('../pages/hub/social-media/index.js');
const TOPICS_MODULE = read('../src/lib/userReelTopics.mjs');
// U+2013 and U+2014, built from code points so this file carries neither.
const DASH_RE = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const VIDEO_URL = `https://${TEST_STORAGE_HOST}/storage/v1/object/public/social-media/reels/${USER_ID}/clip.mp4`;

function okRpc(calls) {
  return {
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      return { data: [{ social_post_id: 'post-1', social_reel_id: 'reel-1' }], error: null };
    },
  };
}

test('a player may attest the same two Reel topics a horse publishes', () => {
  assert.deepEqual([...USER_REEL_TOPICS], ['poker', 'sports']);
  assert.equal(DEFAULT_USER_REEL_TOPIC, 'poker');
  assert.deepEqual({ ...USER_REEL_TOPIC_LABELS }, { poker: 'Poker', sports: 'Sports' });
  assert.equal(normalizeUserReelTopic(true), 'poker', 'a legacy boolean confirmation is Poker');
  assert.equal(normalizeUserReelTopic('poker'), 'poker');
  assert.equal(normalizeUserReelTopic('sports'), 'sports');
  for (const value of [false, null, undefined, 'slots', 'Sports', 'unknown', 1, {}]) {
    assert.equal(normalizeUserReelTopic(value), null, String(value));
  }
});

test('the composer offers only what the database accepts, and always Poker', () => {
  assert.deepEqual(acceptedUserReelTopics(undefined), ['poker']);
  assert.deepEqual(acceptedUserReelTopics(null), ['poker']);
  assert.deepEqual(acceptedUserReelTopics([]), ['poker']);
  assert.deepEqual(acceptedUserReelTopics(['sports']), ['poker', 'sports']);
  assert.deepEqual(acceptedUserReelTopics(['sports', 'poker', 'slots', 'cash']), ['poker', 'sports']);
});

test('before the migration the capability RPC is missing and only Poker is offered, then it is asked again', async () => {
  resetUserReelTopicsCacheForTests();
  let calls = 0;
  const missing = {
    rpc: async (name) => {
      calls += 1;
      assert.equal(name, 'user_reel_topics');
      return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.user_reel_topics' } };
    },
  };
  assert.deepEqual(await loadUserReelTopics(missing), ['poker']);
  assert.deepEqual(await loadUserReelTopics(missing), ['poker']);
  assert.equal(calls, 2, 'a failure is never cached');

  const throwing = { rpc: () => { throw new Error('offline'); } };
  assert.deepEqual(await loadUserReelTopics(throwing), ['poker']);
  assert.deepEqual(await loadUserReelTopics(null), ['poker']);
});

test('after the migration the database list turns Sports on, once per page', async () => {
  resetUserReelTopicsCacheForTests();
  let calls = 0;
  const installed = {
    rpc: async () => {
      calls += 1;
      return { data: ['poker', 'sports'], error: null };
    },
  };
  assert.deepEqual(await loadUserReelTopics(installed), ['poker', 'sports']);
  assert.deepEqual(await loadUserReelTopics(installed), ['poker', 'sports']);
  assert.equal(calls, 1);
  resetUserReelTopicsCacheForTests();
});

test('a Sports upload intent publishes as Sports and survives recovery', async () => {
  const storage = new MemoryStorage();
  const intent = createUserReelPublicationIntent({
    intentId: 'intent-sports',
    userId: USER_ID,
    videoUrl: VIDEO_URL,
    caption: 'Walk-off homer',
    topic: 'sports',
    now: 1_000,
  });
  assert.equal(intent.topic, 'sports');
  persistUserReelPublicationIntent(storage, intent);
  const calls = [];
  const result = await retryUserReelPublication({
    supabase: okRpc(calls),
    storage,
    userId: USER_ID,
    intentId: 'intent-sports',
    attemptKind: 'initial',
    now: () => 2_000,
  });
  assert.equal(result.status, 'published');
  assert.equal(calls[0].name, 'publish_user_video_reel');
  assert.equal(calls[0].payload.p_topic, 'sports');
  assert.equal(calls[0].payload.p_topic_confirmed, true);
});

test('an intent saved before the Sports choice still publishes as Poker; an unknown topic fails closed', async () => {
  const storage = new MemoryStorage();
  const legacy = createUserReelPublicationIntent({
    intentId: 'intent-legacy',
    userId: USER_ID,
    videoUrl: VIDEO_URL,
    now: 1_000,
  });
  assert.equal(legacy.topic, 'poker');
  delete legacy.topic;
  storage.setItem(userReelPublicationStorageKey(USER_ID), JSON.stringify(legacy));
  const calls = [];
  const result = await retryUserReelPublication({
    supabase: okRpc(calls),
    storage,
    userId: USER_ID,
    intentId: 'intent-legacy',
    attemptKind: 'initial',
    now: () => 2_000,
  });
  assert.equal(result.status, 'published');
  assert.equal(calls[0].payload.p_topic, 'poker');

  assert.throws(
    () => createUserReelPublicationIntent({ userId: USER_ID, videoUrl: VIDEO_URL, topic: 'slots' }),
    /topic is invalid/,
  );
});

test('the composer is a Poker or Sports choice wired to the attested topic', () => {
  assert.match(COMPOSER, /loadUserReelTopics\(supabase\)/);
  assert.match(COMPOSER, /role="radiogroup"[\s\S]{0,200}aria-label="Reel Topic"/);
  assert.match(COMPOSER, /reelTopicOptions\.length > 1 &&/, 'the choice appears only when the database accepts Sports');
  assert.match(COMPOSER, /\{USER_REEL_TOPIC_LABELS\[topic\]\} Reels/);
  assert.match(COMPOSER, /Feature This One Video In \{USER_REEL_TOPIC_LABELS\[reelTopic\] \|\| 'Poker'\} Reels\. It Will Be Published Publicly, And I Confirm It Is \{USER_REEL_TOPIC_LABELS\[reelTopic\] \|\| 'Poker'\}-Related And Mine To Share\./);
  assert.match(COMPOSER, /shouldPublishPokerReel \? submittedReelTopic : false/);
  assert.equal((COMPOSER.match(/topic: submittedReelTopic/g) || []).length, 2, 'both upload intents carry the topic');
  assert.match(COMPOSER, /reelTopicOptions\.includes\(reelTopic\) \? reelTopic : null/, 'a topic the database does not accept is never submitted');
});

test('the feed page publishes the attested topic through the atomic Reel RPC', () => {
  assert.match(SOCIAL_PAGE, /const reelTopic = pokerContentConfirmed \? normalizeUserReelTopic\(pokerContentConfirmed\) : null;/);
  assert.match(SOCIAL_PAGE, /if \(submittedVideoUrl && reelTopic\)/);
  assert.match(SOCIAL_PAGE, /'publish_user_video_reel',\s*\{\s*p_video_url: submittedVideoUrl,\s*p_topic: reelTopic,\s*p_topic_confirmed: true,/);
  assert.doesNotMatch(SOCIAL_PAGE, /p_topic: 'poker'/);
});

test('the new copy carries no long dashes', () => {
  assert.doesNotMatch(TOPICS_MODULE, DASH_RE);
  const reelBlock = COMPOSER.slice(COMPOSER.indexOf('{canFeaturePokerReel && ('), COMPOSER.indexOf('{canFeaturePokerReel && (') + 2600);
  assert.doesNotMatch(reelBlock, DASH_RE);
});
