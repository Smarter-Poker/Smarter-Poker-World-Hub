import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const migration = readFileSync('supabase/migrations/20261003024500_reels_reconciliation_authority_repair.sql', 'utf8');

const pgBin = [process.env.PHASE6_POSTGRES_BIN, '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin']
  .filter(Boolean).find((candidate) => existsSync(join(candidate, 'postgres')));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test('real PostgreSQL installs the repair and follows exact interaction indexes', async (t) => {
  if (!pgBin) return t.skip('PostgreSQL 17 server tools are unavailable');
  const workRoot = process.env.SMARTER_WORK_ROOT || '/Volumes/SmarterWork/agent-work';
  mkdirSync(workRoot, { recursive: true });
  const root = mkdtempSync(join(workRoot, 'reels-pg-'));
  const data = join(root, 'data');
  const socket = join(root, 'socket');
  mkdirSync(socket);
  const port = await freePort();
  let started = false;
  let client;
  try {
    execFileSync(join(pgBin, 'initdb'), ['-D', data, '-U', 'postgres', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' });
    execFileSync(join(pgBin, 'pg_ctl'), ['-D', data, '-o', `-F -p ${port} -k ${socket} -c listen_addresses=''`, '-w', 'start'], { stdio: 'ignore' });
    started = true;
    execFileSync(join(pgBin, 'createdb'), ['-h', socket, '-p', String(port), '-U', 'postgres', 'reels_repair'], { stdio: 'ignore' });
    client = new Client({ host: socket, port, user: 'postgres', database: 'reels_repair' });
    await client.connect();
    await client.query(`
      CREATE SCHEMA extensions;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE social_reels (
        id uuid PRIMARY KEY, canonical_asset_key text NOT NULL, author_id uuid NOT NULL,
        is_public boolean NOT NULL DEFAULT true, is_deleted boolean NOT NULL DEFAULT false,
        native_processing_requested boolean NOT NULL DEFAULT false
      );
      CREATE TABLE social_reel_reconciliations (operation_id uuid PRIMARY KEY);
      CREATE TABLE social_reel_reconciliation_quarantine (
        operation_id uuid UNIQUE NOT NULL, canonical_asset_key text NOT NULL,
        proposed_canonical_reel_id uuid, proposed_alias_reel_ids uuid[] NOT NULL,
        reason_code text NOT NULL, request_payload jsonb NOT NULL, details jsonb NOT NULL
      );
      CREATE TABLE social_reel_aliases (
        alias_reel_id uuid PRIMARY KEY, canonical_reel_id uuid NOT NULL,
        canonical_asset_key text NOT NULL
      );
      CREATE TABLE social_likes (post_id uuid, user_id uuid);
      CREATE TABLE social_comments (post_id uuid);
      CREATE TABLE social_interactions (post_id uuid, user_id uuid, interaction_type text, metadata jsonb);
      CREATE TABLE saved_reels (reel_id uuid, user_id uuid);
      CREATE FUNCTION increment_reel_count(uuid, text) RETURNS void LANGUAGE sql AS 'SELECT';
      CREATE FUNCTION decrement_reel_count(uuid, text) RETURNS void LANGUAGE sql AS 'SELECT';
      CREATE FUNCTION reconcile_social_reel_duplicates(
        p_canonical_asset_key text, p_canonical_reel_id uuid, p_alias_reel_ids uuid[],
        p_reason text, p_operation_id uuid DEFAULT gen_random_uuid()
      ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $fixture$
      DECLARE v_ids uuid[] := ARRAY[p_canonical_reel_id] || p_alias_reel_ids; v_reason text;
      BEGIN
        v_reason := CASE
          WHEN EXISTS (
            SELECT 1 FROM public.social_interactions
            WHERE post_id = ANY(v_ids)
            GROUP BY user_id, interaction_type, COALESCE(metadata, '{}'::jsonb)
            HAVING count(*) > 1
          ) THEN 'interaction_collision'
          ELSE NULL
        END;
        RETURN jsonb_build_object('applied', v_reason IS NULL, 'reason', v_reason);
      END $fixture$;
    `);
    await client.query(migration);
    const canonical = '00000000-0000-4000-8000-000000000001';
    const alias = '00000000-0000-4000-8000-000000000002';
    const owner = '00000000-0000-4000-8000-000000000003';
    const viewer = '00000000-0000-4000-8000-000000000004';
    await client.query('INSERT INTO social_reels(id,canonical_asset_key,author_id) VALUES ($1,$3,$4),($2,$3,$4)', [canonical, alias, 'asset:test', owner]);
    await client.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)");
    await client.query("INSERT INTO social_interactions VALUES ($1,$3,'share','{\"surface\":\"a\"}'),($2,$3,'share','{\"surface\":\"a\"}')", [canonical, alias, viewer]);
    const safeShare = await client.query("SELECT reconcile_social_reel_duplicates('asset:test',$1,ARRAY[$2]::uuid[],'fixture',$3) AS result", [canonical, alias, '00000000-0000-4000-8000-000000000005']);
    assert.equal(safeShare.rows[0].result.applied, true);
    await client.query('DELETE FROM social_interactions');
    await client.query("INSERT INTO social_interactions VALUES ($1,$3,'comment_like','{}'),($2,$3,'comment_like','{}')", [canonical, alias, viewer]);
    const nullComments = await client.query("SELECT reconcile_social_reel_duplicates('asset:test',$1,ARRAY[$2]::uuid[],'fixture',$3) AS result", [canonical, alias, '00000000-0000-4000-8000-000000000006']);
    assert.equal(nullComments.rows[0].result.applied, true);
    const definition = await client.query("SELECT pg_get_functiondef('public.remove_owned_social_reel(uuid,uuid)'::regprocedure) AS source");
    assert.ok(definition.rows[0].source.indexOf("'reel-reconcile:' || v_asset_key") < definition.rows[0].source.indexOf('SELECT a.canonical_reel_id INTO v_canonical_id'));
  } finally {
    if (client) await client.end();
    if (started) execFileSync(join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
    rmSync(root, { recursive: true, force: true });
  }
});
