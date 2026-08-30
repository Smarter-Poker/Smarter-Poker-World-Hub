import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('every Poker Near Me map uses the local shared Leaflet runtime and control skin', async () => {
  const [runtime, planner, controls, primaryMap] = await Promise.all([
    source('src/lib/poker-near-me/mapRuntime.js'),
    source('src/components/poker-near-me/RoadTripPlanner.jsx'),
    source('public/vendor/leaflet/poker-map-controls.css'),
    source('src/components/poker-near-me/VenueMap.jsx'),
  ]);

  assert.match(runtime, /\/vendor\/leaflet\/leaflet\.css/);
  assert.match(runtime, /\/vendor\/leaflet\/poker-map-controls\.css/);
  assert.match(planner, /loadPokerMapRuntime/);
  assert.doesNotMatch(planner, /unpkg\.com\/leaflet/);
  assert.doesNotMatch(planner, /await import\(['"]leaflet['"]\)/);
  assert.match(controls, /min-width:\s*44px/);
  assert.match(controls, /min-height:\s*44px/);
  assert.match(controls, /focus-visible/);
  assert.match(controls, /prefers-reduced-motion/);
  assert.match(primaryMap, /width:\s*44px !important/);
  assert.match(primaryMap, /height:\s*44px !important/);
});

test('snapshot refresh has a read-only audit mode and atomically promotes validated files', async () => {
  const [refresh, pkg] = await Promise.all([
    source('scripts/refresh-pnm-directory-snapshot.mjs'),
    source('package.json'),
  ]);

  assert.match(pkg, /"pnm:snapshot:audit":\s*"node scripts\/refresh-pnm-directory-snapshot\.mjs --dry-run"/);
  assert.match(refresh, /process\.argv\.includes\('--dry-run'\)/);
  assert.match(refresh, /mode:\s*'dry-run'/);
  assert.match(refresh, /Atomic snapshot staging failed/);
  assert.match(refresh, /await rename\(temporaryPath, absolutePath\)/);
  assert.match(refresh, /refusing to refresh the canonical snapshot/);
});

test('Open Claw owns an hourly non-mutating directory health monitor with bounded paging', async () => {
  const dispatcher = await source('scripts/openclaw-cron-dispatcher.py');

  assert.match(dispatcher, /\('_internal\/pnm-directory-health',\s*dict\(minute=35\)\)/);
  assert.match(dispatcher, /'_internal\/pnm-directory-health': _pnm_directory_health_job/);
  assert.match(dispatcher, /latencies_ms': deque\(maxlen=96\)/);
  assert.match(dispatcher, /live\/snapshot ID drift/);
  assert.match(dispatcher, /snapshot_age_days/);
  assert.match(dispatcher, /latency_p50_ms/);
  assert.match(dispatcher, /latency_p95_ms/);
  assert.match(dispatcher, /projection_changed/);
  assert.match(dispatcher, /state\['consec_fail'\] >= 2/);
  assert.doesNotMatch(dispatcher, /refresh-pnm-directory-snapshot/);
});
