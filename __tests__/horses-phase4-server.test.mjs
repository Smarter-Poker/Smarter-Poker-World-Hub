/**
 * Phase 4 - the route, and the pure module it shares with the panel.
 *
 * Two halves, the same split Phases 1 to 3 use and for the same reason: a
 * test that only asserts a string appears in a file passes happily while the
 * function that string belongs to has no caller.
 *
 * 1. BEHAVIOUR. src/lib/horses/playerRestrictions.js is imported and
 *    exercised for real: what needs a second operator, what a loosening is,
 *    what an operator is told about the enforcement switch, and whether a
 *    restriction that has run out is still binding.
 *
 * 2. CONTRACTS. There is no node_modules in this snapshot, so nothing here
 *    can call a database or start Next. What is left is asserted against the
 *    WIRING - the wrapper the route is exported through, the permission each
 *    action declares, the ORDER of requireApproval against the write it
 *    gates - rather than against a declaration that may be dead.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import {
  ENFORCED_SCOPES,
  GATE_TEXT,
  REASON_LABELS,
  RESTRICTION_REASON_CODES,
  RESTRICTION_SCOPES,
  RG_FIELDS,
  SCOPE_META,
  displayStatus,
  enforcementNotice,
  isBinding,
  isHeld,
  loosensOf,
  needsApproval,
} from '../src/lib/horses/playerRestrictions.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const route = await readFile(
  path.join(HERE, '..', 'pages/api/horses/player-admin.js'),
  'utf8'
);

// ── 1. BEHAVIOUR ────────────────────────────────────────────────────────────

test('a whole-account restriction always needs a second operator', () => {
  assert.deepEqual(
    needsApproval({ scope: 'account', expiresAt: '2027-01-01T00:00:00Z' }),
    { required: true, reason: 'whole_account' }
  );
});

test('a restriction with no expiry needs a second operator', () => {
  for (const empty of [null, undefined, '']) {
    assert.equal(
      needsApproval({ scope: 'cash', expiresAt: empty }).required,
      true,
      `expiresAt ${JSON.stringify(empty)} must count as indefinite`
    );
    assert.equal(needsApproval({ scope: 'cash', expiresAt: empty }).reason, 'no_expiry');
  }
});

test('a narrow, time-boxed restriction writes directly', () => {
  const gate = needsApproval({ scope: 'cash', expiresAt: '2027-01-01T00:00:00Z' });
  assert.deepEqual(gate, { required: false, reason: null });
});

test('every gate reason has a sentence to show the operator', () => {
  for (const scope of RESTRICTION_SCOPES) {
    for (const expiry of [null, '2027-01-01T00:00:00Z']) {
      const gate = needsApproval({ scope, expiresAt: expiry });
      if (gate.required) {
        assert.ok(
          GATE_TEXT[gate.reason],
          `gate reason ${gate.reason} has no operator-facing sentence`
        );
      }
    }
  }
});

test('the enforcement notice is a TRISTATE and unknown is not off', () => {
  assert.equal(enforcementNotice(true).tone, 'live');
  assert.equal(enforcementNotice(false).tone, 'observing');
  // The one that matters. Told "this will not bite" when nobody knows, an
  // operator stops watching.
  assert.equal(enforcementNotice(null).tone, 'unknown');
  assert.equal(enforcementNotice(undefined).tone, 'unknown');
  assert.notEqual(enforcementNotice(null).tone, enforcementNotice(false).tone);

  for (const value of [true, false, null]) {
    const n = enforcementNotice(value);
    assert.ok(n.title && n.body, 'every enforcement state needs a title and a body');
  }
});

test('the observing notice says the player keeps playing', () => {
  const body = enforcementNotice(false).body.toLowerCase();
  assert.match(
    body,
    /recorded and observed, not refused/,
    'the off state must say plainly that nothing is refused'
  );
  assert.match(body, /keeps playing/, 'and that the player carries on');
});

test('expires_at is the clock, status is only the intent', () => {
  const now = Date.parse('2026-09-04T12:00:00Z');
  const runOut = { status: 'active', expires_at: '2026-09-04T11:00:00Z' };
  const live = { status: 'active', expires_at: '2026-09-04T13:00:00Z' };
  const forever = { status: 'active', expires_at: null };

  assert.equal(isBinding(runOut, now), false, 'a run-out restriction must stop binding');
  assert.equal(isBinding(live, now), true);
  assert.equal(isBinding(forever, now), true);
  assert.equal(isBinding({ status: 'lifted', expires_at: null }, now), false);

  // And the panel must agree with the reader, or it shows "Active" against a
  // player who is not restricted.
  assert.equal(displayStatus(runOut, now), 'expired');
  assert.equal(displayStatus(live, now), 'active');
  assert.equal(displayStatus({ status: 'lifted' }, now), 'lifted');
});

test('a lower money cap is a tightening, a higher one is a loosening', () => {
  const before = { daily_loss_limit: 100, limit_increase_available_at: '2099-01-01T00:00:00Z' };
  assert.deepEqual(loosensOf(before, { daily_loss_limit: 50 }), []);
  assert.deepEqual(loosensOf(before, { daily_loss_limit: 500 }), ['daily_loss_limit:raised']);
  assert.deepEqual(loosensOf(before, { daily_loss_limit: null }), ['daily_loss_limit:cleared']);
});

test('a LONGER reality-check interval is a loosening', () => {
  // The one that reads backwards if you sort it with the money limits: a
  // longer interval means FEWER reminders.
  const before = {
    reality_check_interval_minutes: 30,
    limit_increase_available_at: '2099-01-01T00:00:00Z',
  };
  assert.deepEqual(
    loosensOf(before, { reality_check_interval_minutes: 240 }),
    ['reality_check_interval_minutes:lengthened']
  );
  assert.deepEqual(loosensOf(before, { reality_check_interval_minutes: 15 }), []);
});

test('an earlier exclusion end is a loosening', () => {
  const before = {
    self_excluded_until: '2027-01-01T00:00:00Z',
    limit_increase_available_at: '2099-01-01T00:00:00Z',
  };
  assert.deepEqual(
    loosensOf(before, { self_excluded_until: '2026-10-01T00:00:00Z' }),
    ['self_excluded_until:shortened']
  );
  assert.deepEqual(loosensOf(before, { self_excluded_until: '2028-01-01T00:00:00Z' }), []);
  assert.deepEqual(
    loosensOf(before, { self_excluded_until: null }),
    ['self_excluded_until:cleared']
  );
});

test('creating the first limits row can only tighten', () => {
  // No row means no limits at all, which is the loosest a player can be.
  assert.deepEqual(loosensOf(null, { daily_loss_limit: 5000 }), []);
  assert.equal(isHeld(null, { daily_loss_limit: 5000 }), false);
});

test('a loosening is held until the hold passes, a tightening never is', () => {
  const now = Date.parse('2026-09-04T12:00:00Z');
  const held = { daily_loss_limit: 100, limit_increase_available_at: '2026-09-04T18:00:00Z' };
  const free = { daily_loss_limit: 100, limit_increase_available_at: '2026-09-04T06:00:00Z' };

  assert.equal(isHeld(held, { daily_loss_limit: 500 }, now), true);
  assert.equal(isHeld(held, { daily_loss_limit: 50 }, now), false, 'tightening is never held');
  assert.equal(isHeld(free, { daily_loss_limit: 500 }, now), false, 'the hold has passed');
});

test('every scope and every reason has a label, and the panel can render both', () => {
  for (const scope of RESTRICTION_SCOPES) {
    assert.ok(SCOPE_META[scope], `scope ${scope} has no metadata`);
    assert.ok(SCOPE_META[scope].label, `scope ${scope} has no label`);
    assert.ok(SCOPE_META[scope].blurb, `scope ${scope} has no blurb`);
    assert.equal(typeof SCOPE_META[scope].enforced, 'boolean');
  }
  for (const code of RESTRICTION_REASON_CODES) {
    assert.ok(REASON_LABELS[code], `reason ${code} has no label`);
  }
});

test('the scopes that claim to be enforced are the ones with a guard', () => {
  const claim = RESTRICTION_SCOPES.filter((s) => SCOPE_META[s].enforced);
  assert.deepEqual(
    claim.slice().sort(),
    ENFORCED_SCOPES.slice().sort(),
    'SCOPE_META.enforced and ENFORCED_SCOPES must agree, or the panel tells an operator a '
      + 'scope bites when no guard watches it'
  );
  // transfers and social are recorded only, and the panel must say so.
  assert.equal(SCOPE_META.transfers.enforced, false);
  assert.equal(SCOPE_META.social.enforced, false);
  assert.match(SCOPE_META.transfers.blurb, /Recorded Only/);
  assert.match(SCOPE_META.social.blurb, /Recorded Only/);
});

test('every responsible-gaming field declares which direction is tighter', () => {
  for (const f of RG_FIELDS) {
    assert.ok(['lower', 'later'].includes(f.tighter), `${f.key} has no direction`);
    assert.ok(f.label, `${f.key} has no label`);
  }
  const byKey = Object.fromEntries(RG_FIELDS.map((f) => [f.key, f]));
  assert.equal(byKey.reality_check_interval_minutes.tighter, 'lower');
  assert.equal(byKey.self_excluded_until.tighter, 'later');
  assert.equal(byKey.cooling_off_until.tighter, 'later');
});

// ── 2. CONTRACTS ────────────────────────────────────────────────────────────

test('the route is exported through the operator wrapper', () => {
  assert.match(
    route,
    /export default withOperatorRoute\(spec, handle\)/,
    'every /horses route goes through withOperatorRoute: method allowlist, JWT, '
      + 'service-role client that throws without the key, rate limit, scrubbed envelope'
  );
  assert.ok(
    !/createClient\(/.test(route),
    'the route must not build its own client. The anon fallback was Phase 1 defect F1.'
  );
});

test('the route declares its floor and each action asks for its own', () => {
  assert.match(route, /permission: \{ GET: PERMISSIONS\.PLAYERS_READ, POST: PERMISSIONS\.PLAYERS_WRITE \}/);

  // The one that matters: support holds players.write and must NOT be able to
  // sanction, so the three moderation actions declare moderation.write.
  for (const action of ['restrict', 'lift', 'rg_set']) {
    assert.match(
      route,
      new RegExp(`${action}: PERMISSIONS\\.MODERATION_WRITE`),
      `${action} must require moderation.write, which the support role does not hold`
    );
  }
  assert.match(route, /ticket_assign: PERMISSIONS\.SUPPORT_WRITE/);
  assert.match(route, /note_add: PERMISSIONS\.PLAYERS_WRITE/);
  assert.match(
    route,
    /requireActionPermission\(op, action\)/,
    'the finer check must actually be called on the POST path'
  );
});

test('the approval gate runs BEFORE the write it gates', () => {
  const body = route.slice(route.indexOf('async function actionRestrict'));
  const gateAt = body.indexOf('requireApproval(');
  const writeAt = body.indexOf("'fn_ca_player_restrict'");
  assert.ok(gateAt > -1, 'actionRestrict does not call requireApproval');
  assert.ok(writeAt > -1, 'actionRestrict does not call fn_ca_player_restrict');
  assert.ok(
    gateAt < writeAt,
    'requireApproval must run before fn_ca_player_restrict, or a pending sanction is '
      + 'applied while the queue still says it is waiting'
  );
  assert.match(body, /kind: 'sanction'/, 'the approval kind must be sanction');
});

test('a pending sanction says the queue will not carry it out', () => {
  const body = route.slice(route.indexOf('async function actionRestrict'));
  assert.match(
    body,
    /appliedFromHere: true/,
    'the 202 must say the restriction is applied from this tab. sanction is deliberately '
      + 'not in EXECUTABLE_APPROVAL_KINDS, and an operator who reads "pending" and expects '
      + 'the queue to finish it would wait forever - review B-1 wearing a different hat.'
  );
  assert.match(body, /Nothing Has Been Applied/, 'and that nothing has happened yet');
});

test('what the operator is told is derived from the LIVE switch', () => {
  assert.match(
    route,
    /function restrictionMessage\(enforced, scope\)/,
    'the message must be a function of the enforcement state, not a constant'
  );
  const fn = route.slice(
    route.indexOf('function restrictionMessage'),
    route.indexOf('function scopeLabel')
  );
  assert.match(fn, /enforced === true/, 'the on case must be handled');
  assert.match(fn, /enforced === false/, 'the off case must be handled');
  assert.match(
    fn,
    /Recorded And Observed, Not Refused/,
    'with enforcement off the operator must be told the restriction refuses nothing'
  );
  assert.match(
    fn,
    /Could Not Be Read, So Assume Nothing/,
    'an unknown switch must not be reported as off'
  );

  // And it must be READ, not assumed, on every restriction-bearing answer.
  assert.match(route, /async function enforcementState\(db, requestId\)/);
  assert.match(
    route,
    /if \(error\) \{[\s\S]*?return null;/,
    'a failed policy read must answer null, never false'
  );
});

test('every mutating action writes one audit row', () => {
  const actions = [
    'actionRestrict', 'actionLift', 'actionNoteAdd', 'actionNoteDelete',
    'actionTag', 'actionRgSet', 'actionTicketAssign', 'actionReportReview',
  ];
  for (const name of actions) {
    const start = route.indexOf(`async function ${name}`);
    assert.ok(start > -1, `${name} is missing`);
    const end = route.indexOf('\nasync function ', start + 10);
    const body = route.slice(start, end === -1 ? undefined : end);
    assert.match(
      body,
      /auditOperatorAction\(op, req, \{/,
      `${name} does not write an audit row. Phase 1 F2: three shapes, some routes none.`
    );
  }
});

test('the route never moves money and never hard deletes', () => {
  // Against the CODE, not the file. The header explains that
  // HorseFleetManager seats through atomic_table_buyin - which is exactly why
  // a restriction binds a horse by construction - and a test that searched
  // raw bytes would go red on the explanation of its own rule. Then the
  // obvious way to quieten it is to delete the explanation, which leaves the
  // next agent with a bare rule and no reason.
  const body = route
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  for (const forbidden of [
    'fn_ca_mint', 'fn_ca_burn', 'fn_ca_fund_club', 'mass_fund_horses',
    'chip_ledger', 'atomic_table_buyin',
  ]) {
    assert.ok(
      !body.includes(forbidden),
      `${forbidden} has no business on the player route. A restriction stops a player `
        + 'entering; it never touches what they already hold.'
    );
  }
  assert.ok(
    !/\.delete\(\)/.test(body),
    'nothing on this route deletes a row. A lift marks lifted; a note delete is soft.'
  );
});

test('this phase never writes profiles.status', () => {
  assert.ok(
    !/from\('profiles'\)[\s\S]{0,200}\.update\(/.test(route),
    'profiles.status is decorative and nothing enforces on it. Writing it would create a '
      + "second opinion about a player's standing that the next agent would find and believe."
  );
});

test('the email masking rule is players.write, not players.read', () => {
  assert.match(
    route,
    /function emailVisible\(op\) \{[\s\S]*?PERMISSIONS\.PLAYERS_WRITE/,
    'everyone who can reach this route holds players.read, so gating the raw email on it '
      + 'would be gating on nothing. Phase 1 F19 and the club-arena-admin precedent.'
  );
});

test('the observation section says whether empty means quiet or means unknown', () => {
  const body = route.slice(
    route.indexOf('async function sectionObservations'),
    route.indexOf('async function sectionTickets')
  );
  assert.match(
    body,
    /activeRestrictions: error \? null : count \?\? null/,
    'a failed count must be null, not zero. An empty log beside "0 active restrictions" is '
      + 'a quiet platform; an empty log beside "unknown" is a panel that does not know what '
      + 'it is looking at.'
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// THE CORRECTIONS. Each pins a defect adversarial review found in the first
// version of this route.
// ═══════════════════════════════════════════════════════════════════════════

/** The route with its comments stripped: it explains these rules at length. */
const routeCode = route
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

