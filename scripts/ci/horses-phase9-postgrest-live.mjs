#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const RECEIPT = 'test-results/horses-phase9-postgrest/result.json';

export function validateConfiguration(env) {
  for (const name of [
    'TEST_USER_EMAIL',
    'TEST_USER_PASSWORD',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]) {
    assert.ok(env[name], `${name} is required`);
  }
}

export function validateReceipt(receipt) {
  assert.equal(receipt?.schema, 'horses-phase9-postgrest/v1');
  assert.equal(receipt?.allowed, true);
  assert.equal(receipt?.mismatchedIdentityRefused, true);
  assert.equal(receipt?.unknownPermissionRefused, true);
  assert.equal(receipt?.anonymousRefused, true);
  assert.match(receipt?.accountFingerprint || '', /^[0-9a-f]{16}$/);
  assert.match(receipt?.verifiedAt || '', /^\d{4}-\d{2}-\d{2}T/);
  return receipt;
}

async function run() {
  validateConfiguration(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({
    email: process.env.TEST_USER_EMAIL,
    password: process.env.TEST_USER_PASSWORD,
  });
  assert.ifError(signedIn.error);
  const user = signedIn.data.user;
  assert.ok(user?.id, 'configured test identity did not produce a user');
  assert.equal(user.email?.toLowerCase(), process.env.TEST_USER_EMAIL.toLowerCase());

  const permissions = await client.rpc('fn_ca_operator_permissions', { p_user_id: user.id });
  assert.ifError(permissions.error);
  assert.ok(permissions.data?.permissions?.includes('fleet.read'), 'configured test identity is not a Stable Admin operator with fleet.read');

  const allowed = await client.rpc('fn_ca_operator_has_permission', {
    p_user_id: user.id,
    p_permission: 'fleet.read',
  });
  assert.ifError(allowed.error);
  assert.equal(allowed.data, true);

  const mismatch = await client.rpc('fn_ca_operator_has_permission', {
    p_user_id: '00000000-0000-4000-8000-000000000099',
    p_permission: 'fleet.read',
  });
  assert.ifError(mismatch.error);
  assert.equal(mismatch.data, false);

  const unknown = await client.rpc('fn_ca_operator_has_permission', {
    p_user_id: user.id,
    p_permission: 'phase9.not-a-permission',
  });
  assert.ifError(unknown.error);
  assert.equal(unknown.data, false);

  const anonymous = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const denied = await anonymous.rpc('fn_ca_operator_has_permission', {
    p_user_id: user.id,
    p_permission: 'fleet.read',
  });
  assert.ok(denied.error, 'anonymous execution unexpectedly succeeded');

  const receipt = validateReceipt({
    schema: 'horses-phase9-postgrest/v1',
    verifiedAt: new Date().toISOString(),
    accountFingerprint: createHash('sha256').update(user.id).digest('hex').slice(0, 16),
    allowed: allowed.data === true,
    mismatchedIdentityRefused: mismatch.data === false,
    unknownPermissionRefused: unknown.data === false,
    anonymousRefused: Boolean(denied.error),
  });
  await mkdir('test-results/horses-phase9-postgrest', { recursive: true });
  await writeFile(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await client.auth.signOut({ scope: 'local' });
  console.log(JSON.stringify(receipt));
}

if (process.argv[2] === '--self-test') {
  assert.throws(() => validateConfiguration({}), /TEST_USER_EMAIL/);
  assert.throws(() => validateReceipt({}));
  validateReceipt({
    schema: 'horses-phase9-postgrest/v1',
    verifiedAt: '2026-10-05T00:00:00.000Z',
    accountFingerprint: '0123456789abcdef',
    allowed: true,
    mismatchedIdentityRefused: true,
    unknownPermissionRefused: true,
    anonymousRefused: true,
  });
  console.log('horses-phase9-postgrest self-test passed');
} else if (process.argv[2] === '--check-receipt') {
  validateReceipt(JSON.parse(await readFile(process.argv[3] || RECEIPT, 'utf8')));
  console.log('horses-phase9-postgrest receipt passed');
} else {
  await run();
}
