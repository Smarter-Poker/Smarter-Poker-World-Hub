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

const ROOT = path.resolve(__dirname, '../..');

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

