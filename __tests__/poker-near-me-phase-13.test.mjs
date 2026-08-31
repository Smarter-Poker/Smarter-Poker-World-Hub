import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fetchCompleteDirectory } from '../scripts/lib/pnm-directory-snapshot.mjs';
import { promoteSnapshotPair } from '../scripts/refresh-pnm-directory-snapshot.mjs';
import {
  filterSeriesForRoute,
  isVenueNearRoute,
  validateTravelDateRange,
} from '../src/lib/poker-near-me/roadTripRuntime.js';

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
  assert.doesNotMatch(primaryMap, /\.leaflet-control-zoom\s*\{/);
  assert.match(planner, /\/hub\/poker-near-me\/lobby\?\$\{params\.toString\(\)\}/);
});

test('road-trip planner controls cannot submit an ancestor form', async () => {
  const planner = await source('src/components/poker-near-me/RoadTripPlanner.jsx');
  const buttons = [...planner.matchAll(/<button\b([^>]*)>/g)].map((match) => match[1]);

  assert.ok(buttons.length >= 10, 'expected the complete planner control set');
  for (const attributes of buttons) {
    assert.match(attributes, /\btype="button"/);
  }
  assert.match(planner, /<button type="button" className="rtp-calculate-btn"/);
});

test('snapshot refresh separates preview/audit and transactionally promotes validated files', async () => {
  const [refresh, pkg] = await Promise.all([
    source('scripts/refresh-pnm-directory-snapshot.mjs'),
    source('package.json'),
  ]);

  assert.match(pkg, /"pnm:snapshot:preview":\s*"node scripts\/refresh-pnm-directory-snapshot\.mjs --dry-run"/);
  assert.match(pkg, /"pnm:snapshot:audit":\s*"node scripts\/check-pnm-directory-snapshot\.mjs --live-url=/);
  assert.match(refresh, /process\.argv\.includes\('--dry-run'\)/);
  assert.match(refresh, /mode: 'dry-run'/);
  assert.match(refresh, /Atomic snapshot staging failed/);
  assert.match(refresh, /\.pnm-directory-snapshot\.lock/);
  assert.match(refresh, /\.pnm-refresh\.backup/);
  assert.match(refresh, /AggregateError/);
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

test('road-trip dates, corridor membership, and series remain route-true', () => {
  assert.equal(validateTravelDateRange({ start: '2026-09-10', end: '' }).ok, false);
  assert.equal(validateTravelDateRange({ start: '2026-09-10', end: '2026-09-01' }).ok, false);
  const dates = validateTravelDateRange({ start: '2026-09-01', end: '2026-09-10' });
  assert.equal(dates.ok, true);

  const stops = [{ lat: 32.7767, lng: -96.797 }, { lat: 36.1699, lng: -115.1398 }];
  assert.equal(isVenueNearRoute({ latitude: 34.9, longitude: -106.6 }, stops, 100), true);
  assert.equal(isVenueNearRoute({ latitude: 40.7, longitude: -74.0 }, stops, 100), false);

  const nearby = [{ id: 1, name: 'The Venetian', city: 'Las Vegas', state: 'NV' }];
  const matches = filterSeriesForRoute([
    { id: 'lv', venue: 'The Venetian', city: 'Las Vegas', state: 'NV', start_date: '2026-09-02', end_date: '2026-09-04' },
    { id: 'ky', venue: 'The Barrel', city: 'Franklin', state: 'KY', start_date: '2026-09-02', end_date: '2026-09-04' },
  ], nearby, dates.startDate, dates.endDate);
  assert.deepEqual(matches.map((entry) => entry.id), ['lv']);
});

test('directory collection follows candidate pagination and rejects generation drift', async () => {
  const offsets = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    return new Response(JSON.stringify({
      success: true,
      degraded: false,
      data_source: 'supabase',
      data_revision: 'stable:1',
      total: 1001,
      data: [{ id: offset === 0 ? 1 : 2, location_quality: { status: 'verified' } }],
    }), { status: 200, headers: { 'content-type': 'application/json', 'x-pnm-data-revision': 'stable:1' } });
  };
  const result = await fetchCompleteDirectory({ sourceOrigin: 'https://example.test', fetchImpl });
  assert.deepEqual(offsets, [0, 1000]);
  assert.equal(result.candidateCount, 1001);
  assert.deepEqual(result.venues.map((venue) => venue.id), [1, 2]);
  await assert.rejects(fetchCompleteDirectory({
    sourceOrigin: 'https://example.test',
    fetchImpl: async (input) => {
      const offset = Number(new URL(input).searchParams.get('offset'));
      return new Response(JSON.stringify({ success: true, degraded: false, data_source: 'supabase', data_revision: `revision:${offset}`, total: 1001, data: [{ id: offset + 1 }] }), { status: 200 });
    },
  }), /revision changed/);
});

test('snapshot pair rolls back injected failures and rejects concurrent writers', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pnm-snapshot-'));
  const outputs = ['data/snapshot.json', 'public/data/snapshot.json'];
  try {
    await mkdir(join(cwd, 'data'), { recursive: true });
    await mkdir(join(cwd, 'public/data'), { recursive: true });
    await Promise.all(outputs.map((path) => writeFile(join(cwd, path), 'old\n')));
    await assert.rejects(
      promoteSnapshotPair({ cwd, relativeOutputs: outputs, serialized: 'new\n', promoteHook: (index) => { if (index === 1) throw new Error('injected'); } }),
      /injected/,
    );
    assert.deepEqual(await Promise.all(outputs.map((path) => readFile(join(cwd, path), 'utf8'))), ['old\n', 'old\n']);

    let release;
    let entered;
    const gate = new Promise((resolve) => { release = resolve; });
    const ready = new Promise((resolve) => { entered = resolve; });
    const first = promoteSnapshotPair({ cwd, relativeOutputs: outputs, serialized: 'fresh\n', promoteHook: async (index) => { if (index === 0) { entered(); await gate; } } });
    await ready;
    await assert.rejects(promoteSnapshotPair({ cwd, relativeOutputs: outputs, serialized: 'racing\n' }), /already running/);
    release();
    await first;
    assert.deepEqual(await Promise.all(outputs.map((path) => readFile(join(cwd, path), 'utf8'))), ['fresh\n', 'fresh\n']);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('Open Claw config fails safe and undelivered alerts remain retryable', async () => {
  const home = await mkdtemp(join(tmpdir(), 'pnm-openclaw-'));
  try {
    const code = `
import importlib.util
spec = importlib.util.spec_from_file_location('oc', 'scripts/openclaw-cron-dispatcher.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
assert m.PNM_DIRECTORY_WARN_MS == 3000
assert (m.PNM_SNAPSHOT_WARN_DAYS, m.PNM_SNAPSHOT_MAX_DAYS) == (21, 30)
m._pnm_directory_health_state.update(consec_fail=0, alert_sent=False)
m._fetch_complete_pnm_directory = lambda: (_ for _ in ()).throw(RuntimeError('synthetic outage'))
attempts = []
def send(body):
    attempts.append(body)
    return len(attempts) >= 2
m._send_sms = send
m._pnm_directory_health_job(); m._pnm_directory_health_job()
assert m._pnm_directory_health_state['alert_sent'] is False
m._pnm_directory_health_job()
assert m._pnm_directory_health_state['alert_sent'] is True
assert len(attempts) == 2
`;
    execFileSync('python3', ['-c', code], {
      cwd: fileURLToPath(root),
      env: { ...process.env, HOME: home, PNM_DIRECTORY_WARN_MS: 'invalid', PNM_SNAPSHOT_WARN_DAYS: '40', PNM_SNAPSHOT_MAX_DAYS: '30' },
      stdio: 'pipe',
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('deployment workflow preserves env, deploys as root, and verifies live hashes', async () => {
  const workflow = await source('.github/workflows/deploy-openclaw.yml');
  assert.match(workflow, /HETZNER_SSH_USER \|\| 'root'/);
  assert.match(workflow, /TWILIO_ACCOUNT_SID/);
  assert.match(workflow, /\/opt\/openclaw\/\.env/);
  assert.match(workflow, /systemctl show openclaw\.service -p User/);
  assert.match(workflow, /remote_dispatcher/);
  assert.match(workflow, /remote_unit/);
});
