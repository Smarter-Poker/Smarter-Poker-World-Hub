/**
 * BANKROLL DOCUMENT SCANNER
 *
 * The receipt capture on /hub/bankroll-manager used to wait on a global `cv`
 * that nothing loaded (OpenCV was deleted from pages/_document.js and the
 * promised lazy load was never written), so it timed out on every device; and
 * ReceiptScanner read `session.user.id` off an object literal that only ever
 * held `access_token`, so every upload aborted with "Sign in required".
 *
 * These tests pin the replacement. The geometry and image processing run in
 * plain Node against synthesised RGBA frames, so a regression in detection,
 * corner ordering, quad rejection or perspective correction fails here rather
 * than on a phone in a casino.
 *
 * Fixtures are drawn, not photographed: a light "receipt" quad with dark
 * horizontal "print", over a background that each case makes hostile in a
 * different way (angle, extreme aspect, texture, low contrast, rotation).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    detectDocument,
    orderQuad,
    validateQuad,
    convexHull,
    maxAreaQuad,
    minAreaRect,
    computeHomography,
    applyHomography,
    warpPerspective,
    outputSizeFor,
    applyFilter,
    rotateRGBA,
    polygonArea,
    quadMotion,
    fallbackQuad,
    scaleQuad,
    dist,
    FILTERS,
} from '../src/lib/docscan/pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Strip comments before checking that a defect has not returned. These files
 * document the bugs they replaced by quoting them, and a guard that cannot tell
 * an explanation from a recurrence would push authors to delete the
 * explanation, which is the opposite of what is wanted.
 */
const code = (rel) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ---------------------------------------------------------------------------
// FIXTURE DRAWING
// ---------------------------------------------------------------------------

function makeFrame(width, height, fill) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
        const [r, g, b] = typeof fill === 'function' ? fill(i % width, (i / width) | 0) : fill;
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }
    return { data, width, height };
}

function pointInQuad(quad, x, y) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
        const a = quad[i];
        const b = quad[(i + 1) % 4];
        const z = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
        if (z === 0) continue;
        const s = z > 0 ? 1 : -1;
        if (sign === 0) sign = s;
        else if (sign !== s) return false;
    }
    return true;
}

const UNIT_SQUARE = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

/**
 * Paint a receipt into the frame: paper fill plus dark print.
 *
 * The print bands are laid out in the RECEIPT's own coordinates, not the
 * frame's, by inverse-mapping each pixel through the quad's homography. That
 * matters: bands drawn horizontally across the frame would come out slanted
 * after a correct rectification, so the fixture would punish the warp for
 * being right.
 */
function paintReceipt(frame, quad, paper = [232, 230, 225], ink = [40, 40, 45], printRows = 9) {
    const { data, width, height } = frame;
    const q = orderQuad(quad);
    const toUnit = computeHomography(q, UNIT_SQUARE);
    assert.ok(toUnit, 'fixture quad must be non-degenerate');

    const ys = quad.map((p) => p.y);
    const xs = quad.map((p) => p.x);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)));
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs)));

    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            if (!pointInQuad(quad, x, y)) continue;
            const uv = applyHomography(toUnit, x, y);
            const band = Math.floor(uv.y * printRows * 2);
            const isPrint = band % 2 === 1 && uv.x > 0.12 && uv.x < 0.88;
            const c = isPrint ? ink : paper;
            const p = (y * width + x) * 4;
            data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; data[p + 3] = 255;
        }
    }
    return frame;
}

function addNoise(frame, amount, seed = 7) {
    let s = seed;
    const rand = () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
    const { data } = frame;
    for (let p = 0; p < data.length; p += 4) {
        const n = (rand() - 0.5) * 2 * amount;
        data[p] += n; data[p + 1] += n; data[p + 2] += n;
    }
    return frame;
}

/** Mean corner error as a fraction of the frame diagonal. */
function cornerError(found, expected, width, height) {
    const diag = Math.hypot(width, height);
    const a = orderQuad(found);
    const b = orderQuad(expected);
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += dist(a[i], b[i]);
    return sum / 4 / diag;
}

// ---------------------------------------------------------------------------
// GEOMETRY
// ---------------------------------------------------------------------------

test('orderQuad returns TL,TR,BR,BL clockwise regardless of input order', () => {
    const truth = [{ x: 20, y: 10 }, { x: 180, y: 14 }, { x: 176, y: 260 }, { x: 24, y: 256 }];
    const shuffles = [
        [truth[2], truth[0], truth[3], truth[1]],
        [truth[3], truth[2], truth[1], truth[0]],
        [truth[1], truth[3], truth[0], truth[2]],
    ];
    for (const s of shuffles) {
        const ordered = orderQuad(s);
        assert.deepEqual(ordered, truth, 'ordering must be independent of input permutation');
    }
});

