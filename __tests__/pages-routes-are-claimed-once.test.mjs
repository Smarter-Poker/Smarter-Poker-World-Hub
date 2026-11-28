/**
 * Every pages/ route path is claimed by exactly one file.
 * ==============================================================================
 * pages/x.js and pages/x/index.js (or x.js + x.tsx) both resolve to /x. Next 16
 * `next dev` crashes route setup on such a pair (setup-dev-bundler path.relative
 * undefined) and every dynamic route then 404s. Shared page components belong
 * in src/components, not as a second page file under pages/.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = path.join(ROOT, 'pages');
const PAGE_EXT = /\.(js|jsx|ts|tsx|mjs)$/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (PAGE_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

function routeFor(file) {
  const rel = path.relative(PAGES, file).split(path.sep).join('/');
  const route = rel.replace(PAGE_EXT, '').replace(/(^|\/)index$/, '');
  return `/${route}`;
}

test('no pages/** route path is claimed by more than one file', () => {
  const owners = new Map();
  for (const file of walk(PAGES)) {
    const route = routeFor(file);
    owners.set(route, [...(owners.get(route) || []), path.relative(ROOT, file)]);
  }
  const duplicates = [...owners.entries()].filter(([, files]) => files.length > 1);
  assert.deepEqual(
    duplicates,
    [],
    'Route paths claimed twice (move the shared component to src/components):\n  ' +
      duplicates.map(([route, files]) => `${route}: ${files.join(', ')}`).join('\n  '),
  );
});

test('the route mapping treats x.js and x/index.js as the same route', () => {
  assert.equal(routeFor(path.join(PAGES, 'tools/preflop-ranges.js')), '/tools/preflop-ranges');
  assert.equal(routeFor(path.join(PAGES, 'tools/preflop-ranges/index.js')), '/tools/preflop-ranges');
  assert.equal(routeFor(path.join(PAGES, 'index.js')), '/');
});
