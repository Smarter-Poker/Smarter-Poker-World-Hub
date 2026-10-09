import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const repoRoot = resolve(import.meta.dirname, '..');
const migrationPath = join(
  repoRoot,
  'supabase/migrations/20261009044054_caption_model_daily_budget_contract.sql',
);
const sql = readFileSync(migrationPath, 'utf8');
const code = sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

function pgTool(name) {
  return [
    process.env.PG17_BINDIR && join(process.env.PG17_BINDIR, name),
    join('/opt/homebrew/opt/postgresql@17/bin', name),
    join('/usr/local/opt/postgresql@17/bin', name),
    join('/usr/lib/postgresql/17/bin', name),
  ].filter(Boolean).find(existsSync);
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = server.address();
  await new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  return port;
}

async function serviceClient(port) {
  const client = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
  await client.connect();
  await client.query('SET ROLE service_role');
  await client.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)");
  return client;
}

test('caption budget source stays fail-closed, integer-only and service-private', () => {
  assert.match(code, /enabled boolean NOT NULL DEFAULT false/i);
  assert.match(code, /daily_budget_microusd bigint NOT NULL DEFAULT 0/i);
  assert.match(code, /request_reservation_microusd bigint NOT NULL DEFAULT 0/i);
  assert.match(code, /provider text,\s*model text,/i);
  assert.match(
    code,
    /provider_qualified_at timestamptz,\s*provider_qualified_model text,\s*provider_qualified_reservation_microusd bigint,/i,
  );
  assert.match(code, /provider_qualified_at < clock_timestamp\(\) - interval '24 hours'/i);
  assert.match(code, /btrim\(v_settings\.provider_qualified_model\) <> btrim\(v_settings\.model\)/i);
  assert.match(
    code,
    /v_settings\.provider_qualified_reservation_microusd\s*<> v_settings\.request_reservation_microusd/i,
  );
  assert.match(code, /status IN \('reserved', 'settled'\)/i);
  assert.match(code, /FOR UPDATE/i);
  assert.match(code, /content_settings AS s/i);
  assert.match(code, /s\.engine_enabled IS TRUE/i);
  assert.match(code, /COALESCE\(auth\.role\(\)::text, ''\) <> 'service_role'/i);
  assert.match(code, /REVOKE ALL ON FUNCTION public\.reserve_caption_model_budget\(text\) FROM PUBLIC, anon, authenticated/i);
  assert.match(code, /GRANT EXECUTE ON FUNCTION public\.settle_caption_model_budget\(uuid, text, bigint\) TO service_role/i);
  assert.doesNotMatch(code, /ALTER TABLE public\.content_settings/i);
  assert.doesNotMatch(code, /UPDATE public\.content_settings/i);
  assert.doesNotMatch(code, /gpt-|openai|anthropic|schedule|cron/i);
});

