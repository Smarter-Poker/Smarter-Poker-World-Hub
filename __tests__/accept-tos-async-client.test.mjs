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
test('compiled acceptance waits for the async client export before recording consent', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'accept-tos-bundle-'));
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const fixture = (name, source) => {
      const file = path.join(dir, name);
      writeFileSync(file, source);
      return file;
    };
    const client = fixture('client.mjs', `
      await Promise.resolve();
      export function createClient() {
        return { from(table) {
          if (table !== 'profiles') throw Error('wrong table');
          return { update(values) { return { async eq(column, id) {
            if (column !== 'id' || id !== 'test-user' || !values.club_arena_tos_accepted_at)
              throw Error('acceptance was not recorded for authenticated user');
            return { error: null };
          } }; } };
        } };
      }
    `);
    const auth = fixture('auth.mjs', 'export async function getServerUserWithFallback() { return { user: { id: "test-user" }, error: null }; }');
    const rate = fixture('rate.cjs', 'exports.applyRateLimit = () => true;');
    const idem = fixture('idem.cjs', 'exports.checkIdempotency = () => false;');
    const sentry = fixture('sentry.mjs', 'export function reportApiError() {}');
    const root = process.cwd();
    const aliases = {
      [path.join(root, 'src/lib/serverAuth')]: auth,
      [path.join(root, 'src/lib/poker-engine/RateLimiter')]: rate,
      [path.join(root, 'src/lib/club-arena/idempotency')]: idem,
      [path.join(root, 'src/lib/apiErrorHandler')]: sentry,
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
    // A synthetic configured key selects the production branch; no real
    // credentials, auth service, database or network are used by this test.
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-configured-service-key';
    const { default: handler } = await require(path.join(dir, 'route.cjs'));
    const res = { headersSent: false, statusCode: 0, body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; this.headersSent = true; return this; },
    };
    await handler({ method: 'POST', headers: { authorization: 'Bearer test-token', 'x-idempotency-key': 'test-request' }, body: {} }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.ok(Number.isFinite(Date.parse(res.body.acceptedAt)));
  } finally {
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
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
