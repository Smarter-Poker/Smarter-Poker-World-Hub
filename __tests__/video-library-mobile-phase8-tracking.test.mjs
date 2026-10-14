import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createWatchTrackingSession, watchResumeSeconds } from '../src/lib/videoLibraryWatchTracking.mjs';
import { playbackMessage } from '../src/lib/videoLibraryPlayback.mjs';
import { createVideoLibraryOwnerScope } from '../src/lib/videoLibraryOwnerScope.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
    let time = 0;
    const writes = [];
    const statuses = [];
    const session = createWatchTrackingSession({ now: () => time, durationSeconds: 600,
        persist: async (seconds, position) => { writes.push({ seconds, position }); return { watch_duration_seconds: seconds, progress_seconds: position }; },
        lifecyclePersist: async (seconds, position) => { writes.push({ seconds, position, lifecycle: true }); return true; },
        onStatus: value => statuses.push(value), ...options });
    return { session, writes, statuses, advance: ms => { time += ms; } };
}

test('only actual playing time accrues; seeking and paused/buffering time never become watch credit', async () => {
    const f = fixture();
    f.session.receive({ event: 'infoDelivery', info: { currentTime: 500 } });
    f.advance(20000);
    await f.session.heartbeat();
    assert.equal(f.writes.length, 0);
    f.session.receive({ event: 'infoDelivery', info: { playerState: 1, currentTime: 500 } });
    f.advance(12000);
    f.session.receive({ event: 'infoDelivery', info: { currentTime: 590 } });
    f.session.receive({ event: 'onStateChange', info: 2 });
    await settle();
    assert.deepEqual(f.writes, [{ seconds: 12, position: 590 }]);
    f.advance(90000);
    await f.session.heartbeat();
    assert.equal(f.writes.length, 1);
    f.session.receive({ event: 'onStateChange', info: 3 });
    f.advance(20000);
    await f.session.heartbeat();
    assert.equal(f.writes.length, 1);
});

test('partial provider snapshots preserve play state but reject coerced or invalid states', async () => {
    const f = fixture();
    f.session.receive({ event: 'infoDelivery', info: { playerState: '1', currentTime: 20 } });
    f.advance(10000); await f.session.heartbeat(); assert.equal(f.writes.length, 0);
    f.session.receive({ event: 'infoDelivery', info: { playerState: 1, currentTime: 20 } });
    f.advance(5000);
    f.session.receive({ event: 'infoDelivery', info: { currentTime: 25 } });
    f.advance(5000); await f.session.heartbeat();
    assert.deepEqual(f.writes, [{ seconds: 10, position: 25 }]);
});

test('hidden time is excluded; lifecycle sends one distinct segment and visibility resumes counting', async () => {
    const f = fixture();
    f.session.receive({ event: 'onStateChange', info: 1 }); f.advance(6000);
    f.session.visibility(false); await settle();
    f.advance(60000); await f.session.heartbeat();
    f.session.visibility(false); await settle();
    assert.deepEqual(f.writes, [{ seconds: 6, position: 0, lifecycle: true }]);
    f.session.visibility(true); f.advance(7000); await f.session.heartbeat();
    assert.equal(f.writes[1].seconds, 7);
    assert.equal(f.statuses.find(value => value.status === 'submitted').savedSeconds, undefined);
});

test('server-confirmed totals win over local time and unknown transport is not replayed', async () => {
    const f = fixture({ persist: async () => ({ watch_duration_seconds: 2, progress_seconds: 80 }) });
    f.session.receive({ event: 'onStateChange', info: 1 }); f.advance(15000); await f.session.heartbeat();
    assert.deepEqual(f.statuses.at(-1), { status: 'saved', savedSeconds: 2, savedPositionSeconds: 80 });
    let requests = 0;
    const failed = fixture({ persist: async () => { requests++; throw new Error('Offline'); } });
    failed.session.receive({ event: 'onStateChange', info: 1 }); failed.advance(15000); await failed.session.heartbeat();
    await failed.session.heartbeat();
    assert.equal(requests, 1); assert.equal(failed.statuses.at(-1).status, 'error');
});

test('concurrent saves and stale account responses cannot double-submit or change current personal state', async () => {
    let current = true;
    let finish;
    let requests = 0;
    const f = fixture({ isCurrent: () => current, persist: () => { requests++; return new Promise(resolve => { finish = resolve; }); } });
    f.session.receive({ event: 'onStateChange', info: 1 }); f.advance(15000);
    const first = f.session.heartbeat(); await f.session.heartbeat(); assert.equal(requests, 1);
    current = false;
    finish({ watch_duration_seconds: 15, progress_seconds: 15 }); await first;
    assert.equal(f.statuses.at(-1).status, 'saving');
    f.advance(15000); await f.session.heartbeat(); assert.equal(requests, 1);
});

test('subsecond segments survive pauses; provider error stops tracking and close is idempotent', async () => {
    const f = fixture();
    f.session.receive({ event: 'onStateChange', info: 1 }); f.advance(500);
    f.session.receive({ event: 'onStateChange', info: 2 }); await settle();
    f.session.receive({ event: 'onStateChange', info: 1 }); f.advance(600);
    f.session.receive({ event: 'onError', info: 100 }); await settle();
    assert.equal(f.writes[0].seconds, 1);
    f.advance(30000); await f.session.close(); await f.session.close();
    assert.equal(f.writes.length, 1);
});

test('missing server acknowledgment is an error and cannot manufacture saved progress', async () => {
    const f = fixture({ persist: async () => null });
    f.session.receive({ event: 'onStateChange', info: 1 }); f.advance(15000); await f.session.heartbeat();
    assert.equal(f.statuses.at(-1).status, 'error');
    assert.ok(f.statuses.every(value => value.savedSeconds === undefined));
});

