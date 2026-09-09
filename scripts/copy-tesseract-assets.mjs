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
const OUT = path.join(ROOT, 'public', 'tesseract');

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
export const OUT_DIR = 'public/tesseract';

/**
 * What this will add to public/, measured from node_modules.
 *
 * scripts/ci/check-public-budget.mjs asks, because it walks the CHECKOUT and
 * these files are generated. Without this the 14 MB would be deployed on
 * every build and invisible to the ratchet whose entire job is that nothing
 * arrives unnoticed. Returns null when node_modules cannot answer.
 */
export function generatedBytes() {
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

function run() {
    const modules = path.join(ROOT, 'node_modules');
    if (!fs.existsSync(modules)) fail('node_modules is missing; run npm install first');

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
}

// Importing this for its manifest must not copy anything.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
