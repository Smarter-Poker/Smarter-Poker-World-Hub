import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  canonicalPublicUrl,
  DEFAULT_PUBLIC_ORIGIN,
  getCanonicalPublicOrigin,
} from '../src/lib/publicOrigin.mjs';
import {
  allowsDeclinedReRequest,
  evaluateSeatRequestMembership,
} from '../src/lib/home-games/membershipPolicy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicApiRoot = path.join(repoRoot, 'pages', 'api', 'public');
const seatRoutePath = path.join(
  publicApiRoot,
  'home-games',
  '[slug]',
  'events',
  '[eventId]',
  'request-seat.js'
);
const publicSlugPath = path.join(publicApiRoot, 'home-games', '[slug].js');
const migrationPath = path.join(
  repoRoot,
  'supabase',
  'migrations',
  '20260906184500_home_games_membership_and_rsvp_gate.sql'
);

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  }));
  return nested.flat();
}

test('public Home Games APIs contain no legacy external-domain links', async () => {
  const forbiddenDomain = ['pokernear', 'me'].join('.');
  const sourceFiles = (await filesUnder(publicApiRoot)).filter((file) => /\.[cm]?[jt]sx?$/.test(file));
  const hits = [];

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, 'utf8');
    if (source.toLowerCase().includes(forbiddenDomain)) {
      hits.push(path.relative(repoRoot, sourceFile));
    }
  }

  assert.deepEqual(hits, []);
});

test('canonical public URLs fail closed to smarter.poker', () => {
  assert.equal(DEFAULT_PUBLIC_ORIGIN, 'https://smarter.poker');
  assert.equal(
    canonicalPublicUrl('/hub/venues/venue-1', 'https://smarter.poker'),
    'https://smarter.poker/hub/venues/venue-1'
  );
  assert.equal(getCanonicalPublicOrigin('http://smarter.poker'), DEFAULT_PUBLIC_ORIGIN);
  assert.equal(getCanonicalPublicOrigin('https://smarter.poker.attacker.example'), DEFAULT_PUBLIC_ORIGIN);
  assert.equal(getCanonicalPublicOrigin('not a URL'), DEFAULT_PUBLIC_ORIGIN);
  assert.equal(canonicalPublicUrl('//attacker.example/path'), `${DEFAULT_PUBLIC_ORIGIN}/`);
  assert.equal(canonicalPublicUrl('/\\attacker.example/path'), `${DEFAULT_PUBLIC_ORIGIN}/`);
});

test('seat membership policy blocks banned and declined members by default', () => {
  assert.deepEqual(evaluateSeatRequestMembership('banned', {}), {
    allowed: false,
    status: 403,
    code: 'MEMBERSHIP_BANNED',
    message: 'You cannot request a seat in this home game.',
  });
  assert.deepEqual(evaluateSeatRequestMembership('declined', {}), {
    allowed: false,
    status: 409,
    code: 'MEMBERSHIP_DECLINED',
    message: 'The host has declined this membership request.',
  });
});

test('declined re-request requires an exact boolean host opt-in', () => {
  assert.equal(allowsDeclinedReRequest({ allow_declined_re_request: true }), true);
  assert.equal(allowsDeclinedReRequest({ allow_declined_re_request: 'true' }), false);
  assert.equal(allowsDeclinedReRequest({ allow_declined_re_request: 1 }), false);
  assert.deepEqual(
    evaluateSeatRequestMembership('declined', { allow_declined_re_request: true }),
    { allowed: true, nextStatus: 'pending' }
  );
});

test('seat route evaluates membership before RSVP and notification writes', async () => {
  const source = await readFile(seatRoutePath, 'utf8');
  const gate = source.indexOf('evaluateSeatRequestMembership(');
  const rsvpWrite = source.indexOf('.upsert(rsvpPayload');
  const notificationWrite = source.indexOf('await dispatchHostNotification(');

  assert.ok(gate > 0, 'membership gate must be called');
  assert.ok(rsvpWrite > gate, 'RSVP must be written only after membership gate');
  assert.ok(notificationWrite > rsvpWrite, 'host notification must follow a successful RSVP write');
  assert.match(source, /\.eq\('status', 'declined'\)/);
  assert.match(source, /code: 'MEMBERSHIP_CHANGED'/);
});

test('public slug query does not select the secret invite credential', async () => {
  const source = await readFile(publicSlugPath, 'utf8');
  const query = source.match(
    /\.from\('commander_home_groups'\)([\s\S]*?)\.eq\('id', groupId\)/
  );
  assert.ok(query, 'expected public group query');
  assert.doesNotMatch(query[1], /\binvite_code\b/);
});

test('guarded migration has preflight, enforcement, postassert, and rollback guidance', async () => {
  const source = await readFile(migrationPath, 'utf8');
  const joinFunction = source.match(
    /CREATE OR REPLACE FUNCTION public\.join_home_group[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/
  );

  assert.ok(joinFunction, 'expected join_home_group definition');
  assert.match(source, /\nBEGIN;\n/);
  assert.match(source, /-- PREFLIGHT:/);
  assert.match(source, /PRECHECK_FAILED: join_home_group drifted/);
  assert.match(source, /WHEN coalesce\(v_group\.is_private, true\) AND v_code_kind = 'share' THEN 'pending'/);
  assert.match(source, /allow_declined_re_request/);
  assert.match(source, /CREATE TRIGGER trg_hg_enforce_rsvp_membership_state/);
  assert.match(source, /member\.status IN \('banned', 'declined'\)/);
  assert.match(source, /REVOKE ALL ON FUNCTION public\.join_home_group\(uuid, uuid, text\) FROM PUBLIC, anon/);
  assert.match(source, /-- POST-ASSERT:/);
  assert.match(source, /\nCOMMIT;\n/);
  assert.match(source, /-- ROLLBACK \/ RECOVERY PLAN/);
  assert.doesNotMatch(
    joinFunction[1],
    /p_invite_code = v_group\.invite_code OR p_invite_code = v_group\.club_code/
  );
});
