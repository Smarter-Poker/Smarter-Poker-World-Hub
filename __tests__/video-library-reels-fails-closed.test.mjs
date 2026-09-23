/**
 * GUARD: __tests__/video-library-reels-fails-closed.test.mjs
 * -------------------------------------------------------------------------
 * Fleet recertification finding D1 (2026-09-21). The Open Claw dispatcher ran
 * an old direct-write scripts/video_library_to_reels.py that never read a
 * switch and, with VIDEO_LIBRARY_BOT_PROFILE_ID unset, wrote reels as the
 * first content_authors row with a profile. Every such row is a horse, so a
 * dispatcher could post as a horse while the fleet was switched off.
 *
 * 2026-09-23 owner decision (Dan): Video Library Reels publish ONLY as the
 * official Smarter.Poker system account (never a horse, never a
 * content_authors profile), gated by the dedicated
 * video_reels_pipeline_controls kill switch (video_library_reel_creation +
 * video_library_reel_publication), NOT by the horse-fleet switch
 * content_settings.engine_enabled. The horse-authored workers bridge stays
 * off with the fleet.
 *
 * Two locks, each pinned on its own:
 *   1. The dispatcher runs the job only as the local verified atomic
 *      publisher (`--limit 500 --verify`, 1,800 s) and never calls the
 *      horse-authored workers route /cron/video-library-reels or Vercel.
 *   2. The publisher fails closed by itself, in every mode. Its first request
 *      reads the publisher pinned in video_reels_pipeline_config; a profile
 *      that is not a UUID, does not exist, is not exactly is_horse=false or
 *      is in content_authors, or a VIDEO_LIBRARY_BOT_PROFILE_ID pin that
 *      differs from the database, exits non-zero before any YouTube probe or
 *      write. Then both Reel controls must read exactly enabled=true before
 *      any probe; unreadable, missing or non-boolean controls exit non-zero
 *      and switched-off controls are a zero-probe, zero-write no-op. The fleet
 *      switch is never read, and with it off a valid official publisher still
 *      verifies and publishes through publish_video_library_reel only.
 *
 * Both halves run for real. The dispatcher is imported with its scheduler,
 * network and subprocess calls stubbed (the harness shape of
 * scripts/ci/test-openclaw-critical-jobs.py). The publisher runs as a
 * subprocess against a local stand-in for PostgREST that records every
 * request; YouTube oEmbed is answered in-process and yt-dlp is a vendored
 * fake that records each probe. No network, no credentials and no env file
 * is used.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DISPATCHER = path.join(root, 'scripts', 'openclaw-cron-dispatcher.py');
const BRIDGE = path.join(root, 'scripts', 'video_library_to_reels.py');
const JOB = '/api/cron/video-library-reels';
const HORSE_ROUTE = '/cron/video-library-reels';

const dispatcherCode = fs.readFileSync(DISPATCHER, 'utf8')
  .split('\n')
  .map((line) => line.split('#')[0])
  .join('\n');

/** The literal of a top-level `NAME = {...}` in the dispatcher, comments stripped. */
function pyDict(name) {
  const at = dispatcherCode.search(new RegExp(`^${name}\\s*=\\s*\\{`, 'm'));
  assert.ok(at > -1, `${name} is not defined in the dispatcher`);
  const open = dispatcherCode.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < dispatcherCode.length; i += 1) {
    if (dispatcherCode[i] === '{') depth += 1;
    if (dispatcherCode[i] === '}') depth -= 1;
    if (depth === 0) return dispatcherCode.slice(open, i + 1);
  }
  throw new Error(`${name} is never closed`);
}

