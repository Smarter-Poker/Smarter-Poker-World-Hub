/**
 * GUARD: __tests__/video-library-reels-fails-closed.test.mjs
 * -------------------------------------------------------------------------
 * Fleet recertification finding D1 (2026-09-21). The Open Claw dispatcher had
 * a local-script fallback for /api/cron/video-library-reels: on any host
 * without WORKERS_BASE_URL it ran scripts/video_library_to_reels.py
 * --limit 100 instead of the workers route. That script never read
 * content_settings.engine_enabled, and with VIDEO_LIBRARY_BOT_PROFILE_ID
 * unset it wrote reels as the first content_authors row with a profile, and
 * every such row is a horse. A dispatcher without a workers route could
 * therefore post as a horse while the fleet was switched off.
 *
 * Two locks, each pinned on its own:
 *   1. The dispatcher never runs the local script for this job. It reaches
 *      the workers route, which checks the switch first, or nothing that
 *      writes.
 *   2. The script fails closed by itself. It reads the switch before any
 *      other request, stops on false, null, a missing row or a read error,
 *      and writes only as a pinned profile that the database says is not a
 *      horse and is not in the fleet roster. It never picks an author.
 *
 * Both halves run for real. The dispatcher is imported with its scheduler,
 * network and subprocess calls stubbed (the harness shape of
 * scripts/ci/test-openclaw-critical-jobs.py). The script runs as a
 * subprocess against a local stand-in for PostgREST that records every
 * request. No network, no credentials and no env file is used.
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

test('the dispatcher has no local-script fallback for video-library-reels', () => {
  assert.ok(!pyDict('SCRIPT_JOBS').includes(`'${JOB}'`), `${JOB} must not be a SCRIPT_JOB`);
  assert.ok(!pyDict('SCRIPT_JOB_SCRIPTS').includes(`'${JOB}'`), `${JOB} must not map to a local script`);
  assert.doesNotMatch(dispatcherCode, /video_library_to_reels\.py/,
    'no code line in the dispatcher may point at the reels bridge script');
  // The gated route stays, so the job still has somewhere safe to go.
  assert.match(pyDict('WORKERS_PREFERRED'), new RegExp(`'${JOB}':\\s*'/cron/video-library-reels'`));
});

const DISPATCH_HARNESS = String.raw`
import importlib.util, json, os, shutil, sys, tempfile, types
from pathlib import Path

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

d.subprocess.run = lambda cmd, *a, **k: (spawned.append([str(c) for c in cmd]) or types.SimpleNamespace(returncode=0))
d.requests.get = lambda url, *a, **k: (fetched.append(url) or _Resp())
d._send_sms = lambda *a, **k: True

out = {
    'in_script_jobs': JOB in d.SCRIPT_JOBS,
    'in_script_job_scripts': JOB in d.SCRIPT_JOB_SCRIPTS,
    'skip_on_secondary': d.should_skip_on_secondary(JOB, 'secondary'),
}

# A primary host (the Mac) has no workers route.
d.WORKERS_BASE_URL = ''
d.make_job(JOB)()
out['no_workers_route'] = {'spawned': spawned[:], 'fetched': fetched[:]}
del spawned[:], fetched[:]

# The Hetzner host has one.
d.WORKERS_BASE_URL = 'http://10.0.0.3:8081'
d.make_job(JOB)()
out['workers_route'] = {'spawned': spawned[:], 'fetched': fetched[:]}

shutil.rmtree(tmp, ignore_errors=True)
print('RESULT ' + json.dumps(out))
`;

test('a dispatcher without a workers route never runs the reels bridge script', () => {
  const r = runPython(DISPATCH_HARNESS, [DISPATCHER], 120_000);
  assert.deepEqual(r.no_workers_route.spawned, [],
    `with no workers route the job spawned a local script: ${JSON.stringify(r.no_workers_route.spawned)}`);
  assert.equal(r.in_script_jobs, false, 'SCRIPT_JOBS still carries the job');
  assert.equal(r.in_script_job_scripts, false, 'SCRIPT_JOB_SCRIPTS still maps the job to a script');
  assert.equal(r.skip_on_secondary, false, 'the job must stay registered on the secondary host');
  assert.deepEqual(r.workers_route.spawned, []);
  assert.deepEqual(r.workers_route.fetched, ['http://10.0.0.3:8081/cron/video-library-reels']);
});

const BRIDGE_HARNESS = String.raw`
import http.server, json, os, shutil, subprocess, sys, tempfile, threading, urllib.parse
from pathlib import Path

SRC = Path(sys.argv[1])
HORSE = '11111111-1111-4111-8111-111111111111'
SYSTEM = '22222222-2222-4222-8222-222222222222'
UNKNOWN = '33333333-3333-4333-8333-333333333333'
NULLFLAG = '44444444-4444-4444-8444-444444444444'
ROSTERED = '55555555-5555-4555-8555-555555555555'
IS_HORSE = {HORSE: True, SYSTEM: False, NULLFLAG: None, ROSTERED: False}
ROSTER = [HORSE, ROSTERED]  # content_authors.profile_id, in id order

# A copy outside the repo, so the script's env-file search finds nothing.
sandbox = Path(tempfile.mkdtemp())
(sandbox / 'repo' / 'scripts').mkdir(parents=True)
(sandbox / 'home').mkdir()
script = sandbox / 'repo' / 'scripts' / SRC.name
shutil.copyfile(SRC, script)

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
            table = url.path.rsplit('/', 1)[-1]
            query = dict(urllib.parse.parse_qsl(url.query))
            size = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(size)) if size else None
            state['requests'].append({'method': method, 'table': table, 'query': query, 'body': body})
            if method != 'GET':
                return self._reply(201 if method == 'POST' else 204)
            if table == 'content_settings':
                if state['switch'] == 'error':
                    return self._reply(500, {'message': 'simulated outage'})
                if state['switch'] == 'missing':
                    return self._reply(200, [])
                return self._reply(200, [{'engine_enabled': state['switch']}])
            if table == 'profiles':
                pid = query.get('id', '')[3:]
                return self._reply(200, [{'id': pid, 'is_horse': IS_HORSE[pid]}] if pid in IS_HORSE else [])
            if table == 'content_authors':
                rows = [{'id': 'author-%d' % i, 'profile_id': p, 'name': 'Roster Member %d' % i}
                        for i, p in enumerate(ROSTER)]
                want = query.get('profile_id', '')
                if want.startswith('eq.'):
                    rows = [r for r in rows if r['profile_id'] == want[3:]]
                if query.get('limit'):
                    rows = rows[:int(query['limit'])]
                return self._reply(200, rows)
            if table == 'social_reels':
                return self._reply(200, [{'id': 'reel-1', 'youtube_video_id': 'AAAAAAAAAAA',
                                          'video_url': 'https://www.youtube.com/watch?v=AAAAAAAAAAA',
                                          'caption': 'Old Title', 'source_type': 'video_library'}])
            if table == 'video_library_videos':
                return self._reply(200, [
                    {'youtube_video_id': 'AAAAAAAAAAA', 'source_id': 'HCL', 'source_name': 'HCL',
                     'title': 'New Title', 'thumbnail_url': None,
                     'published_at': '2026-09-01T00:00:00Z', 'type': 'video', 'views_count': 1},
                    {'youtube_video_id': 'BBBBBBBBBBB', 'source_id': 'HCL', 'source_name': 'HCL',
                     'title': 'Fresh Video', 'thumbnail_url': None,
                     'published_at': '2026-09-02T00:00:00Z', 'type': 'video', 'views_count': 1},
                ])
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

def run(switch, pin, args=('--limit', '100')):
    state = {'switch': switch, 'requests': []}
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler(state))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    env = {
        'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
        'HOME': str(sandbox / 'home'),
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
        proc = subprocess.run([sys.executable, str(script), *args], env=env,
                              capture_output=True, text=True, timeout=60)
    finally:
        server.shutdown()
        server.server_close()
    return {
        'code': proc.returncode,
        'requests': state['requests'],
        'writes': [r for r in state['requests'] if r['method'] != 'GET'],
        'log': (proc.stdout + proc.stderr)[-2000:],
    }

SCENARIOS = {
    'switch_off_no_pin': dict(switch=False, pin=None),
    'switch_off_pinned': dict(switch=False, pin=SYSTEM),
    'switch_null': dict(switch=None, pin=SYSTEM),
    'switch_row_missing': dict(switch='missing', pin=SYSTEM),
    'switch_unreadable': dict(switch='error', pin=SYSTEM),
    'switch_off_captions_only': dict(switch=False, pin=SYSTEM, args=('--sync-captions',)),
    'on_no_pin': dict(switch=True, pin=None),
    'on_pinned_horse': dict(switch=True, pin=HORSE),
    'on_pinned_null_flag': dict(switch=True, pin=NULLFLAG),
    'on_pinned_unknown': dict(switch=True, pin=UNKNOWN),
    'on_pinned_in_roster': dict(switch=True, pin=ROSTERED),
    'on_pin_not_uuid': dict(switch=True, pin='first-content-author'),
    'on_pinned_non_horse': dict(switch=True, pin=SYSTEM),
}
out = {'ids': {'horse': HORSE, 'system': SYSTEM}, 'scenarios': {}}
try:
    for name, spec in SCENARIOS.items():
        out['scenarios'][name] = run(**spec)
finally:
    shutil.rmtree(sandbox, ignore_errors=True)
print('RESULT ' + json.dumps(out))
`;

let bridgeRun;
function bridge() {
  bridgeRun ??= runPython(BRIDGE_HARNESS, [BRIDGE], 300_000);
  return bridgeRun;
}

const show = (s) => {
  const authors = s.writes.filter((w) => w.method === 'POST').flatMap((w) => w.body).map((row) => row.author_id);
  return `exit ${s.code}; requests ${JSON.stringify(s.requests.map((q) => `${q.method} ${q.table}`))}; `
    + `inserted as ${JSON.stringify(authors)}\n${s.log}`;
};

const SWITCH_NOT_ON = ['switch_off_no_pin', 'switch_off_pinned', 'switch_null', 'switch_row_missing',
  'switch_unreadable', 'switch_off_captions_only'];
const AUTHOR_REFUSED = ['on_no_pin', 'on_pinned_horse', 'on_pinned_null_flag', 'on_pinned_unknown',
  'on_pinned_in_roster', 'on_pin_not_uuid'];

test('the reels bridge reads the fleet switch before any other request', () => {
  for (const [name, s] of Object.entries(bridge().scenarios)) {
    const first = s.requests[0];
    assert.ok(first, `${name}: made no request at all\n${show(s)}`);
    assert.equal(`${first.method} ${first.table}`, 'GET content_settings',
      `${name}: the first request must read the switch\n${show(s)}`);
    assert.match(first.query.select ?? '', /\bengine_enabled\b/);
    // The same row the fleet engine reads: the first by created_at.
    assert.equal(first.query.order, 'created_at.asc', `${name}: ${JSON.stringify(first.query)}`);
  }
});

test('a switch that is off, null, missing or unreadable stops the bridge before any write', () => {
  const { scenarios } = bridge();
  for (const name of SWITCH_NOT_ON) {
    const s = scenarios[name];
    assert.deepEqual(s.writes, [], `${name}: wrote while the fleet switch was not on\n${show(s)}`);
    assert.deepEqual(s.requests.map((q) => q.table), ['content_settings'],
      `${name}: kept reading after the switch said stop\n${show(s)}`);
  }
  for (const name of SWITCH_NOT_ON.filter((n) => n !== 'switch_unreadable')) {
    assert.equal(scenarios[name].code, 0, `${name}: a switched-off fleet is a deliberate no-op\n${show(scenarios[name])}`);
  }
  assert.notEqual(scenarios.switch_unreadable.code, 0,
    `an unreadable switch must exit non-zero\n${show(scenarios.switch_unreadable)}`);
});

test('the bridge writes only as a pinned profile that is verified not to be a horse', () => {
  const { scenarios } = bridge();
  for (const name of AUTHOR_REFUSED) {
    const s = scenarios[name];
    assert.deepEqual(s.writes, [], `${name}: wrote without a verified non-horse author\n${show(s)}`);
    assert.notEqual(s.code, 0, `${name}: a refused author must exit non-zero\n${show(s)}`);
  }
  // No pin means no author. It must not go looking for one in the roster.
  assert.ok(!scenarios.on_no_pin.requests.some((q) => q.table === 'content_authors'),
    `with no pin the bridge read content_authors\n${show(scenarios.on_no_pin)}`);
  // content_authors is only ever read to check the pinned id, never to pick one.
  for (const [name, s] of Object.entries(scenarios)) {
    for (const q of s.requests.filter((r) => r.table === 'content_authors')) {
      assert.match(q.query.profile_id ?? '', /^eq\.[0-9a-f-]{36}$/,
        `${name}: read content_authors without pinning the profile: ${JSON.stringify(q.query)}`);
    }
  }
});

test('with the switch on and a verified non-horse pin, the bridge still posts as that profile', () => {
  const { ids, scenarios } = bridge();
  const s = scenarios.on_pinned_non_horse;
  assert.equal(s.code, 0, show(s));
  const inserts = s.writes.filter((w) => w.method === 'POST' && w.table === 'social_reels');
  assert.equal(inserts.length, 1, show(s));
  const rows = inserts.flatMap((w) => w.body);
  assert.deepEqual(rows.map((row) => row.video_url), ['https://www.youtube.com/watch?v=BBBBBBBBBBB']);
  assert.ok(rows.every((row) => row.author_id === ids.system), `every reel must carry the pinned author: ${JSON.stringify(rows)}`);
  assert.ok(s.writes.some((w) => w.method === 'PATCH' && w.table === 'social_reels'), 'caption sync still runs after the bridge');
  assert.ok(!JSON.stringify(s.writes).includes(ids.horse), 'no write may name a horse');
});
