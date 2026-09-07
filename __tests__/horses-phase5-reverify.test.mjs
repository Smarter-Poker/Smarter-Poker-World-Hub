/** Cross-surface wiring checks for Phase 5 closeout. */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = (await readdir(path.join(ROOT, 'supabase', 'migrations')))
  .find((name) => name.includes('ca_phase5_integrity_cases_and_review_queue'));
const [route, panel, registry, sql] = await Promise.all([
  readFile(path.join(ROOT, 'pages/api/horses/integrity-admin.js'), 'utf8'),
  readFile(path.join(ROOT, 'src/components/horses/IntegrityPanel.jsx'), 'utf8'),
  readFile(path.join(ROOT, 'src/components/horses/tabRegistry.js'), 'utf8'),
  readFile(path.join(ROOT, 'supabase/migrations', migration), 'utf8'),
]);

test('the lazy Integrity tab reaches the panel and its single API door', () => {
  assert.match(registry, /id: 'integrity'[\s\S]*?load: \(\) => import\('\.\/IntegrityPanel'\)/);
  assert.match(panel, /INTEGRITY_ADMIN/);
  assert.match(route, /export default withOperatorRoute\(spec, handle\)/);
});

test('every route RPC name exists in the migration', () => {
  const names = [
    'fn_ca_integrity_detector_health',
    'fn_ca_integrity_queue',
    'fn_ca_integrity_case',
    'fn_ca_integrity_pairs',
    'fn_ca_integrity_flags',
    'fn_ca_integrity_timing',
    'fn_ca_integrity_hands',
    'fn_ca_integrity_case_open',
    'fn_ca_integrity_case_add_item',
    'fn_ca_integrity_case_retract_item',
    'fn_ca_integrity_case_assign',
    'fn_ca_integrity_case_decide',
    'fn_ca_integrity_case_close',
    'fn_ca_integrity_sanction',
  ];
  for (const name of names) {
    assert.match(route, new RegExp(`['"]${name}['"]`), `${name} is not wired into the route`);
    assert.match(sql, new RegExp(`FUNCTION public\\.${name}\\(`), `${name} is wired but not migrated`);
  }
});

test('all seven sections render under one always-live health banner', () => {
  for (const section of ['queue', 'case', 'pairs', 'flags', 'timing', 'hands', 'health']) {
    assert.match(panel, new RegExp(`'${section}'`));
  }
  const banner = panel.indexOf('<DetectorHealthBanner');
  const switcher = panel.indexOf('role="tablist"');
  assert.ok(banner >= 0 && switcher > banner, 'health must render before section navigation');
});

test('the coverage gap is not closed by this migration', () => {
  assert.doesNotMatch(sql, /UPDATE\s+(?:public\.)?ca_collusion_scan_state/i);
  assert.match(panel, /Recorded Coverage Gap/);
});
