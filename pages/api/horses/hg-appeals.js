/**
 * /api/horses/hg-appeals
 *   GET   ?status=&group_id=&limit=&offset=     - list ban appeals (admin view)
 *   PATCH {appeal_id, decision, reviewer_note}  - review an appeal
 *
 * Built on withHgOperatorRoute: `db` is the service-role client (audit writes),
 * `userDb` speaks as the caller so auth.uid() resolves inside the SECURITY
 * DEFINER moderation RPCs.
 *
 * The list response carries `total` when the RPC knows one and `total: null`
 * when it does not, never an invented figure, plus `hasMore`. A fabricated
 * count is worse than no count: the pager believes it and stops.
 */
import { withHgOperatorRoute, mapHgRpcError } from '../../../src/lib/horses/hgOperator.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { enumOf, paging, uuid } from '../../../src/lib/horses/validate.js';

const DECISIONS = ['approved', 'denied'];

/**
 * home_ban_appeals.status: the value a review writes is one of DECISIONS and a
 * row that has not been reviewed is `pending`, which is also every value the
 * moderation page's status filter offers (re-verification L-8). An empty
 * status means "all". Anything else is a 400 here rather than a 500 out of
 * the RPC.
 */
export const APPEAL_STATUSES = Object.freeze(['pending', ...DECISIONS]);

/** 'hidden_pending_review' -> 'Hidden Pending Review', for the 400 sentence. */
const titleOf = (value) => value.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

function statusFilterOf(query) {
  const raw = query.status;
  if (raw === undefined || raw === null || raw === '') return null;
  const status = enumOf(String(raw).toLowerCase(), APPEAL_STATUSES);
  if (!status) {
    throw badRequest(
      `Status Must Be ${APPEAL_STATUSES.map(titleOf).join(', ')}, Or Blank For All`,
      'invalid_status'
    );
  }
  return status;
}

export const spec = {
  name: 'horses.hg-appeals',
  methods: ['GET', 'PATCH'],
  permission: { GET: PERMISSIONS.PLAYERS_READ, PATCH: PERMISSIONS.MODERATION_WRITE },
  limit: { GET: 'read', PATCH: 'write' },
};

/** The RPC returns either a bare array or a jsonb envelope; accept both. */
function unwrapList(data) {
  if (Array.isArray(data)) return { rows: data, total: null };
  if (data && typeof data === 'object' && !Array.isArray(data.appeals)) {
    // An envelope keyed something else would silently render an empty queue,
    // which reads exactly like "no appeals to review".
    console.warn('[hg-appeals] rpc envelope has no appeals array; keys:', Object.keys(data).join(','));
  }
  return { rows: data?.appeals ?? [], total: typeof data?.total === 'number' ? data.total : null };
}

async function handleGet({ op, userDb, query }) {
  let groupId = null;
  if (query.group_id !== undefined && query.group_id !== '') {
    groupId = uuid(query.group_id);
    if (!groupId) throw badRequest('A Valid Group Id Is Required', 'invalid_group_id');
  }
  const status = statusFilterOf(query);
  const page = paging(query, { defaultLimit: 50, max: 200 });

  const { data, error } = await userDb.rpc('list_home_ban_appeals_admin', {
    p_caller_user_id: op.user.id,
    p_status: status,
    p_group_id: groupId,
    p_limit: page.limit,
    p_offset: page.offset,
  });
  if (error) {
    // 42501 / UNAUTHORIZED -> 403, an expired JWT -> 401, anything else
    // through mapDbError; the database sentence is logged, never returned.
    throw mapHgRpcError(error, 'The Appeals Queue', { requestId: op.requestId, route: 'horses.hg-appeals' });
  }

  // Contract addendum item 15: when the RPC reports no count, `total` is null
  // and the pager reads `hasMore`. It used to be filled with
  // page.offset + rows.length, so page one of a full queue answered
  // "Showing 1-50 Of 50" and the client's own `last < total` disabled Next:
  // every appeal past row 50 was unreachable, and the count shown was a lie.
  const { rows, total: rpcTotal } = unwrapList(data);
  const total = rpcTotal;
  return {
    rows,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: rpcTotal === null ? rows.length === page.limit : page.offset + rows.length < rpcTotal,
    // Legacy field name the moderation page already reads.
    appeals: rows,
  };
}

async function handlePatch({ req, op, userDb, body }) {
  const appealId = uuid(body.appeal_id);
  if (!appealId) throw badRequest('A Valid Appeal Id Is Required', 'invalid_appeal_id');
  const decision = enumOf(body.decision, DECISIONS);
  if (!decision) throw badRequest('Decision Must Be Approved Or Denied', 'invalid_decision');
  const note = typeof body.reviewer_note === 'string' ? body.reviewer_note.trim().slice(0, 2000) : null;

  const { data, error } = await userDb.rpc('review_home_ban_appeal', {
    p_appeal_id: appealId,
    p_decision: decision,
    p_reviewer_note: note || null,
    p_caller_user_id: op.user.id,
  });
  if (error) {
    throw mapHgRpcError(error, 'That Appeal', { requestId: op.requestId, route: 'horses.hg-appeals' });
  }

  // An approved appeal UNBANS a player.
  await auditOperatorAction(op, req, {
    action: 'hg.appeal_reviewed',
    targetType: 'home_ban_appeal',
    targetId: appealId,
    details: { decision, reviewer_note: note || null },
    after: { result: data ?? null },
  });

  return { result: data, appeal_id: appealId, decision };
}

export async function handle(ctx) {
  return ctx.method === 'GET' ? handleGet(ctx) : handlePatch(ctx);
}

export default withHgOperatorRoute(spec, handle);
