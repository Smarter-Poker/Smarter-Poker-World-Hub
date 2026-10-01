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
const migrationNames = [
  '20261001170000_lifetime_vip_card_reversal_safety.sql',
  '20261001173000_lifetime_vip_monthly_expiring_diamonds.sql',
  '20261001180000_marketplace_first_party_operations.sql',
];

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

const fixtureSql = String.raw`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;

CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claim.role', true), '')
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  is_vip boolean NOT NULL DEFAULT false,
  vip_tier text,
  vip_expires_at timestamptz,
  diamonds numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vip_lifetime_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  price_usd numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE FUNCTION public.settle_vip_lifetime_card_purchase_atomic(uuid,text,text)
RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('success', false) $$;

CREATE TABLE public.diamond_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  reason text,
  reference_id text UNIQUE,
  issuance_class text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.fn_ca_mint(
  p_asset text, p_destination text, p_target_id uuid, p_amount numeric,
  p_reason text, p_op_id text, p_class text DEFAULT 'admin'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_balance numeric; v_prior public.diamond_transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_prior FROM public.diamond_transactions WHERE reference_id = p_op_id;
  IF FOUND THEN
    SELECT diamonds INTO v_balance FROM public.profiles WHERE id = p_target_id;
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'balance_after', v_balance);
  END IF;
  UPDATE public.profiles SET diamonds = diamonds + p_amount, updated_at = now()
   WHERE id = p_target_id RETURNING diamonds INTO v_balance;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'profile_not_found'); END IF;
  INSERT INTO public.diamond_transactions(user_id, amount, reason, reference_id, issuance_class)
  VALUES (p_target_id, p_amount, p_reason, p_op_id, p_class);
  RETURN jsonb_build_object('ok', true, 'balance_after', v_balance);
END
$$;

CREATE FUNCTION public.fn_ca_burn(
  p_asset text, p_source text, p_target_id uuid, p_amount numeric,
  p_reason text, p_op_id text, p_class text DEFAULT 'admin'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_balance numeric; v_prior public.diamond_transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_prior FROM public.diamond_transactions WHERE reference_id = p_op_id;
  IF FOUND THEN
    SELECT diamonds INTO v_balance FROM public.profiles WHERE id = p_target_id;
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'balance_after', v_balance);
  END IF;
  UPDATE public.profiles SET diamonds = diamonds - p_amount, updated_at = now()
   WHERE id = p_target_id AND diamonds >= p_amount RETURNING diamonds INTO v_balance;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance'); END IF;
  INSERT INTO public.diamond_transactions(user_id, amount, reason, reference_id, issuance_class)
  VALUES (p_target_id, -p_amount, p_reason, p_op_id, p_class);
  RETURN jsonb_build_object('ok', true, 'balance_after', v_balance);
END
$$;

CREATE FUNCTION public.fixture_spend(p_user_id uuid, p_amount integer, p_reference text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.profiles SET diamonds = diamonds - p_amount WHERE id = p_user_id AND diamonds >= p_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'fixture insufficient balance'; END IF;
  INSERT INTO public.diamond_transactions(user_id, amount, reason, reference_id, issuance_class)
  VALUES (p_user_id, -p_amount, 'Marketplace PostgreSQL Verification Spend', p_reference, 'spend');
END
$$;

CREATE TABLE public.merchandise_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL,
  payment_method text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

test('Marketplace launch migrations execute and preserve paid-entitlement and promotional-wallet invariants on PostgreSQL 17', async (t) => {
  const initdb = pgTool('initdb');
  const pgCtl = pgTool('pg_ctl');
  const postgres = pgTool('postgres');
  const scratchBase = process.env.MARKETPLACE_POSTGRES_ROOT;
  if (!initdb || !pgCtl || !postgres || !scratchBase || !existsSync(scratchBase)) {
    t.skip('PostgreSQL 17 tools and MARKETPLACE_POSTGRES_ROOT are required');
    return;
  }
  assert.match(execFileSync(postgres, ['--version'], { encoding: 'utf8' }), /\b17\./);

  const scratch = mkdtempSync(join(scratchBase, 'run-'));
  const data = join(scratch, 'data');
  const socket = join(scratch, 'socket');
  mkdirSync(socket);
  const port = await reservePort();
  let started = false;
  const client = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
  try {
    execFileSync(initdb, ['-D', data, '-U', 'postgres', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' });
    execFileSync(pgCtl, [
      '-D', data,
      '-l', join(scratch, 'postgres.log'),
      '-o', `-F -p ${port} -c listen_addresses=127.0.0.1`,
      '-w', 'start',
    ], { stdio: 'ignore' });
    started = true;
    await client.connect();
    await client.query(fixtureSql);
    for (const name of migrationNames) {
      await client.query(readFileSync(join(repoRoot, 'supabase', 'migrations', name), 'utf8'));
    }
    await client.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)");

    const firstUser = '10000000-0000-0000-0000-000000000001';
    const firstPurchase = '20000000-0000-0000-0000-000000000001';
    await client.query(`
      INSERT INTO public.profiles(id,is_vip,vip_tier,vip_expires_at,diamonds)
      VALUES ($1,true,'monthly',now() + interval '20 days',1000)
    `, [firstUser]);
    await client.query(`
      INSERT INTO public.vip_lifetime_purchases(id,user_id,price_usd)
      VALUES ($1,$2,499.00)
    `, [firstPurchase, firstUser]);
    const settled = await client.query(
      'SELECT public.settle_vip_lifetime_card_purchase_atomic($1,$2,$3) AS result',
      [firstPurchase, 'cs_lifetime_1', 'pi_lifetime_1'],
    );
    assert.equal(settled.rows[0].result.success, true);
    assert.equal(settled.rows[0].result.duplicate, false);

    const partial = await client.query(
      "SELECT public.reconcile_vip_lifetime_card_reversal_atomic($1,49900,1000,'refund') AS result",
      [firstPurchase],
    );
    assert.equal(partial.rows[0].result.full_reversal, false);
    let profile = (await client.query('SELECT * FROM public.profiles WHERE id=$1', [firstUser])).rows[0];
    assert.equal(profile.vip_tier, 'lifetime');

    const refunded = await client.query(
      "SELECT public.reconcile_vip_lifetime_card_reversal_atomic($1,49900,49900,'refund') AS result",
      [firstPurchase],
    );
    assert.equal(refunded.rows[0].result.profile_restored, true);
    profile = (await client.query('SELECT * FROM public.profiles WHERE id=$1', [firstUser])).rows[0];
    assert.equal(profile.vip_tier, 'monthly');
    assert.equal(profile.vip_lifetime_card_purchase_id, null);

    const wonAfterRefund = await client.query(
      "SELECT public.reconcile_vip_lifetime_card_reversal_atomic($1,49900,49900,'dispute_closed_won',$2,49900) AS result",
      [firstPurchase, 'dp_after_refund'],
    );
    assert.equal(wonAfterRefund.rows[0].result.restored, false);
    assert.equal(wonAfterRefund.rows[0].result.refund_preserved, true);
    profile = (await client.query('SELECT * FROM public.profiles WHERE id=$1', [firstUser])).rows[0];
    assert.equal(profile.vip_tier, 'monthly');

    const lifetimeUser = '10000000-0000-0000-0000-000000000002';
    await client.query(`
      INSERT INTO public.profiles(id,is_vip,vip_tier,diamonds,lifetime_vip_since)
      VALUES ($1,true,'lifetime',1000,date_trunc('month', now()) - interval '1 day')
    `, [lifetimeUser]);
    const currentMonth = (await client.query(
      "SELECT date_trunc('month', now() AT TIME ZONE 'America/Chicago')::date AS month"
    )).rows[0].month;
    const grant = await client.query(
      'SELECT public.grant_lifetime_vip_monthly_diamonds($1,$2) AS result',
      [lifetimeUser, currentMonth],
    );
    assert.equal(grant.rows[0].result.success, true);
    assert.equal(grant.rows[0].result.amount, 2000);
    assert.equal(Number((await client.query('SELECT diamonds FROM public.profiles WHERE id=$1', [lifetimeUser])).rows[0].diamonds), 3000);
    const duplicate = await client.query(
      'SELECT public.grant_lifetime_vip_monthly_diamonds($1,$2) AS result',
      [lifetimeUser, currentMonth],
    );
    assert.equal(duplicate.rows[0].result.duplicate, true);

    await client.query('SELECT public.fixture_spend($1,500,$2)', [lifetimeUser, 'fixture-spend-1']);
    let lot = (await client.query(
      'SELECT * FROM public.lifetime_vip_diamond_lots WHERE user_id=$1', [lifetimeUser]
    )).rows[0];
    assert.equal(lot.remaining_amount, 1500);
    assert.equal(lot.consumed_amount, 500);

    await client.query(`
      UPDATE public.lifetime_vip_diamond_lots
         SET issued_at = now() - interval '91 days',
             expires_at = now() - interval '1 day'
       WHERE id = $1
    `, [lot.id]);
    const expiry = await client.query(
      'SELECT public.expire_lifetime_vip_diamond_lots(100,now()) AS result'
    );
    assert.equal(expiry.rows[0].result.expired, 1500);
    lot = (await client.query(
      'SELECT * FROM public.lifetime_vip_diamond_lots WHERE id=$1', [lot.id]
    )).rows[0];
    assert.equal(lot.status, 'expired');
    assert.equal(Number((await client.query('SELECT diamonds FROM public.profiles WHERE id=$1', [lifetimeUser])).rows[0].diamonds), 1000);

    await client.query(`
      INSERT INTO public.merchandise_orders(status,payment_method,metadata)
      VALUES ('processing','card','{"needs_review":"not-a-boolean"}'::jsonb)
    `);
    const summary = await client.query(
      "SELECT public.marketplace_operations_summary(now() - interval '30 days') AS result"
    );
    assert.equal(summary.rows[0].result.success, true);
    assert.equal(Number(summary.rows[0].result.orders.created), 1);
  } finally {
    await client.end().catch(() => {});
    if (started) {
      try {
        execFileSync(pgCtl, ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
      } catch {}
    }
    rmSync(scratch, { recursive: true, force: true });
  }
});
