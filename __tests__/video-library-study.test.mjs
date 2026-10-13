import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { studyDay, summarizeVideoStudy } from '../src/lib/videoLibraryStudy.mjs';
import { rankLearningVideos, chronologicalVideos, learningActions, normalizeSeenIds, organicAnalyticsEligible, searchTerms } from '../src/lib/videoLearningContract.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('reward day follows Chicago midnight and daylight saving', () => {
    assert.equal(studyDay('2026-03-08T05:59:59Z'), '2026-03-07');
    assert.equal(studyDay('2026-03-08T06:00:00Z'), '2026-03-08');
    assert.equal(studyDay('2026-03-09T05:00:00Z'), '2026-03-09');
});
test('streak counts distinct actual credited days and preserves yesterday until today earns', () => {
    const rows = [{ created_at: '2026-10-12T20:00:00Z', amount: 3 }, { created_at: '2026-10-12T21:00:00Z', amount: 7 }, { created_at: '2026-10-11T20:00:00Z', amount: 4 }];
    const pending = summarizeVideoStudy(rows, new Date('2026-10-13T18:00:00Z'));
    assert.equal(pending.currentStreak, 2); assert.equal(pending.studiedToday, false); assert.equal(pending.diamondsToday, 0);
    const earned = summarizeVideoStudy([...rows, { created_at: '2026-10-13T17:00:00Z', amount: 2 }], new Date('2026-10-13T18:00:00Z'));
    assert.equal(earned.currentStreak, 3); assert.equal(earned.diamondsToday, 2); assert.equal(earned.rewardedVideosToday, 1);
    assert.equal(summarizeVideoStudy(rows, new Date('2026-10-14T18:00:00Z')).currentStreak, 0);
});
test('noncredits, malformed and future timestamps never invent earnings', () => {
    const data = summarizeVideoStudy([{ created_at: 'bad', amount: 9 }, { created_at: '2026-10-13T17:00:00Z', amount: -2 }, { created_at: '2026-10-14T17:00:00Z', amount: 50 }], new Date('2026-10-13T18:00:00Z'));
    assert.equal(data.currentStreak, 0); assert.equal(data.diamondsToday, 0);
});
test('long history exposes a lower bound instead of an invented exact streak', () => {
    const now = new Date('2026-10-13T18:00:00Z');
    const rows = Array.from({ length: 390 }, (_, index) => ({ created_at: new Date(Number(now) - index * 86400000).toISOString(), amount: 1 }));
    const data = summarizeVideoStudy(rows, now); assert.equal(data.currentStreak, 366); assert.equal(data.streakAtLeast, true);
});
function loadStatus(user, data = [], fail = false) {
    const calls = [];
    const query = new Proxy({}, { get(_target, key) { if (key === 'then') return resolve => resolve({ data, error: fail ? new Error('Unavailable') : null }); return (...args) => { calls.push([key, ...args]); return query; }; } });
    const source = read('pages/api/video-library/study-status.js').replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace('export default async function handler', 'async function handler');
    const bindings = { getServerUserWithFallback: async () => ({ user }), applyRateLimit: () => true, LIMITS: { read: {} }, channelServerClient: () => ({ from: table => { calls.push(['from', table]); return query; } }), summarizeVideoStudy };
    return { calls, handler: new Function(...Object.keys(bindings), `${source}\nreturn handler;`)(...Object.values(bindings)) };
}
const response = () => ({ code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });
test('status requires authentication and current owner before any ledger read', async () => {
    for (const [user, ownerId, code] of [[null, 'other', 401], [{ id: 'owner' }, 'other', 409]]) {
        const loaded = loadStatus(user); const res = response(); await loaded.handler({ method: 'GET', query: { ownerId } }, res); assert.equal(res.code, code); assert.equal(loaded.calls.length, 0);
    }
});
test('status reads only the verified owner actual video-watch credits and refuses incomplete/error ledgers', async () => {
    const loaded = loadStatus({ id: 'owner' }); const res = response(); await loaded.handler({ method: 'GET', query: { ownerId: 'owner' } }, res);
    assert.equal(res.code, 200); assert.equal(res.data.ownerId, 'owner'); assert.deepEqual(loaded.calls.filter(call => call[0] === 'eq'), [['eq', 'user_id', 'owner'], ['eq', 'transaction_type', 'video_watch']]);
    for (const [rows, fail] of [[[], true], [Array(2000).fill({}), false]]) { const unavailable = loadStatus({ id: 'owner' }, rows, fail); const result = response(); await unavailable.handler({ method: 'GET', query: {} }, result); assert.equal(result.code, 503); }
});
test('recommendations use the actual playback persistence owner and public identity', () => {
    const source = read('pages/api/video-library/discovery.js');
    assert.match(source, /from\('video_watch_history'\)[\s\S]*?eq\('user_id', user.id\)/);
    assert.match(source, /progressById\[item.id\]/); assert.doesNotMatch(source, /progressById\[item.internalVideoId\]/);
    assert.match(source, /if \(user\?\.id && ownerDb\)/);
});
test('actual discovery handler exposes continuation from player-owned public video history', async () => {
    const owner = 'owner';
    const videoId = 'abcdefghijk';
    const calls = [];
    const datasets = { profiles: { id: owner }, video_library_videos: [{ id: 'internal', youtube_video_id: videoId, source_id: 'POKERGO', source_name: 'PokerGO', title: 'Poker Lesson', type: 'cash', duration: '10:00', published_at: new Date().toISOString() }], video_watch_history: [{ video_id: videoId, progress_seconds: 60, duration_seconds: 600 }], video_study_list_items: [] };
    const from = table => {
        const query = new Proxy({}, { get(_target, method) {
            if (method === 'then') return resolve => resolve({ data: datasets[table] });
            return (...args) => { calls.push([table, method, ...args]); return query; };
        } });
        return query;
    };
    const db = { from, rpc: async () => ({ data: [{ video_id: 'internal', rank: 0 }] }) };
    const source = read('pages/api/video-library/discovery.js').replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace('export default async function handler', 'async function handler');
    const bindings = { createClient: () => db, applyRateLimit: () => true, LIMITS: { read: {} }, getServerUserWithFallback: async () => ({ user: { id: owner } }), VIDEO_LIBRARY_ALLOWED_TYPES: ['cash'], isVideoLibraryVideoAllowed: () => true, VIDEO_LIBRARY_POKER_TYPES: ['cash'], cleanVideoTitle: value => value, dedupeVideos: rows => rows, isCuratedFeedVideo: () => true, chronologicalVideos, learningActions, normalizeSeenIds, organicAnalyticsEligible, rankLearningVideos, searchTerms, matchesBrowseFilters: () => true, normalizeBrowseFilters: () => ({}), process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'local-only' } } };
    const handler = new Function(...Object.keys(bindings), `${source}\nreturn handler;`)(...Object.values(bindings));
    const res = response(); await handler({ method: 'GET', headers: { authorization: 'Bearer local-only' }, query: { ownerId: owner } }, res);
    assert.equal(res.code, 200); assert.equal(res.data.ranking.personalized, true); assert.equal(res.data.data[0].learning.continueAtSeconds, 60);
    assert.ok(res.data.data[0].recommendationReasons.includes('Continue where you stopped'));
    assert.ok(calls.some(call => call[0] === 'video_watch_history' && call[1] === 'eq' && call[2] === 'user_id' && call[3] === owner));
});
