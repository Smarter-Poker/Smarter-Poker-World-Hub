import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(new URL('../supabase/migrations/20261005155115_rake_records_capture_in_force_terms.sql', import.meta.url), 'utf8');

test('rake audit columns are nullable, default-free and never backfilled', () => {
  assert.match(sql, /ADD COLUMN seat_count_in_force integer,/i);
  assert.match(sql, /ADD COLUMN max_rake_cap_in_force numeric\(18,4\);/i);
  assert.doesNotMatch(sql, /ADD COLUMN[^;]*DEFAULT/i);
  assert.doesNotMatch(sql, /UPDATE\s+public\.rake_records/i);
  assert.match(sql, /is_nullable = 'YES' AND column_default IS NULL/i);
  assert.match(sql, /v_nonnull <> 0/i);
});
