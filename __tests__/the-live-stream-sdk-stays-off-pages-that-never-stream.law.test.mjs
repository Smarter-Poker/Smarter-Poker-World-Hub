/**
 * THE LIVE STREAM SDK STAYS OFF PAGES THAT NEVER STREAM (2026-11-28)
 *
 * _app mounts GlobalPiPManager on every page. It was already dynamic (see
 * the-app-shell-stays-light.law.test.mjs), but its own chunk statically
 * imported LiveStreamService, and with it livekit-client: 527 KB decoded,
 * about 141 KB over the wire, fetched on every World root right after
 * hydration for a widget that renders null unless a stream is live. On
 * 2026-11-28 that chunk was the largest single reason ten World roots failed
 * the mobile JS budget in Global Footer E2E.
 *
 * A stream only exists after GoLiveModal or LiveStreamViewer loaded the
 * service, so the service registers itself in src/services/activeLiveStream.js
 * and the PiP reads it from there.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

function resolveSpec(spec, from) {
  if (!spec.startsWith('.')) return null;
  const base = normalize(join(dirname(from), spec));
  for (const c of [base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, join(base, 'index.js'), join(base, 'index.jsx')]) {
    if (existsSync(join(ROOT, c)) && statSync(join(ROOT, c)).isFile()) return c;
  }
  return null;
}

function staticGraph(entry) {
  const files = new Set();
  const bare = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (files.has(file)) continue;
    files.add(file);
    const src = read(file).replace(/import\(\s*['"][^'"]+['"]\s*\)/g, 'import(0)');
    for (const [, spec] of src.matchAll(/^\s*import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/gm)) {
      const resolved = resolveSpec(spec, file);
      if (resolved) stack.push(resolved);
      else if (!spec.startsWith('.')) bare.add(spec);
    }
  }
  return { files, bare };
}

test('GlobalPiPManager reaches neither LiveStreamService nor livekit-client statically', () => {
  const { files, bare } = staticGraph('src/components/social/GlobalPiPManager.jsx');
  assert.ok(!files.has('src/services/LiveStreamService.js'), 'GlobalPiPManager imports LiveStreamService again');
  assert.ok(![...bare].some((spec) => spec === 'livekit-client' || spec.startsWith('livekit-client/')), 'livekit-client is reachable from GlobalPiPManager');
});

test('the service registers its singleton where the PiP reads it', () => {
  const service = read('src/services/LiveStreamService.js');
  assert.match(service, /import \{ registerLiveStreamService \} from '\.\/activeLiveStream';/);
  assert.match(service, /export const liveStreamService = new LiveStreamService\(\);\s*\nregisterLiveStreamService\(liveStreamService\);/);
  assert.match(read('src/components/social/GlobalPiPManager.jsx'), /getLiveStreamService\(\)/);
});

test('no registered service reads as no stream', async () => {
  const handle = await import('../src/services/activeLiveStream.js');
  assert.equal(handle.getLiveStreamService(), null);
  const fake = { room: {}, currentStreamId: 's1' };
  handle.registerLiveStreamService(fake);
  assert.equal(handle.getLiveStreamService(), fake);
  handle.registerLiveStreamService(null);
  assert.equal(handle.getLiveStreamService(), null);
});
