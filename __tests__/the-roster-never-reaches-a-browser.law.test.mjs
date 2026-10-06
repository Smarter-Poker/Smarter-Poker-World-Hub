/**
 * LAW - THE ROSTER NEVER REACHES A BROWSER (2026-10-05)
 *
 * Dan, 2026-09-02: "NOBODY SHOULD EVER EVER EVER BE ABLE TO LOOK AT OUR CODE
 * OR USE A DEVELOPER TOOL AND FIND THIS OUT."
 *
 * public.content_authors is the roster: 1,000 of its rows carry a horse's
 * profile_id and none carries a human's. Until 2026-10-05 three browser
 * surfaces read it with the public key - the social feed and the profile page
 * (to decide who got the green "online" dot, which only roster members could
 * ever get, and to swap a profile's id for a roster row's) and the /horses
 * console (the whole roster). Any player could do the same from the Network
 * tab. Those reads moved server-side:
 *
 *   - presence: POST /api/social/presence answers ONE `online` list for any
 *     ids from fn_profile_presence alone, the definition every surface uses;
 *     a player with no browser keeps a real heartbeat written server-side, so
 *     the route reads no roster and runs no schedule;
 *   - the profile page uses the profile's own id for every player;
 *   - the console reads /api/horses/roster (operator auth, fleet.read).
 *
 * Once this is live, anon and authenticated lose SELECT on content_authors,
 * so a browser read that comes back is an outage as well as a leak.
 *
 * IF THIS FILE GOES RED, YOUR CHANGE IS THE BUG. Read the roster in a
 * pages/api route with the service role, and send the browser an answer that
 * is the same shape for a horse and a human.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CODE_EXT = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const rel = (abs) => relative(ROOT, abs).split('\\').join('/');

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');

// What a browser file must never contain.
const ROSTER_READ = /\.from\(\s*['"`]content_authors['"`]\s*\)/;
const ROSTER_REST = /\/rest\/v1\/content_authors\b/;
const ROSTER_SET = /\bhorseProfileIds\b/;
const SCHEDULE_IMPORT = /['"][^'"]*\/horsePresence(?:\.js)?['"]/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (CODE_EXT.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

/** Every page and app file a browser can load: everything outside the API trees. */
function entryFiles() {
  return [
    ...walk(join(ROOT, 'pages')).filter((f) => !rel(f).startsWith('pages/api/')),
    ...walk(join(ROOT, 'app')).filter((f) => !rel(f).startsWith('app/api/')),
  ];
}

const SPECIFIERS = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
];

function resolveSpecifier(fromFile, spec) {
  let base;
  if (spec.startsWith('./') || spec.startsWith('../')) base = resolve(dirname(fromFile), spec);
  else if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2));
  else return null;
  const candidates = [base, ...CODE_EXT.map((e) => base + e), ...CODE_EXT.map((e) => join(base, 'index' + e))];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile() && CODE_EXT.some((e) => c.endsWith(e))) return c;
  }
  return null;
}

/** The page files plus every in-repo module they import, transitively. */
function browserClosure() {
  const seen = new Set();
  const stack = entryFiles();
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const re of SPECIFIERS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code))) {
        const target = resolveSpecifier(file, m[1]);
        if (target && !rel(target).startsWith('pages/api/') && !rel(target).startsWith('app/api/')) stack.push(target);
      }
    }
  }
  return seen;
}

/** Browser files: every page, everything they import, and all React code under src. */
function browserFiles() {
  const files = browserClosure();
  for (const dir of ['src/components', 'src/hooks', 'src/contexts']) {
    for (const f of walk(join(ROOT, dir))) files.add(f);
  }
  return [...files];
}

test('the browser file set is real (pages, their imports, and the presence hook)', () => {
  const files = browserFiles().map(rel);
  assert.ok(files.includes('pages/hub/social-media/index.js'));
  assert.ok(files.includes('pages/hub/user/[username].js'));
  assert.ok(files.includes('pages/horses/index.js'));
  assert.ok(files.includes('src/hooks/usePresence.js'), 'the import walk reached src/');
  assert.ok(!files.some((f) => f.startsWith('pages/api/')), 'API routes are server code');
});

test('no browser file reads content_authors, keeps a roster set, or runs the schedule', () => {
  const offenders = [];
  for (const file of browserFiles()) {
    const code = stripComments(readFileSync(file, 'utf8'));
    if (ROSTER_READ.test(code)) offenders.push(`${rel(file)}: .from('content_authors')`);
    if (ROSTER_REST.test(code)) offenders.push(`${rel(file)}: /rest/v1/content_authors`);
    if (ROSTER_SET.test(code)) offenders.push(`${rel(file)}: horseProfileIds`);
    if (SCHEDULE_IMPORT.test(code)) offenders.push(`${rel(file)}: imports horsePresence`);
  }
  assert.deepEqual(offenders, [], 'the roster is server-only; ask a pages/api route instead');
});