test('the ticket vocabularies are the database constraint, not a guess', () => {
  // live_help_tickets_priority_check is ('low','medium','high','critical').
  // The first draft guessed ('low','normal','high','urgent'): `medium` is
  // the DEFAULT priority of every ticket on the platform, so filtering by it
  // failed enumOf, the filter was dropped, and the route answered with the
  // ENTIRE unfiltered queue - a wrong answer, not an error. The two invented
  // values passed validation and then violated the constraint on write, so
  // no priority an operator could select could be saved.
  assert.match(
    routeCode,
    /const TICKET_PRIORITIES = \['low', 'medium', 'high', 'critical'\]/,
    'TICKET_PRIORITIES must mirror live_help_tickets_priority_check exactly'
  );
  assert.ok(
    !/'normal'|'urgent'/.test(routeCode),
    'neither invented value may come back'
  );
});

test('a restriction cannot be raised without an idempotency key', () => {
  const body = routeCode.slice(routeCode.indexOf('async function actionRestrict'));
  assert.match(
    body,
    /if \(!opId\) \{[\s\S]{0,200}missing_op_id/,
    'opId must be REQUIRED. Without it the approvals RPC skips its replay lookup and '
      + 'every post files a fresh pending row - so an approved sanction can never be '
      + 'applied, because re-posting raises a third. sanction is not executable from '
      + 'the queue either, so nothing can finish it.'
  );
});

test('the approval key covers the DECISION, not just the player', () => {
  const body = routeCode.slice(routeCode.indexOf('async function actionRestrict'));
  assert.match(
    body,
    /const decisionKey = `\$\{userId\}#\$\{stableHash\(/,
    'the approval target must carry a fingerprint of scope, reasonCode and expiry. '
      + 'fn_ca_operator_request_approval compares a replay on kind, amount, asset, '
      + 'target_type and target_id - all constant for a sanction except the target - so '
      + 'a key approved for a narrow restriction could be replayed as a whole-account '
      + 'indefinite one with no mismatch detected.'
  );
  assert.match(
    body,
    /JSON\.stringify\(\{ scope, reasonCode, expiresAt: expiresAt \?\? null \}\)/,
    'and the fingerprint must cover all three'
  );
  // The plain user id still goes on the audit row, which is what a reader wants.
  assert.match(body, /targetId: userId,/, 'the audit row keeps the bare user id');
});

test('an approved sanction is recorded on the row and closed in the queue', () => {
  const body = routeCode.slice(routeCode.indexOf('async function actionRestrict'));
  assert.ok(
    !/p_approval_id: null/.test(body),
    'approval_id was hardcoded null, so the one link between a sanction and the second '
      + 'pair of eyes that authorised it was never written'
  );
  assert.match(body, /p_approval_id: gate\.required \? \(approvalIdOf\(approvalRef\)/);
  assert.match(
    body,
    /markApprovalExecuted\(op, approvalRef\.approvalId/,
    'the approval row must be closed, or the same approved key re-applies the '
      + 'restriction after every lift, indefinitely, with no new approval'
  );
  assert.match(
    body,
    /marked\.ok === false && !marked\.skipped/,
    "and its refusal must be READ: { ok: false, error: 'not_approved' } means a sanction "
      + 'was applied against a row nobody approved'
  );
});

test('the 202 files an audit row of its own', () => {
  const body = routeCode.slice(routeCode.indexOf('async function actionRestrict'));
  assert.match(
    body,
    /action: 'player\.request_restriction'/,
    'from the operator\'s point of view the request happened, and this is the one action '
      + 'in the phase where the request and the act are separated in time'
  );
  assert.match(body, /opId,\s*\n\s*\}\,\s*\n\s*\}\);/, 'and it must carry the key');
});

test('the observations section reports the enforcement tristate like the rest', () => {
  const body = routeCode.slice(
    routeCode.indexOf('async function sectionObservations'),
    routeCode.indexOf('async function sectionTickets')
  );
  assert.match(
    body,
    /enforced: await enforcementState\(db, requestId\)/,
    'this section used to take the RPC\'s own coalesce-to-false, so the one panel whose '
      + 'whole subject is the enforcement switch was the one panel that reported an '
      + 'unreadable switch as OFF'
  );
  assert.ok(
    !/enforced: data\.enforced === true/.test(body),
    'the collapsing read must not come back'
  );
});

test('a note that is too long says so, instead of reading as absent', () => {
  assert.match(
    routeCode,
    /function noteOrThrow\(value, max\)/,
    'text() collapses "absent" and "too long" into the same null, so an operator who '
      + 'wrote 2,100 characters explaining why was told they had written nothing - and '
      + 'for any other reason code the explanation was silently dropped'
  );
  assert.match(routeCode, /'note_too_long'/);
  // Every note field goes through it.
  assert.equal(
    (routeCode.match(/noteOrThrow\(/g) || []).length,
    4,
    'the helper plus its three call sites: restrict, lift and report_review'
  );
});

test('reviewing a report does not erase the previous reviewers note', () => {
  const body = routeCode.slice(routeCode.indexOf('async function actionReportReview'));
  assert.match(
    body,
    /if \(note\) patch\.admin_notes = note;/,
    'admin_notes must be set only when a note was given. Writing it unconditionally '
      + 'nulled out the first reviewer\'s text every time a report was re-reviewed '
      + "without retyping it - which this route's own header calls impossible."
  );
});

test('a responsible-gaming patch is validated before it reaches a cast', () => {
  assert.match(routeCode, /function validateRgPatch\(patch\)/);
  assert.match(routeCode, /validateRgPatch\(body\.patch\)/, 'and it must be called');
  assert.match(
    routeCode,
    /'unknown_limit'/,
    'a key that is not a responsible-gaming limit must be named, not passed through'
  );
  assert.match(
    routeCode,
    /'out_of_range'/,
    'and a value outside the range the database enforces must be refused HERE, or a '
      + "typo raises 22P02 out of the RPC and callPlayerRpc turns it into a 503 - so the "
      + 'operator reads "unavailable" for their own bad value and retries it'
  );
  // The ranges are the database's.
  assert.match(routeCode, /reality_check_interval_minutes: \{ kind: 'int', min: 5, max: 240/);
  assert.match(routeCode, /session_time_limit_minutes: \{ kind: 'int', min: 15, max: 1440/);
});

test('callPlayerRpc refuses an array and cannot throw out of its error path', () => {
  assert.match(
    routeCode,
    /!data \|\| typeof data !== 'object' \|\| Array\.isArray\(data\)/,
    'an array IS an object and would flow on with data.rows undefined - an empty list '
      + 'reported as a success'
  );
  assert.match(
    routeCode,
    /Number\.isFinite\(Date\.parse\(data\.held_until\)\)/,
    'an unparseable timestamp must not raise a RangeError from inside the error-shaping '
      + 'path, which would escape as a non-ApiError and turn a correct 400 into a 500'
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SECOND-ROUND CORRECTIONS. The first round of fixes was written fast, under
// review pressure, and reviewed by nobody. A second reviewer found two more
// blockers in it. These pin that round.
// ═══════════════════════════════════════════════════════════════════════════

const RG_FIX2 = await readFile(
  path.join(
    HERE, '..',
    'supabase/migrations/20260904193000_ca_creating_rg_limits_must_not_loosen_one.sql'
  ),
  'utf8'
);

test('creating a limits row uses the columns own default, not a longer one', () => {
  // BLOCKER. The INSERT branch defaulted the reality-check interval to 60
  // where the column's default is 30. A LONGER interval is FEWER reminders,
  // which this very function classifies as a loosening - so an operator
  // tightening a deposit limit silently halved the reality check for the same
  // player, on a protection surface, with no hold and nothing said.
  assert.match(
    RG_FIX2,
    /c_default_interval constant int := 30;/,
    'the create default must be the column default of 30'
  );
  assert.ok(
    !/::int, 60\)/.test(RG_FIX2.replace(/^\s*--.*$/gm, ' ')),
    'the 60-minute default must not come back'
  );
  assert.match(
    RG_FIX2,
    /ASSERT FAILED: the column default is now %/,
    'and the migration must refuse to apply if the column default moves away from 30, '
      + 'because the number now lives in two places'
  );
});

test('a consumed approval key cannot write a second restriction', () => {
  const body = routeCode.slice(routeCode.indexOf('async function actionRestrict'));
  assert.match(
    body,
    /if \(approvalRef\.alreadyExecuted\) \{[\s\S]{0,300}'already_executed'/,
    'fn_ca_player_restrict takes NO p_op_id, so it is exactly the kind approvals.js '
      + 'describes as having no key of its own. `executed` is a RELEASED status, so '
      + 'without this a replay falls through to the write. The unique index catches the '
      + 'common case but not after a LIFT: restrict, approve, execute, lift, press Apply '
      + 'It Now again, and a second restriction is written under a consumed approval.'
  );
  // fleet-admin guards the same thing the same way.
  assert.match(body, /409,/, 'and it must be a conflict, not a silent success');
});

test('the active-restriction count honours expiry, like the reader does', () => {
  const body = routeCode.slice(
    routeCode.indexOf('async function sectionObservations'),
    routeCode.indexOf('async function sectionTickets')
  );
  assert.match(
    body,
    /expires_at\.is\.null,expires_at\.gt\./,
    'counting on status alone over-reports in exactly the state the platform is '
      + 'guaranteed to be in, because the sweep that tidies status has no caller. And '
      + 'this count is what tells the operator whether an empty observation log means a '
      + 'quiet platform or nobody being restricted.'
  );
});

test('a dropped audit row reaches the operator', () => {
  const body = routeCode.slice(routeCode.indexOf('async function actionRestrict'));
  assert.match(
    body,
    /const auditRecorded = auditResult\?\.ok !== false;/,
    'auditOperatorAction never throws by design, so a dropped row used to be invisible: '
      + "a player's access taken away with nothing in admin_audit_log, and the operator "
      + 'told "Restriction Applied".'
  );
  assert.match(
    body,
    /WARNING: The Audit Row Could Not Be Written/,
    'and the operator must be told in the sentence they read'
  );
});

test('the ticket and report queues name the player', () => {
  assert.match(
    routeCode,
    /async function namesFor\(db, ids\)/,
    'a ticket list that renders an identical button on every row under a header reading '
      + 'PLAYER tells an operator nothing about whose ticket it is. Found by rendering '
      + 'the panel in a browser.'
  );
  assert.match(routeCode, /reported_name: names\.get/, 'the reports queue too');
  // Best effort: a failed lookup must not take the queue down with it.
  assert.match(
    routeCode,
    /if \(error \|\| !Array\.isArray\(data\)\) return out;/,
    'a name lookup that fails leaves the names out; it does not fail the list'
  );
});

test('the reason that needs a note is named once, not typed twice', async () => {
  const { REASON_NEEDS_NOTE } = await import('../src/lib/horses/playerRestrictions.js');
  assert.equal(REASON_NEEDS_NOTE, 'other');
  assert.match(
    routeCode,
    /reasonCode === REASON_NEEDS_NOTE/,
    'the route must use the constant. Both halves hardcoded the literal while the '
      + 'constant naming it sat exported and imported by nothing - which is exactly how '
      + 'the panel and the route drift apart about which reason needs an explanation.'
  );
  const panelSrc = await readFile(
    path.join(HERE, '..', 'src/components/horses/PlayersPanel.jsx'),
    'utf8'
  );
  assert.match(panelSrc, /reasonCode === REASON_NEEDS_NOTE/, 'and so must the panel');
});
