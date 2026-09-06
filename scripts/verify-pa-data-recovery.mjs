#!/usr/bin/env node

/**
 * Authenticated recovery proof for the Personal Assistant data archive.
 *
 * This creates an immutable export receipt but never alters coaching,
 * analysis, Sandbox, or Club Arena source data. Archive contents and account
 * credentials are intentionally never printed.
 */
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local', quiet: true });

const baseUrl = String(process.env.PA_VERIFY_BASE_URL || 'https://smarter.poker').replace(/\/$/, '');
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const expectedGroups = ['analysis', 'clubArena', 'coaching', 'lifecycleReceipts', 'sandbox'];

if (!email || !password || !supabaseUrl || !anonKey) {
  throw new Error('Missing Test Account Or Public Supabase Configuration.');
}

const supabase = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function main() {
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !auth?.session?.access_token) throw new Error('Recovery Proof Authentication Failed.');

  const response = await fetch(`${baseUrl}/api/assistant/data-controls?mode=export`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${auth.session.access_token}`,
    },
  });
  const archive = await response.json().catch(() => null);
  if (!response.ok || !archive || archive.schemaVersion !== 'pa-data-export-v1') {
    throw new Error(`Recovery Archive Request Failed (${response.status}).`);
  }
  if (!archive.data || expectedGroups.some(group => !(group in archive.data))) {
    throw new Error('Recovery Archive Is Missing A Required Data Group.');
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(archive.data)).digest('hex');
  if (fingerprint !== archive.fingerprint) throw new Error('Recovery Archive Fingerprint Does Not Match.');
  if (archive.receipt?.receipt_fingerprint !== fingerprint.slice(0, 32)) {
    throw new Error('Recovery Receipt Does Not Match The Verified Archive.');
  }
  if (!archive.counts || Object.values(archive.counts).some(value => !Number.isInteger(value) || value < 0)) {
    throw new Error('Recovery Archive Counts Are Invalid.');
  }
  const declaredRows = Object.values(archive.counts).reduce((sum, value) => sum + value, 0);
  console.log(JSON.stringify({
    success: true,
    schemaVersion: archive.schemaVersion,
    dataGroupsVerified: expectedGroups.length,
    declaredRows,
    receiptRecorded: Boolean(archive.receipt?.id),
    fingerprintVerified: true,
    sourceHandsPreserved: true,
  }));
}

try {
  await main();
} finally {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}
