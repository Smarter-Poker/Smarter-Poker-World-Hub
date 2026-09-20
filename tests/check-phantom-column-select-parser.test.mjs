import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { selectColumns } from '../scripts/ci/lib/phantom-column-select-parser.mjs';

// Exact projections used by cashoutBridge.js and subscription-rotation.mjs.
const CASHOUT_SELECT = 'id,club_id,player_id,agent_id,amount::text,status';
const ROTATION_SELECT = 'id,user_id,endpoint,p256dh,auth,device_id,transport,rotation_revision::text';

test('cashout amount and push revision casts retain their actual source columns', () => {
  assert.deepEqual(selectColumns(`'${CASHOUT_SELECT}'`),
    ['id', 'club_id', 'player_id', 'agent_id', 'amount', 'status']);
  assert.deepEqual(selectColumns(`'${ROTATION_SELECT}'`),
    ['id', 'user_id', 'endpoint', 'p256dh', 'auth', 'device_id', 'transport', 'rotation_revision']);
});

test('aliases, simple casts and a real column named text stay distinguishable', () => {
  assert.deepEqual(selectColumns("'total:amount::text, revision:rotation_revision::text, label:text, text, id'"),
    ['amount', 'rotation_revision', 'text', 'text', 'id']);
  assert.deepEqual(selectColumns('"total : amount :: numeric, id", { count: \'exact\' }'), ['amount', 'id']);
  assert.deepEqual(selectColumns('`id, created_at, amount::int8`'), ['id', 'created_at', 'amount']);
  assert.deepEqual(selectColumns("'\"total\":amount, \"total two\":amount::text'"), ['amount', 'amount']);
  assert.deepEqual(selectColumns("'missing_base::text, shown:another_missing_base::text'"),
    ['missing_base', 'another_missing_base']);
});

test('unsupported JSON, embed, wildcard and complex expressions remain conservative', () => {
  assert.deepEqual(selectColumns("'id, profiles:owner_id(name)'"), []);
  assert.deepEqual(selectColumns("'*, id, metadata->>amount::text, child.amount, joined!inner, \"Quoted\"'"), ['id']);
  assert.deepEqual(selectColumns("'amount::numeric::text, amount::pg_catalog.text, amount::text[], a:b:c, id'"), ['id']);
  assert.deepEqual(selectColumns("'amount::numeric(12,2), id'"), []);
  assert.deepEqual(selectColumns('columns'), []);
  assert.deepEqual(selectColumns('`${dynamicColumns}`'), []);
});

function runChecker(root, url) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(root, 'scripts/ci/check-phantom-columns.mjs'), '--json'], {
      cwd: root,
      timeout: 8_000,
      maxBuffer: 512 * 1024,
      // Do not inherit provider credentials, NODE_OPTIONS, proxies or real URLs.
      env: {
        NEXT_PUBLIC_SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: 'phantom-select-fixture-only',
      },
    }, (error, stdout, stderr) => {
      if (error && (typeof error.code !== 'number' || error.killed || error.signal)) {
        reject(error);
      } else {
        resolve({ code: error?.code ?? 0, stdout, stderr });
      }
    });
  });
}

test('real CHECK13 CLI accepts casts but still rejects absent base columns', { timeout: 30_000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'phantom-column-select-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scripts/ci/lib'), { recursive: true });
  await mkdir(path.join(root, 'src'), { recursive: true });
  // Copy only the maintained, dependency-free gate and its small JS modules.
  // Its actual import-relative repository discovery and exit policy remain intact.
  for (const relative of [
    'scripts/ci/check-phantom-columns.mjs',
    'scripts/ci/lib/phantom-column-select-parser.mjs',
    'scripts/ci/lib/phantom-column-write-parser.mjs',
    'scripts/ci/lib/from-calls.mjs',
    'scripts/ci/lib/resilient-fetch.mjs',
  ]) {
    await copyFile(new URL(`../${relative}`, import.meta.url), path.join(root, relative));
  }
  await writeFile(path.join(root, 'scripts/ci/supabase-invariants.allowlist.json'), '{"phantom_columns":{}}');
  const sourcePath = path.join(root, 'src/fixture.js');
  const source = `supabase.from('cashout_requests').select('${CASHOUT_SELECT}');\n` +
    `supabase.from('push_subscriptions').select('${ROTATION_SELECT}');\n`;
  const properties = names => Object.fromEntries(names.map(name => [name, { type: 'string' }]));
  const schema = { definitions: {
    cashout_requests: { properties: properties(['id', 'club_id', 'player_id', 'agent_id', 'amount', 'status']) },
    push_subscriptions: { properties: properties(['id', 'user_id', 'endpoint', 'p256dh', 'auth', 'device_id', 'transport', 'rotation_revision']) },
  } };
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, key: req.headers.apikey, authorization: req.headers.authorization });
    if (req.method !== 'GET' || req.url !== '/rest/v1/' || req.headers.apikey !== 'phantom-select-fixture-only' ||
        req.headers.authorization !== 'Bearer phantom-select-fixture-only') {
      res.writeHead(400); res.end('Unexpected fixture request'); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(schema));
  });
  t.after(async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  await writeFile(sourcePath, source);
  const good = await runChecker(root, url);
  assert.equal(good.code, 0, good.stderr || good.stdout);
  assert.deepEqual(JSON.parse(good.stdout), { phantom: [], staleAllow: [], checked: 14 });

  await writeFile(sourcePath, source + "supabase.from('cashout_requests').select('receipt_amount:missing_amount::text');\n");
  const missing = await runChecker(root, url);
  assert.equal(missing.code, 1, missing.stderr || missing.stdout);
  assert.deepEqual(JSON.parse(missing.stdout), {
    phantom: [{ key: 'cashout_requests.missing_amount', sites: ['src/fixture.js:3'] }],
    staleAllow: [], checked: 15,
  });

  await writeFile(sourcePath, "supabase.from('cashout_requests').select('text');\n");
  const literalText = await runChecker(root, url);
  assert.equal(literalText.code, 1, literalText.stderr || literalText.stdout);
  assert.deepEqual(JSON.parse(literalText.stdout), {
    phantom: [{ key: 'cashout_requests.text', sites: ['src/fixture.js:1'] }],
    staleAllow: [], checked: 1,
  });
  assert.deepEqual(requests, Array.from({ length: 3 }, () => ({ method: 'GET', url: '/rest/v1/',
    key: 'phantom-select-fixture-only', authorization: 'Bearer phantom-select-fixture-only' })));
});
