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
    'pages/api/bankroll/scan-receipt.js',
    'pages/api/bankroll/scan-dealer-document.js',
    'pages/api/poker/ai-hand-reader.js',
    'pages/api/geeves/analyze-screenshot.js',
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
