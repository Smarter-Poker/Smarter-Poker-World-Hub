#!/usr/bin/env node
/**
 * PUT THE PDF WORKER UNDER public/ SO IT IS SERVED FROM OUR OWN ORIGIN.
 *
 * pdf.js, like tesseract.js, defaults its worker to a CDN. Left alone, a
 * player's tax form would be parsed by code fetched from somebody else's
 * server, and the vault would go down whenever that server did.
 *
 * The obvious webpack idiom does not work here. `new URL('pdfjs-dist/build/
 * pdf.worker.min.mjs', import.meta.url)` fails to build: webpack does not
 * resolve bare package specifiers inside new URL(), only relative ones. So
 * the worker is copied out at build time and referenced by a path we own,
 * exactly like scripts/copy-tesseract-assets.mjs does for the OCR engine.
 *
 * THE VERSION IS IN THE PATH for the same reason it is there: it lets
 * vercel.json serve the file `immutable`, and immutable is what makes a
 * warmed cache usable with no signal.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDFJS_ROOT = path.join(ROOT, 'public', 'pdfjs');

function pdfjsVersion() {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const raw = (pkg.dependencies && pkg.dependencies['pdfjs-dist']) || '';
    const installed = path.join(ROOT, 'node_modules', 'pdfjs-dist', 'package.json');
    // The RESOLVED version, not the range: "^4" in package.json is not a path.
    if (fs.existsSync(installed)) {
        const version = JSON.parse(fs.readFileSync(installed, 'utf8')).version;
        if (/^\d+\.\d+\.\d+$/.test(version)) return version;
    }
    const fallback = String(raw).replace(/^[^0-9]*/, '').trim();
    if (/^\d+\.\d+\.\d+$/.test(fallback)) return fallback;
    console.error(`[copy-pdfjs-assets] cannot determine a pdfjs-dist version (package.json says ${JSON.stringify(raw)})`);
    process.exit(1);
}

export const VERSION = pdfjsVersion();
export const OUT_DIR = `public/pdfjs/${VERSION}`;
const OUT = path.join(PDFJS_ROOT, VERSION);

/** from -> to, relative to node_modules and public/pdfjs/<version>. */
export const ASSETS = [
    ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'],
    ['pdfjs-dist/LICENSE', 'LICENSE.pdfjs.txt'],
];

/** What this adds to public/, measured from node_modules. See the budget check. */
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

function pruneOldVersions() {
    if (!fs.existsSync(PDFJS_ROOT)) return [];
    const removed = [];
    // The rule is simple on purpose: this directory holds exactly the version
    // we ship and nothing else. Anything else is either a version we no longer
    // serve or a leftover from a checkout that predates the versioned paths,
    // and both would be deployed and counted against the public budget.
    for (const entry of fs.readdirSync(PDFJS_ROOT, { withFileTypes: true })) {
        if (entry.name === VERSION) continue;
        fs.rmSync(path.join(PDFJS_ROOT, entry.name), { recursive: true, force: true });
        removed.push(entry.name);
    }
    return removed;
}

function run() {
    const modules = path.join(ROOT, 'node_modules');
    if (!fs.existsSync(modules)) {
        console.error('[copy-pdfjs-assets] node_modules is missing; run npm install first');
        process.exit(1);
    }
    const dropped = pruneOldVersions();
    fs.mkdirSync(OUT, { recursive: true });

    let bytes = 0;
    let copied = 0;
    for (const [from, to] of ASSETS) {
        const src = path.join(modules, from);
        const dest = path.join(OUT, to);
        if (!fs.existsSync(src)) {
            // A missing worker is a vault that spins forever on a PDF, which
            // is worse than a red deploy.
            console.error(`[copy-pdfjs-assets] missing ${from}. Reading a PDF would fall back to a CDN or fail.`);
            process.exit(1);
        }
        const stat = fs.statSync(src);
        bytes += stat.size;
        if (fs.existsSync(dest) && fs.statSync(dest).size === stat.size) continue;
        fs.copyFileSync(src, dest);
        copied += 1;
    }

    console.log(`[copy-pdfjs-assets] ${ASSETS.length} assets in ${OUT_DIR} (${(bytes / (1024 * 1024)).toFixed(1)} MB on disk, ${copied} newly copied).`);
    if (dropped.length) console.log(`[copy-pdfjs-assets] removed stale pdf.js versions: ${dropped.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
