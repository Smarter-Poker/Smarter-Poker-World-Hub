#!/usr/bin/env node
// Production parity check for fn_bankroll_totals: READ-ONLY.
//
// Signs in as the CI service account (TEST_USER_EMAIL / TEST_USER_PASSWORD,
// never anyone's personal account), reads that account's own bankroll_ledger
// and bankroll_segments rows through RLS (paged), computes the totals with
// totalsFromRows (the client-side rules), calls fn_bankroll_totals for the
// same windows, and compares every figure in integer cents.
//
// It writes nothing: one POST signs in (auth password grant), the other is
// the STABLE rpc. Every other request is a GET.
//
// Exit codes: 0 every window matches; 1 a difference (printed field by
// field); 2 the function is not installed yet (PGRST202 / 404); 3 setup
// error (missing environment, sign-in or read failure). The function was
// installed 2026-11-28 (supabase/migrations/20261128101707_fn_bankroll_totals.sql),
// so exit 2 now means it was dropped.
//
// Environment: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// TEST_USER_EMAIL, TEST_USER_PASSWORD. Run: node scripts/bankroll-totals-parity.mjs

import { diffTotals, totalsFromRows } from '../src/lib/bankroll/bankrollTotals.mjs';

// PostgREST's answer when the function does not exist.
const isFunctionMissing = (response) => response?.error?.code === 'PGRST202' || (response?.status === 404 && !response?.error?.code);

const fail = (code, message) => {
  console.error('[bankroll-totals-parity] ' + message);
  process.exit(code);
};

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const EMAIL = process.env.TEST_USER_EMAIL || '';
const PASSWORD = process.env.TEST_USER_PASSWORD || '';
if (!URL_BASE || !ANON) fail(3, 'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required');
if (!EMAIL) fail(3, 'TEST_USER_EMAIL is not set - refusing to guess an account');
if (!PASSWORD) fail(3, 'TEST_USER_PASSWORD is not set');

async function signIn() {
  const response = await fetch(URL_BASE + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token || !body.user?.id) fail(3, 'sign-in failed with HTTP ' + response.status);
  return { token: body.access_token, userId: body.user.id };
}

async function readAll(session, table, select) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < 100000; from += pageSize) {
    const query = new URLSearchParams({ select, user_id: 'eq.' + session.userId, order: 'id.asc' });
    const response = await fetch(URL_BASE + '/rest/v1/' + table + '?' + query, {
      headers: {
        apikey: ANON,
        Authorization: 'Bearer ' + session.token,
        Range: from + '-' + (from + pageSize - 1),
        'Range-Unit': 'items',
      },
    });
    if (!response.ok) fail(3, 'reading ' + table + ' failed with HTTP ' + response.status);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  fail(3, table + ' has more rows than this check reads');
}

async function callTotals(session, window) {
  const response = await fetch(URL_BASE + '/rest/v1/rpc/fn_bankroll_totals', {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_from: window.from || null, p_to: window.to || null, p_location_id: window.locationId || null }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) return { status: response.status, error: body || { message: 'HTTP ' + response.status } };
  return { status: response.status, data: body, error: null };
}

const iso = (date) => date.toISOString().slice(0, 10);

const session = await signIn();
const ledgerRows = await readAll(session, 'bankroll_ledger',
  'id,category,location_id,entry_date,start_time,end_time,gross_in,gross_out,is_revision');
const segments = await readAll(session, 'bankroll_segments', 'id,segment_type,initial_deposit');

const today = new Date();
const windows = [
  { label: 'all time' },
  { label: 'last 30 days', from: iso(new Date(today.getTime() - 30 * 86400000)), to: iso(today) },
  { label: 'this year', from: today.getUTCFullYear() + '-01-01', to: iso(today) },
];
const firstVenue = ledgerRows.find((row) => row.location_id)?.location_id;
if (firstVenue) windows.push({ label: 'one venue', locationId: firstVenue });

let differences = 0;
for (const window of windows) {
  const rpc = await callTotals(session, window);
  if (isFunctionMissing(rpc)) fail(2, 'fn_bankroll_totals is not installed (PostgREST ' + (rpc.error?.code || rpc.status) + ')');
  if (rpc.error) fail(3, 'fn_bankroll_totals failed: ' + (rpc.error.code || '') + ' ' + (rpc.error.message || ''));
  const diff = diffTotals(rpc.data, totalsFromRows({ ledgerRows, segments, ...window }));
  if (diff.length) {
    differences += diff.length;
    console.log('MISMATCH ' + window.label + ' (rpc vs client):');
    for (const line of diff) console.log('  ' + line);
  } else {
    console.log('MATCH ' + window.label);
  }
}
console.log('[bankroll-totals-parity] ' + ledgerRows.length + ' ledger rows, ' + windows.length + ' windows, ' + differences + ' differences');
process.exit(differences ? 1 : 0);
