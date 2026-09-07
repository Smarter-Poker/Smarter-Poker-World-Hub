import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const api = fs.readFileSync('pages/api/training/bookmark-solution.js', 'utf8');
const page = fs.readFileSync('pages/hub/training/solutions.js', 'utf8');
const migration = fs.readFileSync(
  'supabase/migrations/20260907010100_training_solution_bookmark_uniqueness.sql',
  'utf8',
);

test('bookmark persistence never reports database failures as success', () => {
  assert.doesNotMatch(api, /return res\.status\(200\)\.json\(\{ success: false/);
  assert.match(api, /existingError[\s\S]*status\(503\)/);
  assert.match(api, /updateError \|\| !updated\?\.id[\s\S]*status\(503\)/);
  assert.match(api, /insertErr \|\| !newBookmark\?\.id[\s\S]*status\(503\)/);
  assert.match(api, /if \(deleteErr\)[\s\S]*status\(503\)/);
  assert.match(api, /TRAINING_BOOKMARK_PERSISTENCE_UNAVAILABLE/g);
});

test('bookmark save is idempotent at both API and database boundaries', () => {
  assert.match(api, /\.upsert\(\{/);
  assert.match(api, /onConflict: 'user_id,scenario_hash'/);
  assert.match(migration, /PARTITION BY user_id, scenario_hash/i);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS solution_bookmarks_user_scenario_unique/i);
  assert.match(migration, /ON public\.solution_bookmarks \(user_id, scenario_hash\)/i);
  assert.match(migration, /uniqueness postcondition failed/i);
});

test('Solutions UI mutates its star only after a validated success body', () => {
  assert.match(page, /body = await res\.json\(\)\.catch/);
  assert.match(page, /body\?\.success !== true/);
  assert.match(page, /Bookmark Change Was Not Saved\. Your Display Has Not Been Changed\./);
  const validation = page.indexOf("body?.success !== true");
  const mutation = page.indexOf('setBookmarkedHashes((prev)', validation);
  assert.ok(validation >= 0 && mutation > validation);
});
