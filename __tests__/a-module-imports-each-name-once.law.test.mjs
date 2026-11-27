// ----------------------------------------------------------------------------
// A MODULE IMPORTS EACH NAME ONCE (law, 2026-11-27)
//
// On 2026-11-27 #3131 and #3136 each added an import of `vipCheckoutAnalytics`
// to pages/hub/diamond-store.js, from two different modules. Each pull request
// built on its own; the squash of the second onto the first left the page with
// the same binding declared twice, which is a SyntaxError. Vercel refused the
// production build of 208edab4 (dpl_2DNKZH24erXEh5p31vsMFYak52aJ) and raised
// VercelDeploymentFailed (operational_alert_events 449639) until #3138 removed
// one of them.
//
// This is the cheapest scan that names that state before a build does: every
// tracked source file under pages/, src/, components/ and lib/ is read, its
// top-level `import` statements are parsed, and any local name bound twice
// fails with the file and the name. It runs in `prebuild`, so it gates every
// build (Vercel and Global Footer E2E) with a message instead of a webpack
// stack.
// ----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = /\.(?:js|jsx|mjs|cjs|ts|tsx)$/;
const ROOTS = ['pages/', 'src/', 'components/', 'lib/'];

// Statements that start at column 0 with `import` and end at their module
// specifier. Side-effect imports (`import 'x'`) bind nothing and are skipped.
const IMPORT_STATEMENT = /^import\s+(?!['"])([\s\S]*?)\s+from\s*['"][^'"\n]+['"]/gm;

export function importedBindings(source) {
  const names = [];
  for (const match of source.matchAll(IMPORT_STATEMENT)) {
    let clause = match[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
    if (/^type\s/.test(clause)) continue; // TypeScript type-only import
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      for (const raw of braces[1].split(',')) {
        const spec = raw.trim();
        if (!spec || /^type\s/.test(spec)) continue;
        const local = spec.split(/\s+as\s+/).pop().trim();
        if (local) names.push(local);
      }
      clause = clause.replace(braces[0], '');
    }
    for (const raw of clause.split(',')) {
      const part = raw.trim();
      if (!part) continue;
      const ns = part.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (ns) names.push(ns[1]);
      else if (/^[A-Za-z_$][\w$]*$/.test(part)) names.push(part);
    }
  }
  return names;
}

export function duplicateBindings(source) {
  const seen = new Set();
  const dupes = new Set();
  for (const name of importedBindings(source)) {
    if (seen.has(name)) dupes.add(name);
    seen.add(name);
  }
  return [...dupes];
}

test('the 2026-11-27 diamond-store shape is detected', () => {
  const broken = [
    "import { vipCheckoutAnalytics } from '../../src/lib/store/vipCheckoutAnalytics.mjs';",
    "import React, { useState } from 'react';",
    "import {",
    "  VIP_INTRO_VERIFY_REASON,",
    "  vipCheckoutAnalytics,",
    "} from '../../src/lib/store/vipIntroPrompt.mjs';",
  ].join('\n');
  assert.deepEqual(duplicateBindings(broken), ['vipCheckoutAnalytics']);
  assert.deepEqual(
    duplicateBindings("import a, { b as c } from 'x';\nimport * as d from 'y';\nimport 'z';\nimport type { a } from 't';"),
    [],
  );
  assert.deepEqual(duplicateBindings("import a from 'x';\nimport * as a from 'y';"), ['a']);
});

test('no tracked source module imports the same name twice', () => {
  const files = execFileSync('git', ['ls-files', ...ROOTS], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => SOURCE.test(f) && existsSync(join(ROOT, f)));
  assert.ok(files.length > 500, `expected the source tree, found ${files.length} files`);
  const offenders = [];
  for (const file of files) {
    const dupes = duplicateBindings(readFileSync(join(ROOT, file), 'utf8'));
    if (dupes.length) offenders.push(`${file}: ${dupes.join(', ')}`);
  }
  assert.deepEqual(
    offenders,
    [],
    'A module binds the same imported name twice; the production build refuses it.\n' +
      'Keep one import (usually the newer module) and delete the other.\n' + offenders.join('\n'),
  );
});