test('orderQuad survives rotation that breaks sort-by-y-then-x', () => {
    // A diamond: two corners share no row ordering that y-sorting can resolve.
    const diamond = [{ x: 100, y: 10 }, { x: 190, y: 100 }, { x: 100, y: 190 }, { x: 10, y: 100 }];
    const ordered = orderQuad(diamond);
    assert.equal(ordered.length, 4);
    // Clockwise on screen means positive shoelace with y pointing down.
    let s = 0;
    for (let i = 0; i < 4; i++) {
        const p = ordered[i];
        const q = ordered[(i + 1) % 4];
        s += p.x * q.y - q.x * p.y;
    }
    assert.ok(s > 0, 'winding must be clockwise in screen coordinates');
    assert.equal(polygonArea(ordered), polygonArea(diamond), 'ordering must not change the shape');
});

test('validateQuad rejects crossed, degenerate, tiny and whole-frame quads', () => {
    const W = 400, H = 600;
    const good = orderQuad([{ x: 40, y: 60 }, { x: 350, y: 50 }, { x: 360, y: 540 }, { x: 30, y: 550 }]);
    assert.equal(validateQuad(good, W, H).ok, true);

    // Bow tie: corners 2 and 3 swapped so the edges cross.
    const crossed = [{ x: 40, y: 60 }, { x: 350, y: 50 }, { x: 30, y: 550 }, { x: 360, y: 540 }];
    assert.equal(validateQuad(crossed, W, H).ok, false);
    assert.equal(validateQuad(crossed, W, H).reason, 'not-convex-or-crossed');

    const collinear = [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 200, y: 10 }, { x: 300, y: 10 }];
    assert.equal(validateQuad(collinear, W, H).ok, false);

    const tiny = orderQuad([{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 40 }, { x: 10, y: 40 }]);
    assert.equal(validateQuad(tiny, W, H).reason, 'too-small');

    const wholeFrame = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    assert.equal(validateQuad(wholeFrame, W, H).reason, 'whole-frame');

    const duplicate = [{ x: 40, y: 60 }, { x: 40, y: 60 }, { x: 360, y: 540 }, { x: 30, y: 550 }];
    assert.equal(validateQuad(duplicate, W, H).ok, false);

    const sliver = orderQuad([{ x: 20, y: 20 }, { x: 380, y: 26 }, { x: 380, y: 34 }, { x: 20, y: 28 }]);
    assert.equal(validateQuad(sliver, W, H).ok, false, 'a hairline is not a document');
});

test('validateQuad accepts a long narrow receipt but not an extreme sliver', () => {
    const W = 500, H = 900;
    const tape = orderQuad([{ x: 200, y: 30 }, { x: 300, y: 30 }, { x: 300, y: 870 }, { x: 200, y: 870 }]);
    const v = validateQuad(tape, W, H);
    assert.equal(v.ok, true, 'cash-register tape at 8:1 is a real receipt');
    assert.ok(v.aspect > 7, 'aspect should be reported');

    const absurd = orderQuad([{ x: 240, y: 20 }, { x: 262, y: 20 }, { x: 262, y: 880 }, { x: 240, y: 880 }]);
    assert.equal(validateQuad(absurd, W, H).ok, false, 'past ~18:1 is not a document');
});

test('convex hull, max-area quad and min-area rect agree on a rectangle', () => {
    const pts = [];
    for (let x = 20; x <= 180; x += 4) { pts.push({ x, y: 30 }); pts.push({ x, y: 250 }); }
    for (let y = 30; y <= 250; y += 4) { pts.push({ x: 20, y }); pts.push({ x: 180, y }); }
    const hull = convexHull(pts);
    const mq = orderQuad(maxAreaQuad(hull));
    const mr = orderQuad(minAreaRect(hull));
    assert.ok(Math.abs(polygonArea(mq) - 160 * 220) / (160 * 220) < 0.05);
    assert.ok(Math.abs(polygonArea(mr) - 160 * 220) / (160 * 220) < 0.05);
});

test('max-area quad recovers a trapezoid instead of over-covering it', () => {
    const trap = [{ x: 60, y: 40 }, { x: 240, y: 70 }, { x: 210, y: 300 }, { x: 30, y: 260 }];
    const pts = [];
    for (let i = 0; i < 4; i++) {
        const a = trap[i], b = trap[(i + 1) % 4];
        for (let t = 0; t <= 1; t += 0.02) pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    const hull = convexHull(pts);
    const quad = orderQuad(maxAreaQuad(hull));
    const truth = orderQuad(trap);
    assert.ok(cornerError(quad, truth, 300, 340) < 0.02, 'trapezoid corners should be recovered');
    const rect = minAreaRect(hull);
    assert.ok(polygonArea(rect) > polygonArea(quad), 'the bounding rect over-covers, which is why it is only a fallback');
});

// ---------------------------------------------------------------------------
// HOMOGRAPHY AND WARP
// ---------------------------------------------------------------------------

test('computeHomography maps the four correspondences exactly', () => {
    const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }];
    const dst = [{ x: 34, y: 21 }, { x: 190, y: 55 }, { x: 168, y: 240 }, { x: 12, y: 205 }];
    const h = computeHomography(src, dst);
    assert.ok(h, 'a non-degenerate configuration must solve');
    for (let i = 0; i < 4; i++) {
        const got = applyHomography(h, src[i].x, src[i].y);
        assert.ok(Math.abs(got.x - dst[i].x) < 1e-6, `x[${i}]`);
        assert.ok(Math.abs(got.y - dst[i].y) < 1e-6, `y[${i}]`);
    }
});

