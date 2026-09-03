/**
 * /api/horses/hg-reports
 *   GET  ?status=&reported_type=&limit=&offset=  - list reports
 *   GET  ?id=<uuid>                              - report detail
 *   PATCH {report_id, action, moderator_note}    - resolve report
 *
 * Handles ALL categories including illegal / self_harm / doxxing. This is the
 * only surface that can, so the resolve path is audited unconditionally.
 *
 * Built on withHgOperatorRoute: the wrapper's `db` is the service-role client
 * (audit writes), and `userDb` speaks as the caller so auth.uid() resolves
 * inside the SECURITY DEFINER moderation RPCs.
 */
import { withHgOperatorRoute, mapHgRpcError } from '../../../src/lib/horses/hgOperator.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { enumOf, paging, uuid } from '../../../src/lib/horses/validate.js';

/**
 * home_content_reports.status, as the check constraint allows it (recorded on
 * the moderation page next to its filter): pending, hidden_pending_review,
 * reviewed, actioned, dismissed. resolve_home_content_report writes actioned
 * or dismissed. An empty status means "all"; anything else is a 400 here, not
 * a 500 out of the RPC (re-verification L-8).
 */
export const REPORT_STATUSES = Object.freeze([
  'pending',
  'hidden_pending_review',
  'reviewed',
  'actioned',
  'dismissed',
]);

/**
 * reported_type is a slug the moderation page renders per type (post, comment,
 * review, game, group, member) and falls through on anything else, so the
 * accepted set is not knowable from this repo. It is validated as a short
 * lowercase slug rather than an enum this file would have to guess at: junk
 * still becomes a 400 here, and a real type the page has not learned to
 * render yet still reaches the RPC.
 */
const REPORTED_TYPE_RE = /^[a-z][a-z0-9_]{0,31}$/;

/** 'hidden_pending_review' -> 'Hidden Pending Review', for the 400 sentence. */
const titleOf = (value) => value.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

function statusFilterOf(value) {
  if (value === undefined || value === null || value === '') return null;
  const picked = enumOf(String(value).toLowerCase(), REPORT_STATUSES);
  if (!picked) {
    throw badRequest(
      `Status Must Be ${REPORT_STATUSES.map(titleOf).join(', ')}, Or Blank For All`,
      'invalid_status'
    );
  }
  return picked;
}

function reportedTypeFilterOf(value) {
  if (value === undefined || value === null || value === '') return null;
  const slug = String(value).trim().toLowerCase();
  if (!REPORTED_TYPE_RE.test(slug)) throw badRequest('Reported Type Is Not A Valid Content Type', 'invalid_reported_type');
  return slug;
}

const RESOLVE_ACTIONS = [
  'dismiss',
  'hide_content',
  'delete_content',
  'warn_author',
  'strike_author',
  'ban_author',
];

export const spec = {
  name: 'horses.hg-reports',
  methods: ['GET', 'PATCH'],
  permission: { GET: PERMISSIONS.PLAYERS_READ, PATCH: PERMISSIONS.MODERATION_WRITE },
  limit: { GET: 'read', PATCH: 'write' },
};

/**
 * list_home_content_reports is RETURNS jsonb and its last statement is
 * jsonb_build_object('success', .., 'total', .., 'reports', v_rows). So `data`
 * is an OBJECT, not an array. Returning it raw handed the page
 * { reports: { success, total, reports: [...] } }, hg-moderation.js then did
 * `reports.length === 0` (undefined === 0, so the empty branch never ran) and
 * fell through to `reports.map(...)`, which threw. Reports is the DEFAULT tab,
 * so the whole moderation page white-screened on load.
 */
function unwrapList(data, key) {
  if (Array.isArray(data)) return { rows: data, total: null };
  if (data && typeof data === 'object' && !Array.isArray(data[key])) {
    // An envelope keyed something else would render an empty queue, which on
    // this surface reads as "nothing has been reported".
    console.warn(`[hg-reports] rpc envelope has no ${key} array; keys:`, Object.keys(data).join(','));
  }
  return { rows: data?.[key] ?? [], total: typeof data?.total === 'number' ? data.total : null };
}

async function handleGet({ userDb, op, query }) {
  // `?id=` with an empty value is a list request, not a malformed detail
  // request: the original treated it as falsy and listed. Only a non-empty id
  // is validated as a uuid.
  if (query.id) {
    const reportId = uuid(query.id);
    if (!reportId) throw badRequest('A Valid Report Id Is Required', 'invalid_report_id');
    const { data, error } = await userDb.rpc('get_home_content_report_detail', {
      p_report_id: reportId,
      p_caller_user_id: op.user.id,
    });
    if (error) {
      throw mapHgRpcError(error, 'That Report', { requestId: op.requestId, route: 'horses.hg-reports' });
    }
    return { report: data };
  }

  const status = statusFilterOf(query.status);
  const reportedType = reportedTypeFilterOf(query.reported_type);
  const page = paging(query, { defaultLimit: 50, max: 200 });
  const { data, error } = await userDb.rpc('list_home_content_reports', {
    p_caller_user_id: op.user.id,
    p_status: status,
    p_reported_type: reportedType,
    p_limit: page.limit,
    p_offset: page.offset,
  });
  if (error) {
    // 42501 / UNAUTHORIZED -> 403, an expired JWT -> 401, anything else
    // through mapDbError; the database sentence is logged, never returned.
    throw mapHgRpcError(error, 'The Reports Queue', { requestId: op.requestId, route: 'horses.hg-reports' });
  }

  // Contract addendum item 15: `total` is null when the jsonb envelope carries
  // no numeric count, never page.offset + rows.length. Reports is the DEFAULT
  // tab, and a fabricated total capped it at one page with a label that agreed
  // with itself and with nothing else.
  const { rows, total: rpcTotal } = unwrapList(data, 'reports');
  const total = rpcTotal;
  return {
    rows,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: rpcTotal === null ? rows.length === page.limit : page.offset + rows.length < rpcTotal,
    // Legacy field name the moderation page already reads.
    reports: rows,
  };
}

async function handlePatch({ req, op, userDb, body }) {
  const reportId = uuid(body.report_id);
  if (!reportId) throw badRequest('A Valid Report Id Is Required', 'invalid_report_id');
  const action = enumOf(body.action, RESOLVE_ACTIONS);
  if (!action) throw badRequest('That Resolution Is Not One This Queue Supports', 'invalid_action');
  const note = typeof body.moderator_note === 'string' ? body.moderator_note.trim().slice(0, 2000) : null;

  const { data, error } = await userDb.rpc('resolve_home_content_report', {
    p_report_id: reportId,
    p_action: action,
    p_moderator_note: note || null,
    p_caller_user_id: op.user.id,
  });
  if (error) {
    throw mapHgRpcError(error, 'That Report', { requestId: op.requestId, route: 'horses.hg-reports' });
  }

  // delete_content, strike_author and ban_author are irreversible; this is the
  // only record of who ran them.
  await auditOperatorAction(op, req, {
    action: 'hg.report_resolved',
    targetType: 'home_content_report',
    targetId: reportId,
    details: { resolution: action, moderator_note: note || null },
    after: { result: data ?? null },
  });

  return { result: data, report_id: reportId, resolution: action };
}

export async function handle(ctx) {
  return ctx.method === 'GET' ? handleGet(ctx) : handlePatch(ctx);
}

export default withHgOperatorRoute(spec, handle);
