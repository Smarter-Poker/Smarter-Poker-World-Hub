/**
 * lib/adminAudit.js
 *
 * Phase 6.1.8 — Admin audit log client helper.
 *
 * Use from any Next.js API route after performing an admin action. The helper
 * is best-effort: a logging failure NEVER blocks the action, but it does
 * surface in the server log so we can spot a broken pipeline.
 *
 * Usage:
 *   import { logAdminAction } from '../../../lib/adminAudit';
 *   await logAdminAction({
 *     adminUserId: user.id,
 *     action: 'club.toggle_auto_settlement',
 *     targetType: 'club',
 *     targetId: club.id,
 *     before: { auto_settlement_enabled: false },
 *     after:  { auto_settlement_enabled: true },
 *     details: { reason: req.body.reason || null },
 *     req,
 *   });
 *
 * `req` is optional but recommended — we extract IP, user agent, and the
 * Vercel request id for full traceability.
 */
import { getSupabaseAdmin } from "./supabaseAdmin";

function pickIp(req) {
  if (!req) return null;
  const xff = req.headers?.["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return (
    req.headers?.["x-real-ip"] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    null
  );
}

function pickUserAgent(req) {
  return req?.headers?.["user-agent"] || null;
}

function pickRequestId(req) {
  if (!req) return null;
  return (
    req.headers?.["x-vercel-id"] ||
    req.headers?.["x-request-id"] ||
    req.headers?.["x-amzn-trace-id"] ||
    null
  );
}

/**
 * Record a privileged admin action. Best-effort: always returns; never throws.
 *
 * @param {object} args
 * @param {string} args.adminUserId  - auth.uid() of the acting admin (required)
 * @param {string} args.action       - dotted-action key, e.g. 'union.update_settings' (required)
 * @param {string} [args.targetType] - logical entity type, e.g. 'union', 'club', 'profile'
 * @param {string|number} [args.targetId] - PK of the affected entity (any scalar)
 * @param {object} [args.details]    - free-form context, e.g. reason, source UI
 * @param {object} [args.before]     - snapshot of relevant fields before the action
 * @param {object} [args.after]      - snapshot of relevant fields after the action
 * @param {object} [args.req]        - Next.js req (for IP/UA/request-id capture)
 * @returns {Promise<{ok:boolean, id?:string, error?:string}>}
 */
export async function logAdminAction({
  adminUserId,
  action,
  targetType = null,
  targetId = null,
  details = {},
  before = null,
  after = null,
  req = null,
} = {}) {
  if (!adminUserId || !action) {
    return { ok: false, error: "adminUserId and action are required" };
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("fn_log_admin_action", {
      p_admin_user_id: adminUserId,
      p_action: String(action),
      p_target_type: targetType,
      p_target_id: targetId == null ? null : String(targetId),
      p_details: details || {},
      p_before_state: before,
      p_after_state: after,
      p_ip_address: pickIp(req),
      p_user_agent: pickUserAgent(req),
      p_request_id: pickRequestId(req),
    });
    if (error) {
      console.warn("[adminAudit] log failed:", error.message, { action, targetType, targetId });
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data };
  } catch (err) {
    console.warn("[adminAudit] log exception:", err?.message || err);
    return { ok: false, error: err?.message || "audit_log_failed" };
  }
}

export default logAdminAction;
