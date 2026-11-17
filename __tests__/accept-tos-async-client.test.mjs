import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bundled = require('next/dist/compiled/webpack/webpack');
const webpack = bundled.webpack || bundled.default;

// Exercise the real route and its real ESM re-export through Next's production
// bundler. Only external services are fixtures. An asynchronous dependency is
// essential: CommonJS destructuring reads a Promise before its exports exist.
test('compiled acceptance acknowledges only the stored current revision after authentication', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'accept-tos-bundle-'));
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const revision = '2026-11-16-87a8e57589a09136';
  const acceptedAt = '2026-11-16T18:00:00.123456+00:00';
  let handler;
  const state = (overrides = {}) => (globalThis.__acceptTosFixture = {
    auth: { user: { id: 'authenticated-user' }, error: null }, authCalls: 0,
    rpcData: { termsRevision: revision, acceptedAt }, rpcError: null, rpcCalls: [],
    legacyCached: false, legacyCacheCalls: 0, ...overrides,
  });
  const request = (body = { termsRevision: revision }, headers = { authorization: 'Bearer test-token', 'x-idempotency-key': 'same-key' }) => ({ method: 'POST', headers, body });
  const call = async (req = request()) => {
    const res = { headersSent: false, statusCode: 0, body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; this.headersSent = true; return this; },
    };
    await handler(req, res);
    return res;
  };
  try {
    const fixture = (name, source) => {
      const file = path.join(dir, name);
      writeFileSync(file, source);
      return file;
    };
    const client = fixture('client.mjs', `
      await Promise.resolve();
      export function createClient() {
        return { async rpc(name, args) {
          const s = globalThis.__acceptTosFixture;
          s.rpcCalls.push({ name, args });
          if (s.rpcThrows) throw Error('unavailable');
          return { data: s.rpcData, error: s.rpcError };
        } };
      }
    `);
    const auth = fixture('auth.mjs', 'export async function getServerUserWithFallback() { const s=globalThis.__acceptTosFixture; s.authCalls++; return s.auth; }');
    const rate = fixture('rate.cjs', 'exports.applyRateLimit = (req,res) => { if(globalThis.__acceptTosFixture.rateLimited){res.status(429).json({success:false});return false;}return true; };');
    const idem = fixture('idem.cjs', 'exports.checkIdempotency = (req,res) => { const s=globalThis.__acceptTosFixture;s.legacyCacheCalls++;if(s.legacyCached){res.status(200).json({success:true,acceptedAt:"2020-01-01T00:00:00Z"});return true;}return false; };');
    const localReporter = fixture('localReporter.mjs', 'export function reportApiError() {}');
    const root = process.cwd();
    const aliases = {
      [path.join(root, 'src/lib/serverAuth')]: auth,
      [path.join(root, 'src/lib/poker-engine/RateLimiter')]: rate,
      [path.join(root, 'src/lib/club-arena/idempotency')]: idem,
      [path.join(root, 'src/lib/apiErrorHandler')]: localReporter,
      '@smarter-poker/commander-shared/lib/supabaseServerClient': client,
    };
    await new Promise((resolve, reject) => {
      const compiler = webpack({
        mode: 'production', target: 'node',
        optimization: { minimize: false },
        entry: path.join(root, 'pages/api/club-arena/accept-tos.js'),
        output: { path: dir, filename: 'route.cjs', library: { type: 'commonjs2' } },
        experiments: { topLevelAwait: true },
        resolve: { alias: aliases, extensions: ['.js', '.mjs', '.cjs'] },
      });
      compiler.run((error, stats) => compiler.close((closeError) => {
        if (error || closeError) return reject(error || closeError);
        if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
        resolve();
      }));
    });
    ({ default: handler } = await require(path.join(dir, 'route.cjs')));
    await t.test('missing service configuration never fabricates acceptance', async () => {
      const s=state();delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      assert.equal((await call()).statusCode,503);assert.equal(s.rpcCalls.length,0);
    });
    // Synthetic configured key; no credentials, auth service or database used.
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-configured-service-key';
    await t.test('missing bearer and invalid authentication cannot write', async () => {
      let s=state();assert.equal((await call(request({termsRevision:revision},{}))).statusCode,401);assert.equal(s.rpcCalls.length,0);
      s=state({auth:{user:null,error:'invalid'}});assert.equal((await call()).statusCode,401);assert.equal(s.rpcCalls.length,0);
    });
    await t.test('unavailable session verification remains unavailable', async () => {
      const s=state({auth:{user:null,error:'SESSION_CHECK_UNAVAILABLE',status:503}});
      assert.equal((await call()).statusCode,503);assert.equal(s.rpcCalls.length,0);
    });
    await t.test('legacy and malformed bodies demand refresh without a mutation', async () => {
      for(const body of [{},null,[], 'body', {termsRevision:7}]){
        const s=state();const res=await call(request(body));assert.equal(res.statusCode,400);assert.equal(res.body.refreshRequired,true);assert.equal(s.rpcCalls.length,0);
      }
    });
    await t.test('wrong revision cannot be accepted or cached', async () => {
      const s=state({legacyCached:true});const res=await call(request({termsRevision:'older'}));
      assert.equal(res.statusCode,409);assert.equal(res.body.refreshRequired,true);assert.equal(s.rpcCalls.length,0);assert.equal(s.legacyCacheCalls,0);
    });
    await t.test('old response cache cannot bypass invalid current authentication', async () => {
      const s=state({legacyCached:true,auth:{user:null,error:'invalid'}});
      assert.equal((await call()).statusCode,401);assert.equal(s.rpcCalls.length,0);assert.equal(s.legacyCacheCalls,0);
    });
    await t.test('database newer-revision refusal demands refresh', async () => {
      state({rpcError:{code:'22023'}});const res=await call();assert.equal(res.statusCode,409);assert.equal(res.body.refreshRequired,true);
    });
    await t.test('missing profile is a conflict', async () => {
      state({rpcError:{code:'P0002'}});assert.equal((await call()).statusCode,409);
    });
    await t.test('missing RPC/schema and unknown errors never acknowledge or retry', async () => {
      for(const code of ['PGRST202','42883','42703','42P01','unknown']){
        const s=state({rpcError:{code}});assert.equal((await call()).statusCode,503);assert.equal(s.rpcCalls.length,1);
      }
      const s=state({rpcThrows:true});assert.equal((await call()).statusCode,503);assert.equal(s.rpcCalls.length,1);
    });
    await t.test('no-op, legacy success and mismatched persisted acknowledgements are unavailable', async () => {
      for(const rpcData of [null,{}, {success:true,acceptedAt}, {termsRevision:'older',acceptedAt},
        {termsRevision:revision}, {termsRevision:revision,acceptedAt:'not-a-date'},
        {termsRevision:revision,acceptedAt:Infinity},[{termsRevision:revision,acceptedAt}]]){
        const s=state({rpcData});assert.equal((await call()).statusCode,503);assert.equal(s.rpcCalls.length,1);
      }
    });
    await t.test('matching stored revision and time bind the authenticated user only', async () => {
      const s=state();const res=await call(request({termsRevision:revision,userId:'attacker-user'}));
      assert.equal(res.statusCode,200);assert.deepEqual(res.body,{success:true,termsRevision:revision,acceptedAt});
      assert.deepEqual(s.rpcCalls,[{name:'fn_ca_accept_terms_revision',args:{p_user_id:'authenticated-user',p_terms_revision:revision}}]);
    });
    await t.test('same-version retry verifies the database and preserves its original time', async () => {
      const s=state();const first=await call();const second=await call();assert.deepEqual(first.body,second.body);assert.equal(s.rpcCalls.length,2);assert.equal(s.legacyCacheCalls,0);
    });
    await t.test('method and rate guard remain authoritative', async () => {
      let s=state();assert.equal((await call({...request(),method:'GET'})).statusCode,405);assert.equal(s.rpcCalls.length,0);
      s=state({rateLimited:true});assert.equal((await call()).statusCode,429);assert.equal(s.rpcCalls.length,0);
    });
  } finally {
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
    delete globalThis.__acceptTosFixture;
    rmSync(dir, { recursive: true, force: true });
  }
});

// Companion wiring coverage: these four siblings shared the same async-module
// misuse. Their business behavior is not exercised by the acceptance fixture.
test('sibling client imports also wait for the asynchronous module', () => {
  for (const file of [
    'pages/api/club-arena/accept-tos.js',
    'pages/api/club-arena/public-clubs.js',
    'pages/api/club-arena/union-invoice.js',
    'pages/api/poker/engine/seat.js',
    'pages/api/poker/engine/tables.js',
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /require\([^\n]*supabaseServerClient/, file);
    assert.match(source, /(?:import[^\n]+from|await import\()[^\n]*supabaseServerClient/, file);
  }
});
