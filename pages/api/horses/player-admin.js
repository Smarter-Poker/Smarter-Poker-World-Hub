/**
 * PLAYER ADMIN - a player, as an operator can see them and act on them.
 *
 * GET  /api/horses/player-admin?section=search&q=&includeHorses=&restricted=&limit=&offset=
 * GET  /api/horses/player-admin?section=player&userId=
 * GET  /api/horses/player-admin?section=restrictions&scope=&status=&includeHorses=&limit=&offset=
 * GET  /api/horses/player-admin?section=observations&hours=&limit=&offset=
 * GET  /api/horses/player-admin?section=tickets&status=&priority=&limit=&offset=
 * GET  /api/horses/player-admin?section=reports&status=&limit=&offset=
 *
 * POST /api/horses/player-admin { action: 'restrict', userId, scope, reasonCode, note, expiresAt, opId }
 * POST /api/horses/player-admin { action: 'lift', restrictionId, note }
 * POST /api/horses/player-admin { action: 'note_add', userId, body, pinned }
 * POST /api/horses/player-admin { action: 'note_delete', noteId }
 * POST /api/horses/player-admin { action: 'tag_add' | 'tag_remove', userId, tag }
 * POST /api/horses/player-admin { action: 'rg_set', userId, patch }
 * POST /api/horses/player-admin { action: 'ticket_assign', ticketId, assignedTo, priority }
 * POST /api/horses/player-admin { action: 'report_review', reportId, status, note }
 *
 * PHASE4-CONTRACTS.md SECTION 0 OUTRANKS EVERYTHING BELOW.
 *
 *   NOTHING IN THIS PHASE TAKES A PLAYER'S ACCESS AWAY UNTIL DAN TURNS
 *   ENFORCEMENT ON, AND WHAT AN OPERATOR IS TOLD MUST MATCH WHAT THE
 *   PLATFORM WILL ACTUALLY DO.
 *
 * This is the first route in the programme that can hurt a real person by
 * working correctly, and everything below is shaped by that.
 *
 *   1. EVERY WRITE HERE REPORTS THE ENFORCEMENT STATE BACK. `enforced` rides
 *      on every restriction answer and on the two list sections, read live
 *      from ca_operator_policy rather than assumed, so the panel's sentence
 *      to the operator is derived from what the database will actually do.
 *      A confirm dialog that says "Suspend This Player" while enforcement is
 *      off is the lie this phase exists not to tell.
 *   2. NO MONEY MOVES ON THIS ROUTE. There is no chip path here at all: no
 *      mint, no burn, no fund, no cashout, no clawback. A restriction stops
 *      a player entering; it never touches what they already hold.
 *   3. NOTHING IS DELETED. `note_delete` is a soft delete in the RPC and the
 *      row keeps its text and its author. `lift` marks a restriction lifted.
 *      There is no action on this route that removes a record.
 *   4. HORSES ARE PLAYERS (CLAUDE.md 10.5). `includeHorses` DEFAULTS TRUE on
 *      every section that has it, and the only thing `is_horse` does here is
 *      travel back as a badge. A horse can be searched, opened, noted,
 *      tagged and restricted exactly as a human can, and the enforcement
 *      binds it through the same table trigger, because HorseFleetManager
 *      seats through atomic_table_buyin like everybody else.
 *
 * WHY THE PERMISSIONS ARE CHECKED HERE AND NOT ONLY IN THE SPEC.
 *
 * `spec.permission` is per METHOD, and this route's POST covers three very
 * different jobs: annotating a player, answering their ticket, and taking
 * their access away. The `support` role holds `players.write` - a help desk
 * has to be able to leave a note - and it must NOT be able to sanction. So
 * the spec asks for the floor and each action asks for its own, naming the
 * permission it wanted so a 403 is actionable rather than mysterious. This is
 * the Phase 3 M-3 pattern, applied to actions instead of sections.
 *
 * WHY THE SERVICE ROLE. ca_player_restrictions, ca_operator_player_notes,
 * ca_operator_player_tags and ca_restriction_observations all have RLS on
 * with no policy for anon or authenticated, so a browser holding an operator
 * JWT reads zero rows from every one of them. The wrapper's service-role
 * client is the only client this route ever sees.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS, hasPermission } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest, forbidden, notFound } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import {
  requireApproval,
  markApprovalExecuted,
  approvalPendingResponse,
} from '../../../src/lib/horses/approvals.js';
import { stableHash } from '../../../src/lib/horses/hash.js';
import { mapDbError } from '../../../src/lib/horses/dbErrors.js';
import { runPaged } from '../../../src/lib/horses/paged.js';
import { pageFor, shapeList } from '../../../src/lib/horses/listShape.js';
import { bool, enumOf, int, isoDate, searchTerm, text, uuid } from '../../../src/lib/horses/validate.js';
import {
  RESTRICTION_REASON_CODES,
  RESTRICTION_SCOPES,
  needsApproval,
} from '../../../src/lib/horses/playerRestrictions.js';

const SECTIONS = [
  'search',
  'player',
  'restrictions',
  'observations',
  'tickets',
  'reports',
];

const ACTIONS = [
  'restrict',
  'lift',
  'note_add',
  'note_delete',
  'tag_add',
  'tag_remove',
  'rg_set',
  'ticket_assign',
  'report_review',
];

/**
 * The permission each action needs, over and above the spec's floor.
 *
 * `restrict`, `lift` and `rg_set` are moderation.write, which `support` does
 * NOT hold. A help-desk account can annotate a player and answer their
 * ticket; it cannot take their access, and it cannot loosen the protection
 * they set for themselves.
 */
