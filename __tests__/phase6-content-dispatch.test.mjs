import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const dispatcher = fs.readFileSync('scripts/openclaw-cron-dispatcher.py', 'utf8');
const deployWorkflow = fs.readFileSync('.github/workflows/deploy-openclaw.yml', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260907002000_phase6_content_modes_disabled.sql', 'utf8');

test('Phase 6 content is scheduled and routed to the workers service', () => {
  const phase6Schedule = dispatcher
    .split('\n')
    .find((line) => line.includes("('/api/cron/phase6-content'"));

  assert.match(phase6Schedule, /dict\(minute=20\)/);
  assert.doesNotMatch(phase6Schedule, /hour=/);
  assert.match(dispatcher, /'\/api\/cron\/phase6-content':\s+'\/cron\/phase6-content'/);
  assert.match(dispatcher, /'\/api\/cron\/phase6-content':\s+300/);
  assert.match(
    deployWorkflow,
    /for route in[\s\S]*?\/api\/cron\/phase6-content[\s\S]*?Registered: \$route  \[/,
    'the immutable dispatcher deployment must prove the Phase 6 job was actually registered'
  );
});

test('all Phase 6 publishing modes are introduced disabled without overwriting approval', () => {
  for (const mode of ['club_data_digest', 'local_event', 'seasonal_local']) {
    assert.match(migration, new RegExp(`\\('${mode}', false,`));
  }
  assert.match(migration, /ON CONFLICT \(mode\) DO NOTHING/i);
});
