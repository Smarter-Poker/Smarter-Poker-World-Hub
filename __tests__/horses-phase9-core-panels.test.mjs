import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, 'src/components/horses', name), 'utf8');

test('StablePanel owns its paged roster, guarded writes, modal, virtualization and cleanup', () => {
  const source = read('StablePanel.jsx');
  assert.match(source, /\/api\/horses\/roster\?limit=\$\{ROSTER_PAGE_SIZE\}&offset=\$\{offset\}/);
  assert.match(source, /hasPermission\(permissions, 'content\.write'\)/);
  assert.match(source, /action: 'bulk_active'/);
  assert.match(source, /action: 'bulk_delete'/);
  assert.match(source, /<VirtualDataTable[\s\S]*virtualizeAt=\{100\}/);
  assert.match(source, /<Modal title=\{editing\.id/);
  assert.match(source, /<ConfirmDialog/);
  assert.match(source, /stopBroadcast\(\)/);
  assert.match(source, /stopMutation\(\)/);
  assert.match(source, /removeEventListener\('horses-updated'/);
  assert.doesNotMatch(source, /\bbot(s)?\b/i);
});

test('SettingsPanel fails closed before a canonical read and patches only shared settings projection', () => {
  const source = read('SettingsPanel.jsx');
  assert.match(source, /\.order\('id', \{ ascending: true \}\)/);
  assert.match(source, /if \(!loaded \|\| !canWrite\)/);
  assert.match(source, /action: 'save_settings'/);
  assert.match(source, /patchContext\(\{ socialSettings: next \}\)/);
  assert.match(source, /clearTimeout\(timerRef\.current\)/);
  assert.match(source, /removeEventListener\('horses-settings-updated'/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test('StatsPanel independently reads canonical platform, analytics, roster and pipeline sources', () => {
  const source = read('StatsPanel.jsx');
  assert.match(source, /section=platform/);
  assert.match(source, /\/api\/horses\/analytics\?type=summary/);
  assert.match(source, /\/api\/horses\/roster\?limit=/);
  assert.match(source, /from\('pipeline_runs'\)/);
  assert.match(source, /selectNavigationBadges/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /stopBroadcast\(\)/);
});

test('MerchPanel is a narrow wrapper around the canonical catalog admin', () => {
  const source = read('MerchPanel.jsx');
  assert.match(source, /import MerchCatalogAdmin from '\.\.\/admin\/MerchCatalogAdmin'/);
  assert.match(source, /<MerchCatalogAdmin authFetch=\{authFetch\} \/>/);
  assert.doesNotMatch(source, /fetch\(|supabase|useState/);
});
