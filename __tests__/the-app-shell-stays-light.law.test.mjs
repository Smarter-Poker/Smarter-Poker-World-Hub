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
  return graphFrom('pages/_app.js');
}

/** The same walk from any entry point, so a PAGE can be measured too. */
function graphFrom(entry) {
  return walk(entry).files;
}

/**
 * Walk the static graph and return BOTH the local files reached and the bare
 * package specifiers reached.
 *
 * The bare set matters: resolveSpec() only resolves relative paths, so a heavy
 * node_modules package is invisible to a file-only check. That hole was real -
 * when this law was proved by breaking it, adding
 * `import { Room } from 'livekit-client'` to liveStreamReads.js left the law
 * GREEN, because the very thing the split exists to keep out was the one thing
 * the walk could not see.
 */
function walk(entry) {
  const files = new Set();
  const bare = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (files.has(f)) continue;
    files.add(f);
    for (const spec of staticImports(f)) {
      const r = resolveSpec(spec, f);
      if (r) {
        if (!files.has(r)) stack.push(r);
      } else if (!spec.startsWith('.')) {
        bare.add(spec);
      }
    }
  }
  return { files, bare };
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

// ═══════════════════════════════════════════════════════════════════════════
// 2026-09-10: the same disease one level down, on the pages themselves.
//
// /hub/social-media shipped 3,076 KB of JS, and 825 KB of it - 27% - was two
// STATIC imports of live-streaming UI:
//
//     import { GoLiveModal }      -> lottie-react     -> a 298 KB Lottie chunk
//     import { LiveStreamViewer } -> LiveStreamService -> livekit-client
//                                                      -> a 527 KB WebRTC chunk
//
// Both render nothing until a reader opens them: GoLiveModal begins
// `if (!isOpen) return null` and LiveStreamViewer sits behind
// `watchingStream &&`. Every one of the 27 uses of the livekit symbols lives
// inside an async method of LiveStreamService, so nothing needed it at import
// time either. Confirmed from the served bundle, not inferred: the 527 KB chunk
// carries RTCPeerConnection x157, LocalParticipant, SignalClient and
// DataPacket, and the 298 KB chunk carries AnimationItem x94 and bodymovin.
// ═══════════════════════════════════════════════════════════════════════════

const STREAMING_PAGES = [
  'pages/hub/social-media/index.js',
  'pages/hub/social-pages/[pageId].js',
];

/** Heavy local leaves that must not be reachable from a page by STATIC import. */
const PAGE_BANNED = [
  'src/components/social/GoLiveModal.jsx',
  'src/components/social/LiveStreamViewer.jsx',
  'src/services/LiveStreamService.js',
];

/**
 * Heavy PACKAGES that must not be reachable either. This is the check that
 * actually defends the split: LiveStreamService could be renamed or wrapped,
 * but the moment any file in a page's static graph imports the SDK the weight
 * is back, whatever the file is called.
 */
const PAGE_BANNED_PACKAGES = ['livekit-client', 'lottie-react'];

test('the live-streaming UI is not statically imported by the pages that list streams', () => {
  const offenders = [];
  for (const page of STREAMING_PAGES) {
    const { files, bare } = walk(page);
    // Control: a page must reach SOMETHING, or an empty graph passes trivially.
    assert.ok(files.size > 10, `${page} reaches only ${files.size} modules - the walker is broken`);
    // Control: the bare-specifier collector must actually collect. Every one of
    // these pages imports react, so an empty bare set means the walk is blind
    // to packages - which is the hole this half of the law exists to close.
    assert.ok(bare.size > 3, `${page} reached only ${bare.size} packages - the bare collector is broken`);
    for (const banned of PAGE_BANNED) {
      if (files.has(banned)) offenders.push(`${page} -> ${banned}`);
    }
    for (const pkg of PAGE_BANNED_PACKAGES) {
      if (bare.has(pkg)) offenders.push(`${page} -> ${pkg} (package)`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'these pages only LIST streams - they call getLiveStreams/getStream - but now ' +
      'reach the streaming UI by static import, so every reader downloads Lottie ' +
      '(298 KB) and the WebRTC SDK (527 KB). Use next/dynamic:\n  ' + offenders.join('\n  ')
  );
});

test('both streaming components are still declared with dynamic() on those pages', () => {
  for (const page of STREAMING_PAGES) {
    const src = readFileSync(join(ROOT, page), 'utf8');
    for (const name of ['GoLiveModal', 'LiveStreamViewer']) {
      assert.match(
        src,
        new RegExp(`const ${name} = dynamic\\(`),
        `${page}: ${name} is no longer dynamic()`
      );
      assert.ok(
        !new RegExp(`^import\\s+\\{[^}]*\\b${name}\\b`, 'm').test(src),
        `${page}: ${name} has a static import as well as a dynamic one`
      );
    }
    assert.match(
      src,
      /^import dynamic from 'next\/dynamic';/m,
      `${page}: uses dynamic() but does not import it - that is a ReferenceError at runtime`
    );
  }
});
