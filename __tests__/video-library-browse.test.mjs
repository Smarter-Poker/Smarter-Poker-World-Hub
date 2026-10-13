import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BROWSE_FILTER_OPTIONS, normalizeBrowseFilter, normalizeBrowseFilters, matchesBrowseFilters, applyBrowseQueryFilters } from '../src/lib/videoLibraryBrowse.mjs';
import { normaliseVideoRow, VIDEO_ROW_FIELDS } from '../src/lib/videoLibraryWatch.mjs';
import { VIDEO_LIBRARY_ALLOWED_TYPES, BLOCKED_VIDEO_LIBRARY_IDS, isVideoLibraryVideoAllowed } from '../src/lib/videoLibraryAvailability.js';
import { VIDEO_LIBRARY_POKER_TYPES, dedupeVideos, isCasinoGameFiledAsPoker, isDisplayableVideoTitle, mixedContentFilter, cleanVideoTitle, isCuratedFeedVideo } from '../src/lib/videoLibraryCuration.mjs';
import { chronologicalVideos, learningActions, normalizeSeenIds, organicAnalyticsEligible, rankLearningVideos, searchTerms } from '../src/lib/videoLearningContract.mjs';

test('browse enums reject query syntax and normalize array/uppercase values', () => {
    assert.equal(normalizeBrowseFilter(['PLO', 'omaha'], 'game'), 'ALL');
    assert.equal(normalizeBrowseFilter(' OMAHA ', 'game'), 'omaha');
    assert.equal(normalizeBrowseFilter('high,title.ilike.%', 'stakes'), 'ALL');
    assert.deepEqual(normalizeBrowseFilters(), { game: 'ALL', stakes: 'ALL', skill: 'ALL' });
    assert.equal(BROWSE_FILTER_OPTIONS.game[0].id, 'ALL');
});

test('every dimension requires explicit published evidence and combines with AND', () => {
    const filters = { game: 'omaha', stakes: 'high', skill: 'advanced' };
    assert.equal(matchesBrowseFilters({ title: 'Advanced High-Stakes PLO5 Strategy' }, filters), true);
    assert.equal(matchesBrowseFilters({ title: 'Poker Masterclass $500/$1000', concepts: ['omaha', 'advanced'], skill: 'advanced' }, filters), false);
    assert.equal(matchesBrowseFilters({ title: 'Poker Lesson', tags: ['PLO', 'High Stakes', 'Advanced'] }, filters), true);
    assert.equal(matchesBrowseFilters({ title: 'Intermediate High Stakes Omaha' }, filters), false);
    assert.equal(matchesBrowseFilters({ title: 'Beginner Low Stakes Holdem' }, { game: 'holdem', stakes: 'low', skill: 'beginner' }), true);
    assert.equal(matchesBrowseFilters({ title: 'PLOtting At The Midstakes' }, { game: 'omaha' }), false);
    assert.equal(matchesBrowseFilters({ title: 'Poker', tags: [null, {}, 3] }, { skill: 'beginner' }), false);
    assert.equal(matchesBrowseFilters({ title: 'Poker' }, {}), true);
});

test('fixed database predicates precede pagination and never include injected input', () => {
    const calls = [];
    const query = { or(value) { calls.push(value); return this; } };
    applyBrowseQueryFilters(query, { game: 'holdem', stakes: 'high', skill: 'advanced' });
    assert.equal(calls.length, 3);
    assert.match(calls[0], /title\.imatch/);
    assert.match(calls[0], /tags\.cs/);
    calls.length = 0;
    applyBrowseQueryFilters(query, { game: 'omaha,title.eq.injected' });
    assert.deepEqual(calls, []);
});

