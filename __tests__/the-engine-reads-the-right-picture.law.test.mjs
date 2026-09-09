/**
 * THE ENGINE READS THE RIGHT PICTURE.
 *
 * The filter chips in DocumentScanner choose what gets SAVED, and the default
 * is 'original' because that is what a person wants to look at. The OCR
 * engine wants the opposite. pipeline.mjs has shipped a `bw` adaptive
 * threshold since the scanner was written, described in its own comment as
 * the one that keeps faint thermal printing, and until 2026-09-09 the reader
 * never saw it.
 *
 * MEASURED, on a receipt with grey thermal ink, a phone shadow across the
 * paper and sensor noise, read by the real engine in a real browser:
 *
 *   raw   engine confidence 66   buy-in null   fee null   total null
 *   bw    engine confidence 94   buy-in 300    fee 40     total 340
 *
 * Every amount on the receipt, lost or found, on that one choice. The
 * classifier still said "tournament" from the words either way, so the raw
 * read produced a confident-looking scan with no money in it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FILTERS, applyFilter } from '../src/lib/docscan/pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ---------------------------------------------------------------------------
// THE RENDITION EXISTS AND DOES SOMETHING
// ---------------------------------------------------------------------------

test('bw is a filter the pipeline actually offers', () => {
    assert.ok(FILTERS.includes('bw'), 'the reader asks for a filter that must exist');
});

test('bw separates ink from paper where a global threshold cannot', () => {
    // The shape of the problem, in pixels: mid-grey ink on a page lit from one
    // side, so the DARKEST PAPER IS DARKER THAN THE LIGHTEST INK. No single
    // cut-off separates them. An adaptive threshold judges each pixel against
    // its own neighbourhood, and that is the whole reason this filter exists.
    const w = 240, h = 160;
    const isInk = (x, y) => (y % 24) >= 8 && (y % 24) < 14 && (x % 24) < 10;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const lit = 250 - 130 * (x / w);
            const v = Math.max(0, lit - (isInk(x, y) ? 70 : 0));
            data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
        }
    }

    const at = (buf, x, y) => buf[(y * w + x) * 4];
    assert.ok(
        at(data, 2, 10) > at(data, 235, 2),
        'the fixture must really be unthresholdable: ink on the lit side is brighter than paper in the shadow',
    );

    const out = applyFilter(new Uint8ClampedArray(data), w, h, 'bw');
    assert.equal(out.width, w);
    assert.equal(out.height, h);

    const mean = (pick) => {
        let sum = 0; let n = 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (pick(x, y)) { sum += at(out.data, x, y); n += 1; }
            }
        }
        return Math.round(sum / n);
    };
    const ink = mean((x, y) => isInk(x, y));
    const paper = mean((x, y) => !isInk(x, y));

    // Measured: the raw gap is 66 and the binarized gap is 177. Anything above
    // 120 means the illumination has been divided out rather than smeared.
    assert.ok(paper - ink > 120, `ink ${ink} and paper ${paper} are not separated`);
    // And separated EVERYWHERE, not just on the lit half.
    assert.ok(at(out.data, 16, 2) - at(out.data, 2, 10) > 80, 'not separated on the lit side');
    assert.ok(at(out.data, 232, 2) - at(out.data, 218, 106) > 80, 'not separated in the shadow');
});

test('bw is not the same picture back', () => {
    const w = 40, h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
        const v = 90 + ((i / 4) % 60);
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
    const before = Array.from(data);
    const out = applyFilter(new Uint8ClampedArray(data), w, h, 'bw');
    assert.notDeepEqual(Array.from(out.data), before);
    // And 'original' IS the same picture back, which is what makes the
    // default the problem rather than the filter.
    const same = applyFilter(new Uint8ClampedArray(data), w, h, 'original');
    assert.deepEqual(Array.from(same.data), before);
});

// ---------------------------------------------------------------------------
// AND THE READER IS GIVEN IT
// ---------------------------------------------------------------------------

test('the scanner exports a binarized rendition beside the saved one', () => {
    const scanner = code('src/components/bankroll/DocumentScanner.jsx');
    assert.match(scanner, /filter: 'bw'/, 'the second rendition is binarized');
    assert.match(scanner, /onUse\(\{[\s\S]{0,200}ocrBlob,/, 'and handed to the caller');
    // PNG: re-encoding a binarization as JPEG rings every sharp edge, which is
    // the detail the engine reads.
    assert.match(scanner, /'image\/png'/, 'the binarized copy is not re-compressed as JPEG');
    // The user's own choice still decides what is SAVED.
    assert.match(scanner, /const blob = await rgbaToBlob\(preview\.data/);
});

test('a failed second pass never costs the user their scan', () => {
    const scanner = code('src/components/bankroll/DocumentScanner.jsx');
    // To the end of the block, not a fixed count of characters.
    const from = scanner.indexOf("if (filter !== 'bw')");
    assert.ok(from > 0, 'the second pass must exist');
    const block = scanner.slice(from, scanner.indexOf('onUse({', from));
    assert.match(block, /catch \(err\)/, 'the extra pass is guarded');
    assert.match(block, /ocrBlob = blob;/, 'and falls back to the saved rendition');
});

test('the reader reads the binarized copy and storage keeps the chosen one', () => {
    const receipt = code('src/components/bankroll/ReceiptScanner.jsx');
    assert.match(receipt, /runOcr\(scan\.ocrBlob \|\| scan\.blob, accessToken\)/, 'the reader gets the binarized copy');
    assert.match(receipt, /uploadBankrollImage\(supabase, uid, scan\.blob/, 'storage still gets what the user chose');
    // A scanner that predates ocrBlob must still work.
    assert.match(receipt, /scan\.ocrBlob \|\| scan\.blob/);
});

// ---------------------------------------------------------------------------
// THE OTHER TWO THINGS IN THE READ PATH
// ---------------------------------------------------------------------------

test('the dealer vault shrinks the photograph before reading it, like the scanner', () => {
    // A modern phone camera is 4000px on the long side. ReceiptScanner has
    // shrunk its copy since day one; the vault sent the full-resolution image
    // straight to the engine.
    const vault = code('src/components/bankroll/DealerVault.jsx');
    assert.match(vault, /downscaleForOcr\(full, 1600, 0\.85\)/);
    assert.match(vault, /await readText\(forOcr/);
});

test('a small image is handed to the engine untouched', () => {
    // The binarized rendition arrives as a PNG. If downscaleForOcr re-encoded
    // it anyway, the JPEG artefacts would undo the binarisation it was made
    // for. It returns the original when nothing needs shrinking.
    const src = code('src/lib/docscan/imageSource.js');
    assert.match(src, /if \(longest <= maxSide\) \{ bitmap\.close && bitmap\.close\(\); return blob; \}/);
});

test('the engine is fetched before anybody presses anything', () => {
    const ocr = code('src/lib/docscan/ocr.mjs');
    assert.match(ocr, /export function warmOcr/);
    assert.match(ocr, /requestIdleCallback/, 'warming must not compete with the page');
    assert.match(ocr, /getWorker\(\)\.catch\(/, 'and must never throw at the caller');
    const page = code('pages/hub/bankroll-manager.js');
    assert.match(page, /warmOcr\(\);/, 'the bankroll page warms it');
    assert.match(page, /import \{ warmOcr \}/);
});
