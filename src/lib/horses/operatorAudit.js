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

function clientIp(req) {
  const h = req?.headers || {};
  const real = h['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim().slice(0, 64);
  const fwd = h['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    const parts = fwd.split(',');
    return parts[parts.length - 1].trim().slice(0, 64);
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
 * Write the audit row. Uses the SECURITY DEFINER RPC first (it stamps
 * created_at server-side and needs no INSERT grant), then a direct
 * service-role insert if the RPC is unavailable, so a row is never dropped
 * because one path is down.
 */
export async function auditOperatorAction(op, req, spec) {
  const row = buildAuditRow(op, req, spec);
  const db = op?.db;
  if (!db) {
    console.error('[operatorAudit] no db on operator context; audit row dropped:', row.action);
    return { ok: false, row };
  }
  try {
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
    console.error('[operatorAudit] audit threw:', err?.message, row.action);
    return { ok: false, row };
  }
}