test('resume is bounded and completed videos restart; messages need both actual frame and official origin', () => {
    assert.equal(watchResumeSeconds({ watchedSeconds: 120 }, 600), 120);
    assert.equal(watchResumeSeconds({ watchedSeconds: 590 }, 600), 0);
    assert.equal(watchResumeSeconds({ watchedSeconds: -1 }, 600), 0);
    const frame = {};
    assert.equal(playbackMessage({ source: {}, origin: 'https://www.youtube-nocookie.com', data: { event: 'onStateChange', info: 1 } }, frame), null);
    assert.equal(playbackMessage({ source: frame, origin: 'https://example.com', data: { event: 'onStateChange', info: 1 } }, frame), null);
});

test('canonical hook uses existing owned history and lifecycle services without adding reward rules', () => {
    const source = readFileSync(new URL('../src/hooks/useVideoLibraryWatchTracking.js', import.meta.url), 'utf8');
    assert.match(source, /scopeRef\.current\.activate\(ownerId\)/);
    assert.match(source, /getAuthUserId\(\) === ownerId/);
    assert.match(source, /updateWatchDuration\(ownerId, videoId/);
    assert.match(source, /flushWatchDuration\(videoId/);
    assert.match(source, /playbackMessage\(event, iframeRef\.current\?\.contentWindow\)/);
    assert.doesNotMatch(source, /award_diamonds|claimReward|record_video_watch_session|setSelectedVideo/);
});

const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');
const hookCode = ts.transpileModule(readFileSync(new URL('../src/hooks/useVideoLibraryWatchTracking.js', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, allowJs: true } }).outputText;
function hookFixture() {
    let ownerId = 'owner-a', now = 0, latest;
    const frame = {}, reads = [], writes = [], heartbeats = new Set(), listeners = new Map();
    const window = { addEventListener: (name, fn) => { const values = listeners.get(name) || new Set(); values.add(fn); listeners.set(name, values); }, removeEventListener: (name, fn) => listeners.get(name)?.delete(fn) };
    const document = { ...window, hidden: false };
    const pending = (list, args) => new Promise((resolve, reject) => list.push({ args, resolve, reject }));
    const imports = name => name === 'react' ? React
        : name.endsWith('videoLibraryPlayback.mjs') ? { playbackMessage }
        : name.endsWith('videoLibraryOwnerScope.mjs') ? { createVideoLibraryOwnerScope }
        : name.endsWith('videoLibraryWatchTracking.mjs') ? { watchResumeSeconds, createWatchTrackingSession: options => createWatchTrackingSession({ ...options, now: () => now }) }
        : name.endsWith('authUtils') ? { getAuthUserId: () => ownerId }
        : name.endsWith('videoWatchHistory') ? { getWatchProgress: id => pending(reads, [id]), updateWatchDuration: (...args) => pending(writes, args), flushWatchDuration: async () => true }
        : (() => { throw new Error(`Unexpected Hook Dependency: ${name}`); })();
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'window', 'document', 'setInterval', 'clearInterval', hookCode)(imports, module, module.exports, window, document, fn => { heartbeats.add(fn); return fn; }, fn => heartbeats.delete(fn));
    const iframeRef = { current: { contentWindow: frame } };
    function Probe() { latest = module.exports.default({ iframeRef, video: { videoId: 'ABC123video', title: 'Poker Lesson', durationSeconds: 600 }, ownerId, active: true }); return null; }
    let root;
    act(() => { root = create(React.createElement(Probe)); });
    return { reads, writes, get result() { return latest; },
        async owner(id) { ownerId = id; await act(async () => root.update(React.createElement(Probe))); },
        async read(index, value) { await act(async () => reads[index].resolve(value)); },
        async write(index, value) { await act(async () => writes[index].resolve(value)); },
        async play() { await act(async () => { for (const fn of listeners.get('message') || []) fn({ source: frame, origin: 'https://www.youtube-nocookie.com', data: { event: 'infoDelivery', info: { playerState: 1, currentTime: 25 } } }); }); },
        async heartbeat() { now += 15000; await act(async () => { for (const fn of heartbeats) fn(); }); },
        close() { act(() => root.unmount()); },
    };
}

test('actual hook rejects stale A to B to A history and preserves authoritative save against late initial reads', async () => {
    const h = hookFixture();
    await h.owner('owner-b'); await h.owner('owner-a');
    await h.read(0, new Map([['ABC123video', { watchedSeconds: 99, totalWatchedSeconds: 99 }]]));
    await h.read(1, new Map([['ABC123video', { watchedSeconds: 88, totalWatchedSeconds: 88 }]]));
    assert.equal(h.result.resumeSeconds, 0);
    await h.play(); await h.heartbeat();
    assert.equal(h.writes.length, 1); assert.equal(h.writes[0].args[0], 'owner-a');
    await h.write(0, { watch_duration_seconds: 10, progress_seconds: 25 });
    assert.equal(h.result.status, 'saved'); assert.equal(h.result.savedSeconds, 10);
    await h.read(2, new Map([['ABC123video', { watchedSeconds: 5, totalWatchedSeconds: 5 }]]));
    assert.equal(h.result.status, 'saved'); assert.equal(h.result.savedSeconds, 10); assert.equal(h.result.savedPositionSeconds, 25);
    h.close();
});

test('actual hook clears personal result on logout before an old write completes', async () => {
    const h = hookFixture(); await h.read(0, new Map()); await h.play(); await h.heartbeat();
    await h.owner(null); await h.write(0, { watch_duration_seconds: 15, progress_seconds: 25 });
    assert.equal(h.result.status, 'anonymous'); assert.equal(h.result.savedSeconds, undefined); h.close();
});