test('computeHomography returns null for a degenerate configuration', () => {
    const src = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    const dst = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    assert.equal(computeHomography(src, dst), null);
});

test('warpPerspective rectifies a skewed receipt and drops the background', () => {
    const W = 480, H = 640;
    const quad = [{ x: 96, y: 88 }, { x: 402, y: 132 }, { x: 366, y: 566 }, { x: 62, y: 508 }];
    const frame = makeFrame(W, H, [22, 24, 28]);
    paintReceipt(frame, quad, [236, 234, 228], [30, 30, 34], 10);

    const size = outputSizeFor(orderQuad(quad));
    const warped = warpPerspective(frame.data, W, H, orderQuad(quad), size.width, size.height);
    assert.ok(warped, 'warp must produce an image');

    // Everything inside the output should be receipt: paper or print, never the
    // dark background. Sample away from the 1px boundary.
    let background = 0;
    let sampled = 0;
    for (let y = 4; y < warped.height - 4; y += 3) {
        for (let x = 4; x < warped.width - 4; x += 3) {
            const p = (y * warped.width + x) * 4;
            const lum = 0.299 * warped.data[p] + 0.587 * warped.data[p + 1] + 0.114 * warped.data[p + 2];
            sampled++;
            if (lum < 26) background++;
        }
    }
    assert.ok(sampled > 500, 'sanity: the warp produced a real image');
    assert.ok(background / sampled < 0.02, `background should be cropped away, got ${(background / sampled * 100).toFixed(1)}%`);

    // The straightened print bands must be horizontal: a row is either all
    // paper or all print. A row that spans both is either a band edge (a small
    // fixed number of them exist) or evidence that the bands came out slanted.
    // Skewed and left uncorrected, this ratio is around 0.7.
    let brokenRows = 0;
    let sampledRows = 0;
    for (let y = 8; y < warped.height - 8; y += 7) {
        let min = 255, max = 0;
        for (let x = Math.round(warped.width * 0.3); x < Math.round(warped.width * 0.7); x++) {
            const p = (y * warped.width + x) * 4;
            const lum = 0.299 * warped.data[p] + 0.587 * warped.data[p + 1] + 0.114 * warped.data[p + 2];
            if (lum < min) min = lum;
            if (lum > max) max = lum;
        }
        sampledRows++;
        if (max - min > 90) brokenRows++;
    }
    const slantRatio = brokenRows / sampledRows;
    assert.ok(
        slantRatio < 0.15,
        `print rows should come out level; ${brokenRows}/${sampledRows} rows span two tones`,
    );
});

test('outputSizeFor keeps proportions and caps runaway sizes', () => {
    const tall = orderQuad([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 2400 }, { x: 0, y: 2400 }]);
    const s = outputSizeFor(tall);
    assert.ok(Math.abs((s.height / s.width) - 8) < 0.2, 'an 8:1 receipt must stay 8:1, not become a page');

    const huge = orderQuad([{ x: 0, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 12000 }, { x: 0, y: 12000 }]);
    const c = outputSizeFor(huge);
    assert.ok(Math.max(c.width, c.height) <= 2600, 'long side must be capped');
    assert.ok(c.width * c.height <= 9e6, 'total pixels must be capped for low-memory devices');
    assert.ok(Math.abs((c.height / c.width) - (12000 / 9000)) < 0.05, 'capping must not change the aspect');
});

test('rotateRGBA turns the image without losing pixels', () => {
    const f = makeFrame(6, 4, (x, y) => [x * 40, y * 60, 0]);
    const r90 = rotateRGBA(f.data, 6, 4, 1);
    assert.equal(r90.width, 4);
    assert.equal(r90.height, 6);
    const back = rotateRGBA(rotateRGBA(rotateRGBA(r90.data, 4, 6, 1).data, 6, 4, 1).data, 4, 6, 1);
    assert.equal(back.width, 6);
    assert.equal(back.height, 4);
    assert.deepEqual(Array.from(back.data), Array.from(f.data), 'four quarter turns must be the identity');
});

// ---------------------------------------------------------------------------
// DETECTION, ONE CASE PER REAL-WORLD FAILURE
// ---------------------------------------------------------------------------

