import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
test('Phase 8 native regression and explicit live proof use the maintained workflow and configured identity',()=>{
 const workflow=read('.github/workflows/global-footer-e2e.yml');
 assert.match(workflow,/video_library_phase8_live:/);
 assert.match(workflow,/!inputs.video_library_phase8_live/);
 assert.match(workflow,/node scripts\/qualification\/videoLibraryOwnerToolsBrowser\.mjs/);
 assert.match(workflow,/node scripts\/qualification\/videoLibraryPhase8Live\.mjs/);
 assert.match(workflow,/TEST_USER_PASSWORD: \$\{\{ secrets\.TEST_USER_PASSWORD \}\}/);
 assert.doesNotMatch(workflow,/schedule:/);
 const driver=read('scripts/qualification/videoLibraryPhase8Live.mjs');
 assert.match(driver,/isDedicatedProbeAccount\(email\)/);
 assert.match(driver,/signOut\(\{scope:'local'\}\)/);
 assert.match(driver,/assert\.equal\(health\.commitSha,expected\)/);
 assert.match(driver,/readFinancialSnapshot/);
});
test('native upload proof requires real owner/rights/byte identity, refuses rewards and recovers exact task outcome',()=>{
 const source=read('scripts/qualification/videoLibraryPhase8Upload.mjs');
 assert.match(source,/marker\.length < 20/);
 assert.match(source,/missingReward\.count === 0/);
 assert.match(source,/post\.author_id, ownerId/);
 assert.match(source,/post\.content, marker/);
 assert.match(source,/createHash\('sha256'\)/);
 assert.match(source,/reel\.rights_status, 'user_authorized'/);
 assert.match(source,/eq\('author_id', ownerId\)\.eq\('content', marker\)/);
 assert.match(source,/assert\.deepEqual\(await readFinancialSnapshot/);
 assert.doesNotMatch(source,/force:\s*true|award_diamonds|claimReward\(/);
});

test('live tracking proof uses the discoverable non-autoplaying player and native resume without iframe rewrites',()=>{
 const source=read('scripts/qualification/videoLibraryPhase8Tracking.mjs');
 assert.match(source,/discoverableSource\.searchParams\.get\('autoplay'\), '0'/);
 assert.match(source,/Discovering the non-autoplaying iframe must not write watch credit/);
 assert.match(source,/name: 'Resume Saved Position'/);
 assert.match(source,/await resumeButton\.click\(\)/);
 assert.match(source,/await resumedIframe\.getAttribute\('src'\), resumeSource/);
 assert.match(source,/await expect\.poll\(state, \{ timeout: 20000 \}\)\.toBe\(1\)/);
 assert.match(source,/The real provider must resume near the saved position/);
 assert.doesNotMatch(source,/name: `Play \$\{video\.title\}`|searchParams\.get\('start'\)/);
});
