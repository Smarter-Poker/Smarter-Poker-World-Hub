#!/usr/bin/env node
/**
 * Regenerates src/lib/sandbox/equityWorkerSource.js from the `@equity-core`
 * block in src/lib/sandbox/EquityEngine.js.
 *
 *   npm run gen:equity-worker          # rewrite the file
 *   npm run gen:equity-worker -- --check   # exit 1 if it would change (CI)
 *
 * WHY: the worker body has to be a plain string so it can become a Blob URL
 * with no webpack worker config and no /public asset that a basePath or CDN
 * rewrite could 404. That means the Monte Carlo core exists twice, and a stale
 * copy is invisible — Worker-capable browsers would quietly compute the old
 * maths while the sync fallback computes the new. __tests__/equity-worker-
 * parity.test.mjs fails when that happens; this script is the fix it points at.
 *
 * Escaping is produced by JSON.stringify, never by hand — a hand-written
 * template literal silently collapses `\s` in the range-splitting regex to `s`.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'src/lib/sandbox/EquityEngine.js');
const OUT = path.join(ROOT, 'src/lib/sandbox/equityWorkerSource.js');

/** Worker glue appended after the mirrored core. Source of truth lives here. */
const SHIM = [
    '',
    '// ─── worker glue (not part of the mirrored core) ───────────────────────────',
    'self.onmessage = function (event) {',
    '    var msg = event && event.data;',
    "    if (!msg || typeof msg.id !== 'number') return;",
    '    try {',
    "        var result = msg.op === 'runouts'",
    '            ? simulateRunouts(msg.hero, msg.board, msg.sims, msg.range, msg.seed)',
    '            : calculateEquity(msg.hero, msg.board, msg.sims, msg.range, msg.seed);',
    '        self.postMessage({ id: msg.id, ok: true, result: result });',
    '    } catch (err) {',
    '        self.postMessage({ id: msg.id, ok: false, error: String((err && err.message) || err) });',
    '    }',
    '};',
    "self.postMessage({ type: 'ready' });",
    '',
];

const HEADER = `/**
 * equityWorkerSource — GENERATED, DO NOT EDIT BY HAND
 * ═══════════════════════════════════════════════════════════════
 * The Web Worker body for the equity Monte Carlo, kept as a string so it can
 * be turned into a Blob URL at runtime. No webpack config, no new dependency,
 * no /public asset that a basePath or CDN rewrite could 404.
 *
 * This is a verbatim mirror of the code between the \`@equity-core\` sentinels
 * in ./EquityEngine.js, with the \`export\` keywords stripped and a small
 * onmessage shim appended. Regenerate it whenever that block changes:
 *
 *     npm run gen:equity-worker
 *
 * Stored as an array of one-string-per-source-line so diffs stay readable and
 * so escaping (\\\\s in the range-splitting regex, backticks in buildDeck) is
 * produced by JSON.stringify rather than by hand.
 */

`;

function build() {
    const engine = fs.readFileSync(ENGINE, 'utf8');
    const m = engine.match(/\/\* @equity-core:start \*\/\n([\s\S]*?)\n\/\* @equity-core:end \*\//);
    if (!m) {
        console.error('[gen-equity-worker] Could not find the @equity-core sentinels in EquityEngine.js.');
        console.error('  Expected:  /* @equity-core:start */ ... /* @equity-core:end */');
        process.exit(2);
    }

    // Strip `export ` so the worker body is plain script, and drop the blank
    // lines that hug the sentinels.
    const core = m[1]
        .split('\n')
        .map((l) => l.replace(/^(\s*)export\s+/, '$1'));
    while (core.length && core[0].trim() === '') core.shift();
    while (core.length && core[core.length - 1].trim() === '') core.pop();

    if (!core.some((l) => l.includes('function calculateEquity'))) {
        console.error('[gen-equity-worker] The @equity-core block does not define calculateEquity — refusing to write a broken worker.');
        process.exit(2);
    }

    const lines = core.concat(SHIM);
    const body = lines.map((l) => JSON.stringify(l)).join(',\n');
    return `${HEADER}export const EQUITY_WORKER_SOURCE = [\n${body},\n].join('\\n');\n`;
}

const next = build();
const check = process.argv.includes('--check');
const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;

if (current === next) {
    console.log('[gen-equity-worker] up to date.');
    process.exit(0);
}
if (check) {
    console.error('[gen-equity-worker] OUT OF DATE — equityWorkerSource.js does not match the @equity-core block.');
    console.error('  Run: npm run gen:equity-worker');
    process.exit(1);
}
fs.writeFileSync(OUT, next);
console.log(`[gen-equity-worker] wrote ${path.relative(ROOT, OUT)}`);