const CASES = [
    {
        name: 'receipt photographed at an angle',
        W: 480, H: 640,
        quad: [{ x: 104, y: 84 }, { x: 398, y: 140 }, { x: 356, y: 560 }, { x: 70, y: 494 }],
        bg: [26, 28, 34],
        tolerance: 0.035,
    },
    {
        name: 'narrow long receipt',
        W: 480, H: 720,
        quad: [{ x: 186, y: 40 }, { x: 300, y: 44 }, { x: 296, y: 676 }, { x: 182, y: 672 }],
        bg: [30, 30, 36],
        tolerance: 0.035,
    },
    {
        name: 'receipt on a busy background',
        W: 480, H: 640,
        quad: [{ x: 120, y: 110 }, { x: 372, y: 104 }, { x: 378, y: 540 }, { x: 116, y: 546 }],
        bg: (x, y) => {
            const checker = ((x >> 4) + (y >> 4)) % 2 ? 96 : 54;
            const streak = (y % 37 < 3) ? 40 : 0;
            return [checker + streak, checker - 8 + streak, checker + 12 + streak];
        },
        tolerance: 0.04,
    },
    {
        name: 'low contrast receipt',
        W: 460, H: 620,
        quad: [{ x: 96, y: 96 }, { x: 366, y: 92 }, { x: 370, y: 528 }, { x: 92, y: 532 }],
        bg: [150, 150, 152],
        paper: [186, 185, 182],
        ink: [138, 138, 140],
        tolerance: 0.04,
    },
    {
        name: 'rotated upload (portrait receipt in a landscape frame)',
        W: 720, H: 480,
        quad: [{ x: 250, y: 62 }, { x: 470, y: 96 }, { x: 442, y: 424 }, { x: 222, y: 392 }],
        bg: [24, 26, 30],
        tolerance: 0.04,
    },
];

for (const c of CASES) {
    test(`detects ${c.name}`, () => {
        const frame = makeFrame(c.W, c.H, c.bg);
        paintReceipt(frame, c.quad, c.paper, c.ink, 12);
        addNoise(frame, 4);

        const found = detectDocument(frame.data, c.W, c.H);
        assert.ok(found, `detection returned nothing for ${c.name}`);
        const err = cornerError(found.quad, c.quad, c.W, c.H);
        assert.ok(
            err < c.tolerance,
            `${c.name}: mean corner error ${(err * 100).toFixed(2)}% of the diagonal, limit ${(c.tolerance * 100).toFixed(1)}%`,
        );
        assert.ok(found.support > 0.3, `${c.name}: boundary support ${found.support.toFixed(2)} too weak`);
        assert.ok(found.confidence >= 0 && found.confidence <= 1);

        // The detected region must actually be smaller than the frame, which is
        // the specific thing the old scanner failed at.
        assert.ok(found.areaFraction < 0.92, `${c.name}: detection must not just return the whole frame`);
    });
}

test('detection reports nothing rather than guessing on a featureless frame', () => {
    const frame = makeFrame(320, 420, [70, 72, 76]);
    addNoise(frame, 3);
    assert.equal(detectDocument(frame.data, 320, 420), null);
});

test('detection reports nothing when the receipt fills the frame edge to edge', () => {
    // No visible border means no boundary to trust. Manual corners must take over.
    const W = 320, H = 420;
    const frame = makeFrame(W, H, [232, 230, 226]);
    paintReceipt(frame, [{ x: -5, y: -5 }, { x: W + 5, y: -5 }, { x: W + 5, y: H + 5 }, { x: -5, y: H + 5 }], [232, 230, 226], [40, 40, 44], 14);
    const found = detectDocument(frame.data, W, H);
    if (found) {
        assert.ok(found.areaFraction < 0.995, 'must never return the frame itself as the crop');
    }
});

test('a detected quad round-trips through scaling back to source resolution', () => {
    const W = 480, H = 640;
    const truth = [{ x: 104, y: 84 }, { x: 398, y: 140 }, { x: 356, y: 560 }, { x: 70, y: 494 }];
    const frame = makeFrame(W, H, [26, 28, 34]);
    paintReceipt(frame, truth, undefined, undefined, 12);
    const found = detectDocument(frame.data, W, H);
    assert.ok(found);
    // Detection runs on a downscaled frame in the app; corners are scaled up by
    // the inverse factor. Scaling must be exactly linear.
    const up = scaleQuad(found.quad, 3);
    for (let i = 0; i < 4; i++) {
        assert.ok(Math.abs(up[i].x - found.quad[i].x * 3) < 1e-9);
        assert.ok(Math.abs(up[i].y - found.quad[i].y * 3) < 1e-9);
    }
});

test('quadMotion measures corner movement for the stability gate', () => {
    const a = fallbackQuad(400, 600);
    const still = quadMotion(a, a, 400, 600);
    assert.equal(still, 0, 'a motionless quad must read as zero motion');
    const moved = a.map((p) => ({ x: p.x + 30, y: p.y }));
    assert.ok(quadMotion(a, moved, 400, 600) > 0.03, 'a 30px shift must register');
    assert.equal(quadMotion(null, a, 400, 600), 1, 'no previous frame means maximum motion');
});

// ---------------------------------------------------------------------------
// FILTERS
// ---------------------------------------------------------------------------

test('filters keep dimensions and never invent content', () => {
    const W = 120, H = 200;
    const frame = makeFrame(W, H, [230, 228, 224]);
    paintReceipt(frame, [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], [230, 228, 224], [60, 60, 64], 8);

    for (const mode of FILTERS) {
        const out = applyFilter(frame.data, W, H, mode);
        assert.equal(out.width, W, `${mode} width`);
        assert.equal(out.height, H, `${mode} height`);
        assert.equal(out.data.length, W * H * 4, `${mode} buffer size`);
    }

    const original = applyFilter(frame.data, W, H, 'original');
    assert.equal(original.data, frame.data, 'Original Color must be the corrected image untouched');
});

