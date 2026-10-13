import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('Phase 6 queue controls and canonical social handoff reach both actual viewers', () => {
    for (const file of ['pages/hub/video-library.js','pages/hub/video-library/watch/[videoId]/[[...slug]].js']) {
        const source = read(file);
        assert.match(source, /useVideoLibraryQueue/);
        assert.match(source, /playbackQueue\.advance\(/);
        assert.match(source, /nextTitle=\{/);
        assert.match(source, /<VideoQueue/);
        assert.match(source, /videoLibrarySocialShareHref/);
        assert.match(source, /<StudyStatus/);
    }
    assert.match(read('pages/hub/video-library.js'), /playlistPath\(list\.id\)/);
    assert.match(read('pages/hub/video-library.js'), /libraryFilter === 'recommended' \|\|/);
});
test('Phase 6 qualification executes in the maintained workflows with manual-only authenticated live proof', () => {
    const footer = read('.github/workflows/global-footer-e2e.yml');
    assert.match(footer, /run: node scripts\/qualification\/videoLibraryPersonalBrowser\.mjs/);
    assert.match(footer, /if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.video_library_phase6_live \}\}/);
    assert.match(footer, /run: node scripts\/qualification\/videoLibraryPhase6Live\.mjs/);
    assert.match(read('.github/workflows/build-safety-gate.yml'), /run: node scripts\/qualification\/videoLibraryPlaylistReorder\.mjs/);
    const browser = read('scripts/qualification/videoLibraryPersonalBrowser.mjs');
    for (const suite of ['023-video-library-personal.spec.ts','024-video-library-social-share.spec.ts','025-video-library-playlists.spec.ts']) assert(browser.includes(suite));
    assert.match(browser, /results\.stats\.expected !== 18/);
    assert.match(browser, /results\.stats\.skipped !== 0/);
    const live = read('scripts/qualification/videoLibraryPhase6Live.mjs');
    assert.match(live, /isDedicatedProbeAccount/);
    assert.match(live, /playlistRemoved = true/);
    assert.match(live, /signOut\(\{ scope: 'local' \}\)/);
    assert.doesNotMatch(live, /award_diamonds_v2|rewards\/video-watch|fn_create_social_post/);
});
test('Live stale playlist proof requires bounded definitive conflict and unchanged persisted order', () => {
    const live = read('scripts/qualification/videoLibraryPhase6Live.mjs');
    assert.match(live, /client\.rpc\('fn_reorder_video_playlist',[^\n]+\.abortSignal\(AbortSignal\.timeout\(20000\)\)/);
    assert.match(live, /assert\.equal\(stale\.status, 409\)/);
    assert.match(live, /assert\.equal\(stale\.error\?\.code, 'PT409'\)/);
    assert.match(live, /assert\.equal\(stale\.error\?\.code, 'PT409'\); assert\.deepEqual\(await order\(\), \[\.\.\.ids\]\.reverse\(\)\)/);
    assert.ok(live.indexOf('report.staleWriteResponse =') < live.indexOf('assert.equal(stale.status, 409)'));
    for (const field of ['status: stale.status', 'statusText: safeText(stale.statusText)', 'code: safeText(stale.error.code)', 'message: safeText(stale.error.message)', 'details: safeText(stale.error.details)', 'hint: safeText(stale.error.hint)']) assert(live.includes(field));
});
