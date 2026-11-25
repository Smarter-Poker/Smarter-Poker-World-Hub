/**
 * The owner's own self-view RPCs must read the masked notification view.
 *
 * WHAT HAPPENED (Production Alerts fleet, incident owner-inbox-operational-rows)
 * -------------------------------------------------------------------------
 * fn_capture_owner_notification_destination() deliberately preserves the
 * owner's operational notifications (financial_incident, system,
 * engine_break_failed, financial_attestation, estate_digest,
 * guarantee_bank_short) byte-for-byte in public.notifications, and relies on
 * every downstream reader going through the destination-aware
 * public.personal_notifications view (filtered by
 * fn_notification_has_personal_destination) instead of the raw table.
 * pages/api/user/get-header-stats.js and pages/api/notifications/feed.js
 * already do this correctly.
 *
 * get_unified_user_profile() and get_user_cross_product_summary() did not:
 * both are SECURITY DEFINER RPCs invoked when the owner views his own profile
 * (v_is_self / auth.uid() = p_user_id), and both queried public.notifications
 * directly for 'unread_notifications' and 'recent_notifications'. Proved live
 * in a rolled-back probe against production account
 * 47965354-0e56-43ef-931c-ddaab82af765: the top 5 raw rows were ALL
 * operational (an estate digest, a push-health system alert, two
 * financial_incident chip-drift alerts, one financial_attestation), so
 * get_unified_user_profile()'s 'recent_notifications' handed the owner's own
 * profile screen financial-incident titles and messages verbatim, and
 * 'unread_notifications' read 127 against a real (non-operational) count of
 * 97 over personal_notifications.
 *
 * THIS IS NOT A DATABASE AUDIT. It sees migration FILES, mirroring
 * __tests__/horses-an-rpc-write-has-a-where.test.mjs: it reads the LAST
 * definition of each named function across supabase/migrations and fails if
 * it queries the raw notifications table for a per-owner notification
 * look-up instead of the masked view.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.join(process.cwd(), 'supabase', 'migrations');

const FUNCTIONS_THAT_MUST_READ_THE_MASKED_VIEW = [
  'get_unified_user_profile',
  'get_user_cross_product_summary',
];

const stripComments = (sql) => sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

// Blanks string literals too, so a message string that happens to contain the
// words "from notifications" can never be mistaken for a real table read.
// Do NOT use this version to look for a literal jsonb key name (e.g.
// 'engagement') - it blanks those the same way, and the search below never
// matches. Use stripComments alone for that.
const stripLiteralsAndComments = (sql) =>
  stripComments(sql).replace(/'(?:[^']|'')*'/g, "''");

function functionBody(sql, from, to) {
  const slice = sql.slice(from, to);
  const open = /\$([a-z_0-9]*)\$/.exec(slice);
  if (!open) return slice;
  const tag = open[0];
  const close = slice.indexOf(tag, open.index + tag.length);
  return close === -1 ? slice : slice.slice(0, close + tag.length);
}

function lastDefinitionOfEveryFunction(transform) {
  const last = new Map();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = transform(readFileSync(path.join(MIGRATIONS, file), 'utf8').toLowerCase());
    const marks = [
      ...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_0-9]+)/g),
    ].map((m) => ({ name: m[1], at: m.index }));
    for (let i = 0; i < marks.length; i++) {
      last.set(marks[i].name, {
        file,
        body: functionBody(sql, marks[i].at, marks[i + 1]?.at ?? sql.length),
      });
    }
  }
  return last;
}

// A standalone reference to the raw table, never matching the
// "personal_notifications" identifier (underscore keeps it one word).
const rawNotificationsTableReads = (body) =>
  [...body.matchAll(/\bfrom\s+notifications\b/g)].map((m) => m[0]);

test('the owner-self-view RPCs read personal_notifications, never the raw table', () => {
  const last = lastDefinitionOfEveryFunction(stripLiteralsAndComments);
  const offenders = [];
  for (const name of FUNCTIONS_THAT_MUST_READ_THE_MASKED_VIEW) {
    const def = last.get(name);
    assert.ok(def, `${name} is not defined by any migration`);
    const bad = rawNotificationsTableReads(def.body);
    if (bad.length > 0) {
      offenders.push(`${name} (${def.file}): ${bad.join(', ')}`);
    }
    assert.match(
      def.body,
      /personal_notifications/,
      `${name} (${def.file}) never references personal_notifications at all`,
    );
  }
  assert.deepEqual(
    offenders,
    [],
    'These RPCs read public.notifications directly for a per-owner notification ' +
      'look-up. Because fn_capture_owner_notification_destination() preserves the ' +
      "owner's operational notifications byte-for-byte in that table (by design, " +
      'for recoverability), any reader that bypasses public.personal_notifications ' +
      "surfaces financial/operational alert content on the owner's own profile:\n  " +
      offenders.join('\n  '),
  );
});

test('get_unified_user_profile only exposes engagement/recent_notifications for the self viewer', () => {
  // Guards against a future edit widening this to non-self viewers, which
  // would leak the masked-but-still-preserved raw rows to someone else via a
  // join or a relaxed condition instead of a table read.
  //
  // Uses stripComments alone (literals intact): 'engagement' is itself a
  // quoted string literal, so stripLiteralsAndComments blanks it to '' and
  // the search below could never match against that version - checked here
  // by the deliberate red-control in this same file's history (see PR
  // #2011 CI run 36376610624, "expected: /'engagement',...then/, actual:
  // <literals blanked>").
  const def = lastDefinitionOfEveryFunction(stripComments).get('get_unified_user_profile');
  assert.ok(def, 'get_unified_user_profile is not defined by any migration');
  assert.match(
    def.body,
    /'engagement',\s*case\s+when\s+v_is_self\s+then/,
    'engagement (which carries recent_notifications) must stay gated on v_is_self',
  );
});