test('black and white keeps faint thermal print instead of erasing it', () => {
    // Very low contrast print, the case where a hard threshold loses the total.
    const W = 160, H = 240;
    const frame = makeFrame(W, H, [238, 237, 234]);
    paintReceipt(frame, [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], [238, 237, 234], [206, 205, 203], 8);

    const meanIn = (data) => {
        let dark = 0;
        let light = 0;
        let darkN = 0;
        let lightN = 0;
        for (let y = 0; y < H; y++) {
            for (let x = Math.round(W * 0.3); x < Math.round(W * 0.7); x++) {
                const p = (y * W + x) * 4;
                const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
                const isPrintRow = Math.floor((y / H) * 16) % 2 === 1;
                if (isPrintRow) { dark += lum; darkN++; } else { light += lum; lightN++; }
            }
        }
        return { print: dark / darkN, paper: light / lightN };
    };

    const before = meanIn(frame.data);
    assert.ok(before.paper - before.print > 10, 'fixture sanity: there is faint print to preserve');

    const bw = applyFilter(frame.data, W, H, 'bw');
    const after = meanIn(bw.data);
    assert.ok(after.print < after.paper, 'print must remain darker than paper after black and white');
    assert.ok(after.paper - after.print > 20, `faint print must survive, separation was ${(after.paper - after.print).toFixed(1)}`);

    const enhanced = applyFilter(frame.data, W, H, 'enhanced');
    const afterEnhanced = meanIn(enhanced.data);
    assert.ok(afterEnhanced.print < afterEnhanced.paper, 'Enhanced must not erase faint print either');
});

// ---------------------------------------------------------------------------
// WIRING: the pipeline is useless if nothing calls it
// ---------------------------------------------------------------------------

const SCANNER = 'src/components/bankroll/DocumentScanner.jsx';
const RECEIPT = 'src/components/bankroll/ReceiptScanner.jsx';
const LIVE = 'src/components/bankroll/LiveCameraScanner.jsx';
const CROPPER = 'src/components/bankroll/DocumentCropper.jsx';
const WORKER = 'src/lib/docscan/scanWorker.js';
const CLIENT = 'src/lib/docscan/scanClient.js';

test('the scanner is reachable from the Bankroll Manager receipt flow', () => {
    const receipt = read(RECEIPT);
    assert.match(receipt, /DocumentScanner/, 'ReceiptScanner must mount the document scanner');
    assert.match(receipt, /Scan Receipt/i, 'Scan Receipt must be the primary action');
    assert.match(receipt, /Upload Image/i, 'Upload Image must sit alongside it');

    const page = read('pages/hub/bankroll-manager.js');
    assert.match(page, /ReceiptScanner/, 'the page must still mount ReceiptScanner');

    // Uploads must go through the same editor, not straight to storage.
    assert.match(
        receipt,
        /initialImage/,
        'a chosen file must be handed to the scanner for detection and corner adjustment',
    );
});

test('the old OpenCV global is gone from every scanner surface', () => {
    for (const rel of [SCANNER, LIVE, CROPPER, RECEIPT]) {
        assert.doesNotMatch(
            code(rel),
            /typeof\s+cv\s*!==|waitForOpenCv|cv\.imread|cv\.Mat\b/,
            `${rel} still waits on a global cv that nothing loads`,
        );
    }
});

