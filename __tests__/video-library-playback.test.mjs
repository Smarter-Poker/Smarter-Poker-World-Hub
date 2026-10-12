import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addHandMarker, boundedPosition, playbackMessage, timestamp } from '../src/lib/videoLibraryPlayback.mjs';

test('only the current YouTube frame can control playback state', () => {
    const frame = {};
    const event = { source: frame, origin: 'https://www.youtube-nocookie.com', data: '{"event":"onStateChange","info":0}' };
    assert.equal(playbackMessage(event, frame).info, 0);
    assert.equal(playbackMessage({ ...event, source: {} }, frame), null);
    assert.equal(playbackMessage({ ...event, origin: 'https://attacker.example' }, frame), null);
    assert.equal(playbackMessage({ ...event, data: '{' }, frame), null);
    assert.equal(playbackMessage(event, null), null);
});
test('seeking rejects bad positions and clamps beyond the end', () => {
    for (const value of [-1, NaN, Infinity, 'bad']) assert.equal(boundedPosition(value, 90), null);
    assert.equal(boundedPosition(95, 90), 90);
    assert.equal(boundedPosition(20.5, 90), 20.5);
});
test('session hand markers are sorted, bounded, unique and capped', () => {
    assert.deepEqual(addHandMarker([10, 30], 20.8, 100), [10, 20, 30]);
    const markers = [10, 30];
    assert.equal(addHandMarker(markers, 30.9, 100), markers);
    assert.equal(addHandMarker(markers, -2, 100), markers);
    assert.equal(addHandMarker(markers, 20, 0), markers);
    assert.equal(addHandMarker(Array.from({ length: 50 }, (_, i) => i), 60, 100).length, 50);
    assert.deepEqual(addHandMarker([], 102, 100), [100]);
    assert.equal(timestamp(3725), '1:02:05');
    assert.equal(timestamp(65), '1:05');
});

test('saving watch progress cannot change the running iframe start position', async () => {
    const { readFileSync } = await import('node:fs');
    const page = readFileSync(new URL('../pages/hub/video-library.js', import.meta.url), 'utf8');
    const block = page.slice(page.indexOf('    const selectedLearningProgress ='), page.indexOf('    const refreshLibrary ='));
    const resume = new Function('selectedVideo', 'learningProgressByVideo', 'getProgressPercent', 'watchProgress', 'iframeKey', 'playerResumeRef', `${block}\nreturn selectedVideoResumeSeconds;`);
    const video = { id: 'video-a', videoId: 'video-a', duration: '3:20' };
    const progress = new Map([['video-a', { watchedSeconds: 20 }]]);
    const learning = new Map();
    const snapshot = { current: { key: null, seconds: 0 } };
    const percent = () => progress.get('video-a').watchedSeconds / 2;
    assert.equal(resume(video, learning, percent, progress, 1, snapshot), 20);
    progress.set('video-a', { watchedSeconds: 35 });
    assert.equal(resume(video, learning, percent, progress, 1, snapshot), 20, 'a heartbeat must not navigate the iframe');
    assert.equal(resume(video, learning, percent, progress, 2, snapshot), 35, 'a new viewing session resumes saved progress');
    learning.set('video-a', { percent_complete: .5, position_seconds: 100 });
    assert.equal(resume(video, learning, percent, progress, 2, snapshot), 35, 'late study-state refresh must not interrupt playback');
    assert.equal(resume(video, learning, percent, progress, 3, snapshot), 100);
    learning.set('video-a', { percent_complete: .96, position_seconds: 192 });
    assert.equal(resume(video, learning, percent, progress, 3, snapshot), 100, 'completion cannot rewind a playing video');
    assert.equal(resume(video, learning, percent, progress, 4, snapshot), 0, 'a new viewing session restarts a completed video');
});
