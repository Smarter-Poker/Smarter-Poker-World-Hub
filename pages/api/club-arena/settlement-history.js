/**
 * POST /api/club-arena/settlement-history
 * 
 * Returns settlement period history for a club with aggregated stats.
 * Also provides auto-close scheduling configuration.
 * 
 * Actions:
 *   'list'          - Returns last N settlement periods with aggregated stats
 *   'auto_schedule' - Toggles auto-close scheduling for a club
 *   'auto_close'    - Cron-triggered: auto-closes all clubs with scheduling enabled
 * 
 * Body: { clubId, action, limit?, enabled? }
 * Auth: Bearer token (club owner/admin) or ADMIN_ROUTE_SECRET for cron
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    if (!applyRateLimit(req, res, 'club-arena/settlement-history')) return;

    const { action } = req.body || {};

    // ═══════════════════════════════════════════════════════════
    // AUTO-CLOSE CRON (triggered by Vercel cron or admin secret)
    // Closes all clubs with auto_settlement_enabled = true
    // ═══════════════════════════════════════════════════════════
    if (action === 'auto_close') {
        const secret = req.headers['x-admin-secret'] || req.body.secret;
        if (secret !== process.env.ADMIN_ROUTE_SECRET) {
            return res.status(403).json({ error: 'Unauthorized cron call' });
        }

        try {
            // Find all clubs with auto-settlement enabled
            const { data: clubs } = await supabaseAdmin
                .from('clubs')
                .select('id, name, settings')
                .not('settings->auto_settlement_enabled', 'is', null);

            const autoClubs = (clubs || []).filter(c => c.settings?.auto_settlement_enabled === true);

            if (autoClubs.length === 0) {
                return res.status(200).json({ success: true, message: 'No clubs with auto-settlement', processed: 0 });
            }

            const results = [];
            for (const club of autoClubs) {
                try {
                    // Find current open period
                    const { data: openPeriod } = await supabaseAdmin
                        .from('settlement_periods')
                        .select('id, start_date')
                        .eq('club_id', club.id)
                        .eq('status', 'open')
                        .order('created_at', { ascending: false })
                        .maybeSingle();

                    if (!openPeriod) {
                        results.push({ clubId: club.id, name: club.name, status: 'no_open_period' });
                        continue;
                    }

                    // Close the period by updating status
                    await supabaseAdmin
                        .from('settlement_periods')
                        .update({ status: 'closed', end_date: new Date().toISOString() })
                        .eq('id', openPeriod.id);

                    // Open a new period
                    await supabaseAdmin
                        .from('settlement_periods')
                        .insert({
                            club_id: club.id,
                            status: 'open',
                            start_date: new Date().toISOString(),
                        });

                    logAudit(supabaseAdmin, {
                        actionType: 'auto_settlement_close',
                        userId: 'SYSTEM',
                        clubId: club.id,
                        details: { periodId: openPeriod.id, trigger: 'cron' },
                        ip: extractIP(req),
                    });

                    results.push({ clubId: club.id, name: club.name, status: 'closed_and_reopened', periodId: openPeriod.id });
                } catch (err) {
                    results.push({ clubId: club.id, name: club.name, status: 'error', message: err.message });
                }
            }

            return res.status(200).json({ success: true, processed: results.length, results });
        } catch (err) {
            return res.status(500).json({ error: 'Auto-close failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // AUTHENTICATED ROUTES (require user token)
    // ═══════════════════════════════════════════════════════════
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No auth token' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { clubId, limit = 12, enabled } = req.body;
    if (!clubId) return res.status(400).json({ error: 'clubId required' });

    // Verify ownership/admin
    const { data: membership } = await supabaseAdmin
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return res.status(403).json({ error: 'Owner/admin only' });
    }

    // ─── LIST: Settlement History ─────────────────────────────
    if (action === 'list') {
        try {
            const { data: periods } = await supabaseAdmin
                .from('settlement_periods')
                .select('id, status, start_date, end_date, created_at')
                .eq('club_id', clubId)
                .order('created_at', { ascending: false })
                .limit(limit);

            // Aggregate stats for each period
            const enriched = [];
            for (const p of (periods || [])) {
                const { data: commissions } = await supabaseAdmin
                    .from('commission_history')
                    .select('amount, status')
                    .eq('period_id', p.id);

                const totalRake = (commissions || []).reduce((s, c) => s + (c.amount || 0), 0);
                const paidCount = (commissions || []).filter(c => c.status === 'paid').length;
                const pendingCount = (commissions || []).filter(c => c.status !== 'paid').length;

                enriched.push({
                    ...p,
                    totalCommissions: totalRake,
                    paidCount,
                    pendingCount,
                    agentCount: (commissions || []).length,
                });
            }

            // Get auto-schedule status
            const { data: club } = await supabaseAdmin
                .from('clubs')
                .select('settings')
                .eq('id', clubId)
                .maybeSingle();

            return res.status(200).json({
                success: true,
                periods: enriched,
                autoSettlement: club?.settings?.auto_settlement_enabled || false,
            });
        } catch (err) {
            return res.status(500).json({ error: 'Failed to fetch history', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
        }
    }

    // ─── AUTO_SCHEDULE: Toggle auto-settlement ────────────────
    if (action === 'auto_schedule') {
        try {
            const { data: club } = await supabaseAdmin
                .from('clubs')
                .select('settings')
                .eq('id', clubId)
                .maybeSingle();

            const currentSettings = club?.settings || {};
            const newEnabled = typeof enabled === 'boolean' ? enabled : !currentSettings.auto_settlement_enabled;

            await supabaseAdmin
                .from('clubs')
                .update({ settings: { ...currentSettings, auto_settlement_enabled: newEnabled } })
                .eq('id', clubId);

            logAudit(supabaseAdmin, {
                actionType: 'auto_settlement_toggled',
                userId: user.id,
                clubId,
                details: { enabled: newEnabled },
                ip: extractIP(req),
            });

            return res.status(200).json({ success: true, autoSettlement: newEnabled });
        } catch (err) {
            return res.status(500).json({ error: 'Toggle failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
        }
    }

    // ─── BATCH_PREVIEW: Preview all pending commissions ───────
    if (action === 'batch_preview') {
        const { periodId: batchPeriodId } = req.body;
        if (!batchPeriodId) return res.status(400).json({ error: 'periodId required' });

        try {
            const { data: commissions } = await supabaseAdmin
                .from('commission_history')
                .select('id, agent_id, amount, status')
                .eq('period_id', batchPeriodId)
                .neq('status', 'paid');

            // Enrich with agent display names
            const agentIds = [...new Set((commissions || []).map(c => c.agent_id))];
            const { data: profiles } = await supabaseAdmin
                .from('profiles')
                .select('id, display_name, username')
                .in('id', agentIds);

            const profileMap = {};
            for (const p of (profiles || [])) profileMap[p.id] = p.display_name || p.username || p.id.substring(0, 8);

            const preview = (commissions || []).map(c => ({
                commissionId: c.id,
                agentId: c.agent_id,
                agentName: profileMap[c.agent_id] || c.agent_id.substring(0, 8),
                amount: c.amount,
                status: c.status,
            }));

            const totalPayout = preview.reduce((s, c) => s + c.amount, 0);

            return res.status(200).json({
                success: true,
                preview,
                totalPayout,
                count: preview.length,
            });
        } catch (err) {
            return res.status(500).json({ error: 'Preview failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
        }
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
}
