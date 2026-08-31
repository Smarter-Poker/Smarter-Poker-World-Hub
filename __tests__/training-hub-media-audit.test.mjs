import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('Phase 3 Training Hub media audit is complete and current', () => {
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
