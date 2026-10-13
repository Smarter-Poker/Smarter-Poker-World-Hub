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

test('standalone server rendering uses configured runtime catalog URL before the compiled public fallback', () => {
 const watch=read('pages/hub/video-library/watch/[videoId]/[[...slug]].js');
 const expression=watch.match(/const url = ([^;]+);/)[1];
 const evaluate=env=>new Function('process',`return ${expression};`)({env});
 assert.equal(evaluate({SUPABASE_URL:'http://127.0.0.1:4567',NEXT_PUBLIC_SUPABASE_URL:'https://compiled-public.invalid'}),'http://127.0.0.1:4567');
 assert.equal(evaluate({NEXT_PUBLIC_SUPABASE_URL:'https://compiled-public.invalid'}),'https://compiled-public.invalid');
 assert.equal(evaluate({}),undefined);
});

test('the learning directory uses existing client navigation instead of cancelling pending document chunks', () => {
 const library=read('pages/hub/video-library.js');
 assert.match(library,/import Link from 'next\/link'/);
 assert.match(library,/<nav[^>]*aria-label="Poker Learning"><Link href="\/hub\/video-library\/players">Poker Players<\/Link>/);
});
