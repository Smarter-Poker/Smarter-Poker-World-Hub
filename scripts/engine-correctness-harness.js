/**
 * ENGINE CORRECTNESS HARNESS
 * ---------------------------------------------------------------------------
 * Standalone assertions over the training engines. Every assertion here was
 * written to FAIL against the buggy code first, then to pass after the fix.
 *
 *   node scripts/engine-correctness-harness.js
 *
 * Loads the ESM engine sources through a Babel require-hook so no build step
 * is needed.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const babel = require('@babel/core');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

// -- Babel require hook: transpile project ESM to CJS on the fly ------------
const origJs = Module._extensions['.js'];
Module._extensions['.js'] = function (mod, filename) {
    if (filename.includes('node_modules')) return origJs(mod, filename);
    const code = fs.readFileSync(filename, 'utf8');
    if (!/\b(import|export)\b/.test(code)) return origJs(mod, filename);
    const out = babel.transformSync(code, {
        filename,
        babelrc: false,
        configFile: false,
        sourceType: 'module',
        plugins: [
            require.resolve('@babel/plugin-transform-modules-commonjs'),
        ],
        parserOpts: {
            plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'objectRestSpread'],
        },
    });
    mod._compile(out.code, filename);
};

// -- Tiny assertion runner --------------------------------------------------
let PASS = 0;
let FAIL = 0;
const failures = [];

function check(name, fn) {
    let ok = false;
    let detail = '';
    try {
        const r = fn();
        if (r === true) ok = true;
        else { detail = typeof r === 'string' ? r : 'returned ' + JSON.stringify(r); }
    } catch (e) {
        detail = 'threw: ' + (e && e.message);
    }
    if (ok) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; failures.push(name + ' -- ' + detail); console.log('  FAIL  ' + name + '  [' + detail + ']'); }
}

function section(title) { console.log('\n=== ' + title + ' ==='); }

module.exports = { check, section, ROOT, report };

function report() {
    console.log('\n---------------------------------------------');
    console.log('PASS ' + PASS + '   FAIL ' + FAIL + '   TOTAL ' + (PASS + FAIL));
    if (failures.length) {
        console.log('\nFailures:');
        failures.forEach(f => console.log('  - ' + f));
    }
    return FAIL;
}

// ===========================================================================
// SUITES
// ===========================================================================
require('./harness/suite-position');
require('./harness/suite-scenario');
require('./harness/suite-grading');
require('./harness/suite-ev');

process.exitCode = report() > 0 ? 1 : 0;