const ACTION_PERMISSION = Object.freeze({
  restrict: PERMISSIONS.MODERATION_WRITE,
  lift: PERMISSIONS.MODERATION_WRITE,
  rg_set: PERMISSIONS.MODERATION_WRITE,
  report_review: PERMISSIONS.MODERATION_WRITE,
  ticket_assign: PERMISSIONS.SUPPORT_WRITE,
  note_add: PERMISSIONS.PLAYERS_WRITE,
  note_delete: PERMISSIONS.PLAYERS_WRITE,
  tag_add: PERMISSIONS.PLAYERS_WRITE,
  tag_remove: PERMISSIONS.PLAYERS_WRITE,
});

/**
 * MIRRORED FROM THE DATABASE'S OWN CHECK CONSTRAINTS, not invented.
 *
 *   live_help_tickets_status_check:   ('open','in_progress','resolved','closed')
 *   live_help_tickets_priority_check: ('low','medium','high','critical')
 *
 * The first draft of this file guessed `('low','normal','high','urgent')` and
 * got two of the four wrong, in the worst possible direction:
 *   * `medium` - the DEFAULT priority of every ticket on the platform - was
 *     not in the list, so `?priority=medium` failed enumOf, the filter was
 *     dropped, and the route answered with the ENTIRE unfiltered queue. A
 *     wrong answer, not an error.
 *   * `normal` and `urgent` passed validation and then violated the check
 *     constraint, so no priority an operator could select could be saved.
 *
 * `user_reports.status` has no check constraint at all; these four are the
 * values the console writes and its default is 'pending'.
 */
const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const REPORT_STATUSES = ['pending', 'reviewed', 'actioned', 'dismissed'];

/**
 * The responsible-gaming fields, and the ranges the database enforces.
 *
 * Validated HERE so an operator's typo is a 400 that names the field, not a
 * 503 that says "Those Limits Could Not Be Saved". Without this, `"abc"` in a
 * money box reaches a `::numeric` cast, raises 22P02 out of the RPC, and
 * `callPlayerRpc` turns any raised error into a 503 - so the operator reads
 * "unavailable" for their own bad value and retries it.
 */
const RG_LIMITS = Object.freeze({
  daily_deposit_limit: { kind: 'money', min: 0, max: 1e12 },
  weekly_deposit_limit: { kind: 'money', min: 0, max: 1e12 },
  monthly_deposit_limit: { kind: 'money', min: 0, max: 1e12 },
  daily_loss_limit: { kind: 'money', min: 0, max: 1e12 },
  session_time_limit_minutes: { kind: 'int', min: 15, max: 1440 },
  reality_check_interval_minutes: { kind: 'int', min: 5, max: 240, notNull: true },
  self_excluded_until: { kind: 'time' },
  cooling_off_until: { kind: 'time' },
});

const SEARCH_PAGE = { defaultLimit: 25, max: 200 };
const LIST_PAGE = { defaultLimit: 50, max: 200 };

/** Operator-safe sentences for what an RPC can refuse. Title Case, house rule. */
const REFUSAL_TEXT = Object.freeze({
  actor_required: 'That Action Needs A Signed-In Operator',
  user_required: 'No Player Was Named',
  player_not_found: 'No Such Player',
  already_restricted:
    'That Player Already Has An Active Restriction On That Scope. Lift It First',
  not_found: 'That Record No Longer Exists',
  not_active: 'That Restriction Is Not Active Any More',
  already_deleted: 'That Note Was Already Deleted',
  body_required: 'A Note Needs Some Text',
  bad_tag: 'A Tag Is Two To Thirty Two Characters, Lower Case, Letters Numbers And Hyphens',
  patch_required: 'No Limits Were Given To Set',
  loosening_is_held:
    'That Change Loosens A Protection, So It Is Held. An Operator Is Not A Bypass',
  patch_changes_nothing:
    'Those Limits Are Already Set To Those Values, So Nothing Was Changed',
  reality_check_not_nullable:
    'The Reality Check Interval Cannot Be Cleared. Set A Number Of Minutes',
});

/**
 * Call one of this phase's RPCs and shape its refusal.
 *
 * Same discipline as fleet-admin's callFleetRpc: a transport failure is a 503
 * with a scrubbed message, and a structured `{ ok: false, reason }` is a 400
 * carrying an operator-safe sentence. Postgres text never reaches the browser.
 */
