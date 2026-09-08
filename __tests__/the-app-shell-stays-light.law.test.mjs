/**
 * THE APP SHELL STAYS LIGHT (2026-09-08, BINDING)
 *
 * pages/_app.js is loaded on EVERY page of the estate, so anything it imports
 * statically is paid for by every reader of every surface. On 2026-09-08 its
 * static graph was 127 modules and 1,588 KB of source, and the largest members
 * were not chrome:
 *
 *   solverRanges 71KB, postflopSolverData 65KB, PostflopStrategyEngine 46KB,
 *   useAssistant 51KB, LiveStreamService 71KB
 *
 * The entire GTO solver and the assistant shipped on every page, because
 * _app statically imported JarvisPanel (which renders null until opened) and
 * GlobalPiPManager (null unless a stream is live). Measured 3,985 KB of
 * decoded JS on the social feed, LCP 3.9s, against a page chunk of 252 KB.
 *
 * This law does not cap a byte count - that would be a number to argue with.
 * It names the modules that must never be reachable from the shell's STATIC
 * import graph, and requires the two entry points to stay dynamic.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();

function resolveSpec(spec, from) {
  if (!spec.startsWith('.')) return null;
  const base = normalize(join(dirname(from), spec));
  for (const c of [base, base + '.js', base + '.jsx', base + '.ts', base + '.tsx',
                   join(base, 'index.js'), join(base, 'index.jsx'),
                   join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(join(ROOT, c)) && statSync(join(ROOT, c)).isFile()) return c;
  }
  return null;
}

/** Static imports only: `dynamic(() => import(x))` is deliberately not one. */
function staticImports(file) {
  let src = readFileSync(join(ROOT, file), 'utf8');
  src = src.replace(/dynamic\(\s*\(\)\s*=>\s*import\([^)]*\)/g, 'dynamic(0');
  return [...src.matchAll(/^\s*import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

function shellGraph() {
  const seen = new Set();
  const stack = ['pages/_app.js'];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of staticImports(f)) {
      const r = resolveSpec(spec, f);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return seen;
}

const BANNED = [
  'src/config/solverRanges.js',
  'src/config/postflopSolverData.js',
  'src/engines/PostflopStrategyEngine.js',
  'src/hooks/useAssistant.js',
  'src/services/LiveStreamService.js',
];

test('the solver, the assistant and the stream service are not in the app shell', () => {
  const graph = shellGraph();
  // Control: the shell must contain SOMETHING, or an empty graph passes trivially.
  assert.ok(graph.size > 20, `shell graph has only ${graph.size} modules - the walker is broken`);

  const leaked = BANNED.filter((b) => graph.has(b));
  assert.deepEqual(
    leaked,
    [],
    'these are reachable from pages/_app.js by STATIC import, so every page on the ' +
      'site now downloads them. Import them with next/dynamic instead:\n  ' + leaked.join('\n  ')
  );
});

test('Jarvis and the PiP manager are still loaded dynamically', () => {
  const app = readFileSync(join(ROOT, 'pages/_app.js'), 'utf8');
  assert.match(app, /const JarvisPanel = dynamic\(/,
    'JarvisPanel is static again - it pulls the whole GTO solver into the shell');
  assert.match(app, /const GlobalPiPManager = dynamic\(/,
    'GlobalPiPManager is static again - it pulls LiveStreamService into the shell');
  assert.ok(
    !/^import\s+\{?\s*JarvisPanel/m.test(app),
    'JarvisPanel has a static import as well as a dynamic one'
  );
});

test('the shell graph has not quietly doubled', () => {
  // A ceiling with headroom, not a target. It was 127 modules before this pass
  // and 76 after; this fails long before it is back where it started.
  const graph = shellGraph();
  assert.ok(
    graph.size <= 100,
    `pages/_app.js now reaches ${graph.size} modules statically (was 76 after the ` +
      '2026-09-08 pass, 127 before it). Something heavy was added to the shell - ' +
      'check whether it can be dynamic()'
  );
});
