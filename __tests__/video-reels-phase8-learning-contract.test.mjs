import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  chronologicalVideos, learningActions, normalizeSeenIds, organicAnalyticsEligible,
  rankLearningVideos, semanticRelevance,
} from '../src/lib/videoLearningContract.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const DISCOVERY = read('../pages/api/video-library/discovery.js');
const STUDY = read('../pages/api/video-library/study-list.js');

const videos = [
  { id: 'old-math', title: 'Pot Odds', source: 'A', type: 'cash', tags: ['math'], publishedAt: '2026-01-01T00:00:00Z' },
  { id: 'new-icm', title: 'Bubble Decisions', source: 'B', type: 'tournament', tags: ['icm'], publishedAt: '2026-09-01T00:00:00Z' },
  { id: 'new-math', title: 'Equity and Outs', source: 'A', type: 'cash', tags: ['math'], publishedAt: '2026-08-01T00:00:00Z' },
];

test('semantic search spans concepts and transparent ranking retains chronology', () => {
  assert.ok(semanticRelevance(videos[0], 'math') > 0);
  const ranked = rankLearningVideos(videos, { query: 'math', nowMs: Date.parse('2026-10-01T00:00:00Z'), seenIds: new Set(['new-math']) });
  assert.equal(ranked[0].id, 'old-math');
  assert.ok(ranked[0].recommendationReasons.includes('Matches your search'));
  assert.deepEqual(chronologicalVideos(videos).map((item) => item.id), ['new-icm', 'new-math', 'old-math']);
});

test('authoritative database relevance survives application reranking', () => {
  const transcriptMatch = { ...videos[0], id: 'transcript-match', title: 'Unrelated Label', semanticRank: 0.8 };
  const weakTitleMatch = { ...videos[1], id: 'title-match', title: 'Math Basics', semanticRank: 0.01 };
  const ranked = rankLearningVideos([weakTitleMatch, transcriptMatch], { query: 'math', nowMs: Date.parse('2026-10-01T00:00:00Z') });
  assert.equal(ranked[0].id, 'transcript-match');
  assert.ok(ranked[0].recommendationReasons.includes('Strong transcript or concept match'));
});

test('diversity reranking never discards a same-creator result set', () => {
  const sameCreator = Array.from({ length: 10 }, (_, index) => ({
    id: `lesson-${index}`,
    title: `Tournament Lesson ${index}`,
    source: 'Trusted Coach',
    type: 'tournament',
    tags: ['icm'],
    publishedAt: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  }));
  const ranked = rankLearningVideos(sameCreator, { query: 'tournament', nowMs: Date.parse('2026-10-01T00:00:00Z') });
  assert.equal(ranked.length, sameCreator.length);
  assert.deepEqual(new Set(ranked.map(video => video.id)), new Set(sameCreator.map(video => video.id)));
});

test('session seen state is bounded and learning actions carry timestamped verified launches', () => {
  assert.equal(normalizeSeenIds(Array.from({ length: 300 }, (_, index) => `video-${index}`)).length, 240);
  const actions = learningActions(videos[0], { progressSeconds: 91 });
  assert.equal(actions.continueAtSeconds, 91);
  assert.equal(actions.geeves.kind, 'explanation');
  assert.equal(actions.quiz.kind, 'quiz');
  assert.equal(actions.sandbox.kind, 'verified-training-launch');
  assert.equal(actions.relatedLessons.excludeVideoId, 'old-math');
});

test('automated profiles cannot contribute organic analytics or personalization', () => {
  assert.equal(organicAnalyticsEligible({ id: 'human', is_horse: false }), true);
  assert.equal(organicAnalyticsEligible({ id: 'horse', is_horse: true }), false);
  assert.match(DISCOVERY, /organicAnalyticsEligible/);
  assert.match(DISCOVERY, /user\?\.id && organicEligible/);
});

test('API contracts are rate-limited, owner-scoped, no-store, and Phase 8 authoritative', () => {
  for (const source of [DISCOVERY, STUDY]) {
    assert.match(source, /applyRateLimit/);
    assert.match(source, /private, no-store/);
    assert.match(source, /getServerUserWithFallback/);
    assert.doesNotMatch(source, /@supabase\/supabase-js/);
  }
  assert.match(DISCOVERY, /rpc\('search_video_learning'/);
  assert.doesNotMatch(DISCOVERY, /video_watch_history|video_watch_later/);
  assert.match(STUDY, /video_study_lists/);
  assert.match(STUDY, /video_study_list_items/);
  assert.match(STUDY, /video_learning_progress/);
  assert.match(STUDY, /rpc\('upsert_video_learning_progress'/);
  assert.match(STUDY, /onConflict: 'list_id,video_id'/);
  assert.match(STUDY, /global: \{ headers: \{ Authorization: `Bearer \$\{token\}` \} \}/);
  assert.match(STUDY, /ownerDb\.from\('video_study_list_items'\)/);
  assert.match(STUDY, /video_library_public_catalog/);
  assert.match(STUDY, /videoId/);
  assert.match(STUDY, /onConflict: 'user_id,name', ignoreDuplicates: true/);
  assert.match(STUDY, /const raced = await ownerDb/);
  assert.doesNotMatch(STUDY, /db\.from\('video_study_list_items'\)/);
  assert.doesNotMatch(STUDY, /video_watch_history|video_watch_later/);
  assert.match(STUDY, /expectedOwnerId !== user\.id/);
  assert.match(STUDY, /rpc\('set_video_learning_reel_saved'/);
});
