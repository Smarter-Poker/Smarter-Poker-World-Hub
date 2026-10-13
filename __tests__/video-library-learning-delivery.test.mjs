import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('pause quizzes receive the existing player error state and current hand markers in both viewers', () => {
 const library=read('pages/hub/video-library.js');
 const watch=read('pages/hub/video-library/watch/[videoId]/[[...slug]].js');
 assert.match(library,/ytError:\s*vlYtManaged/);
 assert.match(library,/<PauseQuiz[^>]*active=\{!vlYtManaged\}[^>]*markers=\{quizMarkers\}/);
 assert.match(watch,/<PauseQuiz[^>]*active=\{!ytError\}[^>]*markers=\{quizMarkers\}/);
 for(const page of [library,watch]) {
  assert.match(page,/onMarkersChange=\{setQuizMarkers\}/);
  assert.match(page,/<WatchPlaybackTools key=\{`tools:/);
  assert.match(page,/<PauseQuiz key=\{`quiz:/);
 }
 assert.match(read('src/components/video-library/WatchPlaybackTools.jsx'),/onMarkersChange\?\.\(markers\)/);
});
test('learning behavioral qualification executes in the maintained browser workflow',()=>{
 assert.match(read('.github/workflows/global-footer-e2e.yml'),/run: node scripts\/qualification\/videoLibraryLearningBrowser\.mjs/);
 assert.match(read('scripts/qualification/videoLibraryLearningBrowser.mjs'),/026-video-library-learning/);
});
