/**
 * NO ROUTE NAMES A MODEL THAT DOES NOT EXIST
 *
 * Model ids in this repo have been decorative. On 2026-09-08 api.x.ai was
 * asked, one name at a time, with no credential (a missing model answers
 * "Model not found" BEFORE authentication, an existing one asks for a key):
 *
 *   grok-2-vision-latest   Model not found
 *   grok-2-vision-1212     Model not found
 *   grok-2-vision          Model not found
 *   grok-vision-beta       Model not found
 *   grok-beta              Model not found
 *   grok-3, grok-3-mini, grok-3-latest, grok-4, grok-4-fast   exist
 *   grok-imagine-image, grok-2-image-1212 (images endpoint)   exist
 *
 * Two routes posted a dead name straight to api.x.ai and failed every call:
 * /api/bankroll/scan-dealer-document and /api/poker/ai-hand-reader. Routes
 * that go through the shared Grok client survive a dead name only because
 * its MODEL_MAP falls back to grok-3 for anything it does not know.
 *
 * This test refuses a dead name in CODE (comments stripped) anywhere under
 * pages, src and lib, and pins the vision routes to the shared client.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Measured dead on 2026-09-08. Add to this list only after asking the API. */
const DEAD_MODELS = ['grok-2-vision-latest', 'grok-2-vision-1212', 'grok-2-vision', 'grok-vision-beta'];

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'vendor' || entry.name.startsWith('.')) continue;
            walk(full, out);
        } else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) {
            out.push(path.relative(ROOT, full));
        }
    }
    return out;
}

const VISION_ROUTES = [
    'pages/api/poker/ai-hand-reader.js',
    'pages/api/geeves/analyze-screenshot.js',
];

/**
 * Routes that used to be on the list above and are not any more.
 *
 * The two bankroll scanners no longer send an image to anybody. Tesseract
 * runs on the player's own device and these routes parse the text it
 * produced, with rules in src/lib/bankroll/. They are pinned here so a future
 * change cannot quietly put a model back in front of somebody's tax form.
 */
const READERS_WITH_NO_MODEL = [
    'pages/api/bankroll/scan-receipt.js',
    'pages/api/bankroll/scan-dealer-document.js',
];

test('no file under pages, src or lib names a model the API does not have', () => {
    const files = [...walk(path.join(ROOT, 'pages')), ...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'lib'))];
    const offenders = [];
    for (const rel of files) {
        const src = code(rel);
        for (const dead of DEAD_MODELS) {
            if (new RegExp(`['"\`]${dead}['"\`]`).test(src)) offenders.push(`${rel} -> ${dead}`);
        }
    }
    assert.deepEqual(offenders, [], `these would answer "Model not found": ${offenders.join(', ')}`);
});

test('every vision route goes through the shared Grok client, not a raw fetch', () => {
    for (const rel of VISION_ROUTES) {
        const src = code(rel);
        assert.match(src, /getGrokClient\(\)/, `${rel} must use the shared client`);
        assert.doesNotMatch(src, /api\.x\.ai/, `${rel} must not hand-roll the endpoint`);
        assert.match(src, /type: 'image_url'/, `${rel} still sends the image`);
    }
});

test('the bankroll readers send no image and call no model', () => {
    for (const rel of READERS_WITH_NO_MODEL) {
        const src = code(rel);
        assert.doesNotMatch(src, /getGrokClient|api\.x\.ai|image_url|grok-/i, `${rel} must reach no model`);
        assert.doesNotMatch(src, /\bopenai\b|\banthropic\b/i, `${rel} must reach no model`);
        assert.match(src, /body\.text/, `${rel} reads text, not an image`);
    }
});

test('the parsers those readers use are pure: no network, no model, no import at runtime', () => {
    for (const rel of ['src/lib/bankroll/receiptParser.mjs', 'src/lib/bankroll/dealerDocParser.mjs']) {
        const src = code(rel);
        assert.doesNotMatch(src, /\bfetch\s*\(/, `${rel} must not reach the network`);
        assert.doesNotMatch(src, /\bimport\s*\(/, `${rel} must not load anything at runtime`);
        assert.doesNotMatch(src, /grok|openai|anthropic|x\.ai|apiKey|api_key/i, `${rel} must name no model`);
    }
});

test('the OCR engine is served from our own origin, never a CDN', () => {
    const ocr = code('src/lib/docscan/ocr.mjs');
    // tesseract.js defaults every asset to jsdelivr. Left alone it would put
    // a player's tax form through somebody else's CDN and break the day that
    // CDN did.
    assert.match(ocr, /workerPath: `\$\{TESSERACT_BASE\}\/worker\.min\.js`/);
    assert.match(ocr, /corePath: `\$\{TESSERACT_BASE\}\/`/);
    assert.match(ocr, /langPath: `\$\{TESSERACT_BASE\}\/lang`/);
    assert.match(ocr, /export const TESSERACT_BASE = '\/tesseract'/, 'same origin, always');
    assert.doesNotMatch(ocr, /jsdelivr|unpkg|cdn\./i, 'no CDN may appear here');
    // And the assets have to actually be put there, or the scanner spins
    // forever on a phone in a poker room.
    const copy = code('scripts/copy-tesseract-assets.mjs');
    assert.match(copy, /public', 'tesseract'/);
    assert.match(copy, /process\.exit\(1\)/, 'a missing asset must fail the build');
});

test('the engine is generated by the build that actually deploys', () => {
    // `prebuild` alone was not enough and this is why: vercel.json sets an
    // explicit buildCommand that calls `next build` directly. npm never runs
    // the `prebuild` hook for a command it was not asked to run, so on
    // 2026-09-09 the reader shipped to production with every asset missing
    // and /tesseract/worker.min.js answering 404. CI was green throughout.
    //
    // Both are pinned. prebuild is what a developer running `npm run build`
    // gets; the Vercel buildCommand is what a player gets.
    const pkg = JSON.parse(read('package.json'));
    assert.match(pkg.scripts.prebuild, /copy-tesseract-assets\.mjs/, 'a local build must generate it');

    const vercel = JSON.parse(read('vercel.json'));
    assert.ok(vercel.buildCommand, 'vercel.json sets its own buildCommand');
    assert.match(vercel.buildCommand, /copy-tesseract-assets\.mjs/, 'and the deployed build must generate it too');
    // Before `next build`, or next copies a public/ that is not there yet.
    const copyAt = vercel.buildCommand.indexOf('copy-tesseract-assets.mjs');
    const buildAt = vercel.buildCommand.indexOf('next build');
    assert.ok(copyAt >= 0 && buildAt >= 0 && copyAt < buildAt, 'the copy must run BEFORE next build');
});

test('the tax report reads the columns w2g_forms actually has', () => {
    const src = code('pages/api/bankroll/tax-report.js');
    assert.match(src, /amount: f\.gross_amount/, 'gross_amount, not amount');
    assert.match(src, /withheld: f\.withholding_amount/, 'withholding is reported');
    assert.doesNotMatch(src, /parseFloat\(f\.amount\)/, 'w2g_forms has no `amount` column');
});

test('the bankroll bucket accepts what the vault forms accept', () => {
    const migration = read('supabase/migrations/20260908220719_user_media_accepts_pdf_and_heic.sql');
    assert.match(migration, /'application\/pdf'/);
    assert.match(migration, /APPLIED:\s+2026-09-08/);
    const storage = code('src/lib/bankroll/receiptStorage.js');
    assert.match(storage, /if \(!EXTENSIONS\[type\]\)/, 'an unsupported type is refused in words before the bucket refuses it in codes');
    assert.match(storage, /This File Type Is Not Supported/);
});