const common = { VIDEO_LIBRARY_ALLOWED_TYPES, BLOCKED_VIDEO_LIBRARY_IDS, isVideoLibraryVideoAllowed,
    VIDEO_LIBRARY_POKER_TYPES, dedupeVideos, isCasinoGameFiledAsPoker, isDisplayableVideoTitle, mixedContentFilter,
    cleanVideoTitle, isCuratedFeedVideo, normaliseVideoRow, VIDEO_ROW_FIELDS, applyBrowseQueryFilters,
    normalizeBrowseFilters, matchesBrowseFilters, chronologicalVideos, learningActions, normalizeSeenIds,
    organicAnalyticsEligible, rankLearningVideos, searchTerms, applyRateLimit: () => true, LIMITS: { read: {} },
    reportApiError: () => {}, getServerUserWithFallback: async () => ({ user: null }) };
function loadHandler(file, createClient) {
    const source = readFileSync(new URL(`../pages/api/video-library/${file}.js`, import.meta.url), 'utf8')
        .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
        .replace('export default async function handler', 'async function handler');
    const bindings = { ...common, createClient, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://local-fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'local-fixture-only' } } };
    return new Function(...Object.keys(bindings), `${source}\nreturn handler;`)(...Object.values(bindings));
}
function response() {
    return { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
}
const row = (id, title) => ({ id, youtube_video_id: id, source_id: 'HCL', source_name: 'Hustler Casino Live', title, type: 'cash',
    duration: '20:00', tags: [], availability_status: 'verified', embeddable: true, availability_checked_at: new Date().toISOString() });

test('catalog handler applies browse predicates before range while preserving safe response filtering', async () => {
    const calls = [];
    const rows = [row('a1234567890', 'Advanced High Stakes PLO Strategy'), row('b1234567890', 'NLH Basics')];
    const query = new Proxy({}, { get(_target, name) {
        if (name === 'then') return undefined;
        return (...args) => { calls.push([name, ...args]); return name === 'range' ? Promise.resolve({ data: rows, count: 1 }) : query; };
    } });
    const handler = loadHandler('catalog', () => ({ from: () => query }));
    const res = response();
    await handler({ method: 'GET', query: { game: 'omaha', stakes: 'high', skill: 'advanced', offset: '30' } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.payload.data.map(video => video.id), ['a1234567890']);
    assert.equal(calls.filter(call => call[0] === 'or' && call[1].includes('title.imatch')).length, 3);
    assert.deepEqual(calls.at(-1), ['range', 30, 59]);
});

test('discovery handler filters candidates before its final result limit', async () => {
    const rows = [row('a1234567890', 'NLH Basics'), row('b1234567890', 'Advanced High Stakes Omaha')];
    const query = { select() { return this; }, in() { return Promise.resolve({ data: rows }); } };
    const handler = loadHandler('discovery', () => ({ rpc: async () => ({ data: rows.map(item => ({ video_id: item.id, rank: 1 })) }), from: () => query }));
    const res = response();
    await handler({ method: 'GET', headers: {}, query: { game: 'omaha', stakes: 'high', skill: 'advanced', limit: '1', mode: 'chronological' } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.payload.data.map(video => video.id), ['b1234567890']);
    assert.equal(res.payload.pagination.total, 1);
});

// Execute the owning shell expression so a q/filter change cannot silently
// recreate the browser component, lose focus, or abort its active request.
test('library query changes preserve the page instance while route changes reset it', async () => {
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const app = readFileSync(new URL('../pages/_app.js', import.meta.url), 'utf8');
  const expression = app.match(/const pageErrorBoundaryKey = ([\s\S]*?);/)[1];
  const key = (resolvedPath, asPath) => runInNewContext(expression, { resolvedPath, router: { asPath } });
  assert.equal(key('/hub/video-library', '/hub/video-library?q=river'), key('/hub/video-library', '/hub/video-library?q=omaha&game=omaha'));
  assert.notEqual(key('/hub/video-library', '/hub/video-library?q=river'), key('/hub/reels', '/hub/reels'));
  assert.notEqual(key('/hub/news', '/hub/news?q=a'), key('/hub/news', '/hub/news?q=b'));
});
