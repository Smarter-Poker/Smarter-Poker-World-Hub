/**
 * /api/horses/hg-appeals
 *   GET   ?status=&group_id=&limit=&offset=     - list ban appeals (admin view)
 *   PATCH {appeal_id, decision, reviewer_note}  - review an appeal
 *
 * Built on withHgOperatorRoute: `db` is the service-role client (audit writes),
 * `userDb` speaks as the caller so auth.uid() resolves inside the SECURITY
 * DEFINER moderation RPCs.
 *
 * The list response carries `total`. It did not before, so the 200-row cap was
 * invisible to the page and an operator could not tell a full queue from a
 * truncated one.
 */
import { withHgOperatorRoute } from '../../../src/lib/horses/hgOperator.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { enumOf, paging, uuid } from '../../../src/lib/horses/validate.js';

const DECISIONS = ['approved', 'denied'];

export const spec = {
  name: 'horses.hg-appeals',
  methods: ['GET', 'PATCH'],
  permission: { GET: PERMISSIONS.PLAYERS_READ, PATCH: PERMISSIONS.MODERATION_WRITE },
  limit: { GET: 'read', PATCH: 'write' },
};

/** The RPC returns either a bare array or a jsonb envelope; accept both. */
function unwrapList(data) {
  if (Array.isArray(data)) return { rows: data, total: null };
  return { rows: data?.appeals ?? [], total: typeof data?.total === 'number' ? data.total : null };
}

async function handleGet({ op, userDb, query }) {
  let groupId = null;
  if (query.group_id !== undefined && query.group_id !== '') {
    groupId = uuid(query.group_id);
    if (!groupId) throw badRequest('A Valid Group Id Is Required', 'invalid_group_id');
  }
  const page = paging(query, { defaultLimit: 50, max: 200 });

  const { data, error } = await userDb.rpc('list_home_ban_appeals_admin', {
    p_caller_user_id: op.user.id,
    p_status: query.status || null,
    p_group_id: groupId,
    p_limit: page.limit,
    p_offset: page.offset,
  });
  if (error) {
    console.warn('[hg-appeals GET]', error.message || error);
    throw new ApiError(500, 'Appeals Could Not Be Loaded', 'appeals_read_failed');
  }

  const { rows, total: rpcTotal } = unwrapList(data);
  const total = rpcTotal === null ? page.offset + rows.length : rpcTotal;
  return {
    rows,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: rpcTotal === null ? rows.length === page.limit : page.offset + rows.length < total,
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
    console.warn('[hg-appeals PATCH]', error.message || error);
    throw new ApiError(500, 'The Appeal Could Not Be Reviewed', 'appeal_review_failed');
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
