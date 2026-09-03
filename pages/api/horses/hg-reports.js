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
import { withHgOperatorRoute } from '../../../src/lib/horses/hgOperator.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { enumOf, paging, uuid } from '../../../src/lib/horses/validate.js';

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
      console.warn('[hg-reports GET detail]', error.message || error);
      throw new ApiError(500, 'The Report Could Not Be Loaded', 'report_read_failed');
    }
    return { report: data };
  }

  const page = paging(query, { defaultLimit: 50, max: 200 });
  const { data, error } = await userDb.rpc('list_home_content_reports', {
    p_caller_user_id: op.user.id,
    p_status: query.status || null,
    p_reported_type: query.reported_type || null,
    p_limit: page.limit,
    p_offset: page.offset,
  });
  if (error) {
    console.warn('[hg-reports GET list]', error.message || error);
    throw new ApiError(500, 'Reports Could Not Be Loaded', 'reports_read_failed');
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
    console.warn('[hg-reports PATCH]', error.message || error);
    throw new ApiError(500, 'The Report Could Not Be Resolved', 'report_resolve_failed');
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