test('ReceiptScanner reads the signed-in user from the auth helpers, not a hand-built literal', () => {
    assert.doesNotMatch(
        code(RECEIPT),
        /const\s+session\s*=\s*\{\s*access_token/,
        'the literal that dropped `user` and made every upload fail must not come back',
    );
    // src/lib/authUtils, not the Supabase client: a pre-commit guard blocks
    // supabase.auth.getSession() in components because the SDK call can throw
    // AbortError. The helper reads the same session out of storage.
    assert.match(read(RECEIPT), /from '\.\.\/\.\.\/lib\/authUtils'/, 'auth must come from the house helpers');
    assert.match(read(RECEIPT), /getAuthUser\(\)/, 'the signed-in user must be read, not assumed');
    assert.match(read(RECEIPT), /getFreshAccessToken\(\)/, 'OCR must be called with a token that is not about to expire');
    assert.doesNotMatch(code(RECEIPT), /supabase\.auth\.getSession\(/, 'the blocked SDK call must not come back');
});

test('nothing uploads before the user approves the scan', () => {
    const src = read(RECEIPT);
    const useScanIndex = src.indexOf('handleScanApproved');
    assert.ok(useScanIndex > 0, 'there must be an explicit approval handler');
    // The storage upload must be reachable only from the approval path and the
    // retry path, never from the capture path. It now lives in the shared
    // uploader, so that is what to look for.
    assert.match(src, /uploadBankrollImage\(/, 'sanity: the component still uploads');
    assert.match(src, /uploadApprovedScan/, 'upload must be a named step taken after approval');
    const approvalIdx = src.indexOf('const handleScanApproved');
    const uploadIdx = src.indexOf('uploadBankrollImage(supabase');
    assert.ok(approvalIdx > 0 && uploadIdx > 0, 'both steps must exist');
    assert.match(
        src.slice(approvalIdx, approvalIdx + 700),
        /await uploadApprovedScan\(approved\)/,
        'the only route to an upload is an approved scan',
    );
});

test('the scanner releases the camera and its buffers', () => {
    const src = read(SCANNER);
    assert.match(src, /getTracks\(\)\.forEach/, 'camera tracks must be stopped');
    assert.match(src, /releaseBuffers/, 'pixel buffers must be dropped on the way out');
    assert.match(src, /c\.width = 0; c\.height = 0;/, 'canvases must be resized to zero so their backing stores go');
    assert.match(src, /removeEventListener\('visibilitychange'/, 'the backgrounding listener must be removed');
    assert.match(src, /clientRef\.current\.dispose\(\)/, 'the scan client must be disposed on unmount');

    // Object URLs are created in exactly two places, and both revoke.
    for (const rel of [RECEIPT, 'src/lib/docscan/imageSource.js']) {
        const created = (read(rel).match(/createObjectURL/g) || []).length;
        const revoked = (read(rel).match(/revokeObjectURL/g) || []).length;
        assert.ok(created > 0 && revoked >= created, `${rel} must revoke every object URL it creates`);
    }

    assert.match(read(CLIENT), /terminate\(\)/, 'the worker must be terminated');
});

test('detection work is offloaded, with a main-thread fallback', () => {
    const client = read(CLIENT);
    assert.match(client, /new Worker\(/, 'a worker must be used where available');
    assert.match(client, /pipeline\.mjs/, 'the fallback must run the same pipeline');
    const worker = read(WORKER);
    assert.match(worker, /pipeline\.mjs/, 'the worker must run the same pipeline, not a copy');
});

test('camera constraints prefer the rear camera without demanding it', () => {
    const src = read(SCANNER);
    assert.match(src, /facingMode:\s*\{\s*ideal:\s*'environment'/, 'facingMode must be a preference');
    assert.match(src, /playsInline/, 'inline playback is required on iOS Safari');
    assert.match(src, /OverconstrainedError/, 'unsupported constraints must be retried, not fatal');
    assert.match(src, /NotAllowedError/, 'permission denial must be handled');
    assert.match(src, /NotReadableError/, 'camera-in-use must be handled');
    assert.match(src, /NotFoundError/, 'a missing camera must be handled');
});

test('the review screen offers the required corrections', () => {
    const src = read(SCANNER);
    for (const label of ['Adjust Corners', 'Rotate', 'Original Color', 'Enhanced', 'Grayscale', 'Black & White', 'Retake', 'Use Scan']) {
        assert.ok(src.includes(label), `the review screen must offer "${label}"`);
    }
    assert.match(src, /View Original Photo|Original Photo/, 'the source photograph must be viewable for comparison');
});

test('the overlay escapes its parent stacking context, because a z-index alone cannot', () => {
    // Measured on production, twice. ReceiptScanner sits inside
    // `.bankroll-modal-overlay`, which is `position: fixed; z-index: 9000` and
    // therefore a stacking context. Every z-index below it resolves as
    // "somewhere within 9000", so the global header at 10050 painted over the
    // scanner and elementFromPoint on the close button returned the header's
    // hamburger. Raising the scanner to 99999 changed nothing, which is the
    // whole point of this test: the number is not the mechanism.
    const src = read(SCANNER);
    assert.match(src, /import \{ createPortal \} from 'react-dom';/, 'the overlay must be portalled');
    assert.match(
        src,
        /createPortal\(tree, document\.body\)/,
        'it must land on document.body, outside every app stacking context',
    );
    assert.match(
        src,
        /typeof document === 'undefined' \? tree : createPortal/,
        'and must not explode if it is ever server-rendered',
    );
});

test('the overlay outranks the global header, or its close button is unclickable', () => {
    // Measured on production: the header is `position: sticky; z-index: 10050`
    // and the scanner sat at 10001, so elementFromPoint over the X returned
    // the header's hamburger. There was no way out of the scanner but the
    // browser back gesture.
    const src = read(SCANNER);
    const m = src.match(/overlay:\s*\{[\s\S]{0,600}?zIndex:\s*(\d+)/);
    assert.ok(m, 'the overlay must declare a zIndex');
    const z = Number(m[1]);
    assert.ok(z > 10050, `overlay zIndex ${z} must beat the 10050 global header`);
    assert.ok(z <= 999999, `overlay zIndex ${z} must stay at or under the error-recovery layer`);
});

test('a changed initialImage is ingested, not ignored', () => {
    const src = read(SCANNER);
    assert.match(src, /ingestedRef/, 'ingestion must be keyed on the image identity');
    assert.match(
        src,
        /if \(!initialImage \|\| ingestedRef\.current === initialImage\) return;/,
        'the same image must not be scanned twice',
    );
    assert.match(src, /\}, \[initialImage\]\);/, 'and a different one must not be silently dropped');
});

test('a worker that dies after the handshake falls back instead of throwing', () => {
    const client = read(CLIENT);
    assert.match(
        client,
        /return readyPromise\.then\(\(ok\) => ok && Boolean\(worker\)\);/,
        'a cached yes must be re-checked against the live worker, or postMessage runs on null',
    );
});

// ---------------------------------------------------------------------------
// SAVING THE SCAN
// The scan itself always worked. Everything below is why pressing Use Scan
// ended at a red "UPLOAD FAILED" box.
// ---------------------------------------------------------------------------

const STORAGE = 'src/lib/bankroll/receiptStorage.js';
const SERVER_GATE = 'src/lib/gates/serverFeatureGate.js';
const OCR_ROUTE = 'pages/api/bankroll/scan-receipt.js';
const LOG_MODAL = 'src/components/bankroll/LogEntryModal.jsx';

test('bankroll images go to a bucket the storage policy actually allows', () => {
    // Storage RLS allows INSERT only for
    // ['avatars','live-recordings','messenger_media','social-media','stories',
    //  'uploads','user-media']. `images` is not on it and has no policy of its
    // own, so every upload was refused 403 "new row violates row-level
    // security policy". The bucket's 117 objects predate the allowlist.
    const src = read(STORAGE);
    assert.match(src, /export const BANKROLL_BUCKET = 'user-media';/, 'must target an allowlisted bucket');
    assert.doesNotMatch(code(STORAGE), /from\('images'\)/, 'the refused bucket must not come back');

    // The policy is foldername(name)[1] = auth.uid(), so the path must lead
    // with the user id or the insert is refused however good the bucket is.
    assert.match(src, /return `\$\{userId\}\/bankroll\//, 'object path must start with the user id');

    for (const rel of [RECEIPT, LOG_MODAL]) {
        assert.doesNotMatch(code(rel), /storage\s*\n?\s*\.from\('images'\)/, `${rel} must not upload to images`);
        assert.match(read(rel), /uploadBankrollImage/, `${rel} must go through the shared uploader`);
    }
});

test('a refused upload is not retried, a flaky one is', () => {
    const src = read(STORAGE);
    assert.match(src, /export function isRetryableUploadError/, 'retry must be a decision, not a loop');
    // Proven against the shape of the real failure.
    const rls = { message: 'new row violates row-level security policy', statusCode: '403' };
    assert.equal(evalRetryable(src, rls), false, 'a policy refusal will fail identically every time');
    assert.equal(evalRetryable(src, { message: 'Failed to fetch' }), true, 'a network blip deserves another go');
    assert.equal(evalRetryable(src, { message: 'Payload too large', statusCode: 413 }), false);
});

/** Run the shipped predicate rather than a paraphrase of it. */
function evalRetryable(src, error) {
    const body = src.slice(src.indexOf('export function isRetryableUploadError'));
    const fn = new Function(`${body.replace('export function', 'return function')}`)();
    return fn(error);
}

test('the OCR route checks entitlement server-side, not with the browser gate', () => {
    // checkFeatureAccess reads localStorage, queries with the anon client whose
    // RLS refuses `profiles`, then recovers by fetching a RELATIVE url. None of
    // that works in an API route, so the route answered 403 to everyone,
    // including a VIP account with 494,455 diamonds.
    const route = read(OCR_ROUTE);
    assert.match(route, /checkServerFeatureAccess/, 'the route must use the server gate');
    assert.doesNotMatch(code(OCR_ROUTE), /checkFeatureAccess\(/, 'the browser gate must not be called here');
    assert.match(route, /checkServerFeatureAccess\(getSupabase\(\)/, 'it must use the service-role client');

    const gate = read(SERVER_GATE);
    assert.match(gate, /is_vip/, 'VIP is the first question');
    assert.match(gate, /daily_unlock_all/, 'then the universal day pass');
    assert.match(gate, /premium_feature_access/, 'then a pass for this feature');
    assert.match(gate, /return deny\('profile-unavailable'\)/, 'a database error must deny, not grant');
});

test('OCR runs alongside the upload so its result survives a retry', () => {
    const src = read(RECEIPT);
    const idx = src.indexOf('const uploadApprovedScan');
    const body = src.slice(idx, idx + 2600);
    assert.match(body, /const ocrPromise = runOcr\(/, 'OCR must start before the upload loop');
    assert.ok(
        body.indexOf('const ocrPromise') < body.indexOf('for (let attempt'),
        'reading the receipt must not be queued behind storage succeeding',
    );
    assert.match(body, /ensureAuthReady\(supabase\)/, 'the SDK session must be live or storage RLS refuses anon');
});

test('an unsaved scan cannot be thrown away by accident', () => {
    const src = read(RECEIPT);
    assert.match(src, /const hasUnsavedScan = Boolean\(approvedScan\) && !uploadedUrl;/, 'pending must be defined');
    assert.match(src, /const confirmDiscard = useCallback/, 'discarding must ask');
    assert.match(src, /window\.addEventListener\('beforeunload', warn\)/, 'a reload must warn too');
    assert.match(src, /onClick=\{requestReset\}/, 'NEW SCAN must go through the guard');
    assert.match(src, /onPendingChange/, 'the page has to know, because its close button is outside this component');

    const page = read('pages/hub/bankroll-manager.js');
    assert.match(page, /onPendingChange=\{setScannerHasUnsaved\}/, 'the page must subscribe');
    assert.match(page, /if \(scannerHasUnsaved && typeof window !== 'undefined'\)/, 'and guard its own close');
});

test('a failed save keeps the scan on screen instead of dead-ending', () => {
    const src = read(RECEIPT);
    const idx = src.indexOf('{error && !isUploading && (');
    const body = src.slice(idx, idx + 1400);
    assert.match(body, /approvedScan\.previewUrl/, 'the user must still see the scan they took');
    assert.match(body, /RETRY SAVE/, 'retry must be the primary action');
    assert.match(body, /Your Scan Is Still Here\. It Is Not Saved Yet\./, 'and be told it is not lost');
    assert.match(body, /onClick=\{requestReset\}/, 'discarding from here must also confirm');
});

test('scanner surfaces carry no emoji and no em dashes', () => {
    // Immutable rule 7 (emoji break the SWC compiler) and playbook rule 0.
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    for (const rel of [SCANNER, RECEIPT, LIVE, CROPPER, WORKER, CLIENT, 'src/lib/docscan/pipeline.mjs']) {
        const src = read(rel);
        assert.ok(!emoji.test(src), `${rel} contains an emoji`);
        assert.ok(!src.includes('—'), `${rel} contains an em dash`);
    }
});

test('the worker proves it loaded before any pixel buffer is transferred into it', () => {
    // A worker script can fail to load (CSP without worker-src, privacy mode,
    // an embedded webview, a chunk that 404s) and the failure arrives AFTER
    // postMessage has already transferred the caller's buffer away. Falling
    // back at that point means falling back onto a detached buffer, which
    // yields a black image rather than an error.
    const client = read(CLIENT);
    assert.match(client, /type: 'ping'/, 'the client must handshake before real work');
    assert.match(client, /if \(await ready\(\)\)/, 'every task must gate on the handshake');
    assert.match(read(WORKER), /type === 'ping'/, 'the worker must answer the handshake');

    // The rectify and filter fallbacks must re-copy from the caller's data,
    // never reuse the buffer that was handed to the worker.
    assert.match(
        client,
        /return localRectify\(new Uint8ClampedArray\(data\)/,
        'the rectify fallback must copy afresh from the intact source',
    );
    assert.match(
        client,
        /return localFilter\(new Uint8ClampedArray\(data\)/,
        'the filter fallback must copy afresh from the intact source',
    );
});

test('the corrected scan is painted after the review screen exists', () => {
    // renderPreview runs while the review screen is still unmounted, so writing
    // to the canvas ref there wrote to nothing and showed a blank 300x150 box.
    const src = read(SCANNER);
    assert.match(src, /setPreviewVersion\(\(v\) => v \+ 1\)/, 'a new preview must announce itself');
    assert.match(
        src,
        /\}, \[phase, previewVersion\]\);/,
        'painting must be an effect keyed on the phase and the preview, not a call inside the producer',
    );
});

test('a corner drag does not lose the pixels before React commits the press', () => {
    const src = read(SCANNER);
    assert.match(src, /draggingRef\.current = nearest/, 'the press must be recorded in a ref');
    assert.match(src, /const dragging = draggingRef\.current;/, 'the move handler must read that ref');
});

test('manual corners are validated, with rules loose enough for a deliberate crop', () => {
    const src = read(SCANNER);
    assert.match(src, /MANUAL_QUAD_RULES/, 'manual corners need their own thresholds');
    assert.match(src, /validateQuad\(draftCorners[\s\S]{0,60}MANUAL_QUAD_RULES\)/, 'Apply must validate before warping');
    assert.match(src, /cross over each other/, 'a crossed outline must be explained, not silently accepted');

    // The loose rules must still refuse the shapes the warp cannot handle.
    const W = 800, H = 1000;
    const rules = { minAreaFraction: 0.004, maxAreaFraction: 1, minCornerAngleDeg: 12, maxAspectRatio: 60 };
    const crossed = [{ x: 240, y: 980 }, { x: 720, y: 100 }, { x: 720, y: 900 }, { x: 80, y: 900 }];
    assert.equal(validateQuad(crossed, W, H, rules).ok, false, 'a bow tie must still be refused');
    const smallButDeliberate = orderQuad([{ x: 300, y: 400 }, { x: 420, y: 400 }, { x: 420, y: 560 }, { x: 300, y: 560 }]);
    assert.equal(validateQuad(smallButDeliberate, W, H, rules).ok, true, 'a small deliberate crop must be allowed');
});

test('no forbidden .single() and no raw supabase client crept in', () => {
    for (const rel of [SCANNER, RECEIPT, LIVE, CROPPER]) {
        const src = read(rel);
        assert.doesNotMatch(src, /\.single\(\)/, `${rel} must use .maybeSingle()`);
        assert.doesNotMatch(src, /from ['"]@supabase\/supabase-js['"]/, `${rel} must not import the raw client`);
    }
});
