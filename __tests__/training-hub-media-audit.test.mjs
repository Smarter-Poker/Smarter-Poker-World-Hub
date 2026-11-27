import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('approved Training lobby media audit covers all 107 new scenes and is current', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/training-hub-media-audit.mjs', '--check'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  const result = JSON.parse(output);
  assert.equal(result.success, true);
  assert.equal(result.canonicalGames, 107);
  assert.equal(result.responsiveVariantFiles, 642);
});
