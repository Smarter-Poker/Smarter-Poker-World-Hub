// Dan 2026-11-28: the Jarvis photo reader (/api/jarvis/vision-hand-parse,
// screenshot-to-hand vision) is removed. No screen ever called it, and it
// depended on paid vision providers. Keep it gone: no route, no helper, and no
// code that points at the old endpoint.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(name)) yield full;
  }
}

test('the Jarvis photo reader route and its vision helper stay removed', () => {
  for (const file of [
    'pages/api/jarvis/vision-hand-parse.js',
    'pages/api/jarvis/vision-hand-parse.ts',
    'src/lib/ai/handVision.mjs',
  ]) {
    assert.equal(existsSync(join(ROOT, file)), false, `${file} must not exist`);
  }
});

test('no page, component or library calls the removed photo reader endpoint', () => {
  const hits = [];
  for (const top of ['pages', 'src', 'lib', 'components']) {
    const dir = join(ROOT, top);
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      if (readFileSync(file, 'utf8').includes('vision-hand-parse')) hits.push(file.slice(ROOT.length));
    }
  }
  assert.deepEqual(hits, []);
});
