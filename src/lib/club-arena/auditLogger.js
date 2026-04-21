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
    try {
        await supabaseAdmin.from('action_audit_logs').insert({
            action_type: actionType,
            user_id: userId,
            target_user_id: targetUserId,
            club_id: clubId,
            amount,
            ip_address: ip,
            details,
        });
    } catch (err) {
        console.warn('[AuditLogger] Insert failed:', err?.message || err);
    }
}

module.exports = { logAudit, extractIP };
