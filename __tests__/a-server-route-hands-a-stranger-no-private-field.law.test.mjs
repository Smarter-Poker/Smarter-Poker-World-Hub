/**
 * A SERVER ROUTE HANDS A STRANGER NO PRIVATE FIELD (2026-10-06)
 * ─────────────────────────────────────────────────────────────────────────
 * Ruling 25 (Club Arena docs/DIAMOND-RULINGS.md, 2026-09-30): a person's
 * money, real identity, birth date and whereabouts/last-seen are readable
 * only by that person and by platform staff. Migration 20260930234500
 * revoked those columns from every browser role, and the browser half of
 * the rule is a-profile-shows-strangers-only-what-the-table-needs.law.
 *
 * pages/api runs as the SERVICE ROLE, which no column grant binds. So a
 * route re-opened the hole every time it read another user's private
 * column and handed it on: the friends search found people by legal name
 * and returned their city, state and last-active to any signed-in account;
 * the suggestions list did the same for 500 accounts at a time; leaderboards,
 * reviews, comments, notification titles, live-stream titles and home-game
 * seat requests printed legal names; an anonymous health endpoint returned a
 * real Diamond balance. Fixed on 2026-10-06.
 *
 * The rule this file holds:
 *   1. A route under pages/api may name an owner-only or sensitive profile
 *      column only if it is listed in REVIEWED below with the reason it is
 *      allowed - SELF (the caller's own row, from the verified JWT, returned
 *      only to that caller) or STAFF (a platform-operator, admin-secret,
 *      CRON_SECRET or production-404 gate runs first). A new reader fails
 *      here until somebody has asked that question about it.
 *   2. No route builds a display name that falls back to a legal name
 *      (`display_name || full_name`, `full_name || username`, ...).
 *   3. (2026-10-07) A member's club wallet is theirs too. A route that reads
 *      club_members.chip_balance is listed in WALLET_REVIEWED with the reason
 *      it never reaches a fellow member, and the club leaderboard - which
 *      handed every member every other member's balance and chip flows -
 *      asks the database's own club-staff rule before it reads either.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { OWNER_ONLY_PROFILE_COLUMNS, SENSITIVE_PROFILE_COLUMNS } from '../src/lib/profileColumns.js';

const ROOT = new URL('..', import.meta.url).pathname;
const PRIVATE = new Set([...OWNER_ONLY_PROFILE_COLUMNS, ...SENSITIVE_PROFILE_COLUMNS]);

// Reviewed 2026-10-06. Each entry says why the read never reaches a stranger.
const REVIEWED = {
  'pages/api/admin/check-auth-uuid.js': 'STAFF: 404 in production before any read',
  'pages/api/admin/check-notification-actors.js': 'STAFF: 404 in production before any read',
  'pages/api/admin/check-profiles-avatars.js': 'STAFF: 404 in production before any read',
  'pages/api/admin/diamond-liability.js': 'STAFF: ADMIN_ROUTE_SECRET or a verified is_admin caller',
  'pages/api/admin/list-profiles.js': 'STAFF: 404 in production before any read',
  'pages/api/admin/verify-profile-schema.js': 'STAFF: 404 in production before any read',
  'pages/api/auth/mfa/setup.js': "SELF: the caller's own phone for their own MFA",
  'pages/api/auth/mfa/verify.js': "SELF: the caller's own phone for their own MFA",
  'pages/api/employee/link-by-email.js': "not profiles: commander_staff rows matched to the caller's own email",
  'pages/api/employee/venues.js': 'not profiles: commander_staff and venue columns',
  'pages/api/horses/stable-admin.js': 'STAFF: withOperatorRoute console.read',
  'pages/api/kyc/status.js': "SELF: the caller's own verification state",
  'pages/api/live-help/create-ticket.js': "SELF: the caller's own email, to support",
  'pages/api/public/venue/[id].js': "not profiles: the social page's own public phone",
  'pages/api/rewards/birthday-reward.js': "SELF: the caller's own birthday",
  'pages/api/auth/ensure-profile.js': "SELF: 403 unless the body user_id is the JWT user's",
  'pages/api/club-arena/agent-dashboard.js': 'derives only an online boolean from last_seen; the timestamp is stripped before the response',
  'pages/api/club-arena/marketplace-items.js': "SELF: the caller's own Diamond balance",
  'pages/api/club-arena/marketplace-purchase.js': "SELF: the caller's own new balance",
  'pages/api/diamonds/spend.js': "SELF: the caller's own balance",
  'pages/api/geeves/start-conversation.js': "SELF: greets the caller in their own conversation",
  'pages/api/health/header.js': 'reads a fixed test account; returns only whether the read worked',
  'pages/api/hendonmob/sync.js': "SELF: the caller's own name, never returned or published",
  'pages/api/horses/anti-abuse.js': 'STAFF: withOperatorRoute players.read',
  'pages/api/horses/club-arena-admin.js': 'STAFF: withOperatorRoute clubs.read / clubs.write',
  'pages/api/horses/economy-stats.js': 'STAFF: withOperatorRoute money.read',
  'pages/api/horses/fleet-admin.js': 'STAFF: withOperatorRoute fleet.read (balances only with money.read)',
  'pages/api/horses/mint.js': 'STAFF: withOperatorRoute money.read / money.write',
  'pages/api/live-help/start-conversation.js': 'SELF: greets the caller in their own support thread',
  'pages/api/poker/ai-hand-reader.js': "SELF: the caller's own balance gates VIP, never returned",
  'pages/api/public/home-games/[slug].js': 'not profiles: city/state there are the group\'s own columns',
  'pages/api/rewards/progress.js': "SELF: the caller's own multiplier",
  'pages/api/store/checkout-status.js': "SELF: the caller's own wallet after the session is proved theirs",
  'pages/api/store/create-checkout-session.js': "SELF: the caller's own Stripe customer",
  'pages/api/store/diamond-transactions.js': "SELF: the caller's own balance",
  'pages/api/user/get-header-stats.js': "SELF: the caller's own header, no-store",
  'pages/api/user/profile.js': "SELF: the caller's own row, private cache",
  'pages/api/vip/check-status.js': "SELF: the caller's own balance",
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|ts|tsx|mjs)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

const privateNamesIn = (text) =>
  [...new Set((text.replace(/\$\{[^}]*\}/g, '').match(/[a-z_]+/g) || []).filter((w) => PRIVATE.has(w)))];

// Every PostgREST spelling of an embedded profiles join (see privateReads).
const EMBED_RE = /\bprofiles(?:\s*:\s*\w+)?(?:\s*!\s*\w+)*\s*\(([^()]*)\)/g;

function privateReads(src) {
  const hits = [];
  // a .from('profiles') chain whose select is a literal (or '*')
  const chainRe = /\.from\(\s*['"`]profiles['"`]\s*\)((?:\s*\.\s*[a-zA-Z]+\s*\((?:[^()]|\([^()]*\))*\))+)/g;
  for (const m of src.matchAll(chainRe)) {
    const sel = (m[1].match(/\.select\(\s*(['"`])([^'"`]*)\1/) || [])[2];
    if (sel === undefined) continue;
    const names = sel.trim() === '*' ? ['*'] : privateNamesIn(sel);
    if (names.length) hits.push(`.from('profiles').select(${sel.slice(0, 60)}) -> ${names}`);
  }
  // an embedded join, in every PostgREST spelling: profiles(...),
  // profiles!fk(...), profiles!fk!inner(...), the alias-on-column form
  // profiles:user_id(...), and an aliased author:profiles(...) /
  // author:profiles!fk(...) (the \b after the colon catches the alias).
  // live-session.js handed out full_name through profiles:user_id(...) for
  // a week because the old pattern only knew the first two.
  for (const m of src.matchAll(EMBED_RE)) {
    const names = privateNamesIn(m[1]);
    if (names.length) hits.push(`profiles(${m[1].trim().slice(0, 60)}) -> ${names}`);
  }
  // a hand-built PostgREST read: /profiles?...select=a,b,c
  for (const m of src.matchAll(/\/profiles\?[^`'"\s]*/g)) {
    const sel = (m[0].match(/select=([^&]*)/) || [])[1];
    if (sel === undefined) continue;
    const names = sel === '*' ? ['*'] : privateNamesIn(sel);
    if (names.length) hits.push(`${m[0].slice(0, 70)} -> ${names}`);
  }
  // a column list kept in a variable (`const fields = 'id, username, ...'`)
  for (const m of src.matchAll(/(['"`])([a-z_]+(?:\s*,\s*[a-z_]+){2,})\1/g)) {
    const words = m[2].match(/[a-z_]+/g) || [];
    if (!words.some((w) => ['username', 'avatar_url', 'display_name'].includes(w))) continue;
    const names = words.filter((w) => PRIVATE.has(w));
    if (names.length) hits.push(`'${m[2].slice(0, 60)}' -> ${[...new Set(names)]}`);
  }
  return hits;
}

// Everything that runs as the service role on behalf of a request.
const apiFiles = () => [...walk(join(ROOT, 'pages/api')), ...walk(join(ROOT, 'src/lib/server'))];

test('every server route that names a private profile column has been reviewed', () => {
  const unreviewed = [];
  for (const file of apiFiles()) {
    const rel = relative(ROOT, file);
    if (REVIEWED[rel]) continue;
    for (const hit of privateReads(readFileSync(file, 'utf8'))) unreviewed.push(`${rel}: ${hit}`);
  }
  assert.deepEqual(
    unreviewed,
    [],
    "These routes read a column only its owner and platform staff may see, as the service role, " +
      'which no grant stops. Leave it out, or - if the row is the caller\'s own and goes back only ' +
      'to them, or the route is staff-gated - add the file to REVIEWED with the reason:\n' +
      unreviewed.join('\n')
  );
});

test('every reviewed entry still exists and still needs its review', () => {
  for (const rel of Object.keys(REVIEWED)) {
    let src;
    try {
      src = readFileSync(join(ROOT, rel), 'utf8');
    } catch {
      assert.fail(`${rel} is listed in REVIEWED but no longer exists - remove the entry`);
    }
    assert.ok(privateReads(src).length > 0, `${rel} no longer reads a private column - remove it from REVIEWED`);
  }
});

test('no server route falls back to a legal name for a display name', () => {
  const offenders = [];
  const re = /\b(?:display_name|username|user_name)\s*\|\|\s*[\w?.]*\b(?:full_name|first_name|last_name)\b|\b(?:full_name|first_name|last_name)\s*\|\|\s*[\w?.]*\b(?:username|display_name)\b/g;
  for (const file of apiFiles()) {
    const rel = relative(ROOT, file);
    // A reviewed SELF or STAFF route's names go only to their owner or to staff.
    if (/^(SELF|STAFF)/.test(REVIEWED[rel] || '')) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(re)) {
      offenders.push(`${rel}:${src.slice(0, m.index).split('\n').length}: ${m[0]}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'A display name that falls back to a legal name prints it to whoever sees the name. ' +
      'Use display_name || username:\n' +
      offenders.join('\n')
  );
});

// ─── Rule 3: a member's club wallet (2026-10-07) ─────────────────────────────
// Ruling 25 names "Diamond or chip balance". club_members.chip_balance is a
// member's money. Its row policy lets a member read their own row and lets
// club staff (is_club_admin), a cashier's downline scope and a union overseer
// read the rest - but a route here runs as the service role, which no row
// policy binds. /api/club-arena/club-leaderboard answered ANY member with every
// other member's balance, 7-day chip volume and net chip flow until 2026-10-07.
// Reviewed 2026-10-07. Each entry says why the balance never reaches a fellow
// member: SELF (the caller's own wallet), STAFF (the gate named runs first), or
// not a member's wallet at all.
const WALLET_REVIEWED = {
  'pages/api/club-arena/agent-analytics.js': 'STAFF: club owner/admin, or an agent pinned to their own downline',
  'pages/api/club-arena/agent-dashboard.js': 'STAFF: club owner/admin, or an agent pinned to their own downline',
  'pages/api/club-arena/cashier-info.js': "SELF: the caller's own wallet (cash-out presets are owner/admin only)",
  'pages/api/club-arena/club-leaderboard.js': 'STAFF: is_club_admin(club, caller) before any balance or chip flow is read',
  'pages/api/club-arena/delete-club.js': 'STAFF: the club owner, deleting the club',
  'pages/api/club-arena/leave-club.js': "SELF: the leaving member's own wallet",
  'pages/api/club-arena/player-sessions.js': 'STAFF: club owner/admin/super_agent',
  'pages/api/club-arena/rakeback.js': "SELF: the caller's own wallet",
  'pages/api/club-arena/smart-recommendations.js': 'STAFF: club owner/admin/super_agent',
  'pages/api/club-arena/spin-activation.js': "not a member's: the union's own wallet, union lead or platform admin",
  'pages/api/club-arena/table-chips.js': 'SELF, or club owner/admin/super_agent, or the engine key',
  'pages/api/club-arena/transfer-chips.js': "SELF: the sender's own balance; the recipient's is read only to prove membership",
  'pages/api/club-arena/union-wallet.js': "not a member's: the union's own wallet, union lead or platform admin",
  'pages/api/horses/club-arena-admin.js': 'STAFF: withOperatorRoute clubs.read / clubs.write',
  'pages/api/horses/fleet-admin.js': 'STAFF: withOperatorRoute fleet.read',
  'pages/api/horses/floor-admin.js': 'STAFF: withOperatorRoute',
  'pages/api/horses/mint.js': 'STAFF: withOperatorRoute money.read / money.write',
};

// Comments do not read a wallet; `://` inside a URL is not a comment.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const readsWallet = (src) => /\bchip_balance\b/.test(codeOnly(src));

test("every server route that reads a member's club wallet has been reviewed", () => {
  const unreviewed = apiFiles()
    .map((file) => relative(ROOT, file))
    .filter((rel) => !WALLET_REVIEWED[rel] && readsWallet(readFileSync(join(ROOT, rel), 'utf8')));
  assert.deepEqual(
    unreviewed,
    [],
    "These routes read club_members.chip_balance as the service role, which the row policy does not bind. " +
      "Answer a balance only to its owner or behind a club-staff gate, then add the file to WALLET_REVIEWED with the reason:\n" +
      unreviewed.join('\n')
  );
});

test('every reviewed wallet entry still exists and still reads a balance', () => {
  for (const rel of Object.keys(WALLET_REVIEWED)) {
    let src;
    try {
      src = readFileSync(join(ROOT, rel), 'utf8');
    } catch {
      assert.fail(`${rel} is listed in WALLET_REVIEWED but no longer exists - remove the entry`);
    }
    assert.ok(readsWallet(src), `${rel} no longer reads chip_balance - remove it from WALLET_REVIEWED`);
  }
});

test("the club leaderboard asks the club-staff rule before it reads any member's balance or chip flow", () => {
  const code = codeOnly(readFileSync(join(ROOT, 'pages/api/club-arena/club-leaderboard.js'), 'utf8'));
  const gate = code.search(/\.rpc\(\s*'is_club_admin'\s*,\s*\{\s*p_club_id:\s*clubId,\s*p_user_id:\s*user\.id\s*\}\s*\)/);
  const refuse = code.indexOf('if (isClubStaff !== true)');
  const balance = code.search(/\bchip_balance\b/);
  const flows = code.search(/\.from\(\s*'chip_transactions'\s*\)/);
  assert.ok(gate > 0, "the leaderboard must ask is_club_admin(club, caller) - the rule behind the club_members row policy");
  assert.ok(refuse > gate, 'anything but a true answer from the staff check must be refused');
  assert.ok(balance > refuse && flows > refuse, 'the staff check must run before any balance or chip flow is read');
});
