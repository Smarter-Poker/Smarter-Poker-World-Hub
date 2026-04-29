/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ORB-5 UNIVERSAL AUDIT LOGGER
 * 
 * Centralized, fire-and-forget audit logging for ALL Club Arena operations.
 * Every financial transaction, agent action, and chip movement is recorded
 * in the immutable `action_audit_logs` table.
 * 
 * Usage:
 *   const { logAudit, extractIP } = require('./auditLogger');
 *   await logAudit(supabaseAdmin, {
 *     actionType: 'chip_distribution',
 *     userId: user.id,
 *     targetUserId: toUserId,
 *     clubId,
 *     amount: 5000,
 *     ip: extractIP(req),
 *     details: { treasuryBefore, treasuryAfter, notes },
 *   });
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Extract the client IP from a Next.js API request.
 * Handles Vercel proxy headers and local development.
 * @param {import('next').NextApiRequest} req
 * @returns {string}
 */
function extractIP(req) {
    if (!req) return 'unknown';
    // Vercel / Cloudflare / Nginx proxy chain
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) {
        return String(forwarded).split(',')[0].trim();
    }
    // Direct connection (local dev)
    return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

/**
 * Write an immutable audit log entry.
 * Fire-and-forget — NEVER blocks the API response or throws.
 * 
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin - Service-role client
 * @param {Object} params
 * @param {string} params.actionType - e.g. 'chip_distribution', 'cashout_approved', 'agent_promoted'
 * @param {string} [params.userId] - Who performed the action
 * @param {string} [params.targetUserId] - Who was affected
 * @param {string} [params.clubId] - Club context
 * @param {number} [params.amount] - Financial amount (if applicable)
 * @param {string} [params.ip] - Client IP (use extractIP(req))
 * @param {Object} [params.details] - Full JSONB snapshot of the action
 * @returns {Promise<void>}
 */
async function logAudit(supabaseAdmin, {
    actionType,
    userId = null,
    targetUserId = null,
    clubId = null,
    amount = null,
    ip = 'unknown',
    details = {},
}) {
    // Phase X7 (2026-04-28) — dual-write: legacy `action_audit_logs` for the
    // existing `audit-trail.js` read endpoint + Commander dashboards, plus the
    // canonical `audit_trail` table from migration 20260428000001 used by the
    // new idempotency middleware, anti-cheat review queue, and admin
    // disposition flow. Either write failing alone never blocks; only a double
    // failure surfaces.
    let legacyOk = true;
    let trailOk = true;

    try {
        const { error } = await supabaseAdmin.from('action_audit_logs').insert({
            action_type: actionType,
            user_id: userId,
            target_user_id: targetUserId,
            club_id: clubId,
            amount,
            ip_address: ip,
            details,
        });
        if (error) {
            legacyOk = false;
            console.warn('[AuditLogger] action_audit_logs write failed:', error.message);
        }
    } catch (err) {
        legacyOk = false;
        console.warn('[AuditLogger] action_audit_logs exception:', err?.message || err);
    }

    // Mirror to canonical audit_trail.
    try {
        const { error } = await supabaseAdmin.from('audit_trail').insert({
            actor_id: userId,
            actor_role: details?.actor_role || 'platform_admin',
            action: String(actionType),
            target_type: details?.target_type || null,
            // audit_trail.target_id is UUID-typed; only insert when valid UUID.
            target_id:
                typeof targetUserId === 'string' && /^[0-9a-f-]{36}$/i.test(targetUserId)
                    ? targetUserId
                    : null,
            club_id: clubId,
            agent_id: details?.agent_id || null,
            amount: typeof amount === 'number' ? amount : null,
            currency: details?.currency || 'CHIPS',
            before_state: details?.before || null,
            after_state: details?.after || null,
            reason: details?.reason || null,
            ip_address: ip && ip !== 'unknown' ? ip : null,
            user_agent: details?.user_agent || null,
            request_id: details?.idempotency_key || details?.request_id || null,
        });
        if (error) {
            trailOk = false;
            console.warn('[AuditLogger] audit_trail mirror failed:', error.message);
        }
    } catch (err) {
        trailOk = false;
        console.warn('[AuditLogger] audit_trail exception:', err?.message || err);
    }

    if (!legacyOk && !trailOk) {
        console.error('[AuditLogger] BOTH audit writes failed for', actionType);
    }
}

module.exports = { logAudit, extractIP };