async function callPlayerRpc(db, name, args, { unavailable, requestId }) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    console.error(
      `[horses.player-admin] ${requestId || 'no-request-id'} ${name} failed:`,
      error.message
    );
    throw new ApiError(503, unavailable, `${name}_unavailable`);
  }
  // Array.isArray too: an array IS an object, and one would flow on with
  // data.rows undefined - an empty list reported as a success.
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    console.error(
      `[horses.player-admin] ${requestId || 'no-request-id'} ${name} returned no payload`
    );
    throw new ApiError(503, unavailable, `${name}_unavailable`);
  }
  if (data.ok === false) {
    const code = typeof data.reason === 'string' ? data.reason : 'refused';
    let message = REFUSAL_TEXT[code] || `Refused: ${code}`;
    // The held-until moment goes IN THE SENTENCE, not in a side channel.
    // ApiError carries status, message and code and nothing else, so an
    // operator told "it is held" and not told until when would simply try
    // again, and again.
    // Guarded, because this runs INSIDE the error-shaping path: a
    // RangeError from an unparseable timestamp would escape as a
    // non-ApiError and turn a correct 400 refusal into a 500.
    if (code === 'loosening_is_held' && Number.isFinite(Date.parse(data.held_until))) {
      message += `. Held Until ${new Date(data.held_until).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
    }
    throw new ApiError(400, message, code);
  }
  return data;
}

/**
 * Is enforcement on right now?
 *
 * Read on every restriction-bearing answer rather than cached, because the
 * whole sentence the panel shows an operator is derived from it and a stale
 * "enforcement is off" is the one wrong answer that matters. Unknown is
 * reported as null, never as false: telling an operator their restriction
 * will not bite when nobody knows is the same lie in the other direction.
 */
async function enforcementState(db, requestId) {
  const { data, error } = await db
    .from('ca_operator_policy')
    .select('restrictions_enforced')
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(
      `[horses.player-admin] ${requestId || 'no-request-id'} policy read failed:`,
      error.message
    );
    return null;
  }
  if (!data) return null;
  return data.restrictions_enforced === true;
}

/** Does this operator see money figures? Phase 3 M-3's rule, reused. */
function moneyVisible(op) {
  return hasPermission(op?.permissions, PERMISSIONS.MONEY_READ);
}

/**
 * Does this operator see a raw email address?
 *
 * The Phase 1 F19 rule and the club-arena-admin precedent: masked unless the
 * caller holds players.write. Everyone who can reach this route holds
 * players.read, so gating on that would be gating on nothing.
 */
function emailVisible(op) {
  return hasPermission(op?.permissions, PERMISSIONS.PLAYERS_WRITE);
}

function requireActionPermission(op, action) {
  const needed = ACTION_PERMISSION[action];
  if (!needed) return;
  if (!hasPermission(op?.permissions, needed)) {
    throw forbidden(
      `That Action Needs The ${needed} Permission`,
      'permission_required'
    );
  }
}

// ── SECTIONS ────────────────────────────────────────────────────────────────

async function sectionSearch(db, op, query, requestId) {
  const page = pageFor(query, 'search', SEARCH_PAGE);
  const data = await callPlayerRpc(
    db,
    'fn_ca_player_search',
    {
      p_q: searchTerm(query.q) || '',
      // DEFAULTS TRUE. An absent parameter means every player, horses
      // included; only an explicit `includeHorses=false` narrows it, and the
      // answer says which happened so the panel can show it.
      p_include_horses: bool(query.includeHorses, { fallback: true }) !== false,
      p_restricted: bool(query.restricted, { fallback: null }),
      p_limit: page.limit,
      p_offset: page.offset,
      p_reveal_email: emailVisible(op),
    },
    { unavailable: 'Player Search Is Unavailable', requestId }
  );

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const total = typeof data.total === 'number' ? data.total : null;
  return {
    rows,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: total === null ? rows.length === page.limit : page.offset + rows.length < total,
    truncated: total !== null && total > rows.length,
    includeHorses: data.includeHorses !== false,
    emailRevealed: data.emailRevealed === true,
  };
}

async function sectionPlayer(db, op, query, requestId) {
  const userId = uuid(query.userId);
  if (!userId) throw badRequest('A Player Id Is Required');

  const money = moneyVisible(op);
  const data = await callPlayerRpc(
    db,
    'fn_ca_player_360',
    { p_user_id: userId, p_money_visible: money, p_reveal_email: emailVisible(op) },
    { unavailable: 'That Player Could Not Be Loaded', requestId }
  );

  return {
    ...data,
    // Reported, not assumed. The panel decides what to say about a
    // restriction from this, and it must be the live value.
    enforced: await enforcementState(db, requestId),
    moneyVisible: money,
  };
}

async function sectionRestrictions(db, query, requestId) {
  const page = pageFor(query, 'restrictions', LIST_PAGE);
  const data = await callPlayerRpc(
    db,
    'fn_ca_restriction_list',
    {
      p_scope: enumOf(query.scope, RESTRICTION_SCOPES),
      p_status: enumOf(query.status, ['active', 'lifted', 'expired'], { fallback: 'active' }),
      p_include_horses: bool(query.includeHorses, { fallback: true }) !== false,
      p_limit: page.limit,
      p_offset: page.offset,
    },
    { unavailable: 'The Restriction List Is Unavailable', requestId }
  );

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const total = typeof data.total === 'number' ? data.total : null;
  return {
    rows,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: total === null ? rows.length === page.limit : page.offset + rows.length < total,
    truncated: total !== null && total > rows.length,
    includeHorses: data.includeHorses !== false,
    enforced: await enforcementState(db, requestId),
  };
}

/**
 * What enforcement WOULD have refused. This is the case for turning it on,
 * and it is the only section whose emptiness is genuinely ambiguous: no
 * observations means either nobody is restricted, or nobody restricted has
 * tried to sit down. The panel is told which by `activeRestrictions`.
 */
async function sectionObservations(db, query, requestId) {
  const page = pageFor(query, 'observations', LIST_PAGE);
  const data = await callPlayerRpc(
    db,
    'fn_ca_restriction_observations',
    {
      p_hours: int(query.hours, { min: 1, max: 720, fallback: 24 }),
      p_limit: page.limit,
      p_offset: page.offset,
    },
    { unavailable: 'The Observation Log Is Unavailable', requestId }
  );

  const { count, error } = await db
    .from('ca_player_restrictions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const total = typeof data.total === 'number' ? data.total : null;
  return {
    rows,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: total === null ? rows.length === page.limit : page.offset + rows.length < total,
    hours: data.hours ?? null,
    // Read the same way every other answer on this route reads it. This
    // section used to take the RPC's own coalesce-to-false, so the one
    // panel whose whole subject is the enforcement switch was the one
    // panel that reported an UNREADABLE switch as OFF.
    enforced: await enforcementState(db, requestId),
    // Null means the count failed, which is NOT zero. An empty log beside
    // "0 active restrictions" is a quiet platform; an empty log beside
    // "unknown" is a panel that does not know what it is looking at.
    activeRestrictions: error ? null : count ?? null,
  };
}

async function sectionTickets(db, query, requestId) {
  const page = pageFor(query, 'tickets', LIST_PAGE);
  const status = enumOf(query.status, TICKET_STATUSES);
  const priority = enumOf(query.priority, TICKET_PRIORITIES);

  let q = db
    .from('live_help_tickets')
    .select(
      'id, user_id, subject, priority, status, assigned_to, created_at, updated_at, resolved_at',
      { count: 'exact' }
    );
  if (status) q = q.eq('status', status);
  if (priority) q = q.eq('priority', priority);

  const result = await runPaged(q.order('created_at', { ascending: false }), page);
  if (result.error) {
    throw mapDbError(result.error, 'The Ticket Queue', { route: 'horses.player-admin' });
  }

  const now = Date.now();
  const rows = (result.data || []).map((t) => ({
    ...t,
    // SLA ageing, computed here rather than in the browser so the CSV and
    // the table agree and so a clock-skewed laptop cannot change a queue's
    // apparent state.
    ageHours:
      t.created_at && !t.resolved_at
        ? Math.max(0, Math.round((now - new Date(t.created_at).getTime()) / 36e5))
        : null,
  }));

  return shapeList(result, page, rows, { requestId });
}

async function sectionReports(db, query, requestId) {
  const page = pageFor(query, 'reports', LIST_PAGE);
  const status = enumOf(query.status, REPORT_STATUSES);

  let q = db
    .from('user_reports')
    .select(
      'id, reporter_id, reported_user_id, reason, details, status, reviewed_by, reviewed_at, created_at',
      { count: 'exact' }
    );
  if (status) q = q.eq('status', status);

  const result = await runPaged(q.order('created_at', { ascending: false }), page);
  if (result.error) {
    throw mapDbError(result.error, 'The Reports Queue', { route: 'horses.player-admin' });
  }
  return shapeList(result, page, result.data || [], { requestId });
}

// ── ACTIONS ─────────────────────────────────────────────────────────────────

/**
 * RESTRICT. The heaviest thing on this route.
 *
 * A restriction that covers the whole account, or that never expires, goes
 * through the Phase 2 approvals queue as kind `sanction` and answers 202
 * having written NOTHING. Everything narrower and time-boxed writes now and
 * is audited.
 *
 * `sanction` is deliberately not executable from the approvals queue - see
 * PHASE4-CONTRACTS section 3 - so the 202 says the request was raised and
 * that the restriction is applied from this tab once it is approved. An
 * operator who reads "pending" and expects the queue to finish it would
 * otherwise wait forever, which is review B-1's defect wearing a different
 * hat.
 */
async function actionRestrict(db, op, req, res, body) {
  const userId = uuid(body.userId);
  if (!userId) throw badRequest('A Player Id Is Required');

  const scope = enumOf(body.scope, RESTRICTION_SCOPES);
  if (!scope) throw badRequest('Unknown Restriction Scope');

  const reasonCode = enumOf(body.reasonCode, RESTRICTION_REASON_CODES);
  if (!reasonCode) throw badRequest('Unknown Reason Code');

  // `text()` answers null for BOTH "absent" and "longer than the max", so
  // an operator who wrote 2,100 characters explaining why was told they
  // had written nothing - and for any other reason code their explanation
  // was silently dropped and the restriction written with no note at all.
  const note = noteOrThrow(body.note, 2000);
  if (reasonCode === 'other' && !note) {
    throw badRequest('Reason Code Other Needs A Note Saying Why', 'note_required');
  }

  const expiresAt = body.expiresAt ? isoDate(body.expiresAt) : null;
  if (body.expiresAt && !expiresAt) throw badRequest('That Expiry Is Not A Date');
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    throw badRequest('That Expiry Has Already Passed', 'expiry_in_the_past');
  }

  // THE IDEMPOTENCY KEY IS REQUIRED, exactly as fleet-admin requires one.
  //
  // Without it `p_op_id` is null, the approvals RPC skips its replay lookup
  // entirely, and EVERY post files a fresh pending row: press Restrict twice
  // and two sanctions are queued, and after the second operator approves one
  // there is no way to apply it, because re-posting raises a third. `sanction`
  // is deliberately not executable from the queue, so nothing else can finish
  // it either. That is review B-1's "control with no exit" wearing a hat.
  const opId = text(body.opId, { min: 1, max: 200 });
  if (!opId) {
    throw badRequest('Missing Idempotency Key. Reload The Panel And Try Again', 'missing_op_id');
  }

  const enforced = await enforcementState(db, op?.requestId);
  const gate = needsApproval({ scope, expiresAt });

  // Declared out here because the WRITE below needs the approval id (to
  // record which decision authorised it) and so does markApprovalExecuted.
  let approvalRef = null;

  if (gate.required) {
    // THE APPROVAL'S IDENTITY HAS TO COVER WHAT IS BEING APPROVED.
    //
    // fn_ca_operator_request_approval compares a replay on five fields:
    // kind, amount, asset, target_type and target_id. For a sanction the
    // first three are constant, so target_id was the ONLY thing that varied
    // - and it was the bare user id, which is the same for every restriction
    // on that player. So: raise `tournaments`, get it approved, then re-post
    // `account` under the same key and the payload-mismatch guard sees no
    // mismatch, the row reads `approved`, and a whole-account indefinite
    // restriction nobody approved is applied.
    //
    // The decision goes INTO the key, the same way fleet-admin puts a patch
    // fingerprint in its approval target (review M-8). The plain user id
    // stays on the audit row, which is what anybody reading the trail wants.
    const decisionKey = `${userId}#${stableHash(
      JSON.stringify({ scope, reasonCode, expiresAt: expiresAt ?? null })
    ).toString(16)}`;

    approvalRef = await requireApproval(op, req, {
      kind: 'sanction',
      targetType: 'profile',
      targetId: decisionKey,
      reason: note || reasonCode,
      opId,
      payload: { action: 'restrict', userId, scope, reasonCode, note, expiresAt },
    });

    if (approvalRef.required) {
      // The request happened, from the operator's point of view, so it gets
      // a row. setPolicy files one at exactly this point for the same
      // reason: this is the one action in the phase where the request and
      // the act are separated in time, so it is the one that most needs it.
      await auditOperatorAction(op, req, {
        action: 'player.request_restriction',
        targetType: 'profile',
        targetId: userId,
        before: null,
        after: null,
        details: {
          scope, reasonCode, expiresAt, enforced,
          gateReason: gate.reason,
          approvalId: approvalRef.approvalId ?? null,
          opId,
        },
      });

      return approvalPendingResponse(res, approvalRef, {
        requestId: op?.requestId,
        message:
          'That Restriction Needs A Second Operator. It Has Been Raised And Nothing Has Been Applied',
        extra: {
          // Told plainly, because the queue will NOT carry this out.
          appliedFromHere: true,
          gateReason: gate.reason,
          enforced,
          // Handed back so the panel can offer to apply it under THIS key
          // once it is approved, rather than minting a new one and raising
          // a second request.
          opId,
        },
      });
    }
  }

  const data = await callPlayerRpc(
    db,
    'fn_ca_player_restrict',
    {
      p_user_id: userId,
      p_scope: scope,
      p_reason_code: reasonCode,
      p_note: note,
      p_expires_at: expiresAt,
      p_actor: op?.user?.id || null,
      // The link between a sanction and the second pair of eyes that
      // authorised it. It used to be hardcoded null, so the column the
      // schema describes as "the approval that gated it" was always empty.
      p_approval_id: gate.required ? (approvalIdOf(approvalRef) ?? null) : null,
    },
    { unavailable: 'That Restriction Could Not Be Applied', requestId: op?.requestId }
  );

  // Close the approval row. NEVER THROWS by design - the restriction is
  // already written by the time this runs - but its refusal IS read, because
  // `{ ok: false, error: 'not_approved' }` means a sanction was applied
  // against a row nobody approved, which is the loudest signal this system
  // can produce (review M-8).
  let executionNote = null;
  if (gate.required && approvalRef?.approvalId) {
    const marked = await markApprovalExecuted(op, approvalRef.approvalId, {
      restrictionId: data.restriction?.id ?? null,
      scope,
      reasonCode,
    });
    if (marked && marked.ok === false && !marked.skipped) {
      executionNote = marked.reason || 'unknown';
    }
  }

  await auditOperatorAction(op, req, {
    action: 'player.restrict',
    targetType: 'profile',
    targetId: userId,
    before: null,
    after: data.restriction ?? null,
    details: {
      scope,
      reasonCode,
      expiresAt,
      isHorse: data.is_horse === true,
      // The state at the moment of the decision. Reading the trail later,
      // "was this actually stopping anybody" is the first question.
      enforced,
      gateReason: gate.reason,
      opId,
      approvalId: approvalRef?.approvalId ?? null,
      approvalCloseRefused: executionNote,
    },
  });

  return {
    restriction: data.restriction ?? null,
    isHorse: data.is_horse === true,
    enforced,
    approvalCloseRefused: executionNote,
    message: restrictionMessage(enforced, scope),
  };
}

/** The approval id an approval answer carries, whatever it called it. */
function approvalIdOf(approval) {
  return approval?.approvalId ?? null;
}

/**
 * What the operator is told, derived from the LIVE switch.
 *
 * Section 0 rule 2: a sentence claiming a player has been stopped, while
 * enforcement is off, is the lie this phase exists not to tell.
 */
function restrictionMessage(enforced, scope) {
  // "Tournaments Is Restricted" was the first draft. Scope labels are
  // plural nouns and one of them is already a phrase, so the sentence is
  // built around the label rather than agreeing with it.
  const what = `${scopeLabel(scope)} Is Now Restricted For This Player`;
  if (enforced === true) return `${what}. New Entries Will Be Refused`;
  if (enforced === false) {
    return `${what}, And Enforcement Is Off. This Is Recorded And Observed, Not Refused`;
  }
  return `${what}. Whether Enforcement Is On Could Not Be Read, So Assume Nothing`;
}

/**
 * A note, or a refusal that says WHICH problem it has.
 *
 * `text()` collapses "you sent nothing" and "you sent too much" into the
 * same null, and the two need different sentences: one is a missing field
 * and the other is somebody's paragraph being thrown away.
 */
function noteOrThrow(value, max) {
  if (value == null || value === '') return null;
  const trimmed = text(value, { max });
  if (!trimmed) {
    throw badRequest(
      `That Note Is Too Long. Keep It Under ${max} Characters`,
      'note_too_long'
    );
  }
  return trimmed;
}

/**
 * Validate a responsible-gaming patch against the ranges the database
 * enforces, so a typo is a 400 naming the field rather than a 503.
 */
function validateRgPatch(patch) {
  const keys = Object.keys(patch);
  if (keys.length === 0) throw badRequest('No Limits Were Given To Set', 'patch_required');

  for (const key of keys) {
    const rule = RG_LIMITS[key];
    if (!rule) {
      throw badRequest(`That Is Not A Responsible Gaming Limit: ${key}`, 'unknown_limit');
    }
    const value = patch[key];
    if (value == null || value === '') {
      if (rule.notNull) {
        throw badRequest(
          'The Reality Check Interval Cannot Be Cleared. Set A Number Of Minutes',
          'reality_check_not_nullable'
        );
      }
      continue;
    }
    if (rule.kind === 'time') {
      if (!Number.isFinite(Date.parse(value))) {
        throw badRequest(`That Is Not A Date: ${key}`, 'bad_date');
      }
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) throw badRequest(`That Is Not A Number: ${key}`, 'bad_number');
    if (rule.kind === 'int' && !Number.isInteger(n)) {
      throw badRequest(`That Must Be A Whole Number Of Minutes: ${key}`, 'bad_number');
    }
    if (n < rule.min || n > rule.max) {
      throw badRequest(
        `${key} Must Be Between ${rule.min} And ${rule.max}`,
        'out_of_range'
      );
    }
  }
}

function scopeLabel(scope) {
  const labels = {
    account: 'The Account',
    cash: 'Cash Games',
    tournaments: 'Tournaments',
    transfers: 'Transfers',
    social: 'Social',
  };
  return labels[scope] || 'That Scope';
}

async function actionLift(db, op, req, body) {
  const id = uuid(body.restrictionId);
  if (!id) throw badRequest('A Restriction Id Is Required');

  const { data: before } = await db
    .from('ca_player_restrictions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  const data = await callPlayerRpc(
    db,
    'fn_ca_player_lift_restriction',
    {
      p_id: id,
      p_actor: op?.user?.id || null,
      p_note: noteOrThrow(body.note, 2000),
    },
    { unavailable: 'That Restriction Could Not Be Lifted', requestId: op?.requestId }
  );

  await auditOperatorAction(op, req, {
    action: 'player.lift_restriction',
    targetType: 'profile',
    targetId: data.restriction?.user_id ?? before?.user_id ?? null,
    before: data.before ?? before ?? null,
    after: data.restriction ?? null,
    details: { restrictionId: id, scope: data.restriction?.scope ?? before?.scope ?? null },
  });

  return { restriction: data.restriction ?? null, message: 'That Restriction Is Lifted' };
}

async function actionNoteAdd(db, op, req, body) {
  const userId = uuid(body.userId);
  if (!userId) throw badRequest('A Player Id Is Required');
  const noteBody = text(body.body, { max: 4000 });
  if (!noteBody) throw badRequest('A Note Needs Some Text');

  const data = await callPlayerRpc(
    db,
    'fn_ca_player_note_add',
    {
      p_user_id: userId,
      p_body: noteBody,
      p_actor: op?.user?.id || null,
      p_pinned: body.pinned === true,
    },
    { unavailable: 'That Note Could Not Be Saved', requestId: op?.requestId }
  );

  await auditOperatorAction(op, req, {
    action: 'player.note_add',
    targetType: 'profile',
    targetId: userId,
    before: null,
    after: { id: data.note?.id ?? null, pinned: data.note?.pinned ?? false },
    details: { noteId: data.note?.id ?? null },
  });

  return { note: data.note ?? null, message: 'Note Saved' };
}

async function actionNoteDelete(db, op, req, body) {
  const noteId = uuid(body.noteId);
  if (!noteId) throw badRequest('A Note Id Is Required');

  const data = await callPlayerRpc(
    db,
    'fn_ca_player_note_delete',
    { p_note_id: noteId, p_actor: op?.user?.id || null },
    { unavailable: 'That Note Could Not Be Removed', requestId: op?.requestId }
  );

  await auditOperatorAction(op, req, {
    action: 'player.note_delete',
    targetType: 'profile',
    targetId: data.note?.user_id ?? null,
    // The REAL prior row, which the RPC now hands back for exactly this.
    // A synthetic { deleted: false } was the only before-state in the
    // phase that was not the thing it claimed to describe.
    before: data.before ?? null,
    after: data.note ?? null,
    details: { noteId },
  });

  // Said out loud, because "Deleted" would be wrong: the row is still there
  // and an audit reader will find it.
  return { note: data.note ?? null, message: 'Note Removed. The Record Of It Is Kept' };
}

async function actionTag(db, op, req, body, remove) {
  const userId = uuid(body.userId);
  if (!userId) throw badRequest('A Player Id Is Required');
  const tag = text(body.tag, { max: 32 });
  if (!tag) throw badRequest('A Tag Is Required');

  const data = await callPlayerRpc(
    db,
    'fn_ca_player_tag_set',
    { p_user_id: userId, p_tag: tag, p_actor: op?.user?.id || null, p_remove: remove },
    { unavailable: 'That Tag Could Not Be Saved', requestId: op?.requestId }
  );

  await auditOperatorAction(op, req, {
    action: remove ? 'player.tag_remove' : 'player.tag_add',
    targetType: 'profile',
    targetId: userId,
    before: { tag: data.tag ?? null, present: data.was_present === true },
    after: { tag: data.tag ?? null, present: !remove },
    details: { tag: data.tag ?? null },
  });

  return { tag: data.tag ?? null, removed: remove, message: remove ? 'Tag Removed' : 'Tag Added' };
}

/**
 * RESPONSIBLE GAMING. Section 0 rule 7: an operator is not a bypass of a
 * player's protection.
 *
 * The RPC decides tighten from loosen and refuses a loosening patch WHOLE
 * while the 24-hour hold stands. This route does not second-guess that and
 * does not offer a force flag, because a force flag is the bypass with an
 * extra click in front of it.
 */
async function actionRgSet(db, op, req, body) {
  const userId = uuid(body.userId);
  if (!userId) throw badRequest('A Player Id Is Required');
  if (!body.patch || typeof body.patch !== 'object' || Array.isArray(body.patch)) {
    throw badRequest('No Limits Were Given To Set');
  }
  validateRgPatch(body.patch);

  const { data: before } = await db
    .from('responsible_gaming_limits')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const data = await callPlayerRpc(
    db,
    'fn_ca_player_rg_set',
    { p_user_id: userId, p_patch: body.patch, p_actor: op?.user?.id || null },
    { unavailable: 'Those Limits Could Not Be Saved', requestId: op?.requestId }
  );

  await auditOperatorAction(op, req, {
    action: 'player.rg_set',
    targetType: 'profile',
    targetId: userId,
    before: data.before ?? before ?? null,
    after: data.limits ?? null,
    details: {
      patch: body.patch,
      created: data.created === true,
      // Which fields actually moved, as the RPC computed it. A patch that
      // changes nothing is refused now, so this is never empty.
      changed: data.changed ?? null,
    },
  });

  return {
    limits: data.limits ?? null,
    created: data.created === true,
    message: data.created === true ? 'Limits Set' : 'Limits Updated',
  };
}

async function actionTicketAssign(db, op, req, body) {
  const ticketId = uuid(body.ticketId);
  if (!ticketId) throw badRequest('A Ticket Id Is Required');

  const assignedTo = body.assignedTo == null || body.assignedTo === ''
    ? null
    : uuid(body.assignedTo);
  if (body.assignedTo && !assignedTo) throw badRequest('That Assignee Is Not A Player Id');

  const priority = body.priority == null || body.priority === ''
    ? null
    : enumOf(body.priority, TICKET_PRIORITIES);
  if (body.priority && !priority) throw badRequest('Unknown Priority');

  const { data: before } = await db
    .from('live_help_tickets')
    .select('id, user_id, status, priority, assigned_to')
    .eq('id', ticketId)
    .maybeSingle();
  if (!before) throw notFound('That Ticket No Longer Exists');

  const patch = { updated_at: new Date().toISOString() };
  if (body.assignedTo !== undefined) patch.assigned_to = assignedTo;
  if (priority) patch.priority = priority;

  const { data: after, error } = await db
    .from('live_help_tickets')
    .update(patch)
    .eq('id', ticketId)
    .select('id, user_id, status, priority, assigned_to')
    .maybeSingle();
  if (error) throw mapDbError(error, 'That Ticket', { route: 'horses.player-admin' });

  await auditOperatorAction(op, req, {
    action: 'ticket.assign',
    targetType: 'live_help_ticket',
    targetId: ticketId,
    before,
    after: after ?? null,
    details: { assignedTo, priority },
  });

  return { ticket: after ?? null, message: 'Ticket Updated' };
}

async function actionReportReview(db, op, req, body) {
  const reportId = uuid(body.reportId);
  if (!reportId) throw badRequest('A Report Id Is Required');

  const status = enumOf(body.status, REPORT_STATUSES);
  if (!status) throw badRequest('Unknown Report Status');

  const note = noteOrThrow(body.note, 2000);

  const { data: before } = await db
    .from('user_reports')
    .select('id, reported_user_id, status, reviewed_by, reviewed_at, admin_notes')
    .eq('id', reportId)
    .maybeSingle();
  if (!before) throw notFound('That Report No Longer Exists');

  // admin_notes is set ONLY when a note was given. Writing it
  // unconditionally nulled out the first reviewer's text every time a
  // report was re-reviewed without retyping it, which this route's own
  // header calls impossible ("there is no action on this route that
  // removes a record").
  const patch = {
    status,
    reviewed_by: op?.user?.id || null,
    reviewed_at: new Date().toISOString(),
  };
  if (note) patch.admin_notes = note;

  const { data: after, error } = await db
    .from('user_reports')
    .update(patch)
    .eq('id', reportId)
    .select('id, reported_user_id, status, reviewed_by, reviewed_at, admin_notes')
    .maybeSingle();
  if (error) throw mapDbError(error, 'That Report', { route: 'horses.player-admin' });

  await auditOperatorAction(op, req, {
    action: 'report.review',
    targetType: 'user_report',
    targetId: reportId,
    before,
    after: after ?? null,
    details: { from: before.status, to: status },
  });

  return { report: after ?? null, message: 'Report Reviewed' };
}

// ── ROUTE ───────────────────────────────────────────────────────────────────

export const spec = {
  name: 'horses.player-admin',
  methods: ['GET', 'POST'],
  // The FLOOR. Each action checks its own on top, because support holds
  // players.write and must not be able to sanction.
  permission: { GET: PERMISSIONS.PLAYERS_READ, POST: PERMISSIONS.PLAYERS_WRITE },
  limit: { GET: 'read', POST: 'write' },
  // Durable, not in-memory. Taking a player's access away is not a thing to
  // rate limit "per lambda instance", and neither is a script walking the
  // player list.
  durable: { POST: { max: 30, windowSeconds: 60 } },
};

export async function handle({ req, res, op, db, body, query, method, requestId }) {
  if (method === 'POST') {
    const action = enumOf(body.action, ACTIONS);
    if (!action) throw badRequest('Unknown Action');
    requireActionPermission(op, action);

    if (action === 'restrict') return actionRestrict(db, op, req, res, body);
    if (action === 'lift') return actionLift(db, op, req, body);
    if (action === 'note_add') return actionNoteAdd(db, op, req, body);
    if (action === 'note_delete') return actionNoteDelete(db, op, req, body);
    if (action === 'tag_add') return actionTag(db, op, req, body, false);
    if (action === 'tag_remove') return actionTag(db, op, req, body, true);
    if (action === 'rg_set') return actionRgSet(db, op, req, body);
    if (action === 'ticket_assign') return actionTicketAssign(db, op, req, body);
    return actionReportReview(db, op, req, body);
  }

  const section = enumOf(String(query.section || 'search'), SECTIONS);
  if (!section) throw badRequest('Unknown Section');

  if (section === 'search') return sectionSearch(db, op, query, requestId);
  if (section === 'player') return sectionPlayer(db, op, query, requestId);
  if (section === 'restrictions') return sectionRestrictions(db, query, requestId);
  if (section === 'observations') return sectionObservations(db, query, requestId);
  if (section === 'tickets') return sectionTickets(db, query, requestId);
  return sectionReports(db, query, requestId);
}

export default withOperatorRoute(spec, handle);
