import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('lint inventory ignores tracked paths removed by the candidate', () => {
  const source = readFileSync('scripts/lint.mjs', 'utf8');
  assert.match(source, /\.filter\(\(file\) => existsSync\(resolve\(ROOT, file\)\)\)/);
  assert.match(source, /git[\s\S]*ls-files[\s\S]*--cached[\s\S]*--others[\s\S]*--exclude-standard/);
  assert.match(source, /statSync\(resolve\(ROOT, file\)\)/);
});
