/**
 * Velocity Check Middleware — Anti-Fraud Engine
 * 
 * Rate-limits financial chip movements per user per club.
 * Detects anomalous patterns:
 *   - Rapid-fire transfers (wash trading indicators)
 *   - Buy-in → immediate cashout cycles
 *   - Agent clawback-then-redistribute loops
 * 
 * Usage: const { passed, reason } = await checkVelocity(supabaseAdmin, { userId, clubId, actionType, amount });
 */

const VELOCITY_DEFAULTS = {
    max_transfers_per_hour: 10,
    max_chip_volume_per_day: 500000,
    wash_trade_window_minutes: 5,     // buyin→cashout within 5 min = flagged
    clawback_cycle_window_minutes: 15, // clawback→redistribute within 15 min = flagged
};

/**
 * Check transaction velocity for a user within a club.
 * Returns { passed: boolean, reason?: string, flagged?: boolean }
 */
async function checkVelocity(supabaseAdmin, { userId, clubId, actionType, amount }) {
    try {
        const now = new Date();
        const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

        // Get club-specific velocity limits (or use defaults)
        const { data: club } = await supabaseAdmin
            .from('clubs')
            .select('settings')
            .eq('id', clubId)
            .maybeSingle();

        const limits = {
            ...VELOCITY_DEFAULTS,
            ...(club?.settings?.velocity_limits || {}),
        };

        // ─── CHECK 1: Hourly Transaction Count ───────────────────
        const { count: hourlyCount } = await supabaseAdmin
            .from('action_audit_logs')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('club_id', clubId)
            .gte('created_at', oneHourAgo);

        if ((hourlyCount || 0) >= limits.max_transfers_per_hour) {
            return {
                passed: false,
                flagged: true,
                reason: `Velocity limit exceeded: ${hourlyCount} transactions in the last hour (max: ${limits.max_transfers_per_hour})`,
            };
        }

        // ─── CHECK 2: Daily Volume Cap ───────────────────────────
        const { data: dailyLogs } = await supabaseAdmin
            .from('action_audit_logs')
            .select('amount')
            .eq('user_id', userId)
            .eq('club_id', clubId)
            .gte('created_at', oneDayAgo)
            .in('action_type', ['chip_distribution', 'chip_transfer', 'buyin', 'clawback']);

        const dailyVolume = (dailyLogs || []).reduce((s, l) => s + Math.abs(l.amount || 0), 0);
        if (dailyVolume + amount > limits.max_chip_volume_per_day) {
            return {
                passed: false,
                flagged: true,
                reason: `Daily chip volume exceeded: ${dailyVolume + amount} (max: ${limits.max_chip_volume_per_day})`,
            };
        }

        // ─── CHECK 3: Wash Trade Detection ───────────────────────
        // Buyin followed by cashout request within N minutes
        if (actionType === 'cashout_requested') {
            const washWindow = new Date(now - limits.wash_trade_window_minutes * 60 * 1000).toISOString();
            const { count: recentBuyins } = await supabaseAdmin
                .from('action_audit_logs')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('club_id', clubId)
                .eq('action_type', 'buyin')
                .gte('created_at', washWindow);

            if ((recentBuyins || 0) > 0) {
                return {
                    passed: false,
                    flagged: true,
                    reason: `Wash trade suspected: cashout within ${limits.wash_trade_window_minutes}min of buy-in`,
                };
            }
        }

        // ─── CHECK 4: Clawback-Redistribute Cycle ────────────────
        if (actionType === 'chip_distribution') {
            const cycleWindow = new Date(now - limits.clawback_cycle_window_minutes * 60 * 1000).toISOString();
            const { count: recentClawbacks } = await supabaseAdmin
                .from('action_audit_logs')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('club_id', clubId)
                .eq('action_type', 'clawback')
                .gte('created_at', cycleWindow);

            if ((recentClawbacks || 0) > 0) {
                return {
                    passed: true, // Allow but flag
                    flagged: true,
                    reason: `Suspicious: distribution within ${limits.clawback_cycle_window_minutes}min of clawback`,
                };
            }
        }

        return { passed: true, flagged: false };
    } catch (err) {
        console.warn('[VelocityCheck] Error:', err?.message || err);
        // Fail-open: allow the transaction but flag it
        return { passed: true, flagged: true, reason: 'Velocity check error — allowed but flagged' };
    }
}

/**
 * Auto-suspend a user and notify the club owner.
 */
async function autoSuspendForFraud(supabaseAdmin, { userId, clubId, reason, ip }) {
    try {
        // Suspend the member
        const { error: err_club_members_rhbv5 } = await supabaseAdmin
          .from('club_members')
          .update({ status: 'suspended' })
            .eq('club_id', clubId)
            .eq('user_id', userId);
        if (err_club_members_rhbv5) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_rhbv5.message);

        // Get club owner
        const { data: owner } = await supabaseAdmin
            .from('club_members')
            .select('user_id')
            .eq('club_id', clubId)
            .eq('role', 'owner')
            .maybeSingle();

        // Notify owner
        if (owner) {
            const { notifyUser } = require('./notify');
            notifyUser(supabaseAdmin, {
                userId: owner.user_id,
                type: 'fraud_alert',
                title: '🛡️ Anti-Fraud Alert',
                message: `Player auto-suspended for: ${reason}`,
                data: { clubId, suspendedUserId: userId },
            });
        }

        // Audit log
        const { logAudit } = require('../../../src/lib/club-arena/auditLogger');
        logAudit(supabaseAdmin, {
            actionType: 'auto_suspend_fraud',
            userId: 'SYSTEM',
            targetUserId: userId,
            clubId,
            details: { reason },
            ip,
        });
    } catch (err) {
        console.warn('[AutoSuspend] Error:', err.message);
    }
}

module.exports = { checkVelocity, autoSuspendForFraud, VELOCITY_DEFAULTS };