test('caption budget migration enforces atomic reservation, bounded settlement and least privilege on PostgreSQL 17', async (t) => {
  const initdb = pgTool('initdb');
  const pgCtl = pgTool('pg_ctl');
  const postgres = pgTool('postgres');
  const scratchBase = process.env.CAPTION_BUDGET_POSTGRES_ROOT;
  if (!initdb || !pgCtl || !postgres || !scratchBase || !existsSync(scratchBase)) {
    t.skip('PostgreSQL 17 tools and CAPTION_BUDGET_POSTGRES_ROOT are required');
    return;
  }
  assert.match(execFileSync(postgres, ['--version'], { encoding: 'utf8' }), /\b17\./);

  const scratch = mkdtempSync(join(scratchBase, 'run-'));
  const data = join(scratch, 'data');
  const socket = join(scratch, 'socket');
  mkdirSync(socket);
  const port = await reservePort();
  let started = false;
  const admin = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
  const clients = [];
  try {
    execFileSync(initdb, ['-D', data, '-U', 'postgres', '--no-locale', '--encoding=UTF8'], {
      stdio: 'ignore',
    });
    execFileSync(pgCtl, [
      '-D', data,
      '-l', join(scratch, 'postgres.log'),
      '-o', `-F -p ${port} -c listen_addresses=127.0.0.1`,
      '-w', 'start',
    ], { stdio: 'ignore' });
    started = true;
    await admin.connect();
    await admin.query(`
      CREATE SCHEMA extensions;
      CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE SCHEMA auth;
      DO $roles$
      BEGIN
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END
      $roles$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT COALESCE(current_setting('request.jwt.claim.role', true), '')
      $$;
      CREATE TABLE public.content_settings (
        id integer PRIMARY KEY,
        ai_model text NOT NULL DEFAULT 'legacy-model',
        engine_enabled boolean NOT NULL DEFAULT false
      );
      INSERT INTO public.content_settings(id) VALUES (1);
    `);
    await admin.query(sql);

    const seeded = await admin.query('SELECT * FROM public.caption_model_budget_settings');
    assert.deepEqual(
      {
        enabled: seeded.rows[0].enabled,
        provider: seeded.rows[0].provider,
        model: seeded.rows[0].model,
        qualifiedAt: seeded.rows[0].provider_qualified_at,
        qualifiedModel: seeded.rows[0].provider_qualified_model,
        qualifiedReservation: seeded.rows[0].provider_qualified_reservation_microusd,
        daily: seeded.rows[0].daily_budget_microusd,
        request: seeded.rows[0].request_reservation_microusd,
      },
      {
        enabled: false,
        provider: null,
        model: null,
        qualifiedAt: null,
        qualifiedModel: null,
        qualifiedReservation: null,
        daily: '0',
        request: '0',
      },
    );
    assert.equal(
      (await admin.query('SELECT ai_model FROM public.content_settings WHERE id=1')).rows[0].ai_model,
      'legacy-model',
    );
    const rpcSecurity = await admin.query(`
      SELECT p.proname, r.rolname AS owner, p.prosecdef, p.proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_roles r ON r.oid = p.proowner
       WHERE n.nspname = 'public'
         AND p.proname IN ('reserve_caption_model_budget', 'settle_caption_model_budget')
       ORDER BY p.proname
    `);
    assert.deepEqual(
      rpcSecurity.rows.map((row) => ({
        name: row.proname,
        owner: row.owner,
        securityDefiner: row.prosecdef,
        searchPath: row.proconfig,
      })),
      [
        {
          name: 'reserve_caption_model_budget',
          owner: 'postgres',
          securityDefiner: true,
          searchPath: ['search_path=pg_catalog, public, extensions'],
        },
        {
          name: 'settle_caption_model_budget',
          owner: 'postgres',
          securityDefiner: true,
          searchPath: ['search_path=pg_catalog, public, extensions'],
        },
      ],
    );

    const browser = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
    clients.push(browser);
    await browser.connect();
    await browser.query('SET ROLE authenticated');
    await assert.rejects(
      browser.query("SELECT * FROM public.reserve_caption_model_budget('browser')"),
      /permission denied/i,
    );
    await assert.rejects(
      browser.query('SELECT * FROM public.caption_model_budget_settings'),
      /permission denied/i,
    );

    const first = await serviceClient(port);
    clients.push(first);
    const serviceSettings = await first.query(`
      SELECT enabled, provider, model, provider_qualified_at, provider_qualified_model,
             provider_qualified_reservation_microusd,
             daily_budget_microusd, request_reservation_microusd
        FROM public.caption_model_budget_settings
    `);
    assert.equal(serviceSettings.rowCount, 1);
    await assert.rejects(
      first.query('SELECT * FROM public.caption_model_budget_ledger'),
      /permission denied/i,
    );
    await assert.rejects(
      first.query('UPDATE public.caption_model_budget_settings SET enabled=true WHERE id=1'),
      /permission denied/i,
    );
    let response = await first.query("SELECT * FROM public.reserve_caption_model_budget('disabled')");
    assert.equal(response.rows[0].decision, 'disabled');
    assert.equal(response.rows[0].reservation_id, null);

    await admin.query(`
      UPDATE public.content_settings SET engine_enabled = true WHERE id = 1;
      UPDATE public.caption_model_budget_settings
         SET enabled = true, daily_budget_microusd = 100,
             request_reservation_microusd = 60
       WHERE id = 1;
    `);
    response = await first.query("SELECT * FROM public.reserve_caption_model_budget('unconfigured')");
    assert.equal(response.rows[0].decision, 'unconfigured');

    await admin.query(`
      UPDATE public.caption_model_budget_settings
         SET provider = 'approved-provider', model = 'approved-model'
       WHERE id = 1
    `);
    response = await first.query("SELECT * FROM public.reserve_caption_model_budget('not-qualified')");
    assert.equal(response.rows[0].decision, 'unconfigured');

    await admin.query(`
      UPDATE public.caption_model_budget_settings
         SET provider_qualified_at = clock_timestamp() - interval '25 hours',
             provider_qualified_model = 'approved-model',
             provider_qualified_reservation_microusd = 60
       WHERE id = 1
    `);
    response = await first.query("SELECT * FROM public.reserve_caption_model_budget('stale-qualified')");
    assert.equal(response.rows[0].decision, 'unconfigured');

    await admin.query(`
      UPDATE public.caption_model_budget_settings
         SET provider_qualified_at = clock_timestamp(),
             provider_qualified_model = 'different-model',
             provider_qualified_reservation_microusd = 60
       WHERE id = 1
    `);
    response = await first.query("SELECT * FROM public.reserve_caption_model_budget('wrong-qualified-model')");
    assert.equal(response.rows[0].decision, 'unconfigured');

    await admin.query(`
      UPDATE public.caption_model_budget_settings
         SET provider_qualified_at = clock_timestamp(),
             provider_qualified_model = 'approved-model',
             provider_qualified_reservation_microusd = 59
       WHERE id = 1
    `);
    response = await first.query("SELECT * FROM public.reserve_caption_model_budget('wrong-qualified-reservation')");
    assert.equal(response.rows[0].decision, 'unconfigured');

    await admin.query(`
      UPDATE public.caption_model_budget_settings
         SET provider_qualified_at = clock_timestamp(),
             provider_qualified_model = 'approved-model',
             provider_qualified_reservation_microusd = 60
       WHERE id = 1
    `);

    const second = await serviceClient(port);
    clients.push(second);
    const concurrent = await Promise.all([
      first.query("SELECT * FROM public.reserve_caption_model_budget('concurrent-a')"),
      second.query("SELECT * FROM public.reserve_caption_model_budget('concurrent-b')"),
    ]);
    const decisions = concurrent.map((result) => result.rows[0].decision).sort();
    assert.deepEqual(decisions, ['budget_exhausted', 'reserved']);
    const reserved = concurrent.map((result) => result.rows[0]).find((row) => row.decision === 'reserved');
    const exhaustedKey = concurrent[0].rows[0].decision === 'budget_exhausted'
      ? 'concurrent-a'
      : 'concurrent-b';
    const reservedKey = exhaustedKey === 'concurrent-a' ? 'concurrent-b' : 'concurrent-a';

    response = await first.query(
      'SELECT * FROM public.reserve_caption_model_budget($1)',
      [reservedKey],
    );
    assert.equal(response.rows[0].decision, 'duplicate');
    assert.equal(response.rows[0].reservation_id, reserved.reservation_id);

    await assert.rejects(
      first.query(
        "SELECT * FROM public.settle_caption_model_budget($1,'wrong-key',40)",
        [reserved.reservation_id],
      ),
      /does not own/i,
    );
    await assert.rejects(
      first.query(
        'SELECT * FROM public.settle_caption_model_budget($1,$2,61)',
        [reserved.reservation_id, reservedKey],
      ),
      /exceeds reserved/i,
    );

    response = await first.query(
      'SELECT * FROM public.settle_caption_model_budget($1,$2,40)',
      [reserved.reservation_id, reservedKey],
    );
    assert.deepEqual(response.rows[0], {
      settled: true,
      charged_microusd: '40',
      committed_microusd: '40',
    });
    response = await first.query(
      'SELECT * FROM public.settle_caption_model_budget($1,$2,40)',
      [reserved.reservation_id, reservedKey],
    );
    assert.equal(response.rows[0].committed_microusd, '40');
    await assert.rejects(
      first.query(
        'SELECT * FROM public.settle_caption_model_budget($1,$2,41)',
        [reserved.reservation_id, reservedKey],
      ),
      /disagrees/i,
    );

    response = await second.query(
      'SELECT * FROM public.reserve_caption_model_budget($1)',
      [exhaustedKey],
    );
    assert.equal(response.rows[0].decision, 'reserved');
    assert.equal(response.rows[0].committed_microusd, '100');
    const secondReservation = response.rows[0];

    await admin.query(`
      UPDATE public.caption_model_budget_settings
         SET daily_budget_microusd = 150, request_reservation_microusd = 70,
             provider_qualified_reservation_microusd = 70,
             provider_qualified_at = clock_timestamp()
       WHERE id = 1
    `);
    const overlap = await Promise.all([
      second.query(
        'SELECT * FROM public.settle_caption_model_budget($1,$2,0)',
        [secondReservation.reservation_id, exhaustedKey],
      ),
      first.query("SELECT * FROM public.reserve_caption_model_budget('settle-reserve-overlap')"),
    ]);
    assert.equal(overlap[0].rows[0].settled, true);
    assert.ok(['reserved', 'budget_exhausted'].includes(overlap[1].rows[0].decision));
    response = await first.query(
      "SELECT * FROM public.reserve_caption_model_budget('settle-reserve-overlap')",
    );
    assert.ok(['reserved', 'duplicate'].includes(response.rows[0].decision));
    assert.equal(response.rows[0].committed_microusd, '110');

    const ledger = await admin.query(`
      SELECT status, reserved_microusd, charged_microusd
        FROM public.caption_model_budget_ledger
       WHERE idempotency_key = 'settle-reserve-overlap'
    `);
    assert.deepEqual(ledger.rows[0], {
      status: 'reserved',
      reserved_microusd: '70',
      charged_microusd: null,
    });

    await admin.query('UPDATE public.content_settings SET engine_enabled = false WHERE id = 1');
    response = await first.query("SELECT * FROM public.reserve_caption_model_budget('master-off')");
    assert.equal(response.rows[0].decision, 'disabled');
    response = await first.query(
      'SELECT * FROM public.reserve_caption_model_budget($1)',
      [reservedKey],
    );
    assert.equal(response.rows[0].decision, 'duplicate');
  } finally {
    await Promise.allSettled(clients.map((client) => client.end()));
    await admin.end().catch(() => {});
    if (started) {
      execFileSync(pgCtl, ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
    }
    rmSync(scratch, { recursive: true, force: true });
  }
});
