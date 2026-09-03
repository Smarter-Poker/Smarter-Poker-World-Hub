/**
 * SAFE_PROFILE_COLUMNS — EVERY NAME MUST BE ONE `authenticated` MAY SELECT
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS
 *
 * `authenticated` has NO table-level SELECT on public.profiles. Reads are
 * carried entirely by column-level grants, and Postgres does not refuse an
 * ungranted COLUMN - it refuses the STATEMENT:
 *
 *     403 {"code":"42501","message":"permission denied for table profiles"}
 *
 * So one ungranted name in this list fails the whole read. Every consumer then
 * takes its `error || !data` branch, and /hub/user/<name> renders
 * "User Not Found" for a user who plainly exists.
 *
 * That is what production did on 2026-09-03: the list carried is_horse,
 * horse_status and horse_profile, all three revoked, and EVERY social profile
 * on the site was unreachable. Verified live - the list returned 42501 for
 * `kingfish`; the identical list minus those three returned the row.
 *
 * The failure is invisible in review because the list reads as a plain string
 * of column names and the 403 surfaces as an ordinary empty state.
 *
 * WHAT IT CHECKS
 * The known-revoked names are absent. The list is the allow-list for reading a
 * STRANGER's profile, so these are also the ones that should never be in it on
 * the merits - identity, KYC, contact and moderation columns.
 *
 * REFRESHING THE LIST
 *   select column_name from information_schema.column_privileges
 *    where table_schema='public' and table_name='profiles'
 *      and grantee='authenticated' and privilege_type='SELECT';
 * Any profiles column absent from that result belongs below.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/lib/profileColumns.js', import.meta.url), 'utf8');

/** Columns `authenticated` has NO SELECT grant on (production, 2026-09-03). */
const REVOKED_FROM_AUTHENTICATED = [
  'age_verified', 'age_verified_at', 'email', 'horse_profile', 'horse_status',
  'is_farming_flagged', 'is_horse', 'jurisdiction_acknowledged_at',
  'jurisdiction_country', 'jurisdiction_region', 'kyc_completed_at',
  'kyc_inquiry_id', 'kyc_provider', 'kyc_rejection_reason', 'kyc_status',
  'mfa_required', 'notification_token', 'over_18_attested_at', 'phone',
  'status_text', 'stripe_customer_id',
];

function safeColumns() {
  const m = SRC.match(/export const SAFE_PROFILE_COLUMNS\s*=\s*([\s\S]*?);/);
  assert.ok(m, 'SAFE_PROFILE_COLUMNS must still exist');
  const joined = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).join('');
  return joined.split(',').map((c) => c.trim()).filter(Boolean);
}

test('SAFE_PROFILE_COLUMNS asks for no column authenticated was revoked from', () => {
  const cols = safeColumns();
  const offenders = cols.filter((c) => REVOKED_FROM_AUTHENTICATED.includes(c));
  assert.deepEqual(
    offenders,
    [],
    `These columns have no SELECT grant for 'authenticated'. Postgres refuses the ` +
      `whole statement with 42501, so every profile read fails and the page shows ` +
      `"User Not Found": ${offenders.join(', ')}`
  );
});

test('the list is still a real list, so the guard cannot pass by reading nothing', () => {
  const cols = safeColumns();
  assert.ok(cols.length > 50, `expected a full allow-list, got ${cols.length} columns`);
  for (const required of ['id', 'username', 'avatar_url', 'display_name']) {
    assert.ok(cols.includes(required), `${required} must remain readable`);
  }
});

test('no duplicate names', () => {
  const cols = safeColumns();
  const dupes = cols.filter((c, i) => cols.indexOf(c) !== i);
  assert.deepEqual([...new Set(dupes)], [], `duplicated: ${dupes.join(', ')}`);
});
