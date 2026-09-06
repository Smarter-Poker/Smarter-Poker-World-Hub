/**
 * GAME INTEGRITY AND CASE MANAGEMENT.
 *
 * GET  /api/horses/integrity-admin?section=queue
 * GET  /api/horses/integrity-admin?section=case&caseId=
 * GET  /api/horses/integrity-admin?section=pairs
 * GET  /api/horses/integrity-admin?section=flags
 * GET  /api/horses/integrity-admin?section=timing
 * GET  /api/horses/integrity-admin?section=hands
 * GET  /api/horses/integrity-admin?section=health
 *
 * POST actions: open_case, add_item, retract_item, assign, decide, close,
 * sanction.
 *
 * PHASE5-CONTRACTS section 0 is the rule this route enforces. Every read gets
 * live detector health before it gets content. Horses are included by default
 * and may only be narrowed by an explicit operator filter. A finding can be
 * attached to a human-owned case, but can never apply a sanction on its own.
 * This route never moves chips. A proposed confiscation is sent through the
 * Phase 2 maker-checker queue and, once approved, is only recorded in the
 * sanction ledger for a human to carry out through the authorized money path.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS, hasPermission } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest, forbidden } from '../../../src/lib/horses/apiEnvelope.js';
import { requireApproval, approvalPendingResponse } from '../../../src/lib/horses/approvals.js';
import { stableHash } from '../../../src/lib/horses/hash.js';
import {
  bool,
  enumOf,
  int,
  isoDate,
  money2dp,
  text,
  uuid,
  uuidList,
} from '../../../src/lib/horses/validate.js';

const SECTIONS = Object.freeze(['queue', 'case', 'pairs', 'flags', 'timing', 'hands', 'health']);
const ACTIONS = Object.freeze([
  'open_case',
  'add_item',
  'retract_item',
  'assign',
  'decide',
  'close',
  'sanction',
]);

const CASE_KINDS = Object.freeze([
  'collusion',
  'chip_dumping',
  'multi_accounting',
  'bot_or_rta',
  'abuse',
  'other',
]);
const CASE_SEVERITIES = Object.freeze(['low', 'medium', 'high']);
const CASE_ITEM_TYPES = Object.freeze([
  'collusion_row',
  'collusion_signal',
  'flag',
  'hand',
  'restriction',
  'note',
  'observation',
]);
const CASE_DECISIONS = Object.freeze(['no_action', 'warned', 'restricted', 'confiscated']);
const SANCTION_KINDS = Object.freeze(['warning', 'restriction', 'confiscation']);
const COMPOSITIONS = Object.freeze(['all', 'horse_horse', 'horse_human', 'human_human']);
const QUEUE_TIERS = Object.freeze([
  'active_case',
  'multiple_signals',
  'seven_day_money_flow',
  'chip_dump',
  'other_non_timing',
  'timing_only',
]);
const QUEUE_PATTERNS = Object.freeze([
  'TIMING_CORRELATION',
  'CHIP_DUMP',
  'SOFT_PLAY',
  'WIN_RATE_ANOMALY',
  'CHIP_FLOW_7D',
  'DUEL_REPEAT_PAIRING',
]);

const READ_RPCS = Object.freeze({
  queue: 'fn_ca_integrity_queue',
  case: 'fn_ca_integrity_case',
  pairs: 'fn_ca_integrity_pairs',
  flags: 'fn_ca_integrity_flags',
  timing: 'fn_ca_integrity_timing',
  hands: 'fn_ca_integrity_hands',
  health: 'fn_ca_integrity_detector_health',
});

const WRITE_RPCS = Object.freeze({
  open_case: 'fn_ca_integrity_case_open',
  add_item: 'fn_ca_integrity_case_add_item',
  retract_item: 'fn_ca_integrity_case_retract_item',
  assign: 'fn_ca_integrity_case_assign',
  decide: 'fn_ca_integrity_case_decide',
  close: 'fn_ca_integrity_case_close',
  sanction: 'fn_ca_integrity_sanction',
});

const REFUSAL_TEXT = Object.freeze({
  ACTOR_REQUIRED: 'That Action Needs A Signed-In Operator',
  CASE_NOT_FOUND: 'That Integrity Case Was Not Found',
  ITEM_NOT_FOUND: 'That Evidence Item Was Not Found',
  PLAYER_NOT_FOUND: 'That Player Was Not Found',
  RESTRICTION_NOT_FOUND: 'That Restriction Was Not Found',
  SUBJECT_NOT_IN_CASE: 'That Player Is Not A Subject Of This Case',
  CASE_CLOSED: 'That Case Is Closed And Cannot Be Changed',
  CASE_ALREADY_CLOSED: 'That Case Is Already Closed',
  STALE_VERSION: 'That Case Changed Since It Was Opened. Reload It And Try Again',
  VERSION_CONFLICT: 'That Case Changed Since It Was Opened. Reload It And Try Again',
  OP_ID_REUSED: 'That Idempotency Key Belongs To A Different Request. Reload And Try Again',
  IDEMPOTENCY_CONFLICT: 'That Idempotency Key Belongs To A Different Request. Reload And Try Again',
  APPROVAL_REQUIRED: 'That Confiscation Needs An Approved Request',
  APPROVAL_NOT_APPROVED: 'That Confiscation Has Not Been Approved',
  QUEUE_SOURCE_ERROR: 'The Integrity Queue Sources Could Not Be Read',
  SOURCE_ERROR: 'An Integrity Source Could Not Be Read',
  INTERNAL_ERROR: 'The Integrity Request Could Not Be Completed',
  INVALID_CASE_KIND: 'Unknown Integrity Case Kind',
  INVALID_SEVERITY: 'Unknown Case Severity',
  INVALID_ITEM_TYPE: 'Unknown Evidence Type',
  INVALID_DECISION: 'Unknown Case Decision',
  INVALID_SANCTION_KIND: 'Unknown Sanction Kind',
  INVALID_COMPOSITION: 'Unknown Player Composition',
  INVALID_TIER: 'Unknown Integrity Queue Tier',
  INVALID_PATTERN: 'Unknown Detector Pattern',
});

const QUERY_LIMIT = Object.freeze({ defaultValue: 50, max: 100 });
const TIMING_HAND_LIMIT = Object.freeze({ defaultValue: 200, max: 1000 });
const MAX_CURSOR_BYTES = 4096;
const MAX_DETAIL_BYTES = 16_384;
const HEALTH_STALE_AFTER_MINUTES = 30;

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function requiredUuid(value, sentence) {
  const id = uuid(value);
  if (!id) throw badRequest(sentence);
  return id;
}

function requiredText(value, { min = 1, max = 2000, missing, tooLong } = {}) {
  if (typeof value !== 'string' || value.trim().length < min) {
    throw badRequest(missing || 'Some Text Is Required');
  }
  const shaped = text(value, { min, max });
  if (!shaped) throw badRequest(tooLong || `That Text Must Be ${max} Characters Or Fewer`);
  return shaped;
}

function optionalText(value, { max = 2000, tooLong } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw badRequest('That Note Must Be Text');
  const shaped = text(value, { min: 1, max });
  if (!shaped) throw badRequest(tooLong || `That Text Must Be ${max} Characters Or Fewer`);
  return shaped;
}

function optionalEnum(value, allowed, sentence, transform = (entry) => entry) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw badRequest(sentence);
  const shaped = enumOf(transform(value.trim()), allowed);
  if (!shaped) throw badRequest(sentence);
  return shaped;
}

function queryBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const shaped = bool(value, { fallback: null });
  if (shaped === null) throw badRequest('That Player Filter Must Be True Or False');
  return shaped;
}

function boundedInteger(value, { defaultValue, min = 1, max, sentence }) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const shaped = int(value, { min, max, fallback: null });
  if (shaped === null) throw badRequest(sentence || `That Number Must Be Between ${min} And ${max}`);
  return shaped;
}

function optionalVersion(value) {
  if (value === undefined || value === null || value === '') return null;
  return boundedInteger(value, {
    defaultValue: null,
    min: 0,
    max: 2_147_483_647,
    sentence: 'That Case Version Is Not Valid',
  });
}

function optionalDate(value, sentence) {
  if (value === undefined || value === null || value === '') return null;
  const shaped = isoDate(value);
  if (!shaped) throw badRequest(sentence || 'That Date Is Not Valid');
  return shaped;
}

function cursorOf(value) {
  if (value === undefined || value === null || value === '') return null;
  let parsed = value;
  if (typeof value === 'string') {
    if (value.length > MAX_CURSOR_BYTES) throw badRequest('That Page Cursor Is Too Large');
    try {
      parsed = JSON.parse(value);
    } catch {
      throw badRequest('That Page Cursor Is Not Valid');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw badRequest('That Page Cursor Is Not Valid');
  }
  let encoded;
  try {
    encoded = JSON.stringify(parsed);
  } catch {
    throw badRequest('That Page Cursor Is Not Valid');
  }
  if (!encoded || encoded.length > MAX_CURSOR_BYTES) throw badRequest('That Page Cursor Is Too Large');
  return parsed;
}

function detailOf(value) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest('Evidence Detail Must Be An Object');
  }
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw badRequest('Evidence Detail Is Not Valid');
  }
  if (encoded.length > MAX_DETAIL_BYTES) throw badRequest('Evidence Detail Is Too Large');
  return value;
}

function requestContext(req, requestId) {
  const headers = req?.headers || {};
  const real = typeof headers['x-real-ip'] === 'string' ? headers['x-real-ip'].trim() : '';
  const forwarded = typeof headers['x-forwarded-for'] === 'string'
    ? headers['x-forwarded-for'].split(',')[0].trim()
    : '';
  return {
    p_ip_address: (real || forwarded || req?.socket?.remoteAddress || '').slice(0, 64) || null,
    p_user_agent: typeof headers['user-agent'] === 'string'
      ? headers['user-agent'].slice(0, 400)
      : null,
    p_request_id: requestId || null,
  };
}

function refusalCode(data) {
  const raw = data?.code ?? data?.error ?? data?.reason;
  return typeof raw === 'string' && raw.trim() ? raw.trim().toUpperCase() : 'REFUSED';
}

function refusalStatus(code) {
  if (code.includes('SOURCE_ERROR') || code.includes('UNAVAILABLE') || code === 'INTERNAL_ERROR') {
    return 503;
  }
  if (code.includes('NOT_FOUND')) return 404;
  if (code === 'ACTOR_REQUIRED' || code.includes('PERMISSION')) return 403;
  if (
    code.includes('STALE')
    || code.includes('VERSION_CONFLICT')
    || code.includes('IDEMPOTENCY_CONFLICT')
    || code.includes('CLOSED')
    || code.includes('ALREADY')
    || code.includes('APPROVAL')
    || code.includes('OP_ID')
  ) return 409;
  return 400;
}

function refusalMessage(data, code) {
  if (REFUSAL_TEXT[code]) return REFUSAL_TEXT[code];
  const candidate = typeof data?.message === 'string' ? data.message.trim() : '';
  if (candidate && candidate.length <= 240 && !/[\r\n]/.test(candidate)) return candidate;
  return 'The Integrity Request Was Refused';
}

async function callIntegrityRpc(db, name, args, { requestId, label }) {
  let result;
  try {
    result = await db.rpc(name, args);
  } catch (error) {
    console.error(
      `[horses.integrity-admin] ${requestId || 'no-request-id'} ${name} threw:`,
      error?.message || error
    );
    throw new ApiError(503, `${label} Is Unavailable`, `${name}_unavailable`);
  }
  const { data, error } = result || {};
  if (error) {
    console.error(
      `[horses.integrity-admin] ${requestId || 'no-request-id'} ${name} failed:`,
      error?.message || error
    );
    throw new ApiError(503, `${label} Is Unavailable`, `${name}_unavailable`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    console.error(
      `[horses.integrity-admin] ${requestId || 'no-request-id'} ${name} returned no payload`
    );
    throw new ApiError(503, `${label} Is Unavailable`, `${name}_unavailable`);
  }
  if (data.ok === false) {
    const code = refusalCode(data);
    throw new ApiError(refusalStatus(code), refusalMessage(data, code), code.toLowerCase());
  }
  if (data.ok !== true) {
    console.error(
      `[horses.integrity-admin] ${requestId || 'no-request-id'} ${name} returned no success state`
    );
    throw new ApiError(503, `${label} Is Unavailable`, `${name}_unavailable`);
  }
  return data;
}

async function detectorHealth(db, requestId) {
  const data = await callIntegrityRpc(
    db,
    READ_RPCS.health,
    { p_stale_after_minutes: HEALTH_STALE_AFTER_MINUTES },
    { requestId, label: 'Detector Health' }
  );
  // The Phase 5 health RPC wraps the worker's established health contract so
  // it can add cron and source detail. Copy the worker fields onto the same
  // object as compatibility aliases: existing health presentation code reads
  // `status`, `stale` and `has_unscanned_gap`, while investigators still get
  // the complete worker, latest_cron, daily_scans and source_errors records.
  const worker = data.worker && typeof data.worker === 'object' && !Array.isArray(data.worker)
    ? data.worker
    : null;
  if (!worker || !hasOwn(data, 'latest_cron') || !Array.isArray(data.source_errors)) {
    console.error(
      `[horses.integrity-admin] ${requestId || 'no-request-id'} detector health omitted required detail`
    );
    throw new ApiError(503, 'Detector Health Is Unavailable', 'fn_ca_integrity_detector_health_unavailable');
  }
  return { ...worker, ...data, worker };
}

function readArgs(section, query) {
  const asOf = optionalDate(query.asOf, 'That Snapshot Time Is Not Valid');
  const snapshot = asOf ? { p_as_of: asOf } : {};

  if (section === 'case') {
    return { p_case_id: requiredUuid(query.caseId, 'A Case Id Is Required') };
  }
  if (section === 'timing') {
    const since = optionalDate(query.since, 'That Timing Start Is Not Valid');
    return {
      p_include_horses: queryBoolean(query.includeHorses, true),
      ...snapshot,
      ...(since ? { p_since: since } : {}),
      p_hand_limit: boundedInteger(query.handLimit ?? query.limit, {
        ...TIMING_HAND_LIMIT,
        sentence: `The Timing Sample Must Be Between 1 And ${TIMING_HAND_LIMIT.max} Hands`,
      }),
    };
  }

  const limit = boundedInteger(query.limit, {
    ...QUERY_LIMIT,
    sentence: `The Page Size Must Be Between 1 And ${QUERY_LIMIT.max}`,
  });
  const cursor = cursorOf(query.cursor);
  if (section === 'queue') {
    return {
      p_include_horses: queryBoolean(query.includeHorses, true),
      p_composition: optionalEnum(
        query.composition,
        COMPOSITIONS,
        'Unknown Player Composition',
        (value) => value.toLowerCase()
      ) || 'all',
      p_tier: optionalEnum(
        query.tier,
        QUEUE_TIERS,
        'Unknown Integrity Queue Tier',
        (value) => value.toLowerCase()
      ),
      p_pattern: optionalEnum(
        query.pattern,
        QUEUE_PATTERNS,
        'Unknown Detector Pattern',
        (value) => value.toUpperCase()
      ),
      ...snapshot,
      p_limit: limit,
      p_cursor: cursor,
    };
  }
  if (section === 'pairs') {
    return {
      p_include_horses: queryBoolean(query.includeHorses, true),
      p_composition: optionalEnum(
        query.composition,
        COMPOSITIONS,
        'Unknown Player Composition',
        (value) => value.toLowerCase()
      ) || 'all',
      ...snapshot,
      p_limit: limit,
      p_cursor: cursor,
    };
  }
  if (section === 'flags') {
    return { ...snapshot, p_limit: limit, p_cursor: cursor };
  }
  return {
    p_player_id: query.playerId
      ? requiredUuid(query.playerId, 'That Player Id Is Not Valid')
      : null,
    p_pair_player_id: query.pairPlayerId
      ? requiredUuid(query.pairPlayerId, 'That Pair Player Id Is Not Valid')
      : null,
    ...snapshot,
    p_limit: limit,
    p_cursor: cursor,
  };
}

function normalizeQueue(data) {
  const groups = Array.isArray(data.groups) ? data.groups : Array.isArray(data.rows) ? data.rows : null;
  const state = data.state ?? data.queue_state ?? data.queueState;
  if (!groups || typeof state !== 'string' || !data.totals || typeof data.totals !== 'object') {
    throw new ApiError(503, 'The Integrity Queue Is Unavailable', 'fn_ca_integrity_queue_unavailable');
  }
  return {
    ...data,
    state,
    queue_state: state,
    queueState: state,
    groups,
    rows: groups,
    total: Number.isFinite(Number(data.totals.groups)) ? Number(data.totals.groups) : null,
    tierTotals: data.totals.by_tier || {},
    patternTotals: data.totals.by_pattern || {},
    compositionTotals: data.totals.by_composition || {},
    sourceTotals: data.totals.by_source || {},
    nextCursor: data.next_cursor ?? null,
    hasMore: data.next_cursor != null,
  };
}

async function readSection(db, section, query, requestId) {
  const health = await detectorHealth(db, requestId);
  if (section === 'health') return { section, ...health, health };

  const data = await callIntegrityRpc(db, READ_RPCS[section], readArgs(section, query), {
    requestId,
    label: section === 'case' ? 'The Integrity Case' : `Integrity ${section[0].toUpperCase()}${section.slice(1)}`,
  });
  const shaped = section === 'queue' ? normalizeQueue(data) : data;
  return { section, ...shaped, health };
}

function writeBase(req, op, requestId, body) {
  const opId = requiredText(body.opId, {
    min: 8,
    max: 200,
    missing: 'An Idempotency Key Is Required',
    tooLong: 'That Idempotency Key Is Too Long',
  });
  return {
    actor: op?.user?.id || null,
    opId,
    context: requestContext(req, requestId),
  };
}

async function actionOpenCase(db, op, req, body, requestId) {
  const subjectIds = uuidList(body.subjectIds, { max: 10 });
  if (!subjectIds) throw badRequest('Name Between One And Ten Valid Case Subjects');
  const kind = optionalEnum(body.kind, CASE_KINDS, 'Unknown Integrity Case Kind');
  if (!kind) throw badRequest('An Integrity Case Kind Is Required');
  const severity = optionalEnum(body.severity, CASE_SEVERITIES, 'Unknown Case Severity');
  const note = optionalText(body.note, { max: 2000 });
  const base = writeBase(req, op, requestId, body);
  return callIntegrityRpc(db, WRITE_RPCS.open_case, {
    p_subject_ids: subjectIds,
    p_kind: kind,
    p_severity: severity || 'medium',
    p_note: note,
    p_actor: base.actor,
    p_op_id: base.opId,
    ...base.context,
  }, { requestId, label: 'The Integrity Case' });
}

async function actionAddItem(db, op, req, body, requestId) {
  const base = writeBase(req, op, requestId, body);
  const caseId = requiredUuid(body.caseId, 'A Case Id Is Required');
  const itemType = optionalEnum(body.itemType, CASE_ITEM_TYPES, 'Unknown Evidence Type');
  if (!itemType) throw badRequest('An Evidence Type Is Required');
  const detail = detailOf(body.detail);
  const itemRef = itemType === 'note'
    ? null
    : requiredText(body.itemRef, {
      max: 500,
      missing: 'An Evidence Reference Is Required',
      tooLong: 'That Evidence Reference Is Too Long',
    });
  if (itemType === 'note' && !text(detail.note, { min: 1, max: 4000 })) {
    throw badRequest('Write A Note Before Adding It To The Case');
  }
  return callIntegrityRpc(db, WRITE_RPCS.add_item, {
    p_case_id: caseId,
    p_item_type: itemType,
    p_item_ref: itemRef,
    p_detail: detail,
    p_actor: base.actor,
    p_op_id: base.opId,
    ...base.context,
  }, { requestId, label: 'The Evidence Item' });
}

async function actionRetractItem(db, op, req, body, requestId) {
  const caseId = requiredUuid(body.caseId, 'A Case Id Is Required');
  const itemId = requiredUuid(body.itemId, 'An Evidence Item Id Is Required');
  const reason = requiredText(body.reason, {
    min: 10,
    max: 1000,
    missing: 'Write A Reason Of At Least Ten Characters For The Retraction',
    tooLong: 'That Retraction Reason Is Too Long',
  });
  const base = writeBase(req, op, requestId, body);
  return callIntegrityRpc(db, WRITE_RPCS.retract_item, {
    p_case_id: caseId,
    p_item_id: itemId,
    p_reason: reason,
    p_actor: base.actor,
    p_op_id: base.opId,
    ...base.context,
  }, { requestId, label: 'The Evidence Retraction' });
}

async function actionAssign(db, op, req, body, requestId) {
  const caseId = requiredUuid(body.caseId, 'A Case Id Is Required');
  if (!hasOwn(body, 'assignedTo')) throw badRequest('Choose An Operator Or Explicitly Unassign The Case');
  const assignedTo = body.assignedTo === null || body.assignedTo === ''
    ? null
    : requiredUuid(body.assignedTo, 'That Assigned Operator Id Is Not Valid');
  const base = writeBase(req, op, requestId, body);
  return callIntegrityRpc(db, WRITE_RPCS.assign, {
    p_case_id: caseId,
    p_assigned_to: assignedTo,
    p_actor: base.actor,
    p_op_id: base.opId,
    p_expected_version: optionalVersion(body.expectedVersion),
    ...base.context,
  }, { requestId, label: 'The Case Assignment' });
}

async function actionDecide(db, op, req, body, requestId) {
  const caseId = requiredUuid(body.caseId, 'A Case Id Is Required');
  const decision = optionalEnum(body.decision, CASE_DECISIONS, 'Unknown Case Decision');
  if (!decision) throw badRequest('A Case Decision Is Required');
  const decisionNote = requiredText(body.decisionNote, {
    min: 10,
    max: 2000,
    missing: 'Write A Decision Note Of At Least Ten Characters',
    tooLong: 'That Decision Note Is Too Long',
  });
  const base = writeBase(req, op, requestId, body);
  return callIntegrityRpc(db, WRITE_RPCS.decide, {
    p_case_id: caseId,
    p_decision: decision,
    p_decision_note: decisionNote,
    p_actor: base.actor,
    p_op_id: base.opId,
    p_expected_version: optionalVersion(body.expectedVersion),
    ...base.context,
  }, { requestId, label: 'The Case Decision' });
}

async function actionClose(db, op, req, body, requestId) {
  const caseId = requiredUuid(body.caseId, 'A Case Id Is Required');
  const closeNote = requiredText(body.closeNote, {
    min: 10,
    max: 2000,
    missing: 'Write A Closing Note Of At Least Ten Characters',
    tooLong: 'That Closing Note Is Too Long',
  });
  const base = writeBase(req, op, requestId, body);
  return callIntegrityRpc(db, WRITE_RPCS.close, {
    p_case_id: caseId,
    p_close_note: closeNote,
    p_actor: base.actor,
    p_op_id: base.opId,
    p_expected_version: optionalVersion(body.expectedVersion),
    ...base.context,
  }, { requestId, label: 'The Case Closure' });
}

async function actionSanction(db, op, req, res, body, requestId) {
  const caseId = requiredUuid(body.caseId, 'A Case Id Is Required');
  const subjectId = requiredUuid(body.subjectId, 'A Case Subject Id Is Required');
  const kind = optionalEnum(body.kind, SANCTION_KINDS, 'Unknown Sanction Kind');
  if (!kind) throw badRequest('A Sanction Kind Is Required');
  const note = requiredText(body.note, {
    min: 10,
    max: 2000,
    missing: 'Write A Sanction Note Of At Least Ten Characters',
    tooLong: 'That Sanction Note Is Too Long',
  });
  const base = writeBase(req, op, requestId, body);

  let restrictionId = null;
  let amount = null;
  let approvalId = null;

  if (kind === 'restriction') {
    restrictionId = requiredUuid(
      body.restrictionId,
      'Record The Existing Player Restriction Before Adding It To This Case'
    );
  } else if (hasOwn(body, 'restrictionId') && body.restrictionId != null && body.restrictionId !== '') {
    throw badRequest('Only A Restriction Sanction Can Name A Restriction');
  }

  if (kind === 'confiscation') {
    if (!hasPermission(op?.permissions, PERMISSIONS.MONEY_WRITE)) {
      throw forbidden(
        'A Confiscation Also Needs The money.write Permission',
        'money_write_required'
      );
    }
    amount = money2dp(body.amount, { max: 1_000_000_000_000 });
    if (amount === null) throw badRequest('Enter A Positive Confiscation Amount With At Most Two Decimals');

    const decisionKey = `${caseId}:${subjectId}:${stableHash(
      JSON.stringify({ kind, amount, note })
    ).toString(16)}`;
    const approval = await requireApproval(op, req, {
      kind: 'sanction',
      amount,
      asset: 'chips',
      targetType: 'integrity_case',
      targetId: decisionKey,
      reason: note,
      opId: base.opId,
      payload: {
        action: 'integrity_confiscation',
        caseId,
        subjectId,
        kind,
        amount,
        note,
        opId: base.opId,
        decisionKey,
      },
    });

    if (approval.required) {
      return approvalPendingResponse(res, approval, {
        requestId,
        message:
          'That Confiscation Needs A Second Operator. It Has Been Raised, No Sanction Was Recorded And No Chips Moved',
        extra: {
          caseId,
          subjectId,
          opId: base.opId,
          executionRequired: true,
          noChipsMoved: true,
        },
      });
    }
    if (approval.alreadyExecuted) {
      throw new ApiError(
        409,
        'That Confiscation Approval Was Already Used. Reload The Case',
        'already_executed'
      );
    }
    if (!approval.approvalId) {
      throw new ApiError(
        503,
        'The Approval Record Could Not Be Read, So No Sanction Was Recorded',
        'approval_unavailable'
      );
    }
    approvalId = approval.approvalId;
  } else if (hasOwn(body, 'amount') && body.amount != null && body.amount !== '') {
    throw badRequest('Only A Confiscation Can Name An Amount');
  }

  const data = await callIntegrityRpc(db, WRITE_RPCS.sanction, {
    p_case_id: caseId,
    p_subject_id: subjectId,
    p_kind: kind,
    p_amount: amount,
    p_restriction_id: restrictionId,
    p_approval_id: approvalId,
    p_note: note,
    p_actor: base.actor,
    p_op_id: base.opId,
    ...base.context,
  }, { requestId, label: 'The Integrity Sanction' });

  if (kind === 'confiscation') {
    return {
      ...data,
      approvalId,
      noChipsMoved: true,
      executionRequired: true,
      message:
        'Confiscation Approved And Recorded. No Chips Have Moved. A Human Must Carry It Out Through The Authorized Money Workflow',
    };
  }
  return data;
}

async function writeAction({ db, op, req, res, body, requestId }, action) {
  if (action === 'open_case') return actionOpenCase(db, op, req, body, requestId);
  if (action === 'add_item') return actionAddItem(db, op, req, body, requestId);
  if (action === 'retract_item') return actionRetractItem(db, op, req, body, requestId);
  if (action === 'assign') return actionAssign(db, op, req, body, requestId);
  if (action === 'decide') return actionDecide(db, op, req, body, requestId);
  if (action === 'close') return actionClose(db, op, req, body, requestId);
  return actionSanction(db, op, req, res, body, requestId);
}

export const spec = {
  name: 'horses.integrity-admin',
  methods: ['GET', 'POST'],
  permission: {
    GET: PERMISSIONS.PLAYERS_READ,
    POST: PERMISSIONS.MODERATION_WRITE,
  },
  limit: { GET: 'read', POST: 'write' },
  durable: { POST: { max: 30, windowSeconds: 60 } },
};

export async function handle(context) {
  const { method, query, body, db, requestId } = context;
  if (method === 'POST') {
    const action = enumOf(body.action, ACTIONS);
    if (!action) throw badRequest('Unknown Action');
    return writeAction(context, action);
  }

  const section = enumOf(String(query.section || 'queue'), SECTIONS);
  if (!section) throw badRequest('Unknown Section');
  return readSection(db, section, query, requestId);
}

export default withOperatorRoute(spec, handle);
