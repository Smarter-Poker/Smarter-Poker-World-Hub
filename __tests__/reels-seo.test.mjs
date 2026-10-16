import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { reelMetadata, reelVideoSchema, reelWatchPath, reelYouTubeFrameHtml } from '../src/lib/reelsSeo.mjs';
const reel = { id: '22d99148-a5e4-47ec-b418-0c22f6612f27', is_public: true, caption: 'A Real Poker Clip', playback_type: 'youtube_embed', youtube_video_id: 'GHEEXXYWuJg', created_at: '2026-10-16T12:00:00Z', source_published_at: '2026-10-15T04:36:57Z', source_thumbnail_url: 'https://i.ytimg.com/vi/GHEEXXYWuJg/maxresdefault.jpg', source_duration: '24:06' };
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('one public Reel receives canonical factual provider video metadata', () => {
    const data = reelMetadata(reel);
    assert.equal(data.canonical, `/hub/reels?id=${reel.id}`);
    assert.equal(data.schema.url, `https://smarter.poker${data.canonical}`);
    assert.equal(data.schema.uploadDate, '2026-10-15T04:36:57.000Z');
    assert.equal(data.schema.duration, 'PT24M6S');
    assert.equal(data.schema.embedUrl, 'https://www.youtube-nocookie.com/embed/GHEEXXYWuJg');
    assert.equal(data.schema.contentUrl, undefined);
    assert.equal(data.image, data.schema.thumbnailUrl[0]);
    assert.equal(data.schema.author, undefined, 'do not invent a creator identity');
});
test('YouTube Reel schema never uses mirroring time for missing provider publication', () => {
    for (const source_published_at of [null, '', '2026-02-30T12:00:00Z', '2026-10-15']) assert.equal(reelVideoSchema({ ...reel, source_published_at }), null);
    assert.equal(reelVideoSchema({ ...reel, is_public: false }), null);
    assert.equal(reelVideoSchema({ ...reel, source_thumbnail_url: 'javascript:bad', thumbnail_url: null }), null);
    assert.equal(reelWatchPath('not-a-uuid'), null);
});
test('native uploads use real publication and actual media bytes, never a watch document', () => {
    const native = { ...reel, playback_type: 'native', youtube_video_id: null, video_url: 'https://media.example/clip.mp4', thumbnail_url: 'https://media.example/clip.jpg' };
    const schema = reelVideoSchema(native);
    assert.equal(schema.uploadDate, '2026-10-16T12:00:00.000Z');
    assert.equal(schema.contentUrl, native.video_url);
    assert.equal(schema.embedUrl, undefined);
    assert.equal(reelVideoSchema({ ...native, video_url: 'javascript:alert(1)' }), null);
});
test('SSR YouTube frame is discoverable, paused, privacy enhanced and rejects injection', () => {
    const html = reelYouTubeFrameHtml(reel.youtube_video_id);
    assert.equal((html.match(/<iframe/g) || []).length, 1);
    assert.match(html, /youtube-nocookie.com\/embed\/GHEEXXYWuJg\?autoplay=0/);
    assert.match(html, /enablejsapi=1/);
    assert.equal(reelYouTubeFrameHtml('x"><script>'), '');
    const player = read('../src/components/reels/ReelYouTubePlayer.jsx');
    assert.match(player, /hostRef.current.querySelector\('iframe'\) \|\| document.createElement\('iframe'\)/);
    assert.match(player, /new YT.Player\(frame,/);
    assert.match(player, /initialFrameHtmlRef.current/);
});
test('detail SSR resolves public canonical identity and seeds the existing full viewer', () => {
    const page = read('../pages/hub/reels.js');
    assert.match(page, /getServerSideProps\(\{ res, query = \{\} \}\)/);
    assert.match(page, /readPublicReelById\(\{ id, category: 'for-you', includeVideoMetadata: true \}\)/);
    assert.match(page, /if \(!detail.data\)[\s\S]*?notFound: true/);
    assert.match(page, /res.statusCode = 503/);
    assert.match(page, /setHeader\('Cache-Control', 'no-store'\)/);
    assert.match(page, /useState\(\(\) => initialReel \? \[initialReel\] : \[\]\)/);
    assert.match(page, /const \[loading, setLoading\] = useState\(!initialReel\)/);
    assert.match(page, /initialReel && currentReel\?\.id === initialReel.id && currentReel.is_public === true/);
    assert.match(page, /source_published_at: initialReel.source_published_at/);
    assert.match(page, /ogImage=\{watchMetadata.image/);
});
test('feed metadata makes no video claim', () => {
    const data = reelMetadata(null);
    assert.equal(data.canonical, '/hub/reels');
    assert.equal(data.schema, null);
});
