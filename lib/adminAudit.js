/**
 * lib/adminAudit.js
 *
 * Phase 6.1.8 — Admin audit log client helper.
 *
 * Use from any Next.js API route after performing an admin action. The helper
 * is best-effort: a logging failure NEVER blocks the action, but it does
 * surface in the server log so we can spot a broken pipeline.
 *
 * Phase X7 (2026-04-28): the helper now WRITES TO BOTH:
 *   1. admin_audit_log (legacy, via fn_log_admin_action RPC)
 *   2. audit_trail     (canonical, direct INSERT, schema from migration
 *                       20260428000001_audit_trail.sql)
 *
 * Going forward, every mutating /api/club-arena/* route MUST call
 * logAdminAction inside the same try-block as its mutation, after success.
 * Pass `details: { actor_role, club_id, agent_id, amount, currency, reason,
 * idempotency_key }` so the audit_trail row carries full context.
 *
 * Usage:
 *   // import { logAdminAction } from "<root>/lib/adminAudit";
 *   await logAdminAction({
 *     adminUserId: user.id,
 *     action: 'club.toggle_auto_settlement',
 *     targetType: 'club',
 *     targetId: club.id,
 *     before: { auto_settlement_enabled: false },
 *     after:  { auto_settlement_enabled: true },
 *     details: {
 *       actor_role: 'owner',                     // Phase X7: required
 *       club_id: club.id,                         // Phase X7: optional but recommended
 *       reason: req.body.reason || null,
 *       idempotency_key: req.headers['idempotency-key'] || null,
 *     },
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

    // 1. Legacy write — preserves the existing fn_log_admin_action contract that
    //    feeds the older admin dashboards and `admin_audit_log` table.
    const { data: legacyId, error: legacyErr } = await supabase.rpc("fn_log_admin_action", {
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

    // 2. Phase X7 (2026-04-28) — mirror to canonical `audit_trail` table created
    //    by migration 20260428000001. New consumers (Commander, club-admin
    //    dashboards, idempotency middleware, anti-cheat review queue) read
    //    from `audit_trail`; legacy admin_audit_log stays for backwards compat
    //    until all dashboards migrate. Mirror is best-effort — a failure here
    //    never blocks the request, but it surfaces in the server log so we can
    //    catch a broken schema.
    const { error: trailErr } = await supabase
      .from("audit_trail")
      .insert({
        actor_id: adminUserId,
        actor_role: details?.actor_role || "platform_admin",
        action: String(action),
        target_type: targetType,
        target_id: typeof targetId === "string" && /^[0-9a-f-]{36}$/i.test(targetId)
          ? targetId
          : null, // audit_trail.target_id is UUID-typed; non-UUID targets stay null + go in details
        club_id: details?.club_id || null,
        agent_id: details?.agent_id || null,
        amount: typeof details?.amount === "number" ? details.amount : null,
        currency: details?.currency || "CHIPS",
        before_state: before,
        after_state: after,
        reason: details?.reason || null,
        ip_address: pickIp(req),
        user_agent: pickUserAgent(req),
        request_id: pickRequestId(req) || details?.idempotency_key || null,
      });

    if (legacyErr) {
      console.warn("[adminAudit] legacy log failed:", legacyErr.message, { action, targetType, targetId });
    }
    if (trailErr) {
      console.warn("[adminAudit] audit_trail mirror failed:", trailErr.message, { action, targetType, targetId });
    }

    if (legacyErr && trailErr) {
      return { ok: false, error: legacyErr.message };
    }
    return { ok: true, id: legacyId };
  } catch (err) {
    console.warn("[adminAudit] log exception:", err?.message || err);
    return { ok: false, error: err?.message || "audit_log_failed" };
  }
}

export default logAdminAction;
