/*
 * PINCH, PAN AND SWIPE, WITHOUT A TOUCHSCREEN (2026-11-09).
 *
 * These are easy to write and hard to get right: a zoom that drifts off the
 * fingers, a pan that escapes the frame leaving a band of backdrop, a swipe
 * that fires while someone is still zooming. The decisions are pure functions
 * so each wrong behaviour can be named and pinned.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    MIN_SCALE, MAX_SCALE, SWIPE_DISTANCE, clampScale, clampOffset, nextIndex,
    offsetForScaleAbout, pinchScale, pointerDistance, pointerMidpoint, swipeIntent, toggleScale,
} from '../src/lib/messenger/viewerGestures.mjs';

test('a pinch scales by how far the fingers moved, and never past the limits', () => {
    assert.equal(pinchScale(100, 200, 1), 2);
    assert.equal(pinchScale(200, 100, 2), 1);
    assert.equal(pinchScale(100, 100_000, 1), MAX_SCALE, 'a frantic pinch stops at the maximum');
    assert.equal(pinchScale(100, 1, 1), MIN_SCALE, 'pinching in stops at fitted');
    for (const bad of [0, -5, NaN, undefined]) assert.equal(pinchScale(bad, 200, 1.5), 1.5, 'a bad start distance changes nothing');
    assert.equal(clampScale(NaN), MIN_SCALE);
});

test('zooming keeps the point between the fingers still', () => {
    // Without this the image slides away from the fingers, which reads as the
    // viewer fighting you.
    const anchor = { x: 100, y: 50 };
    assert.deepEqual(offsetForScaleAbout({ x: 0, y: 0 }, anchor, 1, 2), { x: -100, y: -50 });
    assert.deepEqual(offsetForScaleAbout({ x: 0, y: 0 }, anchor, 1, 1), { x: 0, y: 0 }, 'no zoom, no movement');
    assert.deepEqual(pointerMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 }), { x: 5, y: 10 });
    assert.equal(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('a zoomed photo cannot be dragged past its own edges', () => {
    const frame = { width: 400, height: 800 };
    const natural = { width: 400, height: 800 };
    // At 2x the drawn image is twice the frame, so there is exactly half a
    // frame of slack each way.
    assert.deepEqual(clampOffset({ x: 9999, y: 9999 }, 2, frame, natural), { x: 200, y: 400 });
    assert.deepEqual(clampOffset({ x: -9999, y: -9999 }, 2, frame, natural), { x: -200, y: -400 });
    assert.deepEqual(clampOffset({ x: 10, y: -20 }, 2, frame, natural), { x: 10, y: -20 }, 'inside the slack is untouched');
    // Fitted, it is centred and immovable.
    assert.deepEqual(clampOffset({ x: 50, y: 50 }, 1, frame, natural), { x: 0, y: 0 });
    // Nothing known about the image yet: refuse to invent a position.
    assert.deepEqual(clampOffset({ x: 50, y: 50 }, 2, frame, null), { x: 0, y: 0 });
    assert.deepEqual(clampOffset({ x: 50, y: 50 }, 2, null, natural), { x: 0, y: 0 });
});

test('a swipe turns the page only when it is long enough and clearly sideways', () => {
    assert.equal(swipeIntent(-SWIPE_DISTANCE - 1, 0, 1), 1, 'dragging left shows the next photo');
    assert.equal(swipeIntent(SWIPE_DISTANCE + 1, 0, 1), -1, 'dragging right shows the previous');
    assert.equal(swipeIntent(-SWIPE_DISTANCE + 1, 0, 1), 0, 'a short drag is not a swipe');
    assert.equal(swipeIntent(-80, 80, 1), 0, 'a diagonal drag is not a page turn');
    assert.equal(swipeIntent(-200, 0, 2), 0, 'a zoomed photo pans instead of paging');
});

test('paging stops at the ends rather than wrapping, which loses your place', () => {
    assert.equal(nextIndex(0, 1, 3), 1);
    assert.equal(nextIndex(2, 1, 3), 2, 'the last photo stays the last');
    assert.equal(nextIndex(0, -1, 3), 0, 'the first photo stays the first');
    assert.equal(nextIndex(0, 1, 1), 0, 'a lone photo does not page');
    assert.equal(nextIndex(0, 1, 0), 0);
});

test('a double tap toggles between fitted and readable', () => {
    assert.equal(toggleScale(MIN_SCALE), 2.5);
    assert.equal(toggleScale(2.5), MIN_SCALE);
    assert.equal(toggleScale(MAX_SCALE), MIN_SCALE);
});

test('the viewer is wired to the thread, and the thread still owns no viewer', () => {
    const viewer = readFileSync('src/components/messenger/MediaViewer.jsx', 'utf8');
    const bubble = readFileSync('src/components/messenger/MessageBubble.js', 'utf8');

    // Every thread photo advertises itself so the viewer can page through them.
    assert.match(bubble, /\{\.\.\.\{ \[ATTACHMENT_ATTRIBUTE\]: media\.url \}\}/);
    assert.match(bubble, /<MediaViewer url=\{media\.url\} label=\{label\} onClose=/);
    assert.equal(/createPortal/.test(bubble), false, 'the bubble no longer builds its own dialog');
    assert.equal(/window\.open/.test(bubble), false, 'and still never opens a tab');

    // The viewer keeps every promise the earlier one made.
    assert.match(viewer, /aria-modal="true"/);
    assert.match(viewer, /aria-label="Close Photo"/);
    assert.match(viewer, /event\.key === 'Escape'/);
    assert.match(viewer, /document\.body\.style\.overflow = 'hidden'/);
    // Paging by keyboard and by button, and a position readout.
    assert.match(viewer, /event\.key === 'ArrowRight'/);
    assert.match(viewer, /aria-label="Previous Photo"/);
    assert.match(viewer, /aria-label="Next Photo"/);
    // Touch gestures reach the handlers rather than scrolling the page.
    assert.match(viewer, /touchAction: 'none'/);
    assert.match(viewer, /onPointerCancel=/, 'an interrupted gesture must not strand the viewer');
});
