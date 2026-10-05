import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const COMPONENT = read('../src/components/video-learning/VideoLearningLoop.jsx');
const CSS = read('../src/components/video-learning/VideoLearningLoop.module.css');
const LIBRARY = read('../pages/hub/video-library.js');
const REELS = read('../pages/hub/reels.js');

test('the shared learning loop exposes the complete study path', () => {
  for (const copy of [
    'Why This Is Here',
    'Add To Study List',
    'Open Full Lesson',
    'Ask Geeves To Explain',
    'Take A Quick Quiz',
    'Practice In Sandbox',
    'Related Lessons',
  ]) assert.match(COMPONENT, new RegExp(copy));
  assert.match(COMPONENT, /buildLearningReason/);
  assert.match(COMPONENT, /View Newest First/);
});

test('Video Library connects progress, saves, related lessons, quiz, sandbox, and Geeves', () => {
  assert.match(LIBRARY, /<VideoLearningLoop/);
  assert.match(LIBRARY, /resumeLabel=\{selectedVideoResumeSeconds/);
  assert.match(LIBRARY, /\/api\/video-library\/study-list/);
  assert.match(LIBRARY, /action: 'progress'/);
  assert.match(LIBRARY, /onSave=\{\(\) => void toggleWatchLater\(selectedVideo\)\}/);
  assert.match(LIBRARY, /relatedLessons=\{relatedVideos\}/);
  assert.match(LIBRARY, /geeves-open/);
  assert.match(LIBRARY, /\/hub\/personal-assistant\/sandbox/);
});

test('Reels connects saved state, recommendation reason, full lesson, and chronological mode', () => {
  assert.match(REELS, /<VideoLearningLoop/);
  assert.match(REELS, /currentReel\?\.selection_reason/);
  assert.match(REELS, /saved=\{savedReels\.has\(currentReel\?\.id\)\}/);
  assert.match(REELS, /fullVideoHref=\{videoId/);
  assert.match(REELS, /chronologicalHref="\/hub\/reels\?mode=latest"/);
  assert.match(REELS, /onSave=\{handleStudySave\}/);
  assert.match(REELS, /\/api\/video-library\/study-list/);
});

test('Video Library semantic queries use the Phase 8 discovery authority', () => {
  assert.match(LIBRARY, /semanticDiscovery = libraryFilter === 'ALL'/);
  assert.match(LIBRARY, /semanticDiscovery \? '\/api\/video-library\/discovery' : '\/api\/video-library\/catalog'/);
  assert.match(LIBRARY, /Authorization: `Bearer \$\{discoveryToken\}`/);
  assert.match(LIBRARY, /router\.query\.rank === 'chronological' \? 'chronological' : 'recommended'/);
  assert.match(LIBRARY, /setLearningStudyIds/);
  assert.match(LIBRARY, /setLearningProgressByVideo/);
  assert.match(LIBRARY, /learningProgressByVideo\.get\(selectedVideo\.videoId\)/);
  assert.match(LIBRARY, /rank: 'chronological'/);
  assert.ok(LIBRARY.indexOf('const discoveryToken = semanticDiscovery') < LIBRARY.indexOf('if (userId && discoveryToken)'));
});

test('Reel study saves are serialized through one atomic server authority', () => {
  assert.match(REELS, /studySavePendingRef\.current\.has\(reel\.id\)/);
  assert.match(REELS, /studySavePendingRef\.current\.add\(reel\.id\)/);
  assert.match(REELS, /action: 'reel-save'/);
  assert.match(REELS, /payload\.ownerId !== ownerRequest\.ownerId/);
  assert.doesNotMatch(REELS, /Study list compensation failed/);
  assert.match(REELS, /studySavePendingRef\.current\.delete\(reel\.id\)/);
});

test('the learning deck is mobile-first and keyboard visible', () => {
  assert.match(CSS, /min-height: 46px/);
  assert.match(CSS, /focus-visible/);
  assert.match(CSS, /overflow-x: auto/);
  assert.match(CSS, /prefers-reduced-motion: reduce/);
  assert.match(CSS, /@media \(min-width: 720px\)/);
});
