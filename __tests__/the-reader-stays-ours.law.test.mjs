/**
 * THE READER STAYS OURS.
 *
 * Dan's instruction, verbatim and permanent: "NO, WE CAN'T USE ANY AI READERS.
 * THIS NEEDS TO BE SELF CONTAINING AND OUR OWN DETERMINISTIC ENGINE AND
 * READER."
 *
 * It was not a preference. The route this replaced used to post a photograph
 * of a player's receipt - a W-2G, often enough - to a vision model and trust
 * the JSON that came back, and its own header now records what that cost:
 * the same receipt could be read differently twice, the feature died the day a
 * model id was retired (twice in one week), every scan cost money, and a tax
 * form left the building.
 *
 * All of that is fixed. Nothing stops it coming back. The engine is a
 * dynamic import, the parser is a plain module, and any one of a dozen files
 * in this path could grow a fetch to a model endpoint in an afternoon - and
 * it would LOOK like an improvement, because a model really would read a
 * crumpled receipt better than our regexes do on a bad day. That is exactly
 * why the rule has to live in the repo and not in a chat transcript.
 *
 * So this law says the thing the prose cannot enforce:
 *
 *   1. NO HOSTED READER IN THE SCAN PATH. Not a model endpoint, not a vendor
 *      SDK, not a model id. Checked over code with comments stripped, because
 *      the honest explanations of what was removed name all three.
 *   2. THE ENGINE IS SERVED FROM OUR ORIGIN. tesseract.js defaults to unpkg
 *      and jsdelivr; left alone it puts a player's scan one CDN outage away
 *      from broken and leaks the request. Every asset path must be ours.
 *   3. THE PARSER STAYS PURE. It is exercised with no camera and no network,
 *      which is only true while it asks nothing of either.
 *
 * A determinism rule that only holds while someone remembers it is not a rule.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Directories whose every source file is part of reading a player's document. */
const SCAN_DIRS = ['src/lib/docscan', 'src/lib/bankroll'];
/** Individual files in the path that do not live in those directories. */
const SCAN_FILES = [
    'pages/api/bankroll/scan-receipt.js',
    'pages/api/bankroll/scan-dealer-document.js',
    'src/components/bankroll/ReceiptScanner.jsx',
    'src/components/bankroll/DocumentScanner.jsx',
    'src/components/bankroll/LiveCameraScanner.jsx',
    'src/components/bankroll/DealerVault.jsx',
];

const SOURCE = /\.(m?js|jsx|ts|tsx)$/;

function scanPathFiles() {
    const out = [];
    for (const dir of SCAN_DIRS) {
        const abs = join(ROOT, dir);
        assert.ok(existsSync(abs), `${dir} must exist; the scan path moved and this law did not`);
        for (const name of readdirSync(abs)) {
            if (SOURCE.test(name)) out.push(join(abs, name));
        }
    }
    for (const rel of SCAN_FILES) {
        const abs = join(ROOT, rel);
        assert.ok(existsSync(abs), `${rel} must exist; the scan path moved and this law did not`);
        out.push(abs);
    }
    return out;
}

/**
 * Code with comments removed.
 *
 * This matters more here than anywhere else in the repo: the files in this
 * path explain AT LENGTH that they used to send pictures to a vision model and
 * no longer do. Scanning raw text would fire on every one of those honest
 * explanations, and the usual fix - deleting the explanation - is the worst
 * possible outcome for a rule whose whole purpose is to be remembered.
 */
function codeOnly(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n')
        .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
        .join('\n');
}

const FILES = scanPathFiles().map((abs) => ({
    rel: relative(ROOT, abs),
    code: codeOnly(readFileSync(abs, 'utf8')),
}));

test('the scan path exists where this law thinks it does', () => {
    assert.ok(FILES.length >= 12,
        `only ${FILES.length} files found; a law that checks nothing passes for free`);
    for (const needed of ['src/lib/docscan/ocr.mjs', 'src/lib/bankroll/receiptParser.mjs',
        'pages/api/bankroll/scan-receipt.js']) {
        assert.ok(FILES.some((f) => f.rel === needed), `${needed} must be covered`);
    }
});

test('no file in the scan path talks to a hosted model', () => {
    const HOSTS = [
        'api.openai.com', 'api.anthropic.com', 'api.x.ai', 'api.manus.ai',
        'api.manus.im', 'generativelanguage.googleapis.com', 'openrouter.ai',
        'api.mistral.ai', 'api.cohere.ai', 'api.deepseek.com',
    ];
    const offenders = [];
    for (const { rel, code } of FILES) {
        for (const host of HOSTS) {
            if (code.includes(host)) offenders.push(`${rel} -> ${host}`);
        }
    }
    assert.deepEqual(offenders, [], 'a player’s receipt does not leave their device');
});

test('and imports no model vendor SDK', () => {
    const SDKS = [
        'openai', '@anthropic-ai/sdk', '@google/generative-ai',
        '@google-cloud/vision', 'aws-sdk/clients/textract', '@aws-sdk/client-textract',
        'replicate', 'groq-sdk',
    ];
    const offenders = [];
    for (const { rel, code } of FILES) {
        for (const m of code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
            if (SDKS.includes(m[1])) offenders.push(`${rel} -> ${m[1]}`);
        }
    }
    assert.deepEqual(offenders, [], 'the engine is ours; it needs no vendor');
});

test('and names no model, which is how the old reader died twice in one week', () => {
    // A retired model id took the whole feature down. Nothing here may depend
    // on a name someone else controls the lifetime of.
    const MODEL_ID = /['"`](?:gpt-[\w.]+|claude-[\w.-]+|grok-[\w.-]+|gemini-[\w.-]+|o[1-9]-[\w.]+)['"`]/g;
    const offenders = [];
    for (const { rel, code } of FILES) {
        for (const m of code.matchAll(MODEL_ID)) offenders.push(`${rel} -> ${m[0]}`);
    }
    assert.deepEqual(offenders, [], 'a model id is a dependency on someone else’s roadmap');
});

test('the OCR engine is served from our own origin, not a CDN', () => {
    const ocr = FILES.find((f) => f.rel === 'src/lib/docscan/ocr.mjs');
    assert.ok(ocr, 'src/lib/docscan/ocr.mjs must be in the scan path');
    // tesseract.js reaches for unpkg and jsdelivr unless every path is set.
    for (const cdn of ['unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'esm.sh']) {
        assert.ok(!ocr.code.includes(cdn),
            `${cdn} in the engine puts a player’s scan behind someone else’s outage`);
    }
    assert.match(ocr.code, /TESSERACT_BASE\s*=\s*`\/tesseract\//,
        'the asset base must be an absolute path on our own origin');
    for (const key of ['workerPath', 'corePath', 'langPath']) {
        assert.ok(new RegExp(`${key}\\s*:`).test(ocr.code),
            `${key} must be set explicitly; an unset path falls back to the CDN`);
    }
});

test('the parser asks nothing of a camera or a network', () => {
    // This is what lets the reader be tested exhaustively with fixtures, and
    // what makes two reads of one receipt agree.
    const parser = FILES.find((f) => f.rel === 'src/lib/bankroll/receiptParser.mjs');
    assert.ok(parser, 'the parser must be in the scan path');
    for (const forbidden of ['fetch(', 'XMLHttpRequest', 'navigator.', 'getUserMedia', 'import(']) {
        assert.ok(!parser.code.includes(forbidden),
            `receiptParser.mjs must stay pure; found ${forbidden}`);
    }
});
