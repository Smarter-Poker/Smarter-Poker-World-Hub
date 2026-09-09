/**
 * THE ENGINE WORKS WITH NO SIGNAL.
 *
 * The whole reason for owning the reader is that a poker room has no signal.
 * On 2026-09-09 that was a claim in a commit message and not a fact.
 *
 * Measured against production: warm the cache, go offline, read again.
 *
 *   FAILED after 5 ms: Uncaught NetworkError: Failed to execute
 *   'importScripts' on 'WorkerGlobalScope': the script at
 *   https://smarter.poker/tesseract/worker.min.js failed to load.
 *
 * The cause was one header. Vercel serves public/ as
 * `public, max-age=0, must-revalidate`, and a browser with no network cannot
 * revalidate, so a perfectly good cached engine was unusable. The traineddata
 * survived because tesseract.js keeps it in IndexedDB; the worker and the
 * core did not.
 *
 * `immutable` is only honest if a URL's bytes never change, which is what the
 * version in the path buys. These tests hold the three pieces together: the
 * version the code asks for, the version the build writes, and the header
 * that lets a warmed cache be used with no network.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TESSERACT_VERSION, TESSERACT_BASE, TESSERACT_ASSETS } from '../src/lib/docscan/ocr.mjs';
import { VERSION as COPIED_VERSION, OUT_DIR, ASSETS } from '../scripts/copy-tesseract-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('the version the code asks for is the version the build writes', () => {
    // A mismatch is not cosmetic. It is a 404 for every asset, which is how
    // the reader shipped broken on 2026-09-09.
    assert.equal(TESSERACT_VERSION, COPIED_VERSION);
});

test('and both are the version of the dependency actually installed', () => {
    const pkg = JSON.parse(read('package.json'));
    const declared = String(pkg.dependencies['tesseract.js']).replace(/^[^0-9]*/, '');
    assert.equal(TESSERACT_VERSION, declared, 'bumping tesseract.js must move the constant too');
    const lock = JSON.parse(read('package-lock.json'));
    const locked = lock.packages['node_modules/tesseract.js'];
    assert.ok(locked, 'tesseract.js must be in the lock file');
    assert.equal(locked.version, TESSERACT_VERSION, 'the lock file must agree');
});

test('every asset path carries the version', () => {
    assert.equal(TESSERACT_BASE, `/tesseract/${TESSERACT_VERSION}`);
    for (const [name, url] of Object.entries(TESSERACT_ASSETS)) {
        assert.ok(url.startsWith(`/tesseract/${TESSERACT_VERSION}`), `${name} is not versioned: ${url}`);
    }
    assert.equal(OUT_DIR, `public/tesseract/${TESSERACT_VERSION}`);
});

test('the asset the engine asks for is one the build actually writes', () => {
    // The worker path is spelled out in the code and produced by the script.
    // If either side renamed it the scanner would 404 with nothing to say so.
    const written = ASSETS.map(([, to]) => to);
    const asked = TESSERACT_ASSETS.workerPath.slice(`/tesseract/${TESSERACT_VERSION}/`.length);
    assert.ok(written.includes(asked), `nothing writes ${asked}`);
    assert.ok(written.includes('lang/eng.traineddata.gz'), 'the model must be written');
    // The three cores, because the device picks one at runtime and shipping
    // fewer means the phones that need the others get nothing.
    const cores = written.filter((f) => /^tesseract-core-.*\.wasm\.js$/.test(f));
    assert.equal(cores.length, 3, `expected three cores, got ${cores.join(', ')}`);
});

test('the engine is served immutable, or a warmed cache is useless offline', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const rule = vercel.headers.find((h) => h.source === '/tesseract/(.*)');
    assert.ok(rule, 'no cache rule for the engine: Vercel defaults public/ to max-age=0, must-revalidate');
    const cacheControl = rule.headers.find((h) => /^cache-control$/i.test(h.key));
    assert.ok(cacheControl, 'the rule must set Cache-Control');
    assert.match(cacheControl.value, /\bimmutable\b/, 'a browser with no network cannot revalidate');
    assert.match(cacheControl.value, /max-age=31536000/, 'and must not be asked to, for a year');
    assert.doesNotMatch(cacheControl.value, /must-revalidate|no-cache|max-age=0/,
        'these are the exact directives that broke it');
});

test('immutable is honest: the build never rewrites a path it has served', () => {
    // `immutable` promises the bytes behind a URL never change. That is only
    // true because the version is in the path, so an upgrade writes a new
    // directory rather than replacing files in an old one.
    const copy = read('scripts/copy-tesseract-assets.mjs');
    assert.match(copy, /const OUT = path\.join\(TESSERACT_ROOT, VERSION\)/);
    // And the versions we no longer ship are cleared, or public/ grows by
    // 14 MB with every upgrade and the budget guard eats it.
    assert.match(copy, /function pruneOldVersions/);
    assert.match(copy, /entry\.name === VERSION\) continue/, 'the current version is never pruned');
});

test('the engine still comes from our own origin, never a CDN', () => {
    const ocr = read('src/lib/docscan/ocr.mjs')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(ocr, /jsdelivr|unpkg|cdn\./i);
    assert.match(ocr, /export const TESSERACT_BASE = `\/tesseract\//, 'a root-relative path is same-origin');
});
