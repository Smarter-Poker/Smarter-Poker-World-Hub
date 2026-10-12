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