function runPython(source, args, timeout) {
  const r = spawnSync('python3', ['-', ...args], { input: source, encoding: 'utf8', timeout });
  assert.equal(r.status, 0, `python harness failed (status ${r.status}):\n${r.stdout}\n${r.stderr}`);
  const line = r.stdout.split('\n').reverse().find((l) => l.startsWith('RESULT '));
  assert.ok(line, `python harness printed no RESULT line:\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(line.slice('RESULT '.length));
}

test('the dispatcher runs video-library-reels only as the local verified publisher', () => {
  assert.match(pyDict('SCRIPT_JOBS'),
    new RegExp(`'${JOB}':\\s*\\['--limit',\\s*'500',\\s*'--verify'\\]`));
  assert.match(pyDict('SCRIPT_JOB_SCRIPTS'), new RegExp(`'${JOB}':\\s*REELS_BRIDGE_PY`));
  assert.match(dispatcherCode, /^REELS_BRIDGE_PY = _resolve_script\('video_library_to_reels\.py'\)$/m);
  // The horse-authored workers route is never a target for this job.
  assert.ok(!pyDict('WORKERS_PREFERRED').includes(`'${JOB}'`), `${JOB} must not be in WORKERS_PREFERRED`);
  assert.ok(!dispatcherCode.includes(`'${HORSE_ROUTE}'`), `no code line may name ${HORSE_ROUTE}`);
  assert.match(dispatcherCode, /SCRIPT_WORKER_OVERLAP = sorted\(set\(SCRIPT_JOBS\)\.intersection\(WORKERS_PREFERRED\)\)/);
});

const DISPATCH_HARNESS = String.raw`
import importlib.util, json, os, shutil, sys, tempfile, types
from pathlib import Path

sys.dont_write_bytecode = True  # importing the dispatcher must not leave a .pyc in the repo

def _stub(name, **attrs):
    if name in sys.modules:
        return
    try:
        __import__(name)
    except Exception:
        m = types.ModuleType(name)
        for k, v in attrs.items():
            setattr(m, k, v)
        sys.modules[name] = m

_stub('requests', get=lambda *a, **k: None, post=lambda *a, **k: None,
      exceptions=types.SimpleNamespace(Timeout=type('Timeout', (Exception,), {})))
_stub('apscheduler')
_stub('apscheduler.schedulers')
_stub('apscheduler.schedulers.blocking', BlockingScheduler=object)
_stub('apscheduler.triggers')
_stub('apscheduler.triggers.cron', CronTrigger=object)

tmp = tempfile.mkdtemp()
os.environ['HOME'] = tmp
os.environ['OPENCLAW_ALERT_STATE'] = str(Path(tmp) / 'alert-state.json')
os.environ['SP_LOG_DIR'] = str(Path(tmp) / 'logs')
os.environ['CRON_SECRET'] = 'test-secret'
for key in ('WORKERS_BASE_URL', 'SP_SCRAPER_DIR', 'SP_ENABLE_SCRIPT_JOBS', 'DISPATCHER_ROLE'):
    os.environ.pop(key, None)

spec = importlib.util.spec_from_file_location('dispatcher', sys.argv[1])
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)

JOB = '/api/cron/video-library-reels'
spawned, fetched = [], []

class _Resp:
    status_code = 200
    text = 'ok'

def _run(cmd, *a, **k):
    spawned.append({'cmd': [str(c) for c in cmd], 'timeout': k.get('timeout')})
    return types.SimpleNamespace(returncode=0)

d.subprocess.run = _run
d.requests.get = lambda url, *a, **k: (fetched.append(url) or _Resp())
d.requests.post = lambda url, *a, **k: (fetched.append(url) or _Resp())
d._send_sms = lambda *a, **k: True

out = {
    'script_args': d.SCRIPT_JOBS.get(JOB),
    'script': d.SCRIPT_JOB_SCRIPTS.get(JOB),
    'in_workers_preferred': JOB in d.WORKERS_PREFERRED,
    'horse_route_targeted': '/cron/video-library-reels' in d.WORKERS_PREFERRED.values(),
    'overlap': list(d.SCRIPT_WORKER_OVERLAP),
    'timeout': d.job_timeout(JOB),
    'schedule': [kw for p, kw in d.ALL_CRONS if p == JOB],
    'critical': JOB in d.CRITICAL_JOBS,
    'skip_on_secondary': d.should_skip_on_secondary(JOB, 'secondary'),
    'python': sys.executable,
    'hosts': {},
}

# A primary host (the Mac) has no workers route; the Hetzner host has one.
# Neither may reach the workers route or Vercel for this job.
for label, base in (('no_workers_route', ''), ('workers_route', 'http://10.0.0.3:8081')):
    d.WORKERS_BASE_URL = base
    d.make_job(JOB)()
    out['hosts'][label] = {'spawned': spawned[:], 'fetched': fetched[:]}
    del spawned[:], fetched[:]

shutil.rmtree(tmp, ignore_errors=True)
print('RESULT ' + json.dumps(out))
`;

test('every dispatcher host runs the local publisher and never the horse workers route', () => {
  const r = runPython(DISPATCH_HARNESS, [DISPATCHER], 120_000);
  assert.deepEqual(r.script_args, ['--limit', '500', '--verify']);
  assert.equal(fs.realpathSync(r.script), fs.realpathSync(BRIDGE), 'the job must resolve to this repo\'s publisher');
  assert.equal(r.in_workers_preferred, false, `${JOB} must not route to the workers service`);
  assert.equal(r.horse_route_targeted, false, `${HORSE_ROUTE} must not be a workers target`);
  assert.deepEqual(r.overlap, []);
  assert.equal(r.timeout, 1800);
  assert.deepEqual(r.schedule, [{ hour: 7, minute: 0 }], 'the daily 07:00 UTC schedule is unchanged');
  assert.equal(r.critical, true);
  assert.equal(r.skip_on_secondary, false, 'the job must stay registered on the secondary host');
  for (const [label, host] of Object.entries(r.hosts)) {
    assert.deepEqual(host.fetched, [], `${label}: the job made an HTTP call: ${JSON.stringify(host.fetched)}`);
    assert.equal(host.spawned.length, 1, `${label}: ${JSON.stringify(host.spawned)}`);
    const [{ cmd, timeout }] = host.spawned;
    assert.equal(cmd[0], r.python);
    assert.equal(fs.realpathSync(cmd[1]), fs.realpathSync(BRIDGE));
    assert.deepEqual(cmd.slice(2), ['--limit', '500', '--verify']);
    assert.equal(timeout, 1800);
  }
});

const BRIDGE_HARNESS = String.raw`
import http.server, json, os, shutil, subprocess, sys, tempfile, threading, urllib.parse
from pathlib import Path

SRC = Path(sys.argv[1])
SYSTEM = '00000000-0000-0000-0000-000000000001'  # the official Smarter.Poker account
HORSE = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'   # a non-horse profile that is not the config
UNKNOWN = '33333333-3333-4333-8333-333333333333'
NULLFLAG = '44444444-4444-4444-8444-444444444444'
ROSTERED = '55555555-5555-4555-8555-555555555555'
IS_HORSE = {SYSTEM: False, HORSE: True, OTHER: False, NULLFLAG: None, ROSTERED: False}
ROSTER = [HORSE, ROSTERED]  # content_authors.profile_id
ASSET = '66666666-6666-4666-8666-666666666666'
VIDEO = 'M7lc1UVf-VE'
ON = {'video_library_reel_creation': True, 'video_library_reel_publication': True}

sandbox = Path(tempfile.mkdtemp())
# A copy outside the repo, so the script's env-file search finds nothing.
(sandbox / 'repo' / 'scripts').mkdir(parents=True)
(sandbox / 'home').mkdir()
script = sandbox / 'repo' / 'scripts' / SRC.name
shutil.copyfile(SRC, script)

# A vendored fake yt-dlp (the release exposes yt_dlp only via PYTHONPATH).
# Every non --version call is a YouTube probe and is logged to a file.
vendor = sandbox / 'vendor'
(vendor / 'yt_dlp').mkdir(parents=True)
(vendor / 'yt_dlp' / '__init__.py').write_text('')
probe_log = sandbox / 'probes.log'
(vendor / 'yt_dlp' / '__main__.py').write_text(
    'import json, sys\n'
    'if "--version" in sys.argv[1:]:\n'
    '    print("2026.08.19")\n'
    'else:\n'
    '    open(%r, "a").write("yt-dlp " + sys.argv[-1] + "\\n")\n'
    '    print(json.dumps({"availability": "public", "age_limit": 0,\n'
    '                      "playable_in_embed": True, "live_status": "not_live"}))\n' % str(probe_log))

# Runs the real script with every non-local urlopen (YouTube oEmbed) answered
# in-process and logged as a probe; the fake database stays reachable.
runner = sandbox / 'runner.py'
runner.write_text('''
import io, json, runpy, sys, urllib.request
_real = urllib.request.urlopen
def _urlopen(req, *a, **k):
    url = getattr(req, 'full_url', req)
    if url.startswith('http://127.0.0.1:'):
        return _real(req, *a, **k)
    open(%r, 'a').write('oembed ' + url + '\\n')
    class R(io.BytesIO):
        status = 200
        def __enter__(self): return self
        def __exit__(self, *a): return False
    return R(json.dumps({'title': 'Verified Title', 'author_name': 'Channel'}).encode())
urllib.request.urlopen = _urlopen
script = sys.argv[1]
sys.argv = sys.argv[1:]
runpy.run_path(script, run_name='__main__')
''' % str(probe_log))

def handler(state):
    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _reply(self, code, body=None):
            data = b'' if body is None else json.dumps(body).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            if data:
                self.wfile.write(data)

        def _handle(self, method):
            url = urllib.parse.urlsplit(self.path)
            rpc = '/rpc/' in url.path
            table = url.path.rsplit('/', 1)[-1]
            query = dict(urllib.parse.parse_qsl(url.query))
            size = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(size)) if size else None
            state['requests'].append({'method': method, 'table': table, 'rpc': rpc,
                                      'query': query, 'body': body})
            if rpc:
                preflight = (body or {}).get('p_video_id') == 'schema-preflight-invalid'
                if table == 'record_youtube_embed_failure_verdict':
                    if preflight:
                        return self._reply(400, {'code': '22023', 'message': 'invalid'})
                    return self._reply(200, [{'video_id': body['p_video_id'], 'hit_count': 0,
                                              'verification_status': 'resolved', 'resolved': True}])
                if table == 'publish_video_library_reel':
                    if preflight:
                        return self._reply(400, {'code': 'P0002', 'message': 'no such video'})
                    return self._reply(200, [{'social_post_id': 'post-1', 'social_reel_id': 'reel-1',
                                              'was_created': True}])
                return self._reply(404, {'message': 'unknown rpc ' + table})
            if method != 'GET':
                return self._reply(201 if method == 'POST' else 204)
            if table == 'video_reels_pipeline_config':
                if state['config'] == 'error':
                    return self._reply(500, {'message': 'simulated outage'})
                if state['config'] == 'missing':
                    return self._reply(200, [])
                return self._reply(200, [{'video_library_publisher_profile_id': state['config']}])
            if table == 'profiles':
                pid = query.get('id', '')[3:]
                return self._reply(200, [{'id': pid, 'is_horse': IS_HORSE[pid]}] if pid in IS_HORSE else [])
            if table == 'content_authors':
                want = query.get('profile_id', '')
                rows = [{'id': 'author-%d' % i, 'profile_id': p} for i, p in enumerate(ROSTER)]
                if want.startswith('eq.'):
                    rows = [r for r in rows if r['profile_id'] == want[3:]]
                return self._reply(200, rows[:int(query.get('limit') or len(rows) or 1)])
            if table == 'video_reels_pipeline_controls':
                if state['controls'] == 'error':
                    return self._reply(500, {'message': 'simulated outage'})
                return self._reply(200, [{'control_key': k, 'enabled': v, 'updated_at': None}
                                         for k, v in state['controls'].items()])
            if table == 'content_settings':
                return self._reply(200, [{'engine_enabled': False}])  # the fleet is off
            if table == 'video_library_videos':
                if query.get('limit') == '1' and 'offset' not in query:
                    return self._reply(200, [])  # preflight relation read
                return self._reply(200, [{
                    'id': ASSET, 'youtube_video_id': VIDEO, 'source_id': 'HCL', 'source_name': 'HCL',
                    'title': 'Verified Title', 'thumbnail_url': None,
                    'published_at': '2026-09-20T00:00:00Z', 'type': 'cash',
                    'availability_status': 'unknown', 'embeddable': None,
                    'availability_checked_at': None}])
            if table in ('social_reels', 'social_posts', 'youtube_embed_failures'):
                return self._reply(200, [])
            return self._reply(404, {'message': 'unknown relation ' + table})

        def do_GET(self):
            self._handle('GET')

        def do_POST(self):
            self._handle('POST')

        def do_PATCH(self):
            self._handle('PATCH')

        def do_PUT(self):
            self._handle('PUT')

        def do_DELETE(self):
            self._handle('DELETE')
    return H

