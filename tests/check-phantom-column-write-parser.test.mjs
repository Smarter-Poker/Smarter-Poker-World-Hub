import assert from 'node:assert/strict';
import test from 'node:test';

import {
  firstTopLevelArgument,
  writeColumns,
} from '../scripts/ci/lib/phantom-column-write-parser.mjs';

test('isolates the row payload from Supabase upsert options', () => {
  const args = `[snapshot], {
    onConflict: 'snapshot_key',
    ignoreDuplicates: true,
    defaultToNull: false,
  }`;

  assert.equal(firstTopLevelArgument(args).trim(), '[snapshot]');
  assert.deepEqual(writeColumns(args), []);
});

test('retains literal payload columns while excluding second-argument options', () => {
  const args = `[{ snapshot_key: key, payload: { answer: 'call, then raise' } }], {
    onConflict: 'snapshot_key',
    ignoreDuplicates: true,
  }`;

  assert.deepEqual(writeColumns(args), ['snapshot_key', 'payload']);
});

test('retains object payload columns with nested calls and commas', () => {
  const args = `{
    user_id: userId,
    decision: choose('raise', sizeFor(2, 3)),
    metadata: { street: 'turn', actions: ['bet', 'call'] },
  }, { defaultToNull: false }`;

  assert.deepEqual(writeColumns(args), ['user_id', 'decision', 'metadata']);
});

test('does not infer columns from variable or spread-only payloads', () => {
  assert.deepEqual(writeColumns('canonicalRows, { onConflict: \'id\' }'), []);
  assert.deepEqual(writeColumns('{ ...snapshot }, { onConflict: \'id\' }'), []);
});
