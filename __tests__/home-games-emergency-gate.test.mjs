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
import {
  rsvpGuestCount,
  rsvpSeatCount,
} from '../vendor/commander-shared/src/components/commander/home-games/rsvpCapacity.mjs';

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
const publicHomeGamePagePath = path.join(repoRoot, 'pages', 'hub', 'home-games', '[slug].js');
const migrationPath = path.join(
  repoRoot,
  'supabase',
  'migrations',
  '20260906221000_home_games_membership_and_rsvp_gate.sql'
);
const rosterPagePath = path.join(
  repoRoot,
  'pages',
  'hub',
  'commander',
  'home-games',
  '[id]',
  'roster.js'
);
const managePagePath = path.join(
  repoRoot,
  'pages',
  'hub',
  'commander',
  'home-games',
  '[id]',
  'manage.js'
);
const groupDetailPagePath = path.join(
  repoRoot,
  'pages',
  'hub',
  'commander',
  'home-games',
  '[id].js'
);
const rsvpManagerPath = path.join(
  repoRoot,
  'vendor',
  'commander-shared',
  'src',
  'components',
  'commander',
  'home-games',
  'RSVPManager.jsx'
);
const rsvpFormPath = path.join(
  repoRoot,
  'vendor',
  'commander-shared',
  'src',
  'components',
  'commander',
  'home-games',
  'RsvpForm.jsx'
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

test('seat route delegates membership, RSVP, and capacity to the caller-scoped atomic RPC', async () => {
  const source = await readFile(seatRoutePath, 'utf8');
  const scopedClient = source.indexOf('getUserScopedClient(token)');
  const rpcWrite = source.indexOf(".rpc(\n      'request_public_home_game_seat'");
  const notificationWrite = source.indexOf('await Promise.all(notificationRecipients.map');

  assert.ok(scopedClient > 0, 'RPC client must carry the caller bearer token');
  assert.ok(rpcWrite > scopedClient, 'atomic RPC must use the caller-scoped client');
  assert.ok(notificationWrite > rpcWrite, 'host notification must follow a successful RPC');
  assert.match(source, /p_group_id: groupId/);
  assert.match(source, /p_game_id: eventId/);
  assert.match(source, /p_caller_user_id: user\.id/);
  assert.match(source, /const rsvp = seatResult\.rsvp/);
  assert.match(source, /response: rsvp\.response/);
  assert.match(source, /wait_for_host_approval: seatResult\.wait_for_host_approval === true/);
  assert.match(source, /\[group\.owner_id, event\.host_id\]\.filter\(Boolean\)\.map\(String\)/);
  assert.match(source, /Promise\.all\(notificationRecipients\.map/);
  assert.match(source, /host_user_id: recipientUserId/);
  assert.doesNotMatch(source, /\.from\('commander_home_members'\)/);
  assert.doesNotMatch(source, /\.from\('commander_home_rsvps'\)/);
  assert.doesNotMatch(source, /\.upsert\(rsvpPayload/);
  assert.doesNotMatch(source, /capacity re-check/);
});

test('public Home Games seat UI recognizes RPC owner and event-host exemptions', async () => {
  const source = await readFile(publicHomeGamePagePath, 'utf8');
  assert.match(source, /\['active', 'approved', 'owner', 'host'\]\.includes\(memberStatus\)/);
  assert.match(source, /json\.data\?\.membership\?\.status/);
});

test('member-visible Commander share modal uses only the share-safe club code', async () => {
  const source = await readFile(groupDetailPagePath, 'utf8');
  const copyHandler = source.match(/async function copyInviteCode\(\) \{([\s\S]*?)\n  \}/);
  const shareModal = source.match(/\{\/\* Share Modal \*\/\}([\s\S]*?)<\/CommanderPageShell>/);

  assert.ok(copyHandler, 'expected share-code copy handler');
  assert.ok(shareModal, 'expected member-visible share modal');
  assert.match(copyHandler[1], /group\?\.club_code/);
  assert.doesNotMatch(copyHandler[1], /invite_code/);
  assert.match(shareModal[1], /group\.club_code/);
  assert.doesNotMatch(shareModal[1], /group\.invite_code/);
});

test('Commander full RSVP form preserves guest details and event guest policy', async () => {
  const source = await readFile(groupDetailPagePath, 'utf8');

  assert.match(source, /async function handleRsvp\(event, status, details = null\)/);
  assert.match(source, /rsvpPayload\.bringing_guests = details\.bringing_guests/);
  assert.match(source, /rsvpPayload\.guest_names = details\.guest_names/);
  assert.match(source, /rsvpPayload\.message = details\.message/);
  assert.match(source, /JSON\.stringify\(rsvpPayload\)/);
  assert.match(source, /handleRsvp\(selectedRsvpEvent, rsvpData\.response, rsvpData\)/);
  assert.match(source, /allow_guests: selectedRsvpEvent\.allow_guests === true/);
  assert.match(source, /guest_limit: selectedRsvpEvent\.guest_limit/);
  assert.doesNotMatch(source, /allow_guests:\s*true,\s*\n\s*guest_limit:\s*2/);
  assert.match(source, /handleRsvp\(evt, status\)/, 'quick RSVP must remain response-only');
  assert.match(source, /onClick=\{\(\) => onRsvp\?\.\(event\)\}/, 'full RSVP form must be reachable');
  assert.match(source, />\s*Guests \/ Note\s*<\/button>/);
});

test('Commander RSVP capacity and guest display count seats, not party rows', async () => {
  const source = await readFile(rsvpManagerPath, 'utf8');
  const formSource = await readFile(rsvpFormPath, 'utf8');
  const parties = [
    { bringing_guests: 2 },
    { bringing_guests: '1' },
    { guest_count: 3 },
    { bringing_guests: -4 },
    { bringing_guests: 'invalid' },
  ];

  assert.equal(rsvpGuestCount({ bringing_guests: 2, guest_count: 9 }), 2);
  assert.equal(rsvpGuestCount({ guest_count: 3 }), 3);
  assert.equal(rsvpGuestCount({ bringing_guests: -4 }), 0);
  assert.equal(rsvpGuestCount({ bringing_guests: 'invalid' }), 0);
  assert.equal(rsvpSeatCount(parties), 11);
  assert.equal(rsvpSeatCount(null), 0);
  assert.match(source, /const confirmed = rsvpSeatCount\(grouped\.yes\)/);
  assert.match(source, /const guestCount = rsvpGuestCount\(rsvp\)/);
  assert.doesNotMatch(source, /const confirmed = grouped\.yes\.length/);
  assert.match(formSource, /const requestedSeats = 1 \+ Math\.min/);
  assert.match(formSource, /requestedSeats > spotsLeft/);
  assert.match(formSource, /event\?\.rsvp_seats \?\? event\?\.rsvp_yes \?\? 0/);
  assert.match(formSource, /Array\.from\(\{ length: maxGuests \}/);
  assert.doesNotMatch(formSource, /event\.guest_limit \|\| 1/);
});

test('guest-aware capacity reaches the exact event limit without a phantom spot', () => {
  const exactCapacityParties = [
    { bringing_guests: 2 }, // player + two guests = 3 seats
    { bringing_guests: 1 }, // player + one guest = 2 seats
  ];
  const maxPlayers = 5;
  const occupiedSeats = rsvpSeatCount(exactCapacityParties);
  assert.equal(occupiedSeats, maxPlayers);
  assert.equal(Math.max(0, maxPlayers - occupiedSeats), 0);
});

test('public seat request exposes event guest policy and forwards the controlled party payload', async () => {
  const [apiSource, pageSource] = await Promise.all([
    readFile(publicSlugPath, 'utf8'),
    readFile(publicHomeGamePagePath, 'utf8'),
  ]);
  assert.match(apiSource, /max_players, min_players, allow_guests, guest_limit, rsvp_yes/);
  assert.match(apiSource, /\.select\('game_id, bringing_guests'\)/);
  assert.match(apiSource, /rsvp_seats: seatsByGame\.get\(game\.id\) \|\| 0/);
  assert.match(pageSource, /seatEvent\.allow_guests === true/);
  assert.match(pageSource, /bringing_guests: bringingGuests/);
  assert.match(pageSource, /guest_names: guestNames/);
  assert.match(pageSource, /message: note \|\| null/);
  assert.match(pageSource, /g\.rsvp_seats \?\? g\.rsvp_yes \?\? 0/);
  assert.match(pageSource, /id="hgs-seat-request-guests"/);
  assert.match(pageSource, /id="hgs-seat-request-guest-names"/);
  assert.match(pageSource, /seatRequestBusy \|\| seatRequestLockRef\.current/);
  assert.match(pageSource, /seatRequestLockRef\.current = true/);
  assert.match(pageSource, /seatRequestLockRef\.current = false/);
});

test('public slug query does not select the secret invite credential', async () => {
  const source = await readFile(publicSlugPath, 'utf8');
  const query = source.match(
    /\.from\('commander_home_groups'\)([\s\S]*?)\.eq\('id', groupId\)/
  );
  assert.ok(query, 'expected public group query');
  assert.doesNotMatch(query[1], /\binvite_code\b/);
});

test('World roster removal requires a normalized server-authorized membership id', async () => {
  const source = await readFile(rosterPagePath, 'utf8');
  const handler = source.match(/async function handleRemove\(memberId\) \{([\s\S]*?)\n  \}/);

  assert.ok(handler, 'expected roster removal handler');
  const guard = handler[1].indexOf('if (!normalizedMemberId)');
  const confirmPrompt = handler[1].indexOf("if (!confirm(");
  const deleteRequest = handler[1].indexOf("method: 'DELETE'");
  assert.ok(guard >= 0, 'missing empty/malformed membership-id guard');
  assert.ok(confirmPrompt > guard, 'membership id must be validated before confirmation');
  assert.ok(deleteRequest > confirmPrompt, 'DELETE must happen only after validation');
  assert.match(handler[1], /JSON\.stringify\(\{ member_id: normalizedMemberId \}\)/);
  assert.match(source, /\(data\.roster \|\| \[\]\)\.map\(normalizeRosterMember\)/);
  assert.match(source, /row\?\.can_remove === true[\s\S]*Boolean\(memberId\)/);
  assert.match(source, /!\['follower', 'owner', 'host'\]\.includes\(relationship\)/);
  assert.match(source, /!\['owner', 'host'\]\.includes\(role\)/);
  assert.match(source, /\{p\.can_remove && p\.member_id && \(/);
  assert.match(source, /handleRemove\(p\.member_id\)/);
  assert.doesNotMatch(source, /handleRemove\(p\.member_id \|\| p\.id\)/);
});

test('World group settings expose only visibility states the schema can persist', async () => {
  const source = await readFile(managePagePath, 'utf8');
  assert.match(source, /<option value="private">/);
  assert.match(source, /<option value="public">/);
  assert.doesNotMatch(source, /<option value="friends">/);
});

test('guarded migration has preflight, enforcement, postassert, and rollback guidance', async () => {
  const source = await readFile(migrationPath, 'utf8');
  const joinFunction = source.match(
    /CREATE OR REPLACE FUNCTION public\.join_home_group[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/
  );
  const manageFunction = source.match(
    /CREATE OR REPLACE FUNCTION public\.manage_home_group_member[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/
  );
  const conversationFunction = source.match(
    /CREATE OR REPLACE FUNCTION public\.fn_add_member_to_group_conversation[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/
  );
  const hostClaimFunction = source.match(
    /CREATE OR REPLACE FUNCTION public\.rpc_hg_host_claim_for_member[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/
  );
  const capacityFunction = source.match(
    /CREATE OR REPLACE FUNCTION public\.fn_hg_enforce_rsvp_capacity[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/
  );
  const publicRequestFunction = source.match(
    /CREATE FUNCTION public\.request_public_home_game_seat[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/
  );

  assert.ok(joinFunction, 'expected join_home_group definition');
  assert.ok(manageFunction, 'expected manage_home_group_member definition');
  assert.ok(conversationFunction, 'expected roster-only-safe conversation trigger function');
  assert.ok(hostClaimFunction, 'expected approved-member host claim gate');
  assert.ok(capacityFunction, 'expected guest-aware RSVP capacity gate');
  assert.ok(publicRequestFunction, 'expected atomic public seat-request RPC');
  assert.match(source, /\nBEGIN;\n/);
  assert.match(source, /-- PREFLIGHT:/);
  assert.match(source, /PRECHECK_FAILED: join_home_group drifted/);
  assert.match(source, /WHEN coalesce\(v_group\.is_private, true\) AND v_code_kind = 'share' THEN 'pending'/);
  assert.match(source, /allow_declined_re_request/);
  assert.match(joinFunction[1], /pg_advisory_xact_lock/);
  assert.match(
    joinFunction[1],
    /ON CONFLICT \(group_id, user_id\) WHERE user_id IS NOT NULL DO NOTHING/
  );
  assert.match(joinFunction[1], /'concurrent_replay', true/);
  assert.match(manageFunction[1], /m\.user_id = p_member_user_id/);
  assert.match(manageFunction[1], /m\.user_id IS NULL AND m\.id = p_member_user_id/);
  assert.match(
    manageFunction[1],
    /pg_advisory_xact_lock\(\s*pg_catalog\.hashtext\(p_group_id::text\),\s*pg_catalog\.hashtext\(p_member_user_id::text\)/
  );
  assert.match(
    manageFunction[1],
    /ON CONFLICT \(group_id, user_id\) WHERE user_id IS NOT NULL DO NOTHING\s+RETURNING \* INTO v_target/
  );
  assert.match(manageFunction[1], /IF v_target\.id IS NULL THEN\s+RAISE EXCEPTION 'ALREADY_MEMBER'/);
  assert.match(manageFunction[1], /IF v_target\.role = 'admin' THEN\s+RAISE EXCEPTION 'ADMIN_CANNOT_MODIFY_PEER'/);
  assert.match(manageFunction[1], /IF p_action = 'invite' THEN/);
  assert.match(manageFunction[1], /pg_advisory_xact_lock/);
  assert.match(manageFunction[1], /'member_invited'/);
  assert.match(
    manageFunction[1],
    /INSERT INTO public\.commander_home_members[\s\S]*INSERT INTO public\.commander_home_audit_log/
  );
  for (const action of [
    'approve',
    'decline',
    'ban',
    'unban',
    'promote_admin',
    'demote_member',
    'grant_host',
    'revoke_host',
    'remove',
  ]) {
    assert.match(manageFunction[1], new RegExp(`WHEN '${action}'`));
  }
  assert.match(manageFunction[1], /INSERT INTO public\.commander_home_audit_log/);
  assert.match(manageFunction[1], /'before', v_before/);
  assert.match(manageFunction[1], /'after', v_after/);
  assert.match(manageFunction[1], /'member_id', v_target\.id/);
  assert.match(manageFunction[1], /'member_user_id', v_target\.user_id/);
  assert.match(manageFunction[1], /'member_id', v_target\.id,[\s\S]*'new_state', v_after/);
  const rosterOnlyGuard = conversationFunction[1].indexOf('IF NEW.user_id IS NULL THEN RETURN NEW; END IF;');
  const participantInsert = conversationFunction[1].indexOf('INSERT INTO messenger_participants');
  assert.ok(rosterOnlyGuard >= 0, 'roster-only rows must skip messenger enrollment');
  assert.ok(participantInsert > rosterOnlyGuard, 'NULL identity guard must run before messenger insert');
  assert.match(source, /PRECHECK_FAILED: fn_add_member_to_group_conversation drifted/);
  for (const expectedLiveHash of [
    '751dcefdaa47d088e6b952919a1e36c2',
    '3d6ce5292248176e19b638a4e9ff2987',
    'd6807093d02d838d7c0031742f2ca42a',
    'ae78c2d52c92c6165e5d29d4cc9f6cfb',
    '459998872d80b1c5b424928943350c42',
    '3182b3c3913935e4b42c2b9be140e9be',
    'a3ca80ed46f386c8a0f65fbaad97d4b4',
    '589acb3ee9ba7bfc7b8a91f3274ec812',
  ]) {
    assert.match(source, new RegExp(expectedLiveHash));
  }
  assert.match(source, /POSTASSERT_FAILED: roster-only conversation guard is not installed/);
  assert.match(hostClaimFunction[1], /FOR UPDATE OF t, h/);
  assert.match(
    hostClaimFunction[1],
    /SELECT id, group_id, user_id, display_name, is_roster_only, status[\s\S]*FOR UPDATE/
  );
  assert.match(hostClaimFunction[1], /v_member\.status IS DISTINCT FROM 'approved'/);
  assert.match(hostClaimFunction[1], /MEMBER_NOT_APPROVED/);
  assert.match(hostClaimFunction[1], /ROSTER_MEMBER_IDENTITY_INVALID/);
  assert.match(hostClaimFunction[1], /REGISTERED_MEMBER_IDENTITY_REQUIRED/);
  const statusGate = hostClaimFunction[1].indexOf("v_member.status IS DISTINCT FROM 'approved'");
  const reservationWrite = hostClaimFunction[1].indexOf(
    'INSERT INTO public.commander_home_seat_reservations'
  );
  const rsvpWrite = hostClaimFunction[1].indexOf('INSERT INTO public.commander_home_rsvps');
  assert.ok(statusGate >= 0, 'host claim must test canonical membership state');
  assert.ok(reservationWrite > statusGate, 'reservation write must follow the membership gate');
  assert.ok(rsvpWrite > reservationWrite, 'registered-member RSVP must follow reservation creation');
  assert.match(
    capacityFunction[1],
    /sum\(1 \+ greatest\(coalesce\(r\.bringing_guests, 0\), 0\)\)/
  );
  assert.match(capacityFunction[1], /r\.id <> OLD\.id/);
  assert.match(capacityFunction[1], /NEW\.is_confirmed := false/);
  assert.match(
    source,
    /BEFORE INSERT OR UPDATE OF response, bringing_guests ON public\.commander_home_rsvps/
  );
  assert.match(publicRequestFunction[1], /auth\.uid\(\) <> p_caller_user_id/);
  assert.match(publicRequestFunction[1], /page\.is_public IS TRUE/);
  assert.match(publicRequestFunction[1], /page\.linked_entity_id = p_group_id::text/);
  assert.match(publicRequestFunction[1], /pg_advisory_xact_lock/);
  assert.match(publicRequestFunction[1], /MEMBERSHIP_BANNED/);
  assert.match(publicRequestFunction[1], /allow_declined_re_request/);
  assert.match(publicRequestFunction[1], /INSERT INTO public\.commander_home_audit_log/);
  assert.match(publicRequestFunction[1], /ON CONFLICT \(game_id, user_id\) DO UPDATE/);
  assert.match(publicRequestFunction[1], /RETURNING \* INTO v_rsvp/);
  assert.match(publicRequestFunction[1], /'rsvp', jsonb_build_object/);
  assert.match(publicRequestFunction[1], /'membership', jsonb_build_object/);
  assert.match(source, /CREATE TRIGGER trg_hg_enforce_rsvp_membership_state/);
  assert.ok(
    source.indexOf('CREATE TRIGGER trg_hg_enforce_rsvp_membership_state') < source.indexOf('DO $quarantine$'),
    'RSVP gate must be installed before quarantine can fire waitlist promotion'
  );
  assert.match(source, /CREATE TRIGGER trg_hg_clear_ineligible_member_rsvps/);
  assert.match(source, /BEFORE DELETE OR UPDATE OF status ON public\.commander_home_members/);
  assert.match(source, /game\.status IN \('scheduled', 'confirmed', 'in_progress'\)/);
  assert.match(source, /set_config\('request\.jwt\.claim\.sub', '', true\)/);
  assert.match(source, /set_config\('request\.jwt\.claims', '', true\)/);
  assert.match(source, /r\.user_id IS DISTINCT FROM home_group\.owner_id/);
  assert.match(source, /r\.user_id IS DISTINCT FROM game\.host_id/);
  assert.match(source, /reservation\.member_id = v_member_id/);
  assert.match(source, /DELETE FROM public\.commander_home_seats seat/);
  assert.match(source, /member\.status IN \('approved', 'pending'\)/);
  assert.match(source, /AND NOT EXISTS \(/);
  assert.match(source, /REVOKE ALL ON FUNCTION public\.join_home_group\(uuid, uuid, text\) FROM PUBLIC, anon/);
  assert.match(source, /REVOKE ALL ON FUNCTION public\.manage_home_group_member\(uuid, uuid, text, uuid\)/);
  assert.match(source, /REVOKE ALL ON FUNCTION public\.rpc_hg_host_claim_for_member\(uuid, integer, uuid\)/);
  assert.match(source, /REVOKE ALL ON FUNCTION public\.request_public_home_game_seat\(/);
  assert.match(source, /-- POST-ASSERT:/);
  assert.match(source, /\nCOMMIT;\n/);
  assert.match(source, /-- ROLLBACK \/ RECOVERY PLAN/);
  assert.doesNotMatch(
    joinFunction[1],
    /p_invite_code = v_group\.invite_code OR p_invite_code = v_group\.club_code/
  );
});
