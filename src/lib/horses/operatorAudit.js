/**
 * One audit shape for every operator action.
 *
 *   await auditOperatorAction(op, req, {
 *     action: 'horse.set_active',
 *     targetType: 'content_author',
 *     targetId: id,
 *     before: { is_active: false },
 *     after: { is_active: true },
 *     details: { source: 'stable' },
 *   });
 *
 * Before Phase 1 the console wrote admin_audit_log in three shapes (a full
 * logAdminAction with request headers and before/after, a bare insert with
 * neither, and nothing at all on four reachable routes). Every write now goes
 * through here, so every row carries actor, actor_role, ip, user_agent,
 * request_id, before_state and after_state.
 *
 * Action names are dotted `domain.verb` and are validated so the Audit tab's
 * prefix filter stays meaningful.
 *
 * Failure to audit never fails the request (the mutation already happened and
 * the operator must not be told it did not), but it is reported loudly.
 */
import { requestIdOf } from './apiEnvelope.js';

const ACTION_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$/;

export function isValidAuditAction(action) {
  return typeof action === 'string' && ACTION_RE.test(action);
}

/**
 * The caller's address, resolved the same way the rest of the codebase resolves
 * it (src/lib/antiAbuse.js extractClientIP, pages/api/admin/execute-sql.js).
 *
 * THE HOP THAT MATTERS IS THE FIRST ONE. x-forwarded-for is appended to by
 * every proxy in the chain, so with more than one hop the LAST entry is the
 * proxy nearest this server and the FIRST is the client. This function used to
 * read the last entry, which meant an operator behind two proxies was filed in
 * admin_audit_log under an infrastructure address, and the two rows written for
 * a single cashout (this helper plus club-arena/auditLogger.extractIP) carried
 * different addresses for the same request.
 *
 * x-real-ip is still preferred when present: on Vercel it is set by the
 * platform to the true client address and cannot be appended to by an upstream
 * proxy, so where both exist it is the more trustworthy of the two and equals
 * the first x-forwarded-for hop anyway. Neither header is authenticated, so a
 * value here is evidence, not proof.
 */
function clientIp(req) {
  const h = req?.headers || {};
  const real = h['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim().slice(0, 64);
  const fwd = h['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    const first = fwd.split(',')[0].trim();
    if (first) return first.slice(0, 64);
  }
  return req?.socket?.remoteAddress || null;
}

/** Shape the row exactly as fn_log_admin_action / admin_audit_log expect. */
export function buildAuditRow(op, req, spec = {}) {
  if (!isValidAuditAction(spec.action)) {
    throw new Error('Invalid audit action: ' + String(spec.action));
  }
  const h = req?.headers || {};
  return {
    admin_user_id: op?.user?.id || null,
    actor_role: op?.role || null,
    action: spec.action,
    target_type: spec.targetType == null ? null : String(spec.targetType).slice(0, 80),
    target_id: spec.targetId == null ? null : String(spec.targetId).slice(0, 200),
    details: spec.details && typeof spec.details === 'object' ? spec.details : {},
    before_state: spec.before && typeof spec.before === 'object' ? spec.before : null,
    after_state: spec.after && typeof spec.after === 'object' ? spec.after : null,
    ip_address: clientIp(req),
    user_agent: typeof h['user-agent'] === 'string' ? h['user-agent'].slice(0, 400) : null,
    request_id: op?.requestId || requestIdOf(req),
  };
}

/**
 * The row to file when the caller passed an action name buildAuditRow refuses.
 * The mutation has already happened by the time we are called, so the answer to
 * a bad name is a row filed under a name the Audit tab can still find, with the
 * rejected name carried in details - never a lost row, and never a throw.
 */
function fallbackRow(op, req, spec) {
  console.error('[operatorAudit] invalid audit action, filing as unknown.action:', String(spec?.action));
  return buildAuditRow(op, req, {
    ...spec,
    action: 'unknown.action',
    details: {
      ...(spec?.details && typeof spec.details === 'object' ? spec.details : {}),
      invalid_action: String(spec?.action),
    },
  });
}

/**
 * Write the audit row. Uses the SECURITY DEFINER RPC first (it stamps
 * created_at server-side and needs no INSERT grant), then a direct
 * service-role insert if the RPC is unavailable, so a row is never dropped
 * because one path is down.
 *
 * THIS FUNCTION NEVER THROWS (contract addendum item 20). Every caller runs it
 * AFTER the mutation it records, and several of those mutations move chips, so
 * a failure to audit must never turn a completed write into a 500 the operator
 * reads as "it did not happen". buildAuditRow is therefore called INSIDE the
 * try: its one throw (an action name failing ACTION_RE) used to escape into the
 * response path, which is exactly the shape of failure the comments in the
 * calling routes promised could not occur.
 */
export async function auditOperatorAction(op, req, spec) {
  let row = null;
  try {
    try {
      row = buildAuditRow(op, req, spec);
    } catch {
      row = fallbackRow(op, req, spec);
    }
    const db = op?.db;
    if (!db) {
      console.error('[operatorAudit] no db on operator context; audit row dropped:', row.action);
      return { ok: false, row };
    }
    const { error } = await db.rpc('fn_log_admin_action', {
      p_admin_user_id: row.admin_user_id,
      p_action: row.action,
      p_target_type: row.target_type,
      p_target_id: row.target_id,
      p_details: row.details,
      p_before_state: row.before_state,
      p_after_state: row.after_state,
      p_ip_address: row.ip_address,
      p_user_agent: row.user_agent,
      p_request_id: row.request_id,
    });
    if (!error) return { ok: true, row };
    console.warn('[operatorAudit] fn_log_admin_action failed, falling back to insert:', error.message);
    const { error: insErr } = await db.from('admin_audit_log').insert({
      ...row,
      created_at: new Date().toISOString(),
    });
    if (insErr) {
      console.error('[operatorAudit] audit insert failed:', insErr.message, row.action);
      return { ok: false, row };
    }
    return { ok: true, row };
  } catch (err) {
    console.error('[operatorAudit] audit threw:', err?.message, row?.action ?? String(spec?.action));
    return { ok: false, row };
  }
}