def run(config=SYSTEM, controls=ON, pin=None, args=('--limit', '500', '--verify')):
    state = {'config': config, 'controls': controls, 'requests': []}
    probe_log.write_text('')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler(state))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    env = {
        'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
        'HOME': str(sandbox / 'home'),
        'PYTHONPATH': str(vendor),
        'NEXT_PUBLIC_SUPABASE_URL': 'http://127.0.0.1:%d' % server.server_address[1],
        'SUPABASE_SERVICE_ROLE_KEY': 'placeholder-not-a-credential',
        'SP_ENV_FILE': str(sandbox / 'no-such.env'),
        'SP_LOG_DIR': str(sandbox / 'logs'),
        'SP_EVIDENCE_DIR': str(sandbox / 'evidence'),
        'NO_PROXY': '*',
        'no_proxy': '*',
        'PYTHONDONTWRITEBYTECODE': '1',
    }
    if pin is not None:
        env['VIDEO_LIBRARY_BOT_PROFILE_ID'] = pin
    try:
        proc = subprocess.run([sys.executable, str(runner), str(script), *args], env=env,
                              capture_output=True, text=True, timeout=120)
    finally:
        server.shutdown()
        server.server_close()
    requests = state['requests']
    return {
        'code': proc.returncode,
        'requests': requests,
        'writes': [r for r in requests if r['method'] != 'GET' and not (
            r['rpc'] and (r['body'] or {}).get('p_video_id') == 'schema-preflight-invalid')],
        'probes': [line for line in probe_log.read_text().splitlines() if line],
        'log': (proc.stdout + proc.stderr)[-2500:],
    }

