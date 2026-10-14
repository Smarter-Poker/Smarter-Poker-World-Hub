import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const library = readFileSync(new URL('../pages/hub/video-library.js', import.meta.url), 'utf8');
const watch = readFileSync(new URL('../pages/hub/video-library/watch/[videoId]/[[...slug]].js', import.meta.url), 'utf8');
test('Phase 8 entries are actually mounted and canonical tracking owns only one save path', () => {
 assert.match(library, /<MemberClipUpload \/>/);
 assert.match(library, /href="\/hub\/video-library\/owner"/);
 assert.match(watch, /const tracking = useVideoLibraryWatchTracking\(/);
 assert.match(watch, /<WatchTracking tracking=\{tracking\}/);
 assert.doesNotMatch(watch, /updateWatchDuration\(|flushWatchDuration\(/);
});
test('canonical iframe start captures resume once on Play rather than changing on persisted progress', () => {
 assert.match(watch, /resumeSnapshot\.current = \{ key: resumeKey, seconds: tracking\.resumeSeconds \|\| 0 \}/);
 assert.match(watch, /start=\$\{resumeSnapshot\.current\.seconds\}/);
 assert.doesNotMatch(watch, /start=\$\{tracking\./);
 assert.match(watch, /onClick=\{startWatching\}/);
});
test('library totals and current seek position reflect authoritative acknowledgment instead of local elapsed estimates', () => {
 const body = library.slice(library.indexOf('const saveWatchSession ='), library.indexOf('saveWatchSessionRef.current ='));
 assert.match(body, /totalWatchedSeconds: persistedTotal/);
 assert.match(body, /watchedSeconds: nextProgress/);
 assert.match(body, /const confirmedTotal = persistedTotal/);
 assert.doesNotMatch(body, /Math\.max\(totalWatched|previousWatched \+ watchedSeconds/);
 assert.match(body, /Watch Progress Could Not Be Confirmed/);
});
test('saved zero seek position is retained instead of falling back to cumulative viewing time', () => {
 const service=readFileSync(new URL('../src/services/videoWatchHistory.js',import.meta.url),'utf8');
 const expression=service.match(/watchedSeconds:\s*([^\n]+),/)[1];
 const project=new Function('v',`return ${expression};`);
 assert.equal(project({progress_seconds:0,watch_duration_seconds:120}),0);
 assert.equal(project({progress_seconds:30,watch_duration_seconds:120}),30);
 assert.equal(project({progress_seconds:null,watch_duration_seconds:120}),120);
});
