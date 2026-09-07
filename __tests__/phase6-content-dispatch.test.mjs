import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const dispatcher = fs.readFileSync('scripts/openclaw-cron-dispatcher.py', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260907002000_phase6_content_modes_disabled.sql', 'utf8');

test('Phase 6 content is scheduled and routed to the workers service', () => {
  assert.match(dispatcher, /\('\/api\/cron\/phase6-content',[\s\S]*?dict\(hour=9, minute=20\)\)/);
  assert.match(dispatcher, /'\/api\/cron\/phase6-content':\s+'\/cron\/phase6-content'/);
  assert.match(dispatcher, /'\/api\/cron\/phase6-content':\s+300/);
});

test('all Phase 6 publishing modes are introduced disabled without overwriting approval', () => {
  for (const mode of ['club_data_digest', 'local_event', 'seasonal_local']) {
    assert.match(migration, new RegExp(`\\('${mode}', false,`));
  }
  assert.match(migration, /ON CONFLICT \(mode\) DO NOTHING/i);
});
