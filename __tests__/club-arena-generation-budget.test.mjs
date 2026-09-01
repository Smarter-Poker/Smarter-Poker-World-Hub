import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('Club Arena budgets current and retained generations independently', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/ci/check-ca-bundle-size.mjs', '--json'],
    { encoding: 'utf8' },
  );
  const jsonEnd = output.indexOf('\n}\n');
  assert.ok(jsonEnd > 0, 'budget command did not emit its JSON report');
  const result = JSON.parse(output.slice(0, jsonEnd + 2));

  assert.deepEqual(result.over, []);
  assert.ok(result.code_mb <= result.budgets.code);
  assert.ok(result.retained_code_mb <= result.budgets.retainedCode);
  assert.ok(result.retained_chunks <= result.budgets.retainedChunks);
  assert.equal(result.total_chunks, result.chunks + result.retained_chunks);
  assert.equal(
    result.total_code_mb,
    Number((result.code_mb + result.retained_code_mb).toFixed(2)),
  );
});
