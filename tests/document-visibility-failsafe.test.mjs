import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the WebKit visibility failsafe uses valid keyframe declarations', () => {
  const source = fs.readFileSync(path.join(repo, 'pages/_document.js'), 'utf8');
  const forceVisible = source.match(/@keyframes forceVisible\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';

  assert.match(forceVisible, /visibility:\s*visible/);
  assert.match(forceVisible, /opacity:\s*1/);
  assert.doesNotMatch(
    forceVisible,
    /!important/,
    'CSS ignores !important declarations inside keyframes, leaving the Next.js wrapper blank in WebKit'
  );
});