DRY = ('--dry-run', '--limit', '500')
PREFLIGHT = ('--preflight-only',)
CAPTIONS = ('--sync-captions',)
SCENARIOS = {
    # (a) never a horse, in every mode
    'config_horse': dict(config=HORSE),
    'config_horse_dry_run': dict(config=HORSE, args=DRY),
    'config_horse_preflight': dict(config=HORSE, args=PREFLIGHT),
    'config_horse_captions': dict(config=HORSE, args=CAPTIONS),
    'config_horse_pinned_to_itself': dict(config=HORSE, pin=HORSE),
    'config_null_is_horse': dict(config=NULLFLAG),
    'config_no_profile': dict(config=UNKNOWN),
    'config_not_uuid': dict(config='first-content-author'),
    'config_null': dict(config=None),
    'config_missing': dict(config='missing'),
    'config_unreadable': dict(config='error'),
    # (b) never a content_authors profile, even with is_horse = false
    'config_in_content_authors': dict(config=ROSTERED),
    'config_in_content_authors_dry_run': dict(config=ROSTERED, args=DRY),
    'config_in_content_authors_preflight': dict(config=ROSTERED, args=PREFLIGHT),
    # (c) a host pin must equal the database
    'pin_is_horse': dict(pin=HORSE),
    'pin_other_non_horse': dict(pin=OTHER),
    'pin_other_dry_run': dict(pin=OTHER, args=DRY),
    'pin_other_preflight': dict(pin=OTHER, args=PREFLIGHT),
    # (d) the dedicated kill switch
    'controls_unreadable': dict(controls='error'),
    'controls_unreadable_dry_run': dict(controls='error', args=DRY),
    'controls_row_missing': dict(controls={'video_library_reel_creation': True}),
    'controls_enabled_null': dict(controls={'video_library_reel_creation': True,
                                            'video_library_reel_publication': None}),
    'controls_unreadable_preflight': dict(controls='error', args=PREFLIGHT),
    'creation_off': dict(controls={**ON, 'video_library_reel_creation': False}),
    'publication_off': dict(controls={**ON, 'video_library_reel_publication': False}),
    'publication_off_dry_run': dict(controls={**ON, 'video_library_reel_publication': False}, args=DRY),
    'publication_off_captions': dict(controls={**ON, 'video_library_reel_publication': False}, args=CAPTIONS),
    # (f) the fleet switch is off; the official publisher still runs
    'official': dict(),
    'official_pinned': dict(pin=SYSTEM.upper()),
    'official_dry_run': dict(args=DRY),
    'official_preflight': dict(args=PREFLIGHT),
}
out = {'ids': {'system': SYSTEM, 'horse': HORSE, 'rostered': ROSTERED, 'video': VIDEO},
       'scenarios': {}}
