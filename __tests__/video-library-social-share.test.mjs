import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { videoLibrarySocialShareId, videoLibrarySocialShareHref, videoLibrarySocialPreview } from '../src/lib/videoLibrarySocialShare.mjs';
import { internalArticlePath, articlePreviewNeedsHydration } from '../src/lib/articlePreviewMetadata.mjs';

test('video share handoff carries only a valid catalog ID, never caller metadata or an external target', () => {
    assert.equal(videoLibrarySocialShareHref({ videoId: 'abcdefghijk', title: 'Forged title', url: 'https://evil.test' }), '/hub/social-media?compose=1&shareVideo=abcdefghijk');
    for (const value of [null, ['abcdefghijk'], '//evil.test', 'abcdefghij/', 'abcdefghijk&compose=0', 'abcdefghijk ']) {
        assert.equal(videoLibrarySocialShareId(value), null);
        assert.equal(videoLibrarySocialShareHref(value), null);
    }
});

test('the share preview requires the requested available catalog row and retains its canonical in-app destination', () => {
    const row = { videoId: 'abcdefghijk', title: 'High Stakes Poker', sourceName: 'PokerGO', thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' };
    const preview = videoLibrarySocialPreview({ success: true, data: [row] }, row.videoId);
    assert.equal(preview.url, 'https://smarter.poker/hub/video-library/watch/abcdefghijk/high-stakes-poker');
    assert.equal(preview.title, row.title);
    assert.equal(preview.description, 'PokerGO');
    assert.equal(preview.type, 'link');
    assert.equal(internalArticlePath(preview.url), '/hub/video-library/watch/abcdefghijk/high-stakes-poker');
    assert.equal(articlePreviewNeedsHydration(preview.url, preview), false);
    for (const payload of [{ success: false, data: [row] }, { success: true, data: [] }, { success: true, data: [{ ...row, videoId: 'zyxwvutsrqp' }] }, { success: true, data: [{ ...row, title: '' }] }]) {
        assert.equal(videoLibrarySocialPreview(payload, row.videoId), null);
    }
});

test('the existing composer prepares a verified editable share without publishing and guards stale/account-switched requests', () => {
    const composer = readFileSync(new URL('../src/components/social/SharedPostCreator.jsx', import.meta.url), 'utf8');
    const effect = composer.slice(composer.indexOf('const videoShareHandledRef'), composer.indexOf('  const [checkInVenue'));
    assert.match(effect, /videoLibrarySocialShareId\(shareVideoId\)/);
    assert.match(effect, /\/api\/video-library\/catalog\?ids=/);
    assert.match(effect, /videoLibrarySocialPreview\(payload, id\)/);
    assert.match(effect, /controller\.abort\(\)/);
    assert.match(effect, /if \(!active\) return/);
    assert.match(effect, /videoShareOwnerRef\.current !== user\?\.id/);
    assert.match(effect, /draft\.media\.length \|\| draft\.uploading/);
    assert.doesNotMatch(effect, /onPost\(|handlePost\(|\.insert\(|\.rpc\(|method: ['"]POST/);
    assert.match(composer, /const _submittingRef = useRef\(false\)/);
    const feed = readFileSync(new URL('../pages/hub/social-media/index.js', import.meta.url), 'utf8');
    assert.match(feed, /shareVideoId=\{router\.query\.shareVideo\}/);
    assert.match(feed, /pathname: '\/hub\/social-media', query: \{ shareVideo: router\.query\.shareVideo \}/);
    assert.match(feed, /encodeURIComponent\(videoLibrarySocialShareHref\(router\.query\.shareVideo\)\)/);
    assert.match(feed, /link_url: linkPreview\.url \|\| urls\[0\]/);
});

function composerShareEffect({ shareVideoId = 'abcdefghijk', draft = {}, owner = 'owner-a', previousOwner = owner } = {}) {
    const source = readFileSync(new URL('../src/components/social/SharedPostCreator.jsx', import.meta.url), 'utf8');
    const start = source.indexOf('  useEffect(() => {', source.indexOf('const videoShareDraftRef'));
    const body = source.slice(start + '  useEffect(() => {'.length, source.indexOf('  }, [shareVideoId, user?.id]);', start));
    let resolveFetch;
    const state = { preview: null, error: null, loading: null, calls: [] };
    const bindings = {
        shareVideoId, user: { id: owner },
        videoShareOwnerRef: { current: previousOwner }, videoShareHandledRef: { current: null },
        videoShareDraftRef: { current: { linkPreview: null, media: [], uploading: false, ...draft } },
        videoLibrarySocialShareId, videoLibrarySocialPreview, AbortController, setTimeout, clearTimeout,
        setLinkPreview: value => { state.preview = typeof value === 'function' ? value(state.preview) : value; },
        setError: value => { state.error = value; }, setLinkLoading: value => { state.loading = value; },
        document: { getElementById: () => ({ scrollIntoView() {} }) },
        fetch: (url, init) => { state.calls.push({ url, init }); return new Promise(resolve => { resolveFetch = resolve; }); },
    };
    const cleanup = new Function(...Object.keys(bindings), body)(...Object.values(bindings));
    return { state, cleanup, resolve: payload => resolveFetch({ ok: true, json: async () => payload }) };
}

const verifiedPayload = { success: true, data: [{ videoId: 'abcdefghijk', title: 'Verified Catalog Video', sourceName: 'PokerGO' }] };
const finishRequest = () => new Promise(resolve => setImmediate(resolve));

test('the actual composer request effect prepares a preview only and refuses unavailable and conflicting attachments', async () => {
    const prepared = composerShareEffect();
    prepared.resolve(verifiedPayload);
    await finishRequest();
    assert.equal(prepared.state.preview.title, 'Verified Catalog Video');
    assert.equal(prepared.state.loading, false);
    assert.equal(prepared.state.calls.length, 1);
    assert.equal(prepared.state.calls[0].init.method, undefined);
    const unavailable = composerShareEffect();
    unavailable.resolve({ success: true, data: [] });
    await finishRequest();
    assert.equal(unavailable.state.preview, null);
    assert.match(unavailable.state.error, /not been published/);
    const draft = composerShareEffect({ draft: { media: [{ url: 'preserved-photo' }] } });
    draft.resolve(verifiedPayload);
    await finishRequest();
    assert.equal(draft.state.preview, null);
    assert.match(draft.state.error, /current post is preserved/);
});

test('the actual composer cleanup aborts and ignores an old response after navigation or account change', async () => {
    const stale = composerShareEffect();
    stale.cleanup();
    assert.equal(stale.state.calls[0].init.signal.aborted, true);
    stale.resolve(verifiedPayload);
    await finishRequest();
    assert.equal(stale.state.preview, null);
    assert.equal(stale.state.error, null);
    const invalid = composerShareEffect({ shareVideoId: ['abcdefghijk'] });
    assert.equal(invalid.state.calls.length, 0);
    assert.match(invalid.state.error, /invalid/);
});
