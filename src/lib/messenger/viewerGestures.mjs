/*
 * THE ARITHMETIC BEHIND THE PHOTO VIEWER (2026-11-09).
 *
 * Pinch, pan and swipe are easy to write and hard to get right: a zoom that
 * drifts off-centre, a pan that escapes the frame, a swipe that fires while
 * the person is still zooming. The decisions live here as pure functions so
 * they can be tested without a touchscreen, and the component below stays a
 * thin layer of event wiring over them.
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 6;
// A swipe only changes photo when the finger travelled far enough and stayed
// roughly horizontal: a vertical drag is a dismiss gesture, not a page turn.
export const SWIPE_DISTANCE = 56;
export const SWIPE_RATIO = 1.4;

export const clampScale = value =>
    !Number.isFinite(value) ? MIN_SCALE : Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

/** Distance between two active pointers. */
export const pointerDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Midpoint of two pointers — the anchor a pinch zooms about. */
export const pointerMidpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The scale a pinch asks for, relative to the scale it started from. */
export function pinchScale(startDistance, currentDistance, startScale) {
    if (!(startDistance > 0) || !(currentDistance > 0)) return clampScale(startScale);
    return clampScale(startScale * (currentDistance / startDistance));
}

/**
 * Zooming about a point keeps that point still. Without this the image slides
 * away from the fingers, which reads as the viewer fighting you.
 */
export function offsetForScaleAbout(offset, anchor, previousScale, nextScale) {
    const ratio = nextScale / previousScale;
    return {
        x: anchor.x - (anchor.x - offset.x) * ratio,
        y: anchor.y - (anchor.y - offset.y) * ratio,
    };
}

/**
 * A zoomed image may not be dragged past its own edges, so there is never a
 * band of empty backdrop beside it. At or below 1x it is centred and fixed.
 */
export function clampOffset(offset, scale, frame, natural) {
    if (!(scale > 1) || !frame?.width || !frame?.height || !natural?.width || !natural?.height) return { x: 0, y: 0 };
    // The drawn size at 1x: the image is fitted inside the frame.
    const fit = Math.min(frame.width / natural.width, frame.height / natural.height);
    const drawn = { width: natural.width * fit * scale, height: natural.height * fit * scale };
    const slack = {
        x: Math.max(0, (drawn.width - frame.width) / 2),
        y: Math.max(0, (drawn.height - frame.height) / 2),
    };
    return {
        x: Math.min(slack.x, Math.max(-slack.x, offset.x)),
        y: Math.min(slack.y, Math.max(-slack.y, offset.y)),
    };
}

/** A drag only turns the page when it is long enough and clearly sideways. */
export function swipeIntent(dx, dy, scale) {
    if (scale > MIN_SCALE) return 0;                 // a zoomed image pans instead
    if (Math.abs(dx) < SWIPE_DISTANCE) return 0;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return 0;
    return dx < 0 ? 1 : -1;                          // drag left shows the next
}

/** Paging stops at the ends rather than wrapping, which loses your place. */
export function nextIndex(index, step, count) {
    if (!Number.isInteger(count) || count < 1) return 0;
    const target = index + step;
    return Math.min(count - 1, Math.max(0, target));
}

/** A double tap toggles between fitted and a readable zoom. */
export const toggleScale = scale => (scale > MIN_SCALE ? MIN_SCALE : 2.5);