try:
    for name, spec in SCENARIOS.items():
        out['scenarios'][name] = run(**spec)
finally:
    shutil.rmtree(sandbox, ignore_errors=True)
print('RESULT ' + json.dumps(out))
`;

let bridgeRun;
function bridge() {
  bridgeRun ??= runPython(BRIDGE_HARNESS, [BRIDGE], 600_000);
  return bridgeRun;
}

const show = (s) => `exit ${s.code}; requests ${JSON.stringify(s.requests.map((q) => `${q.method} ${q.table}`))}; `
  + `probes ${JSON.stringify(s.probes)}\n${s.log}`;
const tables = (s) => s.requests.map((q) => q.table);

const AUTHOR_REFUSED = [
  'config_horse', 'config_horse_dry_run', 'config_horse_preflight', 'config_horse_captions',
  'config_horse_pinned_to_itself', 'config_null_is_horse', 'config_no_profile', 'config_not_uuid',
  'config_null', 'config_missing', 'config_unreadable',
  'config_in_content_authors', 'config_in_content_authors_dry_run', 'config_in_content_authors_preflight',
  'pin_is_horse', 'pin_other_non_horse', 'pin_other_dry_run', 'pin_other_preflight',
];
const CONTROLS_UNREADABLE = ['controls_unreadable', 'controls_unreadable_dry_run', 'controls_row_missing',
  'controls_enabled_null', 'controls_unreadable_preflight'];
const CONTROLS_OFF = ['creation_off', 'publication_off', 'publication_off_dry_run', 'publication_off_captions'];

test('the publisher reads its database-pinned author first and never reads the fleet switch', () => {
  for (const [name, s] of Object.entries(bridge().scenarios)) {
    const first = s.requests[0];
    assert.ok(first, `${name}: made no request at all\n${show(s)}`);
    assert.equal(`${first.method} ${first.table}`, 'GET video_reels_pipeline_config',
      `${name}: the first request must read the pinned publisher\n${show(s)}`);
    assert.equal(first.query.singleton_key, 'eq.video_library', `${name}: ${JSON.stringify(first.query)}`);
    assert.match(first.query.select ?? '', /\bvideo_library_publisher_profile_id\b/);
    assert.ok(!tables(s).includes('content_settings'),
      `${name}: the official publisher must not consult content_settings.engine_enabled\n${show(s)}`);
  }
});

test('(a, b, c) a horse, a content_authors profile or a mismatched pin exits non-zero before any probe or write', () => {
  const { ids, scenarios } = bridge();
  for (const name of AUTHOR_REFUSED) {
    const s = scenarios[name];
    assert.notEqual(s.code, 0, `${name}: a refused publisher must exit non-zero\n${show(s)}`);
    assert.deepEqual(s.writes, [], `${name}: wrote without a verified official publisher\n${show(s)}`);
    assert.deepEqual(s.probes, [], `${name}: probed YouTube without a verified publisher\n${show(s)}`);
    assert.ok(!tables(s).includes('video_reels_pipeline_controls'),
      `${name}: kept going after the publisher was refused\n${show(s)}`);
    assert.ok(!s.requests.some((q) => q.rpc), `${name}: called an RPC after the publisher was refused\n${show(s)}`);
  }
  // A host pin that disagrees with the database is refused before the database
  // is asked anything about either profile.
  for (const name of ['pin_is_horse', 'pin_other_non_horse', 'pin_other_dry_run', 'pin_other_preflight']) {
    assert.deepEqual(tables(scenarios[name]), ['video_reels_pipeline_config'], show(scenarios[name]));
  }
  // content_authors is only ever read to check the pinned id, never to pick one.
  for (const [name, s] of Object.entries(scenarios)) {
    for (const q of s.requests.filter((r) => r.table === 'content_authors')) {
      assert.match(q.query.profile_id ?? '', /^eq\.[0-9a-f-]{36}$/,
        `${name}: read content_authors without pinning the profile: ${JSON.stringify(q.query)}`);
    }
    assert.ok(!JSON.stringify(s.writes).includes(ids.horse), `${name}: a write named a horse`);
    assert.ok(!JSON.stringify(s.writes).includes(ids.rostered), `${name}: a write named a content_authors profile`);
  }
});

test('(d) unreadable or switched-off Reel controls stop the run with zero YouTube probes and zero writes', () => {
  const { scenarios } = bridge();
  for (const name of [...CONTROLS_UNREADABLE, ...CONTROLS_OFF]) {
    const s = scenarios[name];
    assert.deepEqual(s.writes, [], `${name}: wrote while the Reel controls were not both on\n${show(s)}`);
    assert.deepEqual(s.probes, [], `${name}: probed YouTube while the Reel controls were not both on\n${show(s)}`);
    const t = tables(s);
    assert.ok(t.includes('video_reels_pipeline_controls'), `${name}: never read the controls\n${show(s)}`);
    for (const table of ['video_library_videos', 'social_reels', 'youtube_embed_failures']) {
      if (!name.endsWith('_preflight')) {
        assert.ok(!t.includes(table), `${name}: read ${table} after the controls said stop\n${show(s)}`);
      }
    }
  }
  for (const name of CONTROLS_UNREADABLE) {
    assert.notEqual(scenarios[name].code, 0, `${name}: unreadable controls must exit non-zero\n${show(scenarios[name])}`);
  }
  for (const name of CONTROLS_OFF) {
    // A readable switch that is off is the operator's deliberate pause, not an outage.
    assert.equal(scenarios[name].code, 0, `${name}: a switched-off pipeline is a logged no-op\n${show(scenarios[name])}`);
  }
});

test('(f) with the fleet switch off, a valid official publisher still verifies and publishes only through the RPC', () => {
  const { ids, scenarios } = bridge();
  for (const name of ['official', 'official_pinned']) {
    const s = scenarios[name];
    assert.equal(s.code, 0, `${name}\n${show(s)}`);
    assert.ok(s.probes.some((p) => p.startsWith('oembed ') && p.includes(ids.video)), `${name}: no oEmbed probe\n${show(s)}`);
    assert.ok(s.probes.some((p) => p === `yt-dlp https://www.youtube.com/watch?v=${ids.video}`),
      `${name}: no yt-dlp probe\n${show(s)}`);
    // No direct table writes: only the verdict and publication RPCs.
    assert.ok(s.writes.every((w) => w.method === 'POST' && w.rpc), `${name}: direct write\n${show(s)}`);
    const publications = s.writes.filter((w) => w.table === 'publish_video_library_reel');
    assert.equal(publications.length, 1, show(s));
    assert.equal(publications[0].body.p_author_id, ids.system, 'the Reel must carry the official account');
    assert.equal(publications[0].body.p_video_id, ids.video);
    assert.ok(s.writes.some((w) => w.table === 'record_youtube_embed_failure_verdict'), show(s));
  }
  const dry = scenarios.official_dry_run;
  assert.equal(dry.code, 0, show(dry));
  assert.ok(dry.probes.length >= 2, `a dry run still verifies\n${show(dry)}`);
  assert.deepEqual(dry.writes, [], `a dry run never writes\n${show(dry)}`);
  const preflight = scenarios.official_preflight;
  assert.equal(preflight.code, 0, show(preflight));
  assert.deepEqual(preflight.probes, [], `a preflight never probes YouTube\n${show(preflight)}`);
  assert.deepEqual(preflight.writes, [], `a preflight never writes\n${show(preflight)}`);
});
