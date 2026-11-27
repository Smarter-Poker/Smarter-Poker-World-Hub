/**
 * A complimentary VIP term no longer blocks a paid Card subscription.
 *
 * Until 2026-11-27 claim_vip_subscription_checkout and
 * admit_vip_subscription_checkout refused whenever profiles.vip_expires_at was
 * in the future. A free trial writes the same column, so the member the
 * "1 USD first month" offer is for got 409 VIP_ENTITLEMENT_ACTIVE.
 *
 * Two layers:
 *   1. Text contracts on the migration. These always run (Vercel build too).
 *   2. The migration executed on a real PostgreSQL on top of the exact
 *      installed function bodies. Skips where no PostgreSQL tools exist or the
 *      process is root (initdb refuses root).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');
const md5 = (text) => createHash('md5').update(text).digest('hex');

const MIGRATION = 'supabase/migrations/20261127074620_vip_complimentary_term_does_not_block_card_subscription.sql';
const MUTEX = 'supabase/migrations/20260906213000_marketplace_phase7_vip_acquisition_mutex.sql';

const migration = read(MIGRATION);
const forward = migration.slice(0, migration.indexOf('\nCOMMIT;'));
const mutexForward = (() => {
  const text = read(MUTEX);
  return text.slice(0, text.indexOf('\nCOMMIT;'));
})();

function functionStatement(sql, name) {
  const header = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`);
  const match = header.exec(sql);
  assert.ok(match, `${name} is defined`);
  const end = sql.indexOf('$function$;', match.index);
  assert.ok(end > match.index, `${name} has a body`);
  return sql.slice(match.index, end + '$function$;'.length);
}

function functionBody(sql, name) {
  const statement = functionStatement(sql, name);
  const open = statement.indexOf('AS $function$') + 'AS $function$'.length;
  return statement.slice(open, statement.length - '$function$;'.length);
}

const OLD_TEST = `  IF v_profile.vip_tier = 'lifetime'
     OR (v_profile.vip_expires_at IS NOT NULL AND v_profile.vip_expires_at > now()) THEN
`;
const NEW_TEST = `  IF v_profile.vip_tier = 'lifetime'
     OR (
       v_profile.vip_expires_at IS NOT NULL
       AND v_profile.vip_expires_at > now()
       AND public.vip_running_term_is_complimentary(p_user_id) IS NOT TRUE
     ) THEN
`;

test('the migration is one transaction and changes functions only', () => {
  assert.equal(forward.match(/^BEGIN;$/gm)?.length, 1);
  assert.match(migration, /^COMMIT;$/m);
  const executable = forward.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
  for (const forbidden of [
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i,
    /\bALTER\s+TABLE\b/i,
    /\bCREATE\s+TABLE\b/i,
    /\bDROP\s+/i,
    /\bLOCK\s+TABLE\b/i,
    /\bINSERT\s+INTO\s+public\.(?:profiles|diamond_transactions|vip_gifts|vip_lifetime_purchases|vip_diamond_purchase_requests)\b/i,
    /\bUPDATE\s+public\.(?:profiles|diamond_transactions|diamond_wallets|vip_gifts)\b/i,
    /\bdiamonds\s*=/i,
  ]) {
    assert.doesNotMatch(executable, forbidden, `the migration must not contain ${forbidden}`);
  }
});

test('each checkout function differs from the installed body by the entitlement test alone', () => {
  for (const name of ['claim_vip_subscription_checkout', 'admit_vip_subscription_checkout']) {
    const before = functionBody(mutexForward, name);
    const after = functionBody(forward, name);
    assert.equal(before.split(OLD_TEST).length, 2, `${name}: one entitlement test before`);
    assert.equal(after.split(NEW_TEST).length, 2, `${name}: one entitlement test after`);
    const [head, tail] = before.split(OLD_TEST);
    assert.ok(after.startsWith(head), `${name}: everything before the test is carried forward`);
    assert.ok(after.endsWith(tail), `${name}: everything after the test is carried forward`);
    const inserted = after.slice(head.length, after.length - tail.length);
    const comment = inserted.slice(0, inserted.indexOf(NEW_TEST));
    assert.equal(inserted, comment + NEW_TEST);
    assert.ok(comment.split('\n').filter(Boolean).every((line) => line.trimStart().startsWith('--')),
      `${name}: the only other inserted lines are comments`);

    // The migration refuses to install over any other body, and proves what it installed.
    assert.ok(forward.includes(`IS DISTINCT FROM '${md5(before)}'`), `${name}: installed body is asserted`);
    assert.ok(forward.includes(`IS DISTINCT FROM '${md5(after)}'`), `${name}: new body is asserted`);

    const statement = functionStatement(forward, name);
    assert.match(statement, /SECURITY DEFINER\nSET search_path = public, extensions\nAS \$function\$/);
    assert.match(statement, /^CREATE OR REPLACE FUNCTION/);
    // Lock order is unchanged: profile, then the Card claim.
    const profileLock = after.indexOf('FROM public.profiles');
    const claimLock = after.indexOf('FROM public.vip_subscription_checkout_claims');
    assert.ok(profileLock > 0 && claimLock > profileLock);
    // The Phase 7 readiness marker still finds its protocol operations.
    assert.ok(after.includes('vip_entitlement_active'));
  }
  assert.ok(functionBody(forward, 'claim_vip_subscription_checkout').includes("state <> 'admitting'"));
  const admit = functionBody(forward, 'admit_vip_subscription_checkout');
  for (const needle of ['claim_conflict', "SET state = 'admitting'", 'SET stripe_subscription_id = p_stripe_subscription_id']) {
    assert.ok(admit.includes(needle), `admit keeps ${needle}`);
  }
  assert.match(forward, /marketplace_phase7_vip_acquisition_mutex_version\(\)\s+IS DISTINCT FROM 'marketplace_phase7_vip_acquisition_mutex:v1'/);
});

test('lifetime still refuses unconditionally and doubt still refuses', () => {
  // The lifetime arm is not behind the helper.
  assert.ok(NEW_TEST.startsWith("  IF v_profile.vip_tier = 'lifetime'\n     OR ("));
  // "IS NOT TRUE": a NULL or FALSE answer keeps the refusal.
  assert.ok(NEW_TEST.includes('IS NOT TRUE'));
  const helper = functionBody(forward, 'vip_running_term_is_complimentary');
  assert.match(helper, /^\s*SELECT COALESCE\(\(/);
  assert.match(helper, /\), false\)\s*$/);
});

test('the helper names every paid rail and the shape of a free grant', () => {
  const helper = functionBody(forward, 'vip_running_term_is_complimentary');
  for (const needle of [
    "(profile.vip_tier IS NULL OR profile.vip_tier = 'monthly')",
    'profile.vip_expires_at > now()',
    "profile.vip_expires_at <= now() + interval '62 days'",
    'profile.vip_gift_id IS NULL',
    'profile.vip_lifetime_card_purchase_id IS NULL',
    'profile.lifetime_vip_since IS NULL',
    'FROM public.vip_subscriptions subscription',
    'FROM public.vip_diamond_purchase_requests request',
    "ledger.transaction_type = 'vip_membership'",
    "ledger.type = 'vip_membership'",
    'gift.redeemed_at IS NOT NULL',
    "lifetime_purchase.status IN ('completed', 'refunded')",
  ]) {
    assert.ok(helper.includes(needle), `helper checks: ${needle}`);
  }
  assert.equal(helper.match(/AND NOT EXISTS \(/g)?.length, 6);
  assert.doesNotMatch(helper, /\b(?:INSERT|UPDATE|DELETE)\b/);
  assert.doesNotMatch(helper, /is_horse/, 'horses and humans are classified by the same rule');
  assert.ok(forward.includes(`IS DISTINCT FROM '${md5(helper)}'`));
  assert.match(forward, /REVOKE ALL ON FUNCTION public\.vip_running_term_is_complimentary\(uuid\)\s+FROM PUBLIC, anon, authenticated;/);
  assert.match(forward, /GRANT EXECUTE ON FUNCTION public\.vip_running_term_is_complimentary\(uuid\)\s+TO service_role;/);
});

test('the rollback restores the exact installed bodies', () => {
  const rollback = migration.slice(migration.indexOf('\nCOMMIT;'))
    .split('\n').map((line) => line.replace(/^-- ?/, '')).join('\n');
  for (const name of ['claim_vip_subscription_checkout', 'admit_vip_subscription_checkout']) {
    assert.equal(functionBody(rollback, name), functionBody(mutexForward, name));
  }
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.vip_running_term_is_complimentary\(uuid\);/);
});

test('the checkout route and webhook still handle the unchanged state name', () => {
  const checkout = read('pages/api/store/create-checkout-session.js');
  const webhook = read('pages/api/store/webhooks/stripe.js');
  assert.match(checkout, /claim\?\.state === 'vip_entitlement_active'/);
  assert.match(checkout, /code: 'VIP_ENTITLEMENT_ACTIVE'/);
  assert.match(webhook, /VIP_COMPENSATED_ADMISSION_DENIALS = new Set\(\[\s+'vip_entitlement_active'/);
  // The free phone-verification term is what must not block: same column, no paid record.
  const verifyOtp = read('pages/api/sms/verify-otp.js');
  assert.match(verifyOtp, /const PHONE_VIP_TRIAL_DAYS = 30;/);
  assert.match(verifyOtp, /updateFields\.vip_expires_at = vipExpires\.toISOString\(\);/);
});

// ---------------------------------------------------------------------------
// Executed on PostgreSQL
// ---------------------------------------------------------------------------

function pgTool(name) {
  return [
    process.env.PG_BINDIR && join(process.env.PG_BINDIR, name),
    process.env.PG17_BINDIR && join(process.env.PG17_BINDIR, name),
    join('/opt/homebrew/opt/postgresql@17/bin', name),
    join('/usr/local/opt/postgresql@17/bin', name),
    join('/usr/lib/postgresql/17/bin', name),
    join('/usr/lib/postgresql/16/bin', name),
  ].filter(Boolean).find(existsSync);
}

const fixtureSql = String.raw`
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_vip boolean NOT NULL DEFAULT false,
  vip_tier text,
  vip_expires_at timestamptz,
  vip_gift_id uuid,
  vip_lifetime_card_purchase_id uuid,
  lifetime_vip_since timestamptz,
  stripe_customer_id text,
  diamonds bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.vip_subscription_checkout_claims (
  user_id uuid PRIMARY KEY,
  request_id text NOT NULL,
  intent_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('initializing', 'open', 'admitting')),
  session_id text,
  session_url text,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.vip_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  plan text,
  tier text,
  status text,
  price_usd numeric,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.vip_diamond_purchase_requests (
  reference_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.diamond_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  type text,
  transaction_type text,
  amount bigint NOT NULL DEFAULT 0,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.vip_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid,
  recipient_id uuid,
  plan text,
  status text NOT NULL DEFAULT 'pending',
  redeemed_at timestamptz,
  granted_entitlement jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.vip_lifetime_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  entitlement_acquired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Stand-in for the Phase 7 readiness marker: same two facts it reads about
-- these two functions (surviving comment, surviving protocol text).
CREATE FUNCTION public.marketplace_phase7_vip_acquisition_mutex_version()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN
    obj_description(to_regprocedure('public.claim_vip_subscription_checkout(uuid,text,text,integer)'), 'pg_proc')
      = 'marketplace_phase7_vip_acquisition_mutex:v1'
    AND obj_description(to_regprocedure('public.admit_vip_subscription_checkout(uuid,text,text,text,text)'), 'pg_proc')
      = 'marketplace_phase7_vip_acquisition_mutex:v1'
    AND strpos(pg_get_functiondef(to_regprocedure('public.claim_vip_subscription_checkout(uuid,text,text,integer)')), 'vip_entitlement_active') > 0
    AND strpos(pg_get_functiondef(to_regprocedure('public.admit_vip_subscription_checkout(uuid,text,text,text,text)')), 'SET state = ''admitting''') > 0
  THEN 'marketplace_phase7_vip_acquisition_mutex:v1' END
$$;
`;

const HASH = 'a'.repeat(64);

test('the migration executes on PostgreSQL and admits only provably free terms', async (t) => {
  const initdb = pgTool('initdb');
  const pgCtl = pgTool('pg_ctl');
  if (!initdb || !pgCtl) {
    t.skip('PostgreSQL server tools are not installed');
    return;
  }
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('initdb refuses to run as root');
    return;
  }
  const require = createRequire(import.meta.url);
  const { Client } = require('pg');
  const root = mkdtempSync(join(tmpdir(), 'vipterm-'));
  const data = join(root, 'd');
  let started = false;
  let client;
  try {
    execFileSync(initdb, ['-D', data, '-U', 'postgres', '--no-locale', '--encoding=UTF8', '-A', 'trust'], { stdio: 'ignore' });
    execFileSync(pgCtl, ['-D', data, '-w', '-o', `-c listen_addresses='' -c unix_socket_directories='${root}' -c fsync=off`, '-l', join(root, 'log'), 'start'], { stdio: 'ignore' });
    started = true;
    client = new Client({ host: root, user: 'postgres', database: 'postgres' });
    await client.connect();

    await client.query(fixtureSql);
    // The exact installed bodies, from the migration that installed them.
    for (const name of [
      'claim_vip_subscription_checkout',
      'admit_vip_subscription_checkout',
      'apply_vip_subscription_projection',
    ]) {
      await client.query(functionStatement(mutexForward, name));
    }
    await client.query(`
      COMMENT ON FUNCTION public.claim_vip_subscription_checkout(uuid,text,text,integer) IS 'marketplace_phase7_vip_acquisition_mutex:v1';
      COMMENT ON FUNCTION public.admit_vip_subscription_checkout(uuid,text,text,text,text) IS 'marketplace_phase7_vip_acquisition_mutex:v1';
    `);

    const member = async (fields = {}) => {
      const columns = Object.keys(fields);
      const sql = columns.length
        ? `INSERT INTO public.profiles(${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`
        : 'INSERT INTO public.profiles DEFAULT VALUES RETURNING id';
      return (await client.query(sql, Object.values(fields))).rows[0].id;
    };
    const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString();
    let serial = 0;
    const claim = async (userId) => {
      const request = `req-${++serial}`;
      const { rows } = await client.query(
        'SELECT public.claim_vip_subscription_checkout($1, $2, $3, 300) AS r', [userId, request, HASH]
      );
      return { ...rows[0].r, request };
    };
    const admit = async (userId, request, subscriptionId = `sub_${++serial}`) => {
      const { rows } = await client.query(
        'SELECT public.admit_vip_subscription_checkout($1, $2, $3, $4, NULL) AS r',
        [userId, subscriptionId, request, HASH]
      );
      return { ...rows[0].r, subscriptionId };
    };
    const freshAdmit = (userId) => admit(userId, `adm-${++serial}`);
    const profile = async (userId) => (await client.query(
      'SELECT is_vip, vip_tier, vip_expires_at FROM public.profiles WHERE id = $1', [userId]
    )).rows[0];
    const project = async (userId, admission, request, status, periodEndDays, extra = {}) => (await client.query(
      `SELECT public.apply_vip_subscription_projection(
         $1, $2, 'cus_test', $3, $4, 'monthly', $5, 1.00, now() - interval '31 days', $6, false, $7) AS r`,
      [userId, admission.subscriptionId, request, HASH, status, inDays(periodEndDays), extra.canceledAt || null]
    )).rows[0].r;

    // BEFORE the migration: the defect. A free trial blocks Card Checkout.
    const before = await member({ is_vip: true, vip_expires_at: inDays(20) });
    assert.equal((await claim(before)).state, 'vip_entitlement_active');
    assert.equal((await freshAdmit(before)).state, 'vip_entitlement_active');

    await client.query(migration.slice(0, migration.indexOf('\nCOMMIT;') + '\nCOMMIT;'.length));

    // Replaying the migration is refused by its own pre-flight (never applied twice).
    await assert.rejects(
      client.query(migration.slice(0, migration.indexOf('\nCOMMIT;') + '\nCOMMIT;'.length)),
      /is not the body this migration edits/
    );
    await client.query('ROLLBACK');

    const { rows: [installed] } = await client.query(`
      SELECT public.marketplace_phase7_vip_acquisition_mutex_version() AS marker,
             has_function_privilege('anon', 'public.vip_running_term_is_complimentary(uuid)', 'EXECUTE') AS anon_can,
             has_function_privilege('authenticated', 'public.claim_vip_subscription_checkout(uuid,text,text,integer)', 'EXECUTE') AS auth_can,
             has_function_privilege('service_role', 'public.admit_vip_subscription_checkout(uuid,text,text,text,text)', 'EXECUTE') AS service_can
    `);
    assert.deepEqual(installed, {
      marker: 'marketplace_phase7_vip_acquisition_mutex:v1', anon_can: false, auth_can: false, service_can: true,
    });

    // The same member, after: allowed at claim and at admission.
    const afterClaim = await claim(before);
    assert.deepEqual([afterClaim.claimed, afterClaim.state], [true, 'initializing']);
    const afterAdmit = await admit(before, afterClaim.request);
    assert.deepEqual([afterAdmit.success, afterAdmit.state, afterAdmit.claim_adopted], [true, 'admitted', true]);

    const expectAllowed = async (label, fields) => {
      const a = await member(fields);
      const claimed = await claim(a);
      assert.deepEqual([claimed.claimed, claimed.state], [true, 'initializing'], `${label}: claim`);
      const b = await member(fields);
      const admitted = await freshAdmit(b);
      assert.deepEqual([admitted.success, admitted.state], [true, 'admitted'], `${label}: admit`);
    };
    const expectBlocked = async (label, fields, evidence = async () => {}) => {
      const a = await member(fields);
      await evidence(a);
      const claimed = await claim(a);
      assert.deepEqual([claimed.claimed, claimed.state], [false, 'vip_entitlement_active'], `${label}: claim`);
      assert.equal((await client.query(
        'SELECT count(*)::int AS n FROM public.vip_subscription_checkout_claims WHERE user_id = $1', [a]
      )).rows[0].n, 0, `${label}: no claim row is left behind`);
      const admitted = await freshAdmit(a);
      assert.deepEqual([admitted.success, admitted.admitted, admitted.state], [false, false, 'vip_entitlement_active'], `${label}: admit`);
    };

    // Allowed: no term, and provably free terms.
    await expectAllowed('no term at all', {});
    await expectAllowed('lapsed term', { is_vip: false, vip_tier: 'monthly', vip_expires_at: inDays(-3) });
    await expectAllowed('phone-verification trial (tier empty)', { is_vip: true, vip_expires_at: inDays(29.9) });
    await expectAllowed('welcome-package trial (tier monthly)', { is_vip: true, vip_tier: 'monthly', vip_expires_at: inDays(30) });
    await expectAllowed('two stacked free grants', { is_vip: true, vip_tier: 'monthly', vip_expires_at: inDays(59) });

    // Blocked exactly as before: lifetime, in both of its stored shapes.
    await expectBlocked('lifetime with no end date', { is_vip: true, vip_tier: 'lifetime' });
    await expectBlocked('lifetime with a sentinel end date', { is_vip: true, vip_tier: 'lifetime', vip_expires_at: '2099-12-31T00:00:00Z' });

    // Blocked: a Diamond-purchased term, by each record it leaves.
    const paid = { is_vip: true, vip_tier: 'monthly', vip_expires_at: inDays(20) };
    await expectBlocked('Diamond term (ledger transaction_type)', paid, (id) => client.query(
      "INSERT INTO public.diamond_transactions(user_id, type, transaction_type, amount, reference_id) VALUES ($1, 'vip_membership', 'vip_membership', -2000, $2)", [id, `vip-${id}`]
    ));
    await expectBlocked('Diamond term (legacy ledger type only)', paid, (id) => client.query(
      "INSERT INTO public.diamond_transactions(user_id, type, amount) VALUES ($1, 'vip_membership', -2000)", [id]
    ));
    await expectBlocked('Diamond term (durable request only)', paid, (id) => client.query(
      "INSERT INTO public.vip_diamond_purchase_requests(reference_id, user_id, request_hash, response) VALUES ($1, $2, $3, '{}')", [`ref-${id}`, id, HASH]
    ));
    await expectBlocked('a Diamond purchase long ago, free term now (any paid history keeps the old rule)', paid, (id) => client.query(
      "INSERT INTO public.diamond_transactions(user_id, transaction_type, amount, created_at) VALUES ($1, 'vip_membership', -2000, now() - interval '300 days')", [id]
    ));

    // Blocked: gifts and Lifetime purchases.
    await expectBlocked('redeemed gift (profile provenance)', { ...paid, vip_gift_id: '11111111-1111-4111-8111-111111111111' });
    await expectBlocked('redeemed gift (gift row)', paid, (id) => client.query(
      "INSERT INTO public.vip_gifts(recipient_id, plan, status, redeemed_at) VALUES ($1, 'monthly', 'redeemed', now())", [id]
    ));
    await expectBlocked('reversed gift that was once redeemed', paid, (id) => client.query(
      "INSERT INTO public.vip_gifts(recipient_id, plan, status, redeemed_at) VALUES ($1, 'monthly', 'disputed', now())", [id]
    ));
    await expectBlocked('once-lifetime provenance (lifetime_vip_since)', { ...paid, lifetime_vip_since: inDays(-200) });
    await expectBlocked('lifetime card provenance', { ...paid, vip_lifetime_card_purchase_id: '22222222-2222-4222-8222-222222222222' });
    await expectBlocked('settled Lifetime purchase', paid, (id) => client.query(
      "INSERT INTO public.vip_lifetime_purchases(user_id, status, completed_at) VALUES ($1, 'refunded', now())", [id]
    ));

    // Blocked: unknown provenance. No record at all, but not the shape of a free grant.
    await expectBlocked('legacy yearly term with no record', { is_vip: true, vip_tier: 'yearly', vip_expires_at: inDays(40) });
    await expectBlocked('long term with no record', { is_vip: true, vip_tier: 'monthly', vip_expires_at: inDays(63) });
    await expectBlocked('retired daily tier', { is_vip: true, vip_tier: 'daily', vip_expires_at: inDays(1) });
    await expectBlocked('unrecognised tier', { is_vip: true, vip_tier: 'gold', vip_expires_at: inDays(10) });

    // Blocked as before: an existing subscription row of any kind.
    for (const [label, row] of [
      ['active Card subscription', ['sub_live', 'active', inDays(20)]],
      ['past-due Card subscription', ['sub_due', 'past_due', inDays(-1)]],
      ['in-app subscription', ['iap:1000', 'active', inDays(20)]],
      ['canceled Card subscription with a free term on top', ['sub_gone', 'canceled', inDays(-40)]],
    ]) {
      await expectBlocked(label, paid, (id) => client.query(
        "INSERT INTO public.vip_subscriptions(user_id, stripe_subscription_id, tier, status, current_period_end) VALUES ($1, $2, 'monthly', $3, $4)",
        [id, `${row[0]}_${id}`, row[1], row[2]]
      ));
    }

    // An unredeemed gift and an unpaid Lifetime attempt are not paid time.
    const pendingOnly = await member({ is_vip: true, vip_expires_at: inDays(10) });
    await client.query("INSERT INTO public.vip_gifts(recipient_id, plan, status) VALUES ($1, 'monthly', 'available')", [pendingOnly]);
    await client.query("INSERT INTO public.vip_lifetime_purchases(user_id, status) VALUES ($1, 'failed')", [pendingOnly]);
    assert.equal((await claim(pendingOnly)).claimed, true);

    // The helper itself fails closed.
    const { rows: [helper] } = await client.query(`
      SELECT public.vip_running_term_is_complimentary(NULL) AS for_null,
             public.vip_running_term_is_complimentary(gen_random_uuid()) AS for_missing
    `);
    assert.deepEqual(helper, { for_null: false, for_missing: false });

    // FREE DAYS, case 1: the trial ends before the paid period does.
    // The paid subscription takes over; nothing is added on top.
    const short = await member({ is_vip: true, vip_expires_at: inDays(20) });
    const shortClaim = await claim(short);
    const shortAdmit = await admit(short, shortClaim.request);
    assert.equal((await project(short, shortAdmit, shortClaim.request, 'active', 30)).state, 'projected');
    let row = await profile(short);
    assert.equal(row.is_vip, true);
    assert.equal(row.vip_tier, 'monthly');
    assert.ok(Math.abs(new Date(row.vip_expires_at) - new Date(inDays(30))) < 60_000, 'VIP runs to the paid period end, not trial + period');
    // Now a subscriber: a second Card Checkout is refused, while the admission
    // barrier stands and after the finalizer has cleared it.
    assert.equal((await claim(short)).state, 'conflict');
    await client.query('DELETE FROM public.vip_subscription_checkout_claims WHERE user_id = $1', [short]);
    assert.equal((await claim(short)).state, 'vip_entitlement_active');
    // The subscription ends at its period end: no stale trial date keeps VIP alive.
    await client.query("UPDATE public.vip_subscriptions SET current_period_end = now() - interval '1 minute' WHERE user_id = $1", [short]);
    await client.query("UPDATE public.profiles SET vip_expires_at = now() - interval '1 minute' WHERE id = $1", [short]);
    assert.equal((await project(short, shortAdmit, shortClaim.request, 'canceled', -0.0005, { canceledAt: new Date().toISOString() })).state, 'projected');
    row = await profile(short);
    assert.deepEqual([row.is_vip, row.vip_tier, row.vip_expires_at], [false, null, null]);

    // FREE DAYS, case 2: the free term outlasts the first paid period.
    // The member keeps the days already owed; never non-VIP while paying.
    const long = await member({ is_vip: true, vip_tier: 'monthly', vip_expires_at: inDays(45) });
    const longClaim = await claim(long);
    const longAdmit = await admit(long, longClaim.request);
    await project(long, longAdmit, longClaim.request, 'active', 30);
    row = await profile(long);
    assert.equal(row.is_vip, true);
    assert.ok(Math.abs(new Date(row.vip_expires_at) - new Date(inDays(45))) < 60_000, 'the later free end date is kept');
    // First renewal moves the paid end past the free date: the paid term is now the term.
    await project(long, longAdmit, longClaim.request, 'active', 60);
    row = await profile(long);
    assert.ok(Math.abs(new Date(row.vip_expires_at) - new Date(inDays(60))) < 60_000);
    assert.equal(row.is_vip, true);

    // A payment that never completes leaves the free term untouched.
    const unpaid = await member({ is_vip: true, vip_expires_at: inDays(12) });
    const unpaidClaim = await claim(unpaid);
    const unpaidAdmit = await admit(unpaid, unpaidClaim.request);
    await project(unpaid, unpaidAdmit, unpaidClaim.request, 'incomplete', 30);
    row = await profile(unpaid);
    assert.equal(row.is_vip, true);
    assert.ok(Math.abs(new Date(row.vip_expires_at) - new Date(inDays(12))) < 60_000);
  } finally {
    if (client) await client.end().catch(() => {});
    if (started) {
      try { execFileSync(pgCtl, ['-D', data, '-m', 'immediate', 'stop'], { stdio: 'ignore' }); } catch { /* already down */ }
    }
    rmSync(root, { recursive: true, force: true });
  }
});
