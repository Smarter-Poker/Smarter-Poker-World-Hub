#!/usr/bin/env node
/**
 * PUT THE OCR ENGINE UNDER public/ SO IT IS SERVED FROM OUR OWN ORIGIN.
 *
 * tesseract.js defaults every asset path to jsdelivr. Left alone, a player's
 * W-2G would be read by code fetched from somebody else's CDN, and the
 * scanner would go down whenever that CDN did. src/lib/docscan/ocr.mjs points
 * at /tesseract instead, and this script is what puts the files there.
 *
 * It runs in `prebuild`, so Vercel copies them out of node_modules at deploy
 * time. Nothing here is committed: public/tesseract is gitignored, because
 * 15 MB of build output does not belong in a repository.
 *
 * THE THREE CORES ARE NOT A MISTAKE. tesseract.js picks one at runtime from
 * what the device's WebAssembly can do (relaxed SIMD, SIMD, neither). Ship
 * one and the phones that cannot run it get nothing. Each browser downloads
 * exactly one.
 *
 * If this script cannot find a file it FAILS THE BUILD. A missing core is a
 * scanner that spins forever on a phone in a poker room, which is worse than
 * a red deploy.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESSERACT_ROOT = path.join(ROOT, 'public', 'tesseract');

/**
 * The engine version, from the dependency itself, in the URL.
 *
 * Not decoration: it is what makes `immutable` caching safe and therefore
 * what makes the scanner work with no signal. Without a version in the path,
 * /tesseract/worker.min.js means a different file after every upgrade, so it
 * can only be cached with revalidation - and a browser in a poker room cannot
 * revalidate. Measured before this change: a warmed cache, taken offline,
 * failed in 5 ms on importScripts.
 *
 * src/lib/docscan/ocr.mjs carries the same number as a constant, and a law
 * test fails the build if the two ever drift.
 */
function engineVersion() {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const raw = (pkg.dependencies && pkg.dependencies['tesseract.js']) || '';
    const version = String(raw).replace(/^[^0-9]*/, '').trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        console.error(`[copy-tesseract-assets] cannot read a tesseract.js version from package.json (got ${JSON.stringify(raw)})`);
        process.exit(1);
    }
    return version;
}

export const VERSION = engineVersion();
const OUT = path.join(TESSERACT_ROOT, VERSION);

/** from -> to, relative to node_modules and public/tesseract. */
export const ASSETS = [
    ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
    ['tesseract.js/dist/worker.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt'],
    // One of these three loads, chosen by the device. All three must exist.
    ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
    ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
    ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
    ['tesseract.js-core/LICENSE', 'LICENSE.tesseract.js-core.txt'],
    // The English model. `_best_int` is what tesseract.js asks for when the
    // core is LSTM-only, which is the core we load.
    ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];

/** Where these land, relative to the repo root. */
export const OUT_DIR = `public/tesseract/${VERSION}`;

/**
 * What this will add to public/, measured from node_modules.
 *
 * scripts/ci/check-public-budget.mjs asks, because it walks the CHECKOUT and
 * these files are generated. Without this the 14 MB would be deployed on
 * every build and invisible to the ratchet whose entire job is that nothing
 * arrives unnoticed. Returns null when node_modules cannot answer.
 */
export function generatedBytes() {
    // Measured from node_modules, so it is the same answer whether or not the
    // copy has run and whichever version directory it would write into.
    const modules = path.join(ROOT, 'node_modules');
    if (!fs.existsSync(modules)) return null;
    let bytes = 0;
    let files = 0;
    for (const [from] of ASSETS) {
        const src = path.join(modules, from);
        if (!fs.existsSync(src)) return null;
        bytes += fs.statSync(src).size;
        files += 1;
    }
    return { bytes, files };
}

function fail(message) {
    console.error(`[copy-tesseract-assets] ${message}`);
    process.exit(1);
}

/**
 * Remove engine directories for versions we no longer ship.
 *
 * Every one of them would otherwise be deployed and cached forever, and the
 * public/ budget counts them. A browser still holding a cached URL from an old
 * version keeps working from its own cache until the page asks for the new
 * one, so nothing breaks by clearing them here.
 */
function pruneOldVersions() {
    if (!fs.existsSync(TESSERACT_ROOT)) return [];
    const removed = [];
    // The rule is simple on purpose: this directory holds exactly the version
    // we ship and nothing else. Anything else is either a version we no longer
    // serve or a leftover from a checkout that predates the versioned paths,
    // and both would be deployed and counted against the public budget.
    for (const entry of fs.readdirSync(TESSERACT_ROOT, { withFileTypes: true })) {
        if (entry.name === VERSION) continue;
        fs.rmSync(path.join(TESSERACT_ROOT, entry.name), { recursive: true, force: true });
        removed.push(entry.name);
    }
    return removed;
}

function run() {
    const modules = path.join(ROOT, 'node_modules');
    if (!fs.existsSync(modules)) fail('node_modules is missing; run npm install first');

    const dropped = pruneOldVersions();
    fs.mkdirSync(path.join(OUT, 'lang'), { recursive: true });

    let copied = 0;
    let bytes = 0;
    for (const [from, to] of ASSETS) {
        const src = path.join(modules, from);
        const dest = path.join(OUT, to);
        if (!fs.existsSync(src)) fail(`missing ${from}. The OCR engine would fall back to a CDN or fail to start.`);

        const stat = fs.statSync(src);
        // Skip an identical copy so a warm build is instant.
        if (fs.existsSync(dest) && fs.statSync(dest).size === stat.size) {
            bytes += stat.size;
            continue;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        copied += 1;
        bytes += stat.size;
    }

    const mb = (bytes / (1024 * 1024)).toFixed(1);
    console.log(`[copy-tesseract-assets] ${ASSETS.length} assets in ${OUT_DIR} (${mb} MB on disk, ${copied} newly copied).`);
    if (dropped.length) console.log(`[copy-tesseract-assets] removed stale engine versions: ${dropped.join(', ')}`);
}

// Importing this for its manifest must not copy anything.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
