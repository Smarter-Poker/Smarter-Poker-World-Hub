import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.env.RETIRED_PROVIDER_TEST_ROOT || path.resolve(new URL('..', import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const retired = /@sentry\/|\bsentry[\w.-]*|(?:NEXT_PUBLIC_|VITE_)?SENTRY_[A-Z_]+|(?:get|with|reportTo)Sentry\w*/i;

function sourceFiles(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' || entry.name === 'node_modules' ? [] : sourceFiles(file);
    return (/\.(?:[cm]?js|jsx|tsx?)$/.test(entry.name) || (file.startsWith('public/') && /\.(?:html|json|map)$/.test(entry.name))) ? [file] : [];
  });
}

test('retired provider has no dependency, runtime loader, API bridge or scheduled job', () => {
  assert.doesNotMatch(read('scripts/openclaw-cron-dispatcher.py'), /\/(?:api|cron)\/clawbot[/-]orchestrator/, 'provider-only worker task must have no schedule or routing entry');
  for (const file of ['package.json', 'package-lock.json', 'next.config.js', 'vercel.json', '.env.example', 'scripts/ci/vercel-env-baseline.json', 'middleware.ts']) {
    assert.doesNotMatch(read(file), retired, file);
  }
  for (const file of ['sentry.client.config.js', 'sentry.server.config.js', 'sentry.edge.config.js', 'src/instrumentation-client.js', 'src/lib/sentry.js', 'src/lib/sentryWrap.js', 'vendor/commander-shared/src/lib/sentryWrap.js', 'pages/api/cron/sentry-signup-bridge.js', 'pages/api/clawbot/sentry-triage.js', 'resolve-sentry-issues.js', '.agent/skills/sentry-mcp/SKILL.md']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, `${file} must stay retired`);
  }
});

test('active product source cannot reintroduce the retired SDK, transport or wrapper', () => {
  const offenders = ['pages', 'app', 'public', 'src', 'utils', 'vendor/commander-shared/src'].flatMap(sourceFiles).filter((file) => retired.test(read(file)));
  assert.deepEqual(offenders, []);
});

test('active operator guidance does not ask agents to reconnect the retired provider', () => {
  for (const file of ['docs/SIGNUP_RUNBOOK.md', '.agent/skills/club-commander/ANTIGRAVITY_TASKS.md', '.agent/skills/club-commander/IMPLEMENTATION_PHASES.md', '.agent/skills/club-commander/BUILD_PLAN.md', '.agent/skills/whats-next-roadmap/SKILL.md', '.agent/architecture/ONE-SOURCE-OF-TRUTH.md', '.agent/architecture/club-arena-operations-api.md', 'CLUB_COMMANDER_BUILD_PLAN.md']) {
    assert.doesNotMatch(read(file), retired, file);
  }
});

test('existing first-party crash storage, auth error route and production guard remain wired', () => {
  for (const file of ['src/components/ui/HubErrorBoundary.jsx', 'src/components/ui/PageErrorBoundary.jsx']) {
    assert.match(read(file), /reportClientCrash\(\{/);
  }
  assert.match(read('pages/api/client-crash.js'), /from\('client_crash_log'\)/);
  assert.match(read('pages/api/auth/log-client-error.js'), /from\('client_crash_log'\)/);
  assert.match(read('src/instrumentation.js'), /checkProductionEnv\(\{ force: true \}\)/);
  assert.match(read('src/hooks/useYouTubeErrorManager.js'), /reportFailureToServer\(videoId, errorCode, surface\)/);
});

async function load(file, dependencies = {}, globals = {}) {
  const context = vm.createContext({ console: { warn() {}, error() {}, debug() {} }, process: { env: { NODE_ENV: 'production' } }, ...globals });
  const module = new vm.SourceTextModule(read(file), { context });
  await module.link(async (specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `unexpected runtime dependency: ${specifier}`);
    const values = dependencies[specifier];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

function response(headersSent = false) {
  return { headersSent, statusCode: null, body: null,
    status(code) { assert.equal(this.headersSent, false); this.statusCode = code; return this; },
    json(body) { this.body = JSON.parse(JSON.stringify(body)); this.headersSent = true; return this; },
  };
}

test('shared local wrapper preserves success, safe errors and already-sent responses without a network transport', async () => {
  const rows = [];
  const api = await load('vendor/commander-shared/src/lib/apiErrorHandler.js', {}, {
    console: { error(...args) { rows.push(args); } },
    fetch() { throw new Error('unexpected network call'); },
  });
  assert.equal(await api.withApiErrorHandler(async () => 42)({ url: '/api/test?secret=hidden', method: 'POST' }, response()), 42);
  const res = response();
  await api.withApiErrorHandler(async () => { throw 'deliberate failure'; })({ url: '/api/test?secret=hidden', method: 'POST', body: { private: true } }, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { success: false, error: 'Internal server error' });
  assert.equal(rows[0][1].route, '/api/test');
  assert.equal(JSON.stringify(rows).includes('secret'), false);
  assert.equal(JSON.stringify(rows).includes('private'), false);
  const sent = response(true);
  await api.withApiErrorHandler(async () => { throw 'deliberate failure'; })({}, sent);
  assert.equal(sent.statusCode, null);
});

test('signup still normalizes failures and returns provisioned results with no telemetry SDK', async () => {
  let result = { error: { message: 'User already registered' } };
  const sdk = await load('src/lib/auth/sdk.js', { '../supabase': { supabase: { auth: { signUp: async () => result } } } });
  const args = { email: 'person@example.test', password: 'long-test-password' };
  assert.equal((await sdk.signupUser(args)).error.code, 'enumeration_avoided');
  assert.equal((await sdk.signupUser({ ...args, password: 'short' })).error.code, 'weak_password');
  result = { data: { user: { id: 'fixture-user' }, session: null } };
  const success = await sdk.signupUser(args);
  assert.equal(success.user.id, 'fixture-user');
  assert.equal(success.error, null);
});

test('auth error reporting retains rate limits, allowlisting, truncation and durable crash records', async () => {
  const records = [];
  let allowed = true;
  const api = await load('pages/api/auth/log-client-error.js', {
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => allowed },
    '../../../src/lib/supabaseServerClient': { createClient: () => ({ from(table) {
      assert.equal(table, 'client_crash_log');
      return { async insert(row) { records.push(row); return { error: null }; } };
    } }) },
  }, { process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-only' } }, fetch() { throw new Error('unexpected external transport'); } });
  const req = { method: 'POST', headers: {}, body: { flow: 'not-allowed', message: 'x'.repeat(700), url: '/auth/login?private=1' } };
  const res = response();
  await api.default(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(records.length, 1);
  assert.equal(records[0].section, 'unknown');
  assert.equal(records[0].message.length, 500);
  assert.equal(records[0].route, '/auth/login');
  allowed = false;
  await api.default(req, response());
  assert.equal(records.length, 1);
});