/**
 * Every table that names, configures or describes the house players. Each is
 * read only by the service role; a browser read is a leak while the table is
 * open and an outage once it is closed. bot_profiles and personas list them by
 * name; content_settings is the content engine's cadence and model.
 */
const SERVER_ONLY_TABLES = [
  'content_authors',
  'clip_usage_log',
  'horse_post_modes',
  'bot_profiles',
  'personas',
  'content_settings',
];

test('no browser file reads a table that names or configures the house players', () => {
  const offenders = [];
  for (const file of browserFiles()) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const table of SERVER_ONLY_TABLES) {
      if (new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)`).test(code)) offenders.push(`${rel(file)}: .from('${table}')`);
      if (new RegExp(`/rest/v1/${table}\\b`).test(code)) offenders.push(`${rel(file)}: /rest/v1/${table}`);
    }
  }
  assert.deepEqual(offenders, [], 'server-only; ask a pages/api operator route instead');
});

test('the console reads the engine settings through the operator route', () => {
  const files = browserFiles().map(rel);
  assert.ok(files.includes('src/components/horses/SettingsPanel.jsx'), 'the import walk reaches the settings panel');
  for (const file of ['pages/horses/index.js', 'src/components/horses/SettingsPanel.jsx']) {
    assert.match(stripComments(read(file)), /action: 'read_settings'/, file);
  }
  const route = stripComments(read('pages/api/horses/stable-admin.js'));
  assert.match(route, /read_settings: PERMISSIONS\.CONSOLE_READ/);
  assert.match(route, /if \(action === 'read_settings'\) return readSettings\(db\);/);
});

test('the dead Vite console that read the roster with the anon key stays deleted', () => {
  assert.equal(existsSync(join(ROOT, 'src/content-engine/admin/HorsesAdmin.jsx')), false);
  assert.equal(existsSync(join(ROOT, 'src/content-engine/admin/main.jsx')), false);
});

test('the online dot is drawn from the presence answer, for anybody', () => {
  const feed = stripComments(read('pages/hub/social-media/index.js'));
  const profile = stripComments(read('pages/hub/user/[username].js'));
  for (const code of [feed, profile]) {
    assert.match(code, /usePresence\(presenceIds\)/);
    assert.match(code, /\{authorOnline && \(/);
    assert.doesNotMatch(code, /isHorseOnlineNow/);
  }
  assert.match(profile, /\{onlineIds\.has\(profile\.id\) && \(/);
  const hook = stripComments(read('src/hooks/usePresence.js'));
  assert.match(hook, /'\/api\/social\/presence'/);
  assert.match(hook, /body\.online/);
});

test('the profile page uses the profile id for every player', () => {
  const profile = stripComments(read('pages/hub/user/[username].js'));
  assert.match(profile, /const socialId = data\.id;/);
  assert.doesNotMatch(profile, /\.ilike\('name'/);
});

test('the console reads the roster through an operator route', () => {
  const page = stripComments(read('src/components/horses/StablePanel.jsx'));
  assert.match(page, /authFetch\(`\/api\/horses\/roster\?limit=\$\{ROSTER_PAGE_SIZE\}&offset=\$\{offset\}`\)/);
  const route = stripComments(read('pages/api/horses/roster.js'));
  assert.match(route, /export default withOperatorRoute\(spec, handle\)/);
  assert.match(route, /permission: PERMISSIONS\.FLEET_READ/);
  assert.match(route, /methods: \['GET'\]/);
});

// ── The presence route, run for real with its imports injected ──────────────

const PRESENCE_SOURCE = read('pages/api/social/presence.js');
const ts = require('typescript');

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ONLINE_A = ID(1);
const OFFLINE_A = ID(2);
const ONLINE_B = ID(3);
const OFFLINE_B = ID(4);
const TOKEN = 'caller-token-0123456789abcdef0123456789';

function loadPresence({ presenceRows = [], presenceError = null, user = { id: ID(99) } } = {}) {
  const calls = [];
  const createClient = (url, key, options) => {
    const auth = options?.global?.headers?.Authorization || null;
    return {
      auth: {},
      rpc(name, args) {
        calls.push({ kind: 'rpc', key, auth, name, args });
        return Promise.resolve({ data: presenceError ? null : presenceRows, error: presenceError });
      },
      from(table) {
        const q = { kind: 'from', key, auth, table, filters: [] };
        calls.push(q);
        const builder = {
          select(cols) { q.select = cols; return builder; },
          eq(col, v) { q.filters.push(['eq', col, v]); return builder; },
          in(col, v) { q.filters.push(['in', col, v]); return builder; },
          then(onOk, onErr) {
            return Promise.resolve({ data: [], error: null }).then(onOk, onErr);
          },
        };
        return builder;
      },
    };
  };
  const mocks = {
    '../../../src/lib/supabaseServerClient': { createClient },
    '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user, error: user ? null : 'no' }) },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: { max: 120, windowMs: 60000 } } },
  };
  const code = ts.transpileModule(PRESENCE_SOURCE, {
    fileName: 'presence.js',
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(
    (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    module,
    module.exports,
    { env: { SUPABASE_URL: 'https://presence.test.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' } }
  );
  return { mod: module.exports, calls };
}

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

const post = (ids, auth = `Bearer ${TOKEN}`) => ({
  method: 'POST',
  url: '/api/social/presence',
  headers: auth ? { authorization: auth } : {},
  body: { ids },
});

test('presence: one `online` list, in the order asked, from fn_profile_presence alone', async () => {
  const { mod, calls } = loadPresence({
    presenceRows: [
      { user_id: ONLINE_A, is_online: true },
      { user_id: OFFLINE_A, is_online: false },
      { user_id: ONLINE_B, is_online: true },
      { user_id: OFFLINE_B, is_online: false },
    ],
  });
  const res = fakeRes();
  await mod.default(post([ONLINE_B, OFFLINE_A, ONLINE_A, OFFLINE_B]), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['online', 'success'], 'no other field, ever');
  assert.deepEqual(res.body.online, [ONLINE_B, ONLINE_A]);
  assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');

  const rpcs = calls.filter((c) => c.kind === 'rpc');
  assert.equal(rpcs.length, 1);
  assert.equal(rpcs[0].name, 'fn_profile_presence', 'everybody is online by the platform definition');
  assert.equal(rpcs[0].auth, `Bearer ${TOKEN}`, 'asked as the caller');
  assert.deepEqual(calls.filter((c) => c.kind === 'from'), [], 'no table is read: no roster, no schedule');
});

test('presence: the route knows nothing about who anybody is', () => {
  const code = stripComments(PRESENCE_SOURCE);
  assert.doesNotMatch(code, /content_authors|horsePresence|isHorseOnlineNow|is_horse|\.from\(/);
  assert.equal(existsSync(join(ROOT, 'src/lib/horsePresence.js')), false, 'the schedule module is gone');
});

test('presence: every success response in the route is { success, online } and nothing else', () => {
  const code = stripComments(PRESENCE_SOURCE);
  const oks = code.match(/\.json\(\{\s*success:\s*true[^}]*\}\)/g) || [];
  assert.ok(oks.length >= 1);
  for (const ok of oks) assert.match(ok, /^\.json\(\{\s*success:\s*true,\s*online(?::\s*\[\])?\s*\}\)$/, ok);
});

test('presence: if the database cannot answer, nobody is online', async () => {
  const { mod } = loadPresence({
    presenceRows: [{ user_id: ONLINE_A, is_online: true }],
    presenceError: { message: 'rpc down' },
  });
  const res = fakeRes();
  await mod.default(post([ONLINE_A]), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.online, undefined);
});

test('presence: signed-in callers only, POST only, at most 200 uuids', async () => {
  let { mod } = loadPresence();
  let res = fakeRes();
  await mod.default(post([ONLINE_A], null), res);
  assert.equal(res.statusCode, 401);

  ({ mod } = loadPresence({ user: null }));
  res = fakeRes();
  await mod.default(post([ONLINE_A]), res);
  assert.equal(res.statusCode, 401);

  ({ mod } = loadPresence());
  res = fakeRes();
  await mod.default({ ...post([ONLINE_A]), method: 'GET' }, res);
  assert.equal(res.statusCode, 405);

  res = fakeRes();
  await mod.default(post(['not-a-uuid']), res);
  assert.equal(res.statusCode, 400);

  res = fakeRes();
  await mod.default(post(Array.from({ length: 201 }, (_, i) => ID(i + 1000))), res);
  assert.equal(res.statusCode, 400);

  assert.deepEqual(mod.parsePresenceIds({ ids: [ONLINE_A.toUpperCase(), ONLINE_A] }), { ids: [ONLINE_A] });
});
